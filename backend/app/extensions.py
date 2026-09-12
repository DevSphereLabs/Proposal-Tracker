# Flask extensions, instantiated once here and bound to the app in
# create_app(). The db handle lives in app.models next to the model classes.
from flask_cors import CORS
from flask_marshmallow import Marshmallow
from flask_migrate import Migrate

ma = Marshmallow()
cors = CORS()
migrate = Migrate()