from flask import Flask, jsonify

from app.config import Config
from app.extensions import cors, ma, migrate
from app.models import db


def create_app(config_class=Config):
    app = Flask(__name__)
    app.config.from_object(config_class)

    # Treat /path and /path/ as the same route instead of 308-redirecting
    # between them, so the frontend proxy doesn't have to match slashes exactly.
    app.url_map.strict_slashes = False

    if not app.config.get('SECRET_KEY'):
        raise RuntimeError(
            'SECRET_KEY is not set. Copy backend/.env.example to backend/.env '
            'and set a strong random value: '
            'python3 -c "import secrets; print(secrets.token_hex(32))"'
        )

    db.init_app(app)
    migrate.init_app(app, db)
    ma.init_app(app)

    # Browsers may only call this API from the frontend's origin. The
    # Authorization header carries the JWT, so no cookies/credentials needed.
    cors.init_app(app, origins=[app.config['FRONTEND_ORIGIN']])

    from app.blueprints.portal import portal_bp
    from app.blueprints.submissions import submissions_bp
    from app.blueprints.team import team_bp
    from app.blueprints.users import users_bp

    app.register_blueprint(users_bp, url_prefix='/api/users')
    app.register_blueprint(submissions_bp, url_prefix='/api/submissions')
    app.register_blueprint(portal_bp, url_prefix='/api/portal')
    app.register_blueprint(team_bp, url_prefix='/api/team')

    @app.get('/api/health')
    def health():
        return jsonify({'status': 'ok'})

    # JSON error responses everywhere; never leak internals to the client
    @app.errorhandler(404)
    def not_found(_e):
        return jsonify({'error': 'not found'}), 404

    @app.errorhandler(413)
    def too_large(_e):
        max_mb = app.config['MAX_CONTENT_LENGTH'] // (1024 * 1024)
        return jsonify({'error': f'upload too large (max {max_mb} MB)'}), 413

    @app.errorhandler(500)
    def server_error(_e):
        return jsonify({'error': 'internal server error'}), 500

    return app
