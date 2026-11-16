#!/usr/bin/env bash
set -e
project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$project_root"
exec "$project_root/venv/bin/python" -m uvicorn app.main:app --host 127.0.0.1 --port 8011 --reload --reload-dir app --lifespan on --log-level info
