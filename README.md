# Biblioteca A–Z · Vanilla JS + MongoDB Atlas

Misma UI. Misma API. Los libros viven en Atlas (`libros.books`).

## Local

Sin Atlas:

```bash
npm install
npm start
```

http://localhost:8080 — usa `/tmp/libros-abc.json`.

Con Atlas:

```bash
export MONGODB_URI="mongodb+srv://USER:PASS@CLUSTER.mongodb.net/libros?retryWrites=true&w=majority"
npm start
```

## Atlas (una vez)

1. https://cloud.mongodb.com → crear proyecto + cluster **M0 Free**.
2. Database Access → usuario con rol `readWrite`.
3. Network Access → `0.0.0.0/0` (Cloud Run no tiene IP fija).
4. Connect → Drivers → copiar la URI.

## Deploy a Cloud Run

Secretos de GitHub:

| Secret | Qué es |
|---|---|
| `GCP_PROJECT_ID` | ID del proyecto GCP del Cloud Run |
| `GCP_SA_KEY` | JSON de una SA con permiso de deploy |
| `MONGODB_URI` | connection string de Atlas |

```bash
export GCP_PROJECT_ID=tu-proyecto-gcp
export MONGODB_URI="mongodb+srv://..."
bash deploy.sh
```

`/health` tiene que decir `"store":"mongodb"`.

## API

- `GET /api/books`
- `POST /api/books` `{ title, read }`
- `PATCH /api/books/:id` `{ read }`
- `DELETE /api/books/:id`
- `GET /health` → `{ ok, store: "mongodb" | "local" }`
