import uuid
from datetime import date, datetime, timezone

from flask_sqlalchemy import SQLAlchemy
from sqlalchemy import (
    Boolean, Column, Date, DateTime, Float, ForeignKey, Integer, Interval,
    JSON, LargeBinary, Numeric, String, Table, Text,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship

def _new_uuid() -> str:
    """Generate a fresh UUIDv4 string for a primary key."""
    return str(uuid.uuid4())


def _utcnow() -> datetime:
    """Lambda-friendly default for created_at columns. Evaluated per row."""
    return datetime.now(timezone.utc)

class Base(DeclarativeBase):
    pass


db = SQLAlchemy(model_class=Base)



class Users(Base):
    __tablename__ = 'users'

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_new_uuid)
    email: Mapped[str] = mapped_column(String(100), unique=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(String(300), nullable=False)
    role: Mapped[str] = mapped_column(String(50), nullable=False, default='MEMBER')  ## ADMIN, MEMBER (team), CLIENT (portal)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)

    # Profile shown on the client portal's "My Details" card
    first_name: Mapped[str] = mapped_column(String(100), nullable=True)
    last_name: Mapped[str] = mapped_column(String(100), nullable=True)
    phone: Mapped[str] = mapped_column(String(50), nullable=True)
    company_name: Mapped[str] = mapped_column(String(200), nullable=True)


class Submissions(Base):
    __tablename__ = 'submissions'

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_new_uuid)
    contact_name: Mapped[str] = mapped_column(String(100), nullable=False)
    contact_email: Mapped[str] = mapped_column(String(100), nullable=False)
    project_type: Mapped[str] = mapped_column(String(50), nullable=False)
    budget_range: Mapped[str] = mapped_column(String(50), nullable=False)
    timeline_weeks: Mapped[int] = mapped_column(Integer, nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default='NEW') ## NEW, CONTACTED, PROPOSAL_SENT, WON, lOST
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)

    # Set once the client creates their portal account; links the submission
    # to the user who can see it on /api/portal
    client_id: Mapped[str] = mapped_column(String, ForeignKey('users.id'), nullable=True)

    notes: Mapped[list['SubmissionNotes']] = relationship('SubmissionNotes', back_populates='submission')
    proposal: Mapped['Proposals'] = relationship('Proposals', back_populates='submission', uselist=False)
    project: Mapped['Projects'] = relationship('Projects', back_populates='submission', uselist=False)
    client: Mapped['Users'] = relationship('Users')
    messages: Mapped[list['ProposalMessages']] = relationship(
        'ProposalMessages', back_populates='submission', order_by='ProposalMessages.created_at'
    )
    files: Mapped[list['ProposalFiles']] = relationship(
        'ProposalFiles', back_populates='submission', order_by='ProposalFiles.created_at'
    )

class SubmissionNotes(Base):
    __tablename__ = 'submission_notes'

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_new_uuid)
    submission_id: Mapped[str] = mapped_column(String, ForeignKey('submissions.id'), nullable=False)
    author_id: Mapped[str] = mapped_column(String, ForeignKey('users.id'), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)

    submission: Mapped['Submissions'] = relationship('Submissions', back_populates='notes')
    author: Mapped['Users'] = relationship('Users')


class Proposals(Base):
    __tablename__ = 'proposals'

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_new_uuid)
    submission_id: Mapped[str] = mapped_column(String, ForeignKey('submissions.id'), nullable=False, unique=True)
    scope: Mapped[str] = mapped_column(Text, nullable=False)
    price: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False, default=0)
    expected_deadline: Mapped[date] = mapped_column(Date, nullable=True)
    feedback_timeframe: Mapped[str] = mapped_column(String(100), nullable=True)
    pdf_storage_url: Mapped[str] = mapped_column(String(300), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)

    submission: Mapped['Submissions'] = relationship('Submissions', back_populates='proposal')


class ProposalMessages(Base):
    """Message thread between the client and the team, per submission."""
    __tablename__ = 'proposal_messages'

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_new_uuid)
    submission_id: Mapped[str] = mapped_column(String, ForeignKey('submissions.id'), nullable=False)
    sender_id: Mapped[str] = mapped_column(String, ForeignKey('users.id'), nullable=False)
    body: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)

    submission: Mapped['Submissions'] = relationship('Submissions', back_populates='messages')
    sender: Mapped['Users'] = relationship('Users')


class ProposalFiles(Base):
    """A document uploaded to a submission's file manager.

    Content lives on disk under UPLOAD_DIR as `stored_name` (a UUID we
    generate, never the client's filename); this row holds the metadata.
    """
    __tablename__ = 'proposal_files'

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_new_uuid)
    submission_id: Mapped[str] = mapped_column(String, ForeignKey('submissions.id'), nullable=False)
    uploader_id: Mapped[str] = mapped_column(String, ForeignKey('users.id'), nullable=False)
    original_name: Mapped[str] = mapped_column(String(255), nullable=False)
    stored_name: Mapped[str] = mapped_column(String(300), nullable=False, unique=True)
    content_type: Mapped[str] = mapped_column(String(100), nullable=False)
    size_bytes: Mapped[int] = mapped_column(Integer, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)

    submission: Mapped['Submissions'] = relationship('Submissions', back_populates='files')
    uploader: Mapped['Users'] = relationship('Users')


class Projects(Base):
    __tablename__ = 'projects'

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_new_uuid)
    submission_id: Mapped[str] = mapped_column(String, ForeignKey('submissions.id'), nullable=False, unique=True)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    kanban_status: Mapped[str] = mapped_column(String(20), nullable=False, default='Backlog')
    board_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow, onupdate=_utcnow)

    submission: Mapped['Submissions'] = relationship('Submissions', back_populates='project')

