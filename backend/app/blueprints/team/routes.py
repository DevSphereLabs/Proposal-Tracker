"""Internal API for the team's proposal manager dashboard.

Every route is team-only (MEMBER/ADMIN). Unlike the portal, queries are not
scoped to one client — the team sees and manages every submission.
"""
from datetime import datetime, timezone

from flask import jsonify, request, send_file
from marshmallow import ValidationError
from werkzeug.security import check_password_hash, generate_password_hash

from app.blueprints.portal.schemas import dump_client, dump_file, dump_message, message_create_schema
from app.models import (
    ProposalFiles, ProposalMessages, SubmissionNotes, Submissions, Templates, Users, db,
)
from app.util.auth import roles_required
from app.util.settings import (
    SAFE_EXTENSIONS, enabled_extensions, load_settings, save_settings,
)
from . import team_bp
from .schemas import (
    MANAGER_STATUS,
    MANAGER_STATUS_UPDATE,
    client_key,
    dump_client_summary,
    dump_detail,
    dump_report,
    dump_note,
    dump_row,
    dump_template,
    note_create_schema,
    settings_update_schema,
    team_profile_update_schema,
    team_proposal_update_schema,
    template_create_schema,
    template_update_schema,
)
from io import BytesIO


def _submission_or_none(submission_id):
    return db.session.get(Submissions, submission_id)


def _settings_payload():
    return {'settings': load_settings(), 'available_file_types': SAFE_EXTENSIONS}


# Team-configurable settings (Settings page)
@team_bp.route('/settings', methods=['GET'])
@roles_required('MEMBER', 'ADMIN')
def get_settings():
    return jsonify(_settings_payload()), 200


@team_bp.route('/settings', methods=['PUT'])
@roles_required('MEMBER', 'ADMIN')
def update_settings():
    try:
        data = settings_update_schema.load(request.json)
    except ValidationError as e:
        return jsonify(e.messages), 400

    # File types can only be toggled within the safe list
    if 'file_types' in data:
        rejected = set(data['file_types']) - set(SAFE_EXTENSIONS)
        if rejected:
            return jsonify({'error': f'file types not allowed: {", ".join(sorted(rejected))}'}), 400

    # Colors may only target known statuses: the built-ins plus the custom
    # list as it will be after this update
    custom = data.get('custom_statuses', load_settings()['custom_statuses'])
    known = set(MANAGER_STATUS_UPDATE) | {s['name'] for s in custom}
    unknown = set(data.get('status_colors', {})) - known
    if unknown:
        return jsonify({'error': f'unknown statuses: {", ".join(sorted(unknown))}'}), 400

    save_settings(data)
    db.session.commit()

    return jsonify(_settings_payload()), 200


# The signed-in team member's own account (Settings > Profile)
@team_bp.route('/profile', methods=['GET'])
@roles_required('MEMBER', 'ADMIN')
def get_profile():
    user = db.session.get(Users, request.user_id)
    if not user:
        return jsonify({'error': 'not found'}), 404

    return jsonify({'profile': dump_client(user)}), 200


@team_bp.route('/profile', methods=['PATCH'])
@roles_required('MEMBER', 'ADMIN')
def update_profile():
    user = db.session.get(Users, request.user_id)
    if not user:
        return jsonify({'error': 'not found'}), 404

    try:
        data = team_profile_update_schema.load(request.json)
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

    return jsonify({'profile': dump_client(user)}), 200


# Clients: every submission grouped under the person who sent it, with the
# totals the Clients page ranks by (highest total value first by default)
@team_bp.route('/clients', methods=['GET'])
@roles_required('MEMBER', 'ADMIN')
def list_clients():
    groups = {}
    for submission in db.session.query(Submissions).all():
        groups.setdefault(client_key(submission), []).append(submission)

    clients = [dump_client_summary(group) for group in groups.values()]
    clients.sort(key=lambda c: c['totalValue'], reverse=True)

    return jsonify({'clients': clients}), 200


