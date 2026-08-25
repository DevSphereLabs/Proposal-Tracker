from flask import Blueprint

team_bp = Blueprint('team_bp', __name__)

from . import routes
