"""Serializers for the team's proposal manager.

Reuses the portal's file/message shapes so both dashboards render the same
data, but exposes the lead's full contact info (the portal never does) and a
manager-facing status vocabulary.
"""
from marshmallow import Schema, fields, validate

from app.blueprints.portal.schemas import _short_date, dump_file, dump_message
from app.models import SubmissionNotes, Submissions

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


# Same editable fields the portal allows, plus the pipeline status
class TeamProposalUpdateSchema(Schema):
    budget_range = fields.Str(validate=validate.Length(min=1, max=50))
    timeline_weeks = fields.Int(validate=validate.Range(min=1, max=520))
    project_type = fields.Str(validate=validate.Length(min=1, max=50))
    description = fields.Str(validate=validate.Length(min=1))
    status = fields.Str(validate=validate.OneOf(list(MANAGER_STATUS_UPDATE)))


note_create_schema = NoteCreateSchema()
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


def dump_row(submission: Submissions) -> dict:
    """One row of the proposals table."""
    return {
        'id': submission.id,
        'title': submission.project.title if submission.project else submission.project_type,
        'clientName': submission.contact_name,
        'status': MANAGER_STATUS.get(submission.status, 'new'),
        'created': _short_date(submission.created_at),
        # ISO timestamp so the frontend can sort without parsing display dates
        'createdSort': submission.created_at.isoformat(),
    }


def dump_detail(submission: Submissions) -> dict:
    """Everything the View popup shows across its tabs."""
    client = submission.client
    updated = submission.proposal.updated_at if submission.proposal else submission.created_at

    return {
        **dump_row(submission),
        'client': {
            'name': submission.contact_name,
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
