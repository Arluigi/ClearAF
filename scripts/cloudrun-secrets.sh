#!/usr/bin/env bash
# Provision names only. This script never reads secret values or the clipboard.
set -euo pipefail
script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
source "$script_dir/cloudrun-config.sh"

gcloud services enable secretmanager.googleapis.com --project="$CLOUDRUN_PROJECT"
for env_name in "${CLOUDRUN_RUNTIME_NAMES[@]}"; do
  secret_name="$(cloudrun_secret_name "$env_name")"
  if ! gcloud secrets describe "$secret_name" --project="$CLOUDRUN_PROJECT" >/dev/null 2>&1; then
    gcloud secrets create "$secret_name" --project="$CLOUDRUN_PROJECT" --replication-policy=automatic
  fi
  printf '\n# Copy the value for %s, then run:\n' "$env_name"
  printf 'pbpaste | gcloud secrets versions add %s --project=%s --data-file=-\n' "$secret_name" "$CLOUDRUN_PROJECT"
done
