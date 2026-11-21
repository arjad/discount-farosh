#!/usr/bin/env bash
# Scrape MCB deals in a visible browser and save to Postgres. Keeps the Mac awake while it runs.
# Usage:  ./scrape_mcb.sh   (runs app/public/routes.py directly — all MCB merchants)
set -e
cd "$(dirname "$0")"
exec caffeinate -i .venv/bin/python app/public/routes.py
