#!/usr/bin/env bash

set -euo pipefail

if [ "$#" -lt 2 ]; then
  echo "usage: $0 <development|preview|production> <command...>" >&2
  exit 1
fi

environment="$1"
shift

root_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
app_dir="$root_dir/apps/web"
env_file="$app_dir/.vercel/.env.${environment}.local"

cd "$app_dir"
npx vercel env pull ".vercel/.env.${environment}.local" --environment="$environment" --yes >/dev/null

set -a
# shellcheck disable=SC1090
source "$env_file"
set +a

cd "$root_dir"
exec "$@"
