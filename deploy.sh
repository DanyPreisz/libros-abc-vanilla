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
  --project "${PROJECT}"

gcloud run deploy "${SERVICE}" \
  --project "${PROJECT}" \
  --source . \
  --region "${REGION}" \
  --allow-unauthenticated \
  --quiet \
  --set-env-vars="MONGODB_URI=${MONGODB_URI},MONGODB_DB=libros,MONGODB_COLLECTION=books" \
  --remove-env-vars=GCS_BUCKET,GCS_OBJECT,GOOGLE_CLOUD_PROJECT

URL="$(gcloud run services describe "${SERVICE}" \
  --project "${PROJECT}" \
  --region "${REGION}" \
  --format='value(status.url)')"

echo "url=${URL}"
echo "health=${URL}/health"
