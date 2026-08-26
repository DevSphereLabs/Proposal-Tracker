"""Team-configurable settings with hardcoded defaults.

Stored as JSON blobs in the settings table, one row per key, written only
when the team saves a change. Everything reads through load_settings() so
defaults and overrides merge in one place.
"""
from app.models import Settings, db

# Every extension an upload may ever have. The File Types setting can only
# enable/disable within this list — documents only, no executables/scripts.
SAFE_EXTENSIONS = [
    'pdf', 'png', 'jpg', 'jpeg', 'gif', 'doc', 'docx', 'xls', 'xlsx', 'csv', 'txt', 'zip',
]

DEFAULT_SETTINGS = {
    # Pill colors for the proposal manager's status vocabulary; the client
    # portal derives its pill colors from these too
    'status_colors': {
        'new': '#d1d5db',
        'in_progress': '#38bdf8',
        'accepted': '#22c55e',
        'declined': '#ef4444',
    },
    # Extra statuses the team has defined (name + color). Stored and shown
    # in settings; wiring them into the pipeline is future work.
    'custom_statuses': [],
    # Project categories offered as suggestions on edit forms
    'categories': [
        'Web Development', 'Mobile App', 'Full Stack Web App', 'Website', 'Design', 'Other',
    ],
    # Which of SAFE_EXTENSIONS uploads currently accept
    'file_types': list(SAFE_EXTENSIONS),
    # Budget ranges offered as suggestions on edit forms
    'budget_ranges': ['Under $5k', '$5k - $15k', '$15k - $50k', '$50k+', 'Not sure yet'],
}


def load_settings() -> dict:
    """Stored settings merged over the defaults."""
    stored = {row.key: row.value for row in db.session.query(Settings).all()}
    merged = {}
    for key, default in DEFAULT_SETTINGS.items():
        value = stored.get(key, default)
        # A partial color save shouldn't drop the colors it didn't mention
        if key == 'status_colors':
            value = {**default, **(value or {})}
        merged[key] = value
    return merged


def save_settings(changes: dict) -> None:
    """Upsert the given keys. Caller validates and commits."""
    for key, value in changes.items():
        row = db.session.get(Settings, key)
        if row:
            row.value = value
        else:
            db.session.add(Settings(key=key, value=value))


def enabled_extensions() -> set:
    """File extensions uploads accept right now."""
    return set(load_settings()['file_types'])
