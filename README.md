# Biblioteca A–Z · Vanilla JS

Cargá el nombre de un libro y marcá si lo leíste. Se ordenan alfabéticamente y se muestran en una solapa por letra.

## Local

```bash
npm start
```

http://localhost:8080

- `GET /api/books`
- `POST /api/books` `{ title, read }`
- `PATCH /api/books/:id` `{ read }`
- `DELETE /api/books/:id`
- `GET /health`

## Cloud Run

El disco es efímero: los libros nuevos viven en `/tmp/libros-abc.json` hasta que la instancia se apague.

```bash
gcloud run deploy libros-abc \
  --source . \
  --region southamerica-east1 \
  --allow-unauthenticated
```

## Repo

https://github.com/DanyPreisz/libros-abc-vanilla
