#!/usr/bin/env bash
set -euo pipefail

PROJECT="${GCP_PROJECT_ID:-${PROJECT:-$(gcloud config get-value project 2>/dev/null || true)}}"
REGION="${REGION:-europe-west1}"
SERVICE="${SERVICE:-libros-abc-vanilla}"
BUCKET="${GCS_BUCKET:-${PROJECT}-libros-abc}"
OBJECT="${GCS_OBJECT:-books.json}"

if [[ -z "${PROJECT}" || "${PROJECT}" == "(unset)" ]]; then
  echo "Seteá GCP_PROJECT_ID o gcloud config set project" >&2
  exit 1
fi

gcloud config set project "${PROJECT}" >/dev/null

echo "project=${PROJECT}"
echo "region=${REGION}"
echo "service=${SERVICE}"
echo "bucket=gs://${BUCKET}/${OBJECT}"

gcloud services enable \
  run.googleapis.com \
  storage.googleapis.com \
  cloudbuild.googleapis.com \
  artifactregistry.googleapis.com \
  iam.googleapis.com \
  --project "${PROJECT}"

if gcloud storage buckets describe "gs://${BUCKET}" --project "${PROJECT}" >/dev/null 2>&1; then
  echo "bucket exists"
else
  gcloud storage buckets create "gs://${BUCKET}" \
    --project "${PROJECT}" \
    --location "${REGION}" \
    --uniform-bucket-level-access
fi

PROJECT_NUMBER="$(gcloud projects describe "${PROJECT}" --format='value(projectNumber)')"
COMPUTE_SA="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"

RUN_SA="$(gcloud run services describe "${SERVICE}" \
  --project "${PROJECT}" \
  --region "${REGION}" \
  --format='value(spec.template.spec.serviceAccountName)' 2>/dev/null || true)"

if [[ -z "${RUN_SA}" ]]; then
  RUN_SA="${COMPUTE_SA}"
fi

grant() {
  local member="$1"
  gcloud storage buckets add-iam-policy-binding "gs://${BUCKET}" \
    --member="serviceAccount:${member}" \
    --role=roles/storage.objectAdmin \
    --quiet >/dev/null
  echo "iam ${member}"
}

grant "${RUN_SA}"
grant "${COMPUTE_SA}"

gcloud run deploy "${SERVICE}" \
  --project "${PROJECT}" \
  --source . \
  --region "${REGION}" \
  --allow-unauthenticated \
  --quiet \
  --set-env-vars="GCS_BUCKET=${BUCKET},GCS_OBJECT=${OBJECT}"

URL="$(gcloud run services describe "${SERVICE}" \
  --project "${PROJECT}" \
  --region "${REGION}" \
  --format='value(status.url)')"

echo "url=${URL}"
echo "health=${URL}/health"
