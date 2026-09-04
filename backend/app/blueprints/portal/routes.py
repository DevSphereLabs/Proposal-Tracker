"""Client-facing API for the portal dashboard.

Every route requires a valid token, and every query is scoped to the signed-in
client's own submissions — an ID belonging to another client 404s (never 403,
so IDs can't be probed).
"""
import uuid
from datetime import datetime, timezone

from flask import current_app, jsonify, request, send_file
from marshmallow import ValidationError
from werkzeug.security import check_password_hash, generate_password_hash

from app.models import ProposalFiles, ProposalMessages, Submissions, Users, db
from app.util.auth import token_required
from app.util.settings import enabled_extensions, load_settings
from . import portal_bp
from .schemas import (
    PORTAL_STATUS,
    dump_client,
    dump_message,
    dump_file,
    dump_proposal,
    message_create_schema,
    profile_update_schema,
    proposal_update_schema,
)

def _own_submission(submission_id):
    """The signed-in client's submission, or None (callers 404)."""
    return db.session.query(Submissions).where(
        Submissions.id == submission_id,
        Submissions.client_id == request.user_id,
    ).first()


# Profile for the "My Details" card
@portal_bp.route('/me', methods=['GET'])
@token_required
def get_me():
    user = db.session.get(Users, request.user_id)
    if not user:
        return jsonify({'error': 'not found'}), 404

    return jsonify({'client': dump_client(user)}), 200


@portal_bp.route('/me', methods=['PATCH'])
@token_required
def update_me():
    user = db.session.get(Users, request.user_id)
    if not user:
        return jsonify({'error': 'not found'}), 404

    try:
        data = profile_update_schema.load(request.json)
    except ValidationError as e:
        return jsonify(e.messages), 400

    new_password = data.pop('new_password', None)
    current_password = data.pop('current_password', None)
    if new_password:
        if not current_password or not check_password_hash(user.password_hash, current_password):
            return jsonify({'error': 'current password is incorrect'}), 403
        user.password_hash = generate_password_hash(new_password)

    for field, value in data.items():
        setattr(user, field, value.strip())
    db.session.commit()

    return jsonify({'client': dump_client(user)}), 200


# Display settings the portal shares with the team dashboard, keyed by the
# portal's status vocabulary so pill colors stay consistent on both sides
@portal_bp.route('/settings', methods=['GET'])
@token_required
def get_display_settings():
    colors = load_settings()['status_colors']
    return jsonify({'statusColors': {
        'new': colors['new'],
        'active': colors['in_progress'],
        'completed': colors['accepted'],
        'declined': colors['declined'],
    }}), 200


# The client's proposals, optionally filtered to one tab
@portal_bp.route('/proposals', methods=['GET'])
@token_required
def get_proposals():
    status = request.args.get('status')
    if status is not None and status not in set(PORTAL_STATUS.values()):
        return jsonify({'error': 'status must be one of: active, completed, declined'}), 400

    submissions = db.session.query(Submissions).where(
        Submissions.client_id == request.user_id
    ).all()

    proposals = [dump_proposal(s) for s in submissions]
    if status is not None:
        proposals = [p for p in proposals if p['status'] == status]

    return jsonify({'proposals': proposals}), 200


@portal_bp.route('/proposals/<submission_id>', methods=['PATCH'])
@token_required
def update_proposal(submission_id):
    submission = _own_submission(submission_id)
    if not submission:
        return jsonify({'error': 'not found'}), 404

    # Completed and declined proposals are a record of what was agreed (or
    # turned down) — only in-flight ones stay editable
    if PORTAL_STATUS.get(submission.status, 'active') != 'active':
        return jsonify({'error': 'only active proposals can be edited'}), 409

    try:
        data = proposal_update_schema.load(request.json)
    except ValidationError as e:
        return jsonify(e.messages), 400

    for field, value in data.items():
        setattr(submission, field, value.strip() if isinstance(value, str) else value)

    # Surface the edit on both dashboards' "last updated" dates
    if data and submission.proposal:
        submission.proposal.updated_at = datetime.now(timezone.utc)
    db.session.commit()

    return jsonify({'proposal': dump_proposal(submission)}), 200


