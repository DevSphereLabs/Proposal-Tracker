import os
from pathlib import Path

from dotenv import load_dotenv

# backend/ directory: .env, the dev SQLite file, and uploads live here
BASE_DIR = Path(__file__).resolve().parent.parent

load_dotenv(BASE_DIR / '.env')

def _database_uri() -> str:
    """Neon hands out postgresql:// URLs, which SQLAlchemy reads as psycopg2 —
    the driver we don't install. Point it at psycopg 3 instead."""
    url = os.environ.get('DATABASE_URL')
    if not url:
        return f"sqlite:///{BASE_DIR / 'proposal_tracker.db'}"

    if url.startswith('postgres://'):
        url = url.replace('postgres://', 'postgresql://', 1)
    if url.startswith('postgresql://'):
        url = url.replace('postgresql://', 'postgresql+psycopg://', 1)

    return url

class Config:
    SECRET_KEY = os.environ.get('SECRET_KEY')

    # Local SQLite by default; set DATABASE_URL for Postgres
    SQLALCHEMY_DATABASE_URI = _database_uri()

    # The only origin allowed to call this API from a browser
    FRONTEND_ORIGIN = os.environ.get('FRONTEND_ORIGIN', 'http://localhost:3100')

    # Flask rejects request bodies larger than this with a 413
    MAX_CONTENT_LENGTH = int(os.environ.get('MAX_UPLOAD_MB', '10')) * 1024 * 1024
