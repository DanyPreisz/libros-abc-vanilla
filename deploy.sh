#!/usr/bin/env bash
set -euo pipefail

PROJECT="${GCP_PROJECT_ID:-${PROJECT:-$(gcloud config get-value project 2>/dev/null || true)}}"
REGION="${REGION:-europe-west1}"
SERVICE="${SERVICE:-libros-abc-vanilla}"

if [[ -z "${PROJECT}" || "${PROJECT}" == "(unset)" ]]; then
  echo "Seteá GCP_PROJECT_ID o gcloud config set project" >&2
  exit 1
fi

gcloud config set project "${PROJECT}" >/dev/null

echo "project=${PROJECT}"
echo "region=${REGION}"
echo "service=${SERVICE}"
echo "store=firestore"

gcloud services enable \
  run.googleapis.com \
  firestore.googleapis.com \
  cloudbuild.googleapis.com \
  artifactregistry.googleapis.com \
  iam.googleapis.com \
  --project "${PROJECT}"

if ! gcloud firestore databases describe --database="(default)" --project "${PROJECT}" >/dev/null 2>&1; then
  gcloud firestore databases create \
    --project "${PROJECT}" \
    --location "${REGION}" \
    --type=firestore-native
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

for member in "${RUN_SA}" "${COMPUTE_SA}"; do
  gcloud projects add-iam-policy-binding "${PROJECT}" \
    --member="serviceAccount:${member}" \
    --role=roles/datastore.user \
    --quiet >/dev/null
  echo "iam ${member} datastore.user"
done

gcloud run deploy "${SERVICE}" \
  --project "${PROJECT}" \
  --source . \
  --region "${REGION}" \
  --allow-unauthenticated \
  --quiet \
  --set-env-vars="GOOGLE_CLOUD_PROJECT=${PROJECT}" \
  --remove-env-vars=GCS_BUCKET,GCS_OBJECT

URL="$(gcloud run services describe "${SERVICE}" \
  --project "${PROJECT}" \
  --region "${REGION}" \
  --format='value(status.url)')"

echo "url=${URL}"
echo "health=${URL}/health"
