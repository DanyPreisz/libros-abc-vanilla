# Biblioteca A–Z · Vanilla JS + Firestore

Misma UI. Misma API. Los libros viven en Firestore (`books/{id}`).

## Local

```bash
npm start
```

http://localhost:8080 — usa `/tmp/libros-abc.json`.

## Deploy

`deploy.sh` habilita Firestore, crea la base `(default)` si no existe, da `datastore.user` a Cloud Run y despliega.

### GitHub Actions (una vez)

Repo → Settings → Secrets and variables → Actions:

| Secret | Qué es |
|---|---|
| `GCP_PROJECT_ID` | ID del proyecto GCP |
| `GCP_SA_KEY` | JSON de una service account |

Roles mínimos de esa cuenta:

- `roles/run.admin`
- `roles/iam.serviceAccountUser`
- `roles/datastore.owner` (para crear la base la primera vez)
- `roles/cloudbuild.builds.editor`
- `roles/artifactregistry.admin`

Push a `main` o Actions → Deploy Cloud Run → Run workflow.

```bash
export GCP_PROJECT_ID=tu-proyecto
bash deploy.sh
```

`/health` tiene que decir `"store":"firestore"`.

## API

- `GET /api/books`
- `POST /api/books` `{ title, read }`
- `PATCH /api/books/:id` `{ read }`
- `DELETE /api/books/:id`
- `GET /health` → `{ ok, store: "firestore" | "local" }`
