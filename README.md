# Biblioteca A–Z · Vanilla JS + Cloud Storage

El UI no cambia. Cloud Run solo sirve la API y los estáticos. El JSON vive en un bucket.

## Local (sin bucket)

```bash
npm start
```

http://localhost:8080 — usa `/tmp/libros-abc.json`.

## Persistencia real (Cloud Storage)

```bash
PROJECT=$(gcloud config get-value project)
REGION=europe-west1
BUCKET=$PROJECT-libros-abc

# 1. Bucket
gcloud storage buckets create gs://$BUCKET --location=$REGION --uniform-bucket-level-access

# 2. Que Cloud Run pueda leer/escribir el JSON
# Si el servicio ya existe, usá la SA que muestra:
#   gcloud run services describe libros-abc-vanilla --region $REGION --format='value(spec.template.spec.serviceAccountName)'
PROJECT_NUMBER=$(gcloud projects describe $PROJECT --format='value(projectNumber)')
COMPUTE_SA=$PROJECT_NUMBER-compute@developer.gserviceaccount.com

gcloud storage buckets add-iam-policy-binding gs://$BUCKET \
  --member="serviceAccount:$COMPUTE_SA" \
  --role=roles/storage.objectAdmin

# 3. Redesplegar con el bucket
gcloud run deploy libros-abc-vanilla \
  --source . \
  --region $REGION \
  --allow-unauthenticated \
  --set-env-vars=GCS_BUCKET=$BUCKET,GCS_OBJECT=books.json
```

La primera escritura crea `gs://$BUCKET/books.json`. Si el objeto no existe, se copia el seed de `data/books.json`.

## API (igual)

- `GET /api/books`
- `POST /api/books` `{ title, read }`
- `PATCH /api/books/:id` `{ read }`
- `DELETE /api/books/:id`
- `GET /health` → `{ ok, store: "gcs" | "local" }`

## Por qué ahora sí persiste

Cloud Run borra el disco del contenedor al apagarse. El archivo en el bucket no.
Las escrituras usan `ifGenerationMatch` para no pisarse si hay más de una instancia.
