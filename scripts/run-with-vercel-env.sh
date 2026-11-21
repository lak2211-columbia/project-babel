#!/usr/bin/env bash

set -euo pipefail

if [ "$#" -lt 2 ]; then
  echo "usage: $0 <development|preview|production> <command...>" >&2
  exit 1
fi

environment="$1"
shift

case "$environment" in
  development|preview|production) ;;
  *)
    echo "invalid environment '$environment' (expected development, preview, or production)" >&2
    exit 1
    ;;
esac

root_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
app_dir="$root_dir/apps/web"
env_file="$app_dir/.vercel/.env.${environment}.local"

cleanup() {
  if [ "${KEEP_VERCEL_ENV:-0}" != "1" ] && [ -f "$env_file" ]; then
    rm -f "$env_file"
  fi
}
trap cleanup EXIT

cd "$app_dir"
npx vercel env pull ".vercel/.env.${environment}.local" --environment="$environment" --yes >/dev/null

if command -v python3 >/dev/null 2>&1; then
  py_bin="python3"
else
  py_bin="python"
fi

cd "$root_dir"
# Parse KEY=VALUE lines safely without shell evaluation (avoids executing $() or backticks in secrets).
# Do not use `exec` so the EXIT trap always cleans up the temporary pulled env file.
"$py_bin" -c '
import os, subprocess, sys
env_path = sys.argv[1]
cmd = sys.argv[2:]
env = os.environ.copy()
with open(env_path, "r", encoding="utf-8") as fh:
    for raw_line in fh:
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        if key.startswith("export "):
            key = key[7:].strip()
        value = value.strip()
        if len(value) >= 2 and value[0] == value[-1] and value[0] in ("\"", "\x27"):
            value = value[1:-1]
        env[key] = value
raise SystemExit(subprocess.call(cmd, env=env))
' "$env_file" "$@"
