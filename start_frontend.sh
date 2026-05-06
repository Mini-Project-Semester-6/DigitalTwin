#!/usr/bin/env bash
# start_frontend.sh – install deps and launch Vite dev server
set -e

cd "$(dirname "$0")/frontend"

echo " Installing Node dependencies…"
npm install

echo " Starting React dev server on http://localhost:3000"
npm run dev
