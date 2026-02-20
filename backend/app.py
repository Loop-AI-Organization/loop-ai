from __future__ import annotations

import os
import sys

from dotenv import load_dotenv
from flask import Flask
from flask_sock import Sock


def create_app() -> Flask:
    # Ensure `backend/` is on sys.path even when run from repo root.
    sys.path.insert(0, os.path.dirname(__file__))

    load_dotenv()

    app = Flask(__name__)
    sock = Sock(app)

    from loop_ai.web.ws import register_ws

    register_ws(sock)

    @app.get("/health")
    def health():
        return {"ok": True}

    return app


if __name__ == "__main__":
    app = create_app()
    app.run(host="0.0.0.0", port=5000, debug=True)
