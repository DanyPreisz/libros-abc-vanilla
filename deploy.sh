#!/usr/bin/env bash
set -euo pipefail

PROJECT="${GCP_PROJECT_ID:-${PROJECT:-$(gcloud config get-value project 2>/dev/null || true)}}"
REGION="${REGION:-europe-west1}"
SERVICE="${SERVICE:-libros-abc-vanilla}"

if [[ -z "${PROJECT}" || "${PROJECT}" == "(unset)" ]]; then
  echo "Seteá GCP_PROJECT_ID o gcloud config set project" >&2
  exit 1
fi

if [[ -z "${MONGODB_URI:-}" ]]; then
  echo "Seteá MONGODB_URI (connection string de Atlas)" >&2
  exit 1
fi

gcloud config set project "${PROJECT}" >/dev/null

echo "project=${PROJECT}"
echo "region=${REGION}"
echo "service=${SERVICE}"
echo "store=mongodb"

gcloud services enable \
  run.googleapis.com \
  cloudbuild.googleapis.com \
  artifactregistry.googleapis.com \
  storage.googleapis.com \
  --project "${PROJECT}"

PROJECT_NUMBER="$(gcloud projects describe "${PROJECT}" --format='value(projectNumber)')"
COMPUTE_SA="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"
BUILD_SA="${PROJECT_NUMBER}@cloudbuild.gserviceaccount.com"

grant() {
  local member="$1"
  local role="$2"
  gcloud projects add-iam-policy-binding "${PROJECT}" \
    --member="serviceAccount:${member}" \
    --role="${role}" \
    --quiet >/dev/null || true
  echo "iam ${member} ${role}"
}

grant "${COMPUTE_SA}" roles/storage.objectAdmin
grant "${COMPUTE_SA}" roles/artifactregistry.writer
grant "${COMPUTE_SA}" roles/logging.logWriter
grant "${BUILD_SA}" roles/storage.objectAdmin
grant "${BUILD_SA}" roles/artifactregistry.writer
grant "${BUILD_SA}" roles/run.admin

gcloud run deploy "${SERVICE}" \
  --project "${PROJECT}" \
  --source . \
  --region "${REGION}" \
  --allow-unauthenticated \
  --quiet \
  --update-env-vars="MONGODB_URI=${MONGODB_URI},MONGODB_DB=libros,MONGODB_COLLECTION=books"

gcloud run services update "${SERVICE}" \
  --project "${PROJECT}" \
  --region "${REGION}" \
  --quiet \
  --remove-env-vars=GCS_BUCKET,GCS_OBJECT,GOOGLE_CLOUD_PROJECT || true

URL="$(gcloud run services describe "${SERVICE}" \
  --project "${PROJECT}" \
  --region "${REGION}" \
  --format='value(status.url)')"

echo "url=${URL}"
echo "health=${URL}/health"
