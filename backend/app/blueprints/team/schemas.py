"""Serializers for the team's proposal manager.

Reuses the portal's file/message shapes so both dashboards render the same
data, but exposes the lead's full contact info (the portal never does) and a
manager-facing status vocabulary.
"""
from marshmallow import Schema, fields, validate

from app.blueprints.portal.schemas import _short_date, dump_file, dump_message
from app.models import SubmissionNotes, Submissions
from app.util.value import submission_value

# Internal pipeline status -> what the proposal manager displays
MANAGER_STATUS = {
    'NEW': 'new',
    'CONTACTED': 'in_progress',
    'PROPOSAL_SENT': 'in_progress',
    'WON': 'accepted',
    'LOST': 'declined',
}

# What the manager sets -> internal pipeline status. in_progress maps to
# CONTACTED; PROPOSAL_SENT is set by the (future) proposal-sending flow.
MANAGER_STATUS_UPDATE = {
    'new': 'NEW',
    'in_progress': 'CONTACTED',
    'accepted': 'WON',
    'declined': 'LOST',
}


class NoteCreateSchema(Schema):
    text = fields.Str(required=True, validate=validate.Length(min=1, max=5000))


HEX_COLOR = validate.Regexp(r'^#[0-9a-fA-F]{6}$', error='color must be a hex value like #38bdf8')


class CustomStatusSchema(Schema):
    name = fields.Str(required=True, validate=validate.Length(min=1, max=30))
    color = fields.Str(required=True, validate=HEX_COLOR)


# Partial update: only the keys being changed are sent. Route-level checks
# cover what needs the current state (file types subset, known color keys).
class SettingsUpdateSchema(Schema):
    status_colors = fields.Dict(
        keys=fields.Str(validate=validate.Length(min=1, max=30)),
        values=fields.Str(validate=HEX_COLOR),
    )
    custom_statuses = fields.List(
        fields.Nested(CustomStatusSchema), validate=validate.Length(max=20)
    )
    categories = fields.List(
        fields.Str(validate=validate.Length(min=1, max=50)),
        validate=validate.Length(min=1, max=25),
    )
    file_types = fields.List(fields.Str(), validate=validate.Length(min=1))
    budget_ranges = fields.List(
        fields.Str(validate=validate.Length(min=1, max=50)),
        validate=validate.Length(min=1, max=25),
    )


# The signed-in team member's own account. Password changes require the
# current password alongside the new one.
class TeamProfileUpdateSchema(Schema):
    first_name = fields.Str(validate=validate.Length(min=1, max=100))
    last_name = fields.Str(validate=validate.Length(min=1, max=100))
    phone = fields.Str(validate=validate.Length(max=50))
    current_password = fields.Str(load_only=True)
    new_password = fields.Str(load_only=True, validate=validate.Length(min=8, max=200))


# Same editable fields the portal allows, plus the pipeline status
class TeamProposalUpdateSchema(Schema):
    budget_range = fields.Str(validate=validate.Length(min=1, max=50))
    timeline_weeks = fields.Int(validate=validate.Range(min=1, max=520))
    project_type = fields.Str(validate=validate.Length(min=1, max=50))
    description = fields.Str(validate=validate.Length(min=1))
    status = fields.Str(validate=validate.OneOf(list(MANAGER_STATUS_UPDATE)))


note_create_schema = NoteCreateSchema()
settings_update_schema = SettingsUpdateSchema()
team_profile_update_schema = TeamProfileUpdateSchema()
team_proposal_update_schema = TeamProposalUpdateSchema()


def dump_note(note: SubmissionNotes) -> dict:
    author = note.author
    initials = f'{(author.first_name or " ")[0]}{(author.last_name or " ")[0]}'.strip().upper()
    return {
        'id': note.id,
        'sender': initials or 'TQ',
        'text': note.content,
        'posted': _short_date(note.created_at),
    }


def client_name(submission: Submissions) -> str:
    """The lead's name as the team should see it.

    A linked client can update their details on the portal, so prefer their
    current profile; fall back to what was typed on the intake form for
    submissions with no account (or a profile with no name yet).
    """
    client = submission.client
    if client:
        name = f'{client.first_name or ""} {client.last_name or ""}'.strip()
        if name:
            return name
    return submission.contact_name


def dump_row(submission: Submissions) -> dict:
    """One row of the proposals table."""
    return {
        'id': submission.id,
        'title': submission.project.title if submission.project else submission.project_type,
        'clientName': client_name(submission),
        'status': MANAGER_STATUS.get(submission.status, 'new'),
        'created': _short_date(submission.created_at),
        # ISO timestamp so the frontend can sort without parsing display dates
        'createdSort': submission.created_at.isoformat(),
    }


def client_key(submission: Submissions) -> str:
    """Groups a submission under its client: the linked account when there
    is one, otherwise the intake email (a lead who hasn't registered)."""
    return submission.client_id or f'lead:{submission.contact_email.strip().lower()}'


def dump_client_proposal(submission: Submissions) -> dict:
    """One proposal in a client's expanded list on the Clients page."""
    return {
        'id': submission.id,
        'title': submission.project.title if submission.project else submission.project_type,
        'status': MANAGER_STATUS.get(submission.status, 'new'),
        'budget': submission.budget_range,
        'value': submission_value(submission),
        'timelineWeeks': submission.timeline_weeks,
        'created': _short_date(submission.created_at),
        'createdSort': submission.created_at.isoformat(),
    }


def dump_client_summary(submissions: list) -> dict:
    """A client with every submission grouped under them, plus the totals
    the Clients page ranks by. All `submissions` must share a client_key."""
    by_date = sorted(submissions, key=lambda s: s.created_at)
    earliest, latest = by_date[0], by_date[-1]
    client = latest.client

    counts = {key: 0 for key in MANAGER_STATUS_UPDATE}
    for s in submissions:
        counts[MANAGER_STATUS.get(s.status, 'new')] += 1

    return {
        'id': client.id if client else client_key(latest),
        'name': client_name(latest),
        'company': (client.company_name if client else '') or '',
        'email': client.email if client else latest.contact_email,
        'phone': (client.phone if client else '') or '',
        'hasAccount': client is not None,
        'proposalCount': len(submissions),
        'counts': counts,
        'totalValue': sum(submission_value(s) for s in submissions),
        'wonValue': sum(submission_value(s) for s in submissions if s.status == 'WON'),
        'avgTimelineWeeks': round(sum(s.timeline_weeks for s in submissions) / len(submissions), 1),
        'firstCreated': _short_date(earliest.created_at),
        'lastCreated': _short_date(latest.created_at),
        'lastCreatedSort': latest.created_at.isoformat(),
        'proposals': [dump_client_proposal(s) for s in reversed(by_date)],
    }


def dump_detail(submission: Submissions) -> dict:
    """Everything the View popup shows across its tabs."""
    client = submission.client
    updated = submission.proposal.updated_at if submission.proposal else submission.created_at

    return {
        **dump_row(submission),
        'client': {
            'name': client_name(submission),
            'email': submission.contact_email,
            'phone': (client.phone if client else '') or '',
            'company': (client.company_name if client else '') or '',
        },
        'budget': submission.budget_range,
        'timelineWeeks': submission.timeline_weeks,
        'projectType': submission.project_type,
        'details': submission.description,
        'updated': _short_date(updated),
        'notes': [dump_note(n) for n in submission.notes],
        'files': [dump_file(f) for f in submission.files],
        'messages': [dump_message(m) for m in submission.messages],
    }
