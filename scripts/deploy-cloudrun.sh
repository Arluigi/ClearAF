#!/usr/bin/env bash
# Production deployment; run manually only after release approval. Never sources dotenv.
set -euo pipefail
script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
repo_dir="$(cd -- "$script_dir/.." && pwd)"
source "$script_dir/cloudrun-config.sh"
runtime_account="$CLOUDRUN_SERVICE@$CLOUDRUN_PROJECT.iam.gserviceaccount.com"

gcloud services enable run.googleapis.com artifactregistry.googleapis.com \
  secretmanager.googleapis.com cloudbuild.googleapis.com --project="$CLOUDRUN_PROJECT"
if ! gcloud artifacts repositories describe "$CLOUDRUN_REPOSITORY" \
  --project="$CLOUDRUN_PROJECT" --location="$CLOUDRUN_REGION" >/dev/null 2>&1; then
  gcloud artifacts repositories create "$CLOUDRUN_REPOSITORY" --repository-format=docker \
    --project="$CLOUDRUN_PROJECT" --location="$CLOUDRUN_REGION"
fi
if ! gcloud iam service-accounts describe "$runtime_account" --project="$CLOUDRUN_PROJECT" >/dev/null 2>&1; then
  gcloud iam service-accounts create "$CLOUDRUN_SERVICE" --display-name='UNZIT API runtime' \
    --project="$CLOUDRUN_PROJECT"
fi

secret_mappings=()
for env_name in "${CLOUDRUN_RUNTIME_NAMES[@]}"; do
  secret_name="$(cloudrun_secret_name "$env_name")"
  # Require a populated enabled version before spending time building.
  version="$(gcloud secrets versions list "$secret_name" --project="$CLOUDRUN_PROJECT" \
    --filter='state=ENABLED' --sort-by='~createTime' --limit=1 --format='value(name)')"
  if [[ -z "$version" ]]; then
    printf 'Missing enabled version for %s; populate it with scripts/cloudrun-secrets.sh instructions.\n' "$env_name" >&2
    exit 1
  fi
  # Secret-level grants keep the runtime account scoped to these names, with no other roles.
  gcloud secrets add-iam-policy-binding "$secret_name" --project="$CLOUDRUN_PROJECT" \
    --member="serviceAccount:$runtime_account" --role=roles/secretmanager.secretAccessor >/dev/null
  # Pin the numeric version so traffic rollback restores the secret version selection too.
  secret_mappings+=("$env_name=$secret_name:${version##*/}")
done
secret_csv="$(IFS=,; printf '%s' "${secret_mappings[*]}")"
image_tag="$(git -C "$repo_dir" rev-parse --short=12 HEAD)-$(date -u +%Y%m%d%H%M%S)"
image="$CLOUDRUN_REGION-docker.pkg.dev/$CLOUDRUN_PROJECT/$CLOUDRUN_REPOSITORY/$CLOUDRUN_SERVICE:$image_tag"

# The explicit allowlist prevents local dotenv files from reaching Cloud Build at all.
gcloud builds submit "$repo_dir/backend" --project="$CLOUDRUN_PROJECT" --region="$CLOUDRUN_REGION" \
  --ignore-file="$repo_dir/backend/.dockerignore" --tag="$image"
gcloud run deploy "$CLOUDRUN_SERVICE" --project="$CLOUDRUN_PROJECT" --region="$CLOUDRUN_REGION" \
  --image="$image" --service-account="$runtime_account" --set-secrets="$secret_csv" \
  --set-env-vars=NODE_ENV=production --port=8080 --min-instances=0 --max-instances=3 \
  --cpu=1 --memory=512Mi --timeout=60s --allow-unauthenticated

service_url="$(gcloud run services describe "$CLOUDRUN_SERVICE" --project="$CLOUDRUN_PROJECT" \
  --region="$CLOUDRUN_REGION" --format='value(status.url)')"
printf 'Service URL: %s\n' "$service_url"
curl --fail --silent --show-error --max-time 60 "$service_url/health"
printf '\n'
curl --fail --silent --show-error --max-time 60 "$service_url/ready"
printf '\n'
