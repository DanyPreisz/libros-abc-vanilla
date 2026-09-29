const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const PORT = Number(process.env.PORT) || 8080;
const HOST = process.env.HOST || "0.0.0.0";
const ROOT = __dirname;
const PUBLIC = path.join(ROOT, "public");
const SEED = path.join(ROOT, "data", "books.json");
const LOCAL_DB = process.env.DB_PATH || path.join("/tmp", "libros-abc.json");
const GCS_BUCKET = process.env.GCS_BUCKET || "";
const GCS_OBJECT = process.env.GCS_OBJECT || "books.json";

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
};

function seedBooks() {
  try {
    return JSON.parse(fs.readFileSync(SEED, "utf8"));
  } catch {
    return [];
  }
}

function gcsUrl(objectPath, query = "") {
  const obj = encodeURIComponent(GCS_OBJECT);
  return `https://storage.googleapis.com${objectPath}${obj}${query}`;
}

async function accessToken() {
  const url =
    "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token";
  const res = await fetch(url, { headers: { "Metadata-Flavor": "Google" } });
  if (!res.ok) throw new Error("metadata token " + res.status);
  const data = await res.json();
  return data.access_token;
}

async function gcsHeaders() {
  const token = await accessToken();
  return { Authorization: "Bearer " + token };
}

async function gcsGet() {
  const headers = await gcsHeaders();
  const metaRes = await fetch(
    gcsUrl(`/storage/v1/b/${GCS_BUCKET}/o/`),
    { headers }
  );
  if (metaRes.status === 404) return { books: seedBooks(), generation: "0" };
  if (!metaRes.ok) throw new Error("gcs meta " + metaRes.status);
  const meta = await metaRes.json();
  const mediaRes = await fetch(
    gcsUrl(`/storage/v1/b/${GCS_BUCKET}/o/`, "?alt=media"),
    { headers }
  );
  if (mediaRes.status === 404) return { books: seedBooks(), generation: "0" };
  if (!mediaRes.ok) throw new Error("gcs media " + mediaRes.status);
  const books = JSON.parse(await mediaRes.text());
  return { books: Array.isArray(books) ? books : [], generation: String(meta.generation) };
}

async function gcsPut(books, generation) {
  const headers = await gcsHeaders();
  const qs = new URLSearchParams({ uploadType: "media", name: GCS_OBJECT });
  if (generation && generation !== "0") qs.set("ifGenerationMatch", generation);
  const res = await fetch(
    `https://storage.googleapis.com/upload/storage/v1/b/${GCS_BUCKET}/o?` + qs,
    {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify(books, null, 2),
    }
  );
  if (res.status === 412) return false;
  if (!res.ok) throw new Error("gcs put " + res.status + " " + (await res.text()));
  return true;
}

function localGet() {
  try {
    if (fs.existsSync(LOCAL_DB)) {
      return { books: JSON.parse(fs.readFileSync(LOCAL_DB, "utf8")), generation: "1" };
    }
  } catch {}
  return { books: seedBooks(), generation: "1" };
}

function localPut(books) {
  fs.writeFileSync(LOCAL_DB, JSON.stringify(books, null, 2));
  return true;
}

async function load() {
  if (GCS_BUCKET) return gcsGet();
  return localGet();
}

async function save(books, generation) {
  if (GCS_BUCKET) return gcsPut(books, generation);
  return localPut(books);
}

async function mutate(fn) {
  for (let i = 0; i < 5; i += 1) {
    const { books, generation } = await load();
    const next = fn(books.slice());
    const ok = await save(next, generation);
    if (ok) return next;
  }
  throw new Error("gcs conflict");
}

function send(res, status, body, type = TYPES[".json"]) {
  res.writeHead(status, { "Content-Type": type, "Cache-Control": "no-store" });
  res.end(typeof body === "string" || Buffer.isBuffer(body) ? body : JSON.stringify(body));
}

function body(req) {
  return new Promise((resolve) => {
    let raw = "";
    req.on("data", (c) => {
      raw += c;
    });
    req.on("end", () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        resolve({});
      }
    });
  });
}

function file(res, filePath) {
  fs.readFile(filePath, (err, data) => {
    if (err) return send(res, 404, "No encontrado", "text/plain; charset=utf-8");
    send(res, 200, data, TYPES[path.extname(filePath)] || "application/octet-stream");
  });
}

function sortBooks(list) {
  return list.slice().sort((a, b) => a.title.localeCompare(b.title, "es", { sensitivity: "base" }));
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, "http://localhost");

    if (req.method === "GET" && (url.pathname === "/health" || url.pathname === "/healthz")) {
      return send(res, 200, { ok: true, store: GCS_BUCKET ? "gcs" : "local" });
    }

    if (req.method === "GET" && url.pathname === "/api/books") {
      const { books } = await load();
      return send(res, 200, sortBooks(books));
    }

    if (req.method === "POST" && url.pathname === "/api/books") {
      const data = await body(req);
      const title = String(data.title || "").trim().slice(0, 120);
      if (!title) return send(res, 400, { error: "vacío" });
      const book = { id: "b" + Date.now(), title, read: Boolean(data.read) };
      await mutate((books) => {
        books.push(book);
        return books;
      });
      return send(res, 201, book);
    }

    const one = url.pathname.match(/^\/api\/books\/([^/]+)$/);
    if (one) {
      if (req.method === "PATCH") {
        const data = await body(req);
        let updated = null;
        await mutate((books) => {
          const book = books.find((b) => b.id === one[1]);
          if (!book) return books;
          if (data.read != null) book.read = Boolean(data.read);
          if (data.title != null) {
            const title = String(data.title).trim().slice(0, 120);
            if (title) book.title = title;
          }
          updated = book;
          return books;
        });
        return updated ? send(res, 200, updated) : send(res, 404, { error: "no" });
      }
      if (req.method === "DELETE") {
        let found = false;
        await mutate((books) => {
          const next = books.filter((b) => b.id !== one[1]);
          found = next.length !== books.length;
          return next;
        });
        return found ? send(res, 200, { ok: true }) : send(res, 404, { error: "no" });
      }
    }

    const rel = url.pathname === "/" ? "/index.html" : url.pathname;
    const safe = path.normalize(rel).replace(/^(\.\.[/\\])+/, "");
    file(res, path.join(PUBLIC, safe));
  } catch (err) {
    console.error(err);
    send(res, 500, { error: "store", detail: String(err.message || err) });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`listening on http://${HOST}:${PORT} store=${GCS_BUCKET ? "gcs:" + GCS_BUCKET : "local"}`);
});