# Reports: the whole pipeline rolled up for the Reports page
@team_bp.route('/reports', methods=['GET'])
@roles_required('MEMBER', 'ADMIN')
def get_report():
    return jsonify({'report': dump_report(db.session.query(Submissions).all())}), 200


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
        db.session.delete(file)
    for message in submission.messages:
        db.session.delete(message)
    for note in submission.notes:
        db.session.delete(note)
    if submission.proposal:
        db.session.delete(submission.proposal)
    if submission.project:
        db.session.delete(submission.project)
    # Templates saved from it stay, just no longer point at it
    db.session.query(Templates).where(
        Templates.source_submission_id == submission.id
    ).update({'source_submission_id': None})

    db.session.delete(submission)
    db.session.commit()

    return jsonify({'message': 'deleted'}), 200


# Templates: reusable starting points for proposals, saved from work the
# team has already done (or written from scratch)
@team_bp.route('/templates', methods=['GET'])
@roles_required('MEMBER', 'ADMIN')
def list_templates():
    templates = db.session.query(Templates).order_by(Templates.updated_at.desc()).all()
    return jsonify({'templates': [dump_template(t) for t in templates]}), 200


@team_bp.route('/templates', methods=['POST'])
@roles_required('MEMBER', 'ADMIN')
def create_template():
    try:
        data = template_create_schema.load(request.json)
    except ValidationError as e:
        return jsonify(e.messages), 400

    # Start from an existing proposal: anything not given comes from it
    source_id = data.pop('source_submission_id', None)
    source = _submission_or_none(source_id) if source_id else None
    if source_id and not source:
        return jsonify({'error': 'source proposal not found'}), 404
    if source:
        data.setdefault('project_type', source.project_type)
        data.setdefault('budget_range', source.budget_range)
        data.setdefault('timeline_weeks', source.timeline_weeks)
        data.setdefault('description', source.description)

    missing = [f for f in ('project_type', 'budget_range', 'timeline_weeks', 'description') if f not in data]
    if missing:
        return jsonify({'error': f'{", ".join(missing)} required (or pick a source proposal)'}), 400

    template = Templates(
        **{k: v.strip() if isinstance(v, str) else v for k, v in data.items()},
        source_submission_id=source.id if source else None,
        created_by=request.user_id,
    )
    db.session.add(template)
    db.session.commit()

    return jsonify({'template': dump_template(template)}), 201


@team_bp.route('/templates/<template_id>', methods=['PATCH'])
@roles_required('MEMBER', 'ADMIN')
def update_template(template_id):
    template = db.session.get(Templates, template_id)
    if not template:
        return jsonify({'error': 'not found'}), 404

    try:
        data = template_update_schema.load(request.json)
    except ValidationError as e:
        return jsonify(e.messages), 400

    for field, value in data.items():
        setattr(template, field, value.strip() if isinstance(value, str) else value)
    if data:
        template.updated_at = datetime.now(timezone.utc)
    db.session.commit()

    return jsonify({'template': dump_template(template)}), 200


@team_bp.route('/templates/<template_id>', methods=['DELETE'])
@roles_required('MEMBER', 'ADMIN')
def delete_template(template_id):
    template = db.session.get(Templates, template_id)
    if not template:
        return jsonify({'error': 'not found'}), 404

    db.session.delete(template)
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

    # Extensions the team currently allows (Settings > File Types)
    allowed_extensions = enabled_extensions()

    saved = []
    for upload in uploads:
        original_name = (upload.filename or '').strip()
        extension = original_name.rsplit('.', 1)[-1].lower() if '.' in original_name else ''
        if not original_name or extension not in allowed_extensions:
            allowed = ', '.join(sorted(allowed_extensions))
            return jsonify({'error': f'file type not allowed (allowed: {allowed})'}), 400

        data = upload.read()

        record = ProposalFiles(
            submission_id=submission.id,
            uploader_id=request.user_id,
            original_name=original_name,
            content=data,
            content_type=upload.mimetype or 'application/octet-stream',
            size_bytes=len(data),
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
        BytesIO(file.content),
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

    db.session.delete(file)
    db.session.commit()

    return jsonify({'message': 'deleted'}), 200
