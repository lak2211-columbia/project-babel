#!/usr/bin/env bash

set -euo pipefail

cd "$(dirname "$0")/.."

PYTHON_BIN="${PYTHON_BIN:-python3.11}"

if ! command -v "$PYTHON_BIN" >/dev/null 2>&1; then
  echo "Required interpreter '$PYTHON_BIN' was not found." >&2
  exit 1
fi

"$PYTHON_BIN" -m venv services/pipeline/.venv
. services/pipeline/.venv/bin/activate
pip install --upgrade pip
pip install -e services/pipeline[dev]

echo "Bootstrap complete."