# Message thread
@portal_bp.route('/proposals/<submission_id>/messages', methods=['POST'])
@token_required
def send_message(submission_id):
    submission = _own_submission(submission_id)
    if not submission:
        return jsonify({'error': 'not found'}), 404

    try:
        data = message_create_schema.load(request.json)
    except ValidationError as e:
        return jsonify(e.messages), 400

    message = ProposalMessages(
        submission_id=submission.id,
        sender_id=request.user_id,
        body=data['body'],
    )
    db.session.add(message)
    db.session.commit()

    return jsonify({'message': dump_message(message)}), 201


@portal_bp.route('/messages/<message_id>', methods=['DELETE'])
@token_required
def delete_message(message_id):
    # Clients may only delete messages they sent themselves — team messages
    # on their thread are visible but not theirs to remove
    message = db.session.query(ProposalMessages).where(
        ProposalMessages.id == message_id,
        ProposalMessages.sender_id == request.user_id,
    ).first()

    if not message:
        return jsonify({'error': 'not found'}), 404

    db.session.delete(message)
    db.session.commit()

    return jsonify({'message': 'deleted'}), 200


# File manager
@portal_bp.route('/proposals/<submission_id>/files', methods=['POST'])
@token_required
def upload_files(submission_id):
    submission = _own_submission(submission_id)
    if not submission:
        return jsonify({'error': 'not found'}), 404

    uploads = request.files.getlist('files')
    if not uploads:
        return jsonify({'error': 'no files in request (use multipart field "files")'}), 400

    # Extensions the team currently allows (Settings > File Types); the
    # stored name on disk is a UUID we generate ourselves either way
    allowed_extensions = enabled_extensions()

    saved = []
    for upload in uploads:
        original_name = (upload.filename or '').strip()
        extension = original_name.rsplit('.', 1)[-1].lower() if '.' in original_name else ''
        if not original_name or extension not in allowed_extensions:
            allowed = ', '.join(sorted(allowed_extensions))
            return jsonify({'error': f'file type not allowed (allowed: {allowed})'}), 400

        stored_name = f'{uuid.uuid4()}.{extension}'
        path = current_app.config['UPLOAD_DIR'] / stored_name
        upload.save(path)

        record = ProposalFiles(
            submission_id=submission.id,
            uploader_id=request.user_id,
            original_name=original_name,
            stored_name=stored_name,
            content_type=upload.mimetype or 'application/octet-stream',
            size_bytes=path.stat().st_size,
        )
        db.session.add(record)
        saved.append(record)

    db.session.commit()

    return jsonify({'files': [dump_file(f) for f in saved]}), 201


@portal_bp.route('/files/<file_id>/download', methods=['GET'])
@token_required
def download_file(file_id):
    # Any file on the client's own submission is downloadable, including
    # ones the team attached for them
    file = db.session.query(ProposalFiles).join(Submissions).where(
        ProposalFiles.id == file_id,
        Submissions.client_id == request.user_id,
    ).first()

    if not file:
        return jsonify({'error': 'not found'}), 404

    return send_file(
        current_app.config['UPLOAD_DIR'] / file.stored_name,
        as_attachment=True,
        download_name=file.original_name,
        mimetype=file.content_type,
    )


@portal_bp.route('/files/<file_id>', methods=['DELETE'])
@token_required
def delete_file(file_id):
    # Clients may only delete files they uploaded themselves
    file = db.session.query(ProposalFiles).where(
        ProposalFiles.id == file_id,
        ProposalFiles.uploader_id == request.user_id,
    ).first()

    if not file:
        return jsonify({'error': 'not found'}), 404

    path = current_app.config['UPLOAD_DIR'] / file.stored_name
    db.session.delete(file)
    db.session.commit()
    path.unlink(missing_ok=True)

    return jsonify({'message': 'deleted'}), 200
