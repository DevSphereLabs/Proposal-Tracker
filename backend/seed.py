"""Seed the database with a demo client and sample proposals.

Idempotent: re-running wipes the demo client's existing proposals (and their
files/messages) and recreates them, so you always get the same clean state.

    python seed.py

Demo login (client portal):  john@doecorp.com  /  password123
"""
import base64
from datetime import datetime, timezone

from werkzeug.security import generate_password_hash

from app import create_app
from app.models import (
    Projects,
    ProposalFiles,
    ProposalMessages,
    Proposals,
    SubmissionNotes,
    Submissions,
    Users,
    db,
)

DEMO_EMAIL = 'john@doecorp.com'
DEMO_PASSWORD = 'password123'
TEAM_EMAIL = 'team@techsquad.com'


def dt(year, month, day):
    """A fixed timezone-aware timestamp, so seeded dates are stable."""
    return datetime(year, month, day, 12, 0, tzinfo=timezone.utc)


def get_or_create_user(email, **fields):
    user = db.session.query(Users).where(Users.email == email).first()
    if not user:
        user = Users(email=email)
        db.session.add(user)
    for key, value in fields.items():
        setattr(user, key, value)
    return user


def wipe_client_data(client):
    """Remove the client's submissions and everything hanging off them."""
    submissions = db.session.query(Submissions).where(
        (Submissions.client_id == client.id) | (Submissions.contact_email == client.email)
    ).all()

    for submission in submissions:
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
        db.session.delete(submission)

    db.session.flush()


# A small valid JPEG (64x64 light blue), so seeded .jpg files actually open
# after downloading.
JPEG_PLACEHOLDER = base64.b64decode(
    '/9j/4AAQSkZJRgABAQAASABIAAD/4QBMRXhpZgAATU0AKgAAAAgAAYdpAAQAAAABAAAAGgAAAAAA'
    'A6ABAAMAAAABAAEAAKACAAQAAAABAAAAQKADAAQAAAABAAAAQAAAAAD/7QA4UGhvdG9zaG9wIDMu'
    'MAA4QklNBAQAAAAAAAA4QklNBCUAAAAAABDUHYzZjwCyBOmACZjs+EJ+/8AAEQgAQABAAwEiAAIR'
    'AQMRAf/EAB8AAAEFAQEBAQEBAAAAAAAAAAABAgMEBQYHCAkKC//EALUQAAIBAwMCBAMFBQQEAAAB'
    'fQECAwAEEQUSITFBBhNRYQcicRQygZGhCCNCscEVUtHwJDNicoIJChYXGBkaJSYnKCkqNDU2Nzg5'
    'OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6g4SFhoeIiYqSk5SVlpeYmZqio6Slpqeo'
    'qaqys7S1tre4ubrCw8TFxsfIycrS09TV1tfY2drh4uPk5ebn6Onq8fLz9PX29/j5+v/EAB8BAAMB'
    'AQEBAQEBAQEAAAAAAAABAgMEBQYHCAkKC//EALURAAIBAgQEAwQHBQQEAAECdwABAgMRBAUhMQYS'
    'QVEHYXETIjKBCBRCkaGxwQkjM1LwFWJy0QoWJDThJfEXGBkaJicoKSo1Njc4OTpDREVGR0hJSlNU'
    'VVZXWFlaY2RlZmdoaWpzdHV2d3h5eoKDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5'
    'usLDxMXGx8jJytLT1NXW19jZ2uLj5OXm5+jp6vLz9PX29/j5+v/bAEMAAgICAgICBAICBAYEBAQG'
    'CAYGBgYICggICAgICgwKCgoKCgoMDAwMDAwMDA4ODg4ODhAQEBAQEhISEhISEhISEv/bAEMBAwMD'
    'BQQFCAQECBMNCw0TExMTExMTExMTExMTExMTExMTExMTExMTExMTExMTExMTExMTExMTExMTExMT'
    'ExMTE//dAAQABP/aAAwDAQACEQMRAD8A/TSiiivpT4IKKKKACiiigAooooA//9D9NKKKK+lPggoo'
    'ooAKKKKACiiigD//0f00ooor6U+CCiiigAooooAKKKKAP//S/TSiiivpT4IKKKKACiiigAooooA/'
    '/9k='
)


def make_pdf(title):
    """A tiny but valid one-page PDF with `title` printed on it."""
    content = f'BT /F1 24 Tf 72 720 Td ({title}) Tj ET'.encode()
    objects = [
        b'<< /Type /Catalog /Pages 2 0 R >>',
        b'<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
        b'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] '
        b'/Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
        b'<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
        b'<< /Length %d >>\nstream\n%s\nendstream' % (len(content), content),
    ]

    out = bytearray(b'%PDF-1.4\n')
    offsets = []
    for number, body in enumerate(objects, start=1):
        offsets.append(len(out))
        out += b'%d 0 obj\n%s\nendobj\n' % (number, body)

    xref_at = len(out)
    out += b'xref\n0 %d\n0000000000 65535 f \n' % (len(objects) + 1)
    for offset in offsets:
        out += b'%010d 00000 n \n' % offset
    out += b'trailer\n<< /Size %d /Root 1 0 R >>\nstartxref\n%d\n%%%%EOF\n' % (
        len(objects) + 1, xref_at,
    )
    return bytes(out)


def placeholder_bytes(name):
    """Real content for a seeded file, so downloads open in a viewer."""
    ext = name.rsplit('.', 1)[-1].lower()
    if ext == 'pdf':
        return make_pdf(name)
    if ext in ('jpg', 'jpeg'):
        return JPEG_PLACEHOLDER
    return f'Placeholder for {name}\n'.encode()


