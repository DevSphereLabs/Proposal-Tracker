"""Internal API for the team's proposal manager dashboard.

Every route is team-only (MEMBER/ADMIN). Unlike the portal, queries are not
scoped to one client — the team sees and manages every submission.
"""
import uuid
from datetime import datetime, timezone

from flask import current_app, jsonify, request, send_file
from marshmallow import ValidationError

from app.blueprints.portal.routes import ALLOWED_EXTENSIONS
from app.blueprints.portal.schemas import dump_file, dump_message, message_create_schema
from app.models import (
    ProposalFiles, ProposalMessages, SubmissionNotes, Submissions, db,
)
from app.util.auth import roles_required
from . import team_bp
from .schemas import (
    MANAGER_STATUS,
    MANAGER_STATUS_UPDATE,
    dump_detail,
    dump_note,
    dump_row,
    note_create_schema,
    team_proposal_update_schema,
)


def _submission_or_none(submission_id):
    return db.session.get(Submissions, submission_id)


# The proposals table
@team_bp.route('/proposals', methods=['GET'])
@roles_required('MEMBER', 'ADMIN')
def list_proposals():
    submissions = db.session.query(Submissions).all()
    return jsonify({'proposals': [dump_row(s) for s in submissions]}), 200


# Everything the View popup needs, in one request
@team_bp.route('/proposals/<submission_id>', methods=['GET'])
@roles_required('MEMBER', 'ADMIN')
def get_proposal(submission_id):
    submission = _submission_or_none(submission_id)
    if not submission:
        return jsonify({'error': 'not found'}), 404

    return jsonify({'proposal': dump_detail(submission)}), 200


@team_bp.route('/proposals/<submission_id>', methods=['PATCH'])
@roles_required('MEMBER', 'ADMIN')
def update_proposal(submission_id):
    submission = _submission_or_none(submission_id)
    if not submission:
        return jsonify({'error': 'not found'}), 404

    try:
        data = team_proposal_update_schema.load(request.json)
    except ValidationError as e:
        return jsonify(e.messages), 400

    status = data.pop('status', None)
    # Only move the pipeline when the manager label actually changes, so
    # setting in_progress on a PROPOSAL_SENT submission doesn't quietly
    # downgrade it to CONTACTED
    if status is not None and MANAGER_STATUS.get(submission.status) != status:
        submission.status = MANAGER_STATUS_UPDATE[status]

    for field, value in data.items():
        setattr(submission, field, value.strip() if isinstance(value, str) else value)

    # Surface the edit on both dashboards' "last updated" dates
    if (data or status is not None) and submission.proposal:
        submission.proposal.updated_at = datetime.now(timezone.utc)
    db.session.commit()

    return jsonify({'proposal': dump_detail(submission)}), 200


@team_bp.route('/proposals/<submission_id>', methods=['DELETE'])
@roles_required('MEMBER', 'ADMIN')
def delete_proposal(submission_id):
    submission = _submission_or_none(submission_id)
    if not submission:
        return jsonify({'error': 'not found'}), 404

    # No DB-level cascades configured, so remove children explicitly —
    # uploaded files come off disk too
    for file in submission.files:
        (current_app.config['UPLOAD_DIR'] / file.stored_name).unlink(missing_ok=True)
        db.session.delete(file)
    for message in submission.messages:
        db.session.delete(message)
    for note in submission.notes:
        db.session.delete(note)
    if submission.proposal:
        db.session.delete(submission.proposal)
    if submission.project:
        db.session.delete(submission.project)

    db.session.delete(submission)
    db.session.commit()

    return jsonify({'message': 'deleted'}), 200


# Internal notes (never visible on the client portal)
@team_bp.route('/proposals/<submission_id>/notes', methods=['POST'])
@roles_required('MEMBER', 'ADMIN')
def add_note(submission_id):
    submission = _submission_or_none(submission_id)
    if not submission:
        return jsonify({'error': 'not found'}), 404

    try:
        data = note_create_schema.load(request.json)
    except ValidationError as e:
        return jsonify(e.messages), 400

    note = SubmissionNotes(
        submission_id=submission.id,
        author_id=request.user_id,
        content=data['text'],
    )
    db.session.add(note)
    db.session.commit()

    return jsonify({'note': dump_note(note)}), 201


@team_bp.route('/notes/<note_id>', methods=['DELETE'])
@roles_required('MEMBER', 'ADMIN')
def delete_note(note_id):
    # Notes are shared within the team, so any member can clear them
    note = db.session.get(SubmissionNotes, note_id)
    if not note:
        return jsonify({'error': 'not found'}), 404

    db.session.delete(note)
    db.session.commit()

    return jsonify({'message': 'deleted'}), 200


# Message thread with the client, from the team's side
@team_bp.route('/proposals/<submission_id>/messages', methods=['POST'])
@roles_required('MEMBER', 'ADMIN')
def send_message(submission_id):
    submission = _submission_or_none(submission_id)
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


@team_bp.route('/messages/<message_id>', methods=['DELETE'])
@roles_required('MEMBER', 'ADMIN')
def delete_message(message_id):
    # Any team-authored message is fair game; the client's side of the
    # thread is theirs and stays put
    message = db.session.get(ProposalMessages, message_id)
    if not message:
        return jsonify({'error': 'not found'}), 404
    if message.sender.role == 'CLIENT':
        return jsonify({'error': "clients' messages can only be deleted by them"}), 403

    db.session.delete(message)
    db.session.commit()

    return jsonify({'message': 'deleted'}), 200


# File manager, team side: same rules as the portal for what's accepted,
# but the team can manage every file on a submission
@team_bp.route('/proposals/<submission_id>/files', methods=['POST'])
@roles_required('MEMBER', 'ADMIN')
def upload_files(submission_id):
    submission = _submission_or_none(submission_id)
    if not submission:
        return jsonify({'error': 'not found'}), 404

    uploads = request.files.getlist('files')
    if not uploads:
        return jsonify({'error': 'no files in request (use multipart field "files")'}), 400

    saved = []
    for upload in uploads:
        original_name = (upload.filename or '').strip()
        extension = original_name.rsplit('.', 1)[-1].lower() if '.' in original_name else ''
        if not original_name or extension not in ALLOWED_EXTENSIONS:
            allowed = ', '.join(sorted(ALLOWED_EXTENSIONS))
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


@team_bp.route('/files/<file_id>/download', methods=['GET'])
@roles_required('MEMBER', 'ADMIN')
def download_file(file_id):
    file = db.session.get(ProposalFiles, file_id)
    if not file:
        return jsonify({'error': 'not found'}), 404

    return send_file(
        current_app.config['UPLOAD_DIR'] / file.stored_name,
        as_attachment=True,
        download_name=file.original_name,
        mimetype=file.content_type,
    )


@team_bp.route('/files/<file_id>', methods=['DELETE'])
@roles_required('MEMBER', 'ADMIN')
def delete_file(file_id):
    file = db.session.get(ProposalFiles, file_id)
    if not file:
        return jsonify({'error': 'not found'}), 404

    path = current_app.config['UPLOAD_DIR'] / file.stored_name
    db.session.delete(file)
    db.session.commit()
    path.unlink(missing_ok=True)

    return jsonify({'message': 'deleted'}), 200
