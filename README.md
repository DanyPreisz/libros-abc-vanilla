# Biblioteca A–Z · Vanilla JS + Cloud Storage

El UI no cambia. Cloud Run sirve la API y los estáticos. El JSON vive en un bucket.

## Local

```bash
npm start
```

http://localhost:8080 — usa `/tmp/libros-abc.json`.

## Deploy automático

`deploy.sh` crea el bucket si no existe, da permiso a Cloud Run y despliega con `GCS_BUCKET`.

### Una vez: secretos de GitHub

Repo → Settings → Secrets and variables → Actions:

| Secret | Qué es |
|---|---|
| `GCP_PROJECT_ID` | ID del proyecto GCP (no el número) |
| `GCP_SA_KEY` | JSON de una service account |

La service account necesita, como mínimo:

- `roles/run.admin`
- `roles/iam.serviceAccountUser`
- `roles/storage.admin`
- `roles/cloudbuild.builds.editor`
- `roles/artifactregistry.admin`

Después, cada push a `main` corre [.github/workflows/deploy.yml](.github/workflows/deploy.yml).

También se puede disparar a mano: Actions → Deploy Cloud Run → Run workflow.

### A mano, misma cosa

```bash
export GCP_PROJECT_ID=tu-proyecto
bash deploy.sh
```

Cuando terminó, `/health` tiene que decir `"store":"gcs"`.

## API

- `GET /api/books`
- `POST /api/books` `{ title, read }`
- `PATCH /api/books/:id` `{ read }`
- `DELETE /api/books/:id`
- `GET /health` → `{ ok, store: "gcs" | "local" }`