def make_file(submission_id, uploader_id, name, content_type, uploaded_on):
    """Create a placeholder file on disk plus its metadata row."""
    data = placeholder_bytes(name)
    return ProposalFiles(
        submission_id=submission_id,
        uploader_id=uploader_id,
        original_name=name,
        content=data,
        content_type=content_type,
        size_bytes=len(data),
        created_at=uploaded_on,
    )


def seed():
    app = create_app()
    with app.app_context():
        

        # The team account authors "team" messages and uploads team files.
        team = get_or_create_user(
            TEAM_EMAIL,
            password_hash=generate_password_hash('teampass123'),
            role='MEMBER',
            first_name='Tech',
            last_name='Squad',
        )

        # The demo client whose portal we're populating.
        john = get_or_create_user(
            DEMO_EMAIL,
            password_hash=generate_password_hash(DEMO_PASSWORD),
            role='CLIENT',
            first_name='John',
            last_name='Doe',
            phone='555-555-5555',
            company_name='John Doe INC',
        )
        db.session.flush()

        wipe_client_data(john)

        # --- Active: E-commerce Website (matches the mockup) ---
        ecommerce = Submissions(
            contact_name='John Doe',
            contact_email=DEMO_EMAIL,
            project_type='Website',
            budget_range='$5000',
            timeline_weeks=12,
            description=(
                'This project involves the design and development of a modern '
                'e-commerce website tailored to showcase products, streamline '
                'online sales, and enhance the customer shopping experience.'
            ),
            status='NEW',
            client_id=john.id,
            created_at=dt(2026, 6, 15),
        )
        db.session.add(ecommerce)
        db.session.flush()
        db.session.add_all([
            Projects(submission_id=ecommerce.id, title='E-commerce Website', updated_at=dt(2026, 6, 18)),
            Proposals(submission_id=ecommerce.id, scope='Full e-commerce build', price=5000,
                      created_at=dt(2026, 6, 15), updated_at=dt(2026, 6, 18)),
            make_file(ecommerce.id, john.id, 'Logo.jpg', 'image/jpeg', dt(2026, 6, 17)),
            make_file(ecommerce.id, john.id, 'Banner.jpg', 'image/jpeg', dt(2026, 6, 17)),
            ProposalMessages(submission_id=ecommerce.id, sender_id=team.id,
                             body='Contact client to confirm start date', created_at=dt(2026, 6, 19)),
            ProposalMessages(submission_id=ecommerce.id, sender_id=john.id,
                             body='Sounds great, looking forward to getting started!', created_at=dt(2026, 6, 19)),
        ])

        # --- Active: Mobile App (has a team-uploaded file the client can't delete) ---
        mobile = Submissions(
            contact_name='John Doe',
            contact_email=DEMO_EMAIL,
            project_type='Mobile App',
            budget_range='$12,000',
            timeline_weeks=24,
            description=(
                'A companion mobile app for iOS and Android that lets customers '
                'browse the catalog, track orders, and receive push notifications.'
            ),
            status='CONTACTED',
            client_id=john.id,
            created_at=dt(2026, 7, 1),
        )
        db.session.add(mobile)
        db.session.flush()
        db.session.add_all([
            Projects(submission_id=mobile.id, title='Mobile App', updated_at=dt(2026, 7, 2)),
            Proposals(submission_id=mobile.id, scope='iOS + Android companion app', price=12000,
                      created_at=dt(2026, 7, 1), updated_at=dt(2026, 7, 2)),
            make_file(mobile.id, team.id, 'Wireframes.pdf', 'application/pdf', dt(2026, 7, 1)),
            ProposalMessages(submission_id=mobile.id, sender_id=team.id,
                             body='Wireframes attached - design review starts this week', created_at=dt(2026, 7, 2)),
        ])

        # --- Completed: Brand Refresh ---
        brand = Submissions(
            contact_name='John Doe',
            contact_email=DEMO_EMAIL,
            project_type='Design',
            budget_range='$3000',
            timeline_weeks=4,
            description='A refresh of the company brand: updated logo, color palette, and a style guide.',
            status='WON',
            client_id=john.id,
            created_at=dt(2026, 5, 20),
        )
        db.session.add(brand)
        db.session.flush()
        db.session.add_all([
            Projects(submission_id=brand.id, title='Brand Refresh', updated_at=dt(2026, 5, 30)),
            Proposals(submission_id=brand.id, scope='Logo + style guide', price=3000,
                      created_at=dt(2026, 5, 20), updated_at=dt(2026, 5, 30)),
            make_file(brand.id, john.id, 'StyleGuide.pdf', 'application/pdf', dt(2026, 5, 28)),
            ProposalMessages(submission_id=brand.id, sender_id=team.id,
                             body='Final style guide delivered. Thanks for working with us!', created_at=dt(2026, 5, 30)),
        ])

        # --- Declined: SEO Audit ---
        seo = Submissions(
            contact_name='John Doe',
            contact_email=DEMO_EMAIL,
            project_type='SEO',
            budget_range='Under $5k',
            timeline_weeks=3,
            description='A one-time SEO audit of the existing marketing site with a prioritized fix list.',
            status='LOST',
            client_id=john.id,
            created_at=dt(2026, 4, 10),
        )
        db.session.add(seo)
        db.session.flush()
        db.session.add_all([
            Projects(submission_id=seo.id, title='SEO Audit', updated_at=dt(2026, 4, 15)),
            Proposals(submission_id=seo.id, scope='One-time SEO audit', price=2500,
                      created_at=dt(2026, 4, 10), updated_at=dt(2026, 4, 15)),
        ])

        db.session.commit()

        print('Seeded demo data.')
        print(f'  Client login:  {DEMO_EMAIL}  /  {DEMO_PASSWORD}')
        print('  Proposals: 2 active, 1 completed, 1 declined')


if __name__ == '__main__':
    seed()
