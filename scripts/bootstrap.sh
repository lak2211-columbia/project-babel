#!/usr/bin/env bash

set -euo pipefail

cd "$(dirname "$0")/.."

if [ -n "${PYTHON_BIN:-}" ]; then
  chosen_python="$PYTHON_BIN"
elif command -v python3.11 >/dev/null 2>&1; then
  chosen_python="python3.11"
elif command -v python3 >/dev/null 2>&1; then
  chosen_python="python3"
elif command -v python >/dev/null 2>&1; then
  chosen_python="python"
else
  echo "Required Python (>=3.11) interpreter was not found." >&2
  exit 1
fi

"$chosen_python" -c 'import sys; assert sys.version_info >= (3, 11), "Python >= 3.11 required"'
"$chosen_python" -m venv services/pipeline/.venv

if [ -f "services/pipeline/.venv/bin/activate" ]; then
  # shellcheck disable=SC1091
  . services/pipeline/.venv/bin/activate
elif [ -f "services/pipeline/.venv/Scripts/activate" ]; then
  # shellcheck disable=SC1091
  . services/pipeline/.venv/Scripts/activate
else
  echo "Virtual environment activation script not found." >&2
  exit 1
fi

python -m pip install --upgrade pip
pip install -e 'services/pipeline[dev]'

echo "Bootstrap complete."
