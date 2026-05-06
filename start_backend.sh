#!/usr/bin/env bash
# start_backend.sh – install deps and launch FastAPI
set -e

cd "$(dirname "$0")/backend"

echo "Installing Python dependencies…"
pip install -r requirements.txt --break-system-packages -q

echo "Starting FastAPI on http://localhost:8000"
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
