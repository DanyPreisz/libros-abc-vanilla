const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const PORT = Number(process.env.PORT) || 8080;
const HOST = process.env.HOST || "0.0.0.0";
const ROOT = __dirname;
const PUBLIC = path.join(ROOT, "public");
const SEED = path.join(ROOT, "data", "books.json");
const LOCAL_DB = process.env.DB_PATH || path.join("/tmp", "libros-abc.json");

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

async function projectId() {
  if (process.env.GOOGLE_CLOUD_PROJECT) return process.env.GOOGLE_CLOUD_PROJECT;
  if (process.env.GCP_PROJECT_ID) return process.env.GCP_PROJECT_ID;
  if (process.env.GCLOUD_PROJECT) return process.env.GCLOUD_PROJECT;
  try {
    const res = await fetch(
      "http://metadata.google.internal/computeMetadata/v1/project/project-id",
      { headers: { "Metadata-Flavor": "Google" }, signal: AbortSignal.timeout(400) }
    );
    if (res.ok) return (await res.text()).trim();
  } catch {}
  return "";
}

async function accessToken() {
  const res = await fetch(
    "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token",
    { headers: { "Metadata-Flavor": "Google" } }
  );
  if (!res.ok) throw new Error("metadata token " + res.status);
  return (await res.json()).access_token;
}

function docsUrl(project, id = "") {
  const base = `https://firestore.googleapis.com/v1/projects/${project}/databases/(default)/documents/books`;
  return id ? `${base}/${encodeURIComponent(id)}` : base;
}

function fromDoc(doc) {
  const id = String(doc.name || "").split("/").pop();
  return {
    id,
    title: doc.fields?.title?.stringValue || "",
    read: Boolean(doc.fields?.read?.booleanValue),
  };
}

function toDoc(book) {
  return {
    fields: {
      title: { stringValue: String(book.title || "") },
      read: { booleanValue: Boolean(book.read) },
    },
  };
}

async function firestoreHeaders() {
  return {
    Authorization: "Bearer " + (await accessToken()),
    "Content-Type": "application/json",
  };
}

async function fsList(project) {
  const res = await fetch(docsUrl(project) + "?pageSize=500", {
    headers: await firestoreHeaders(),
  });
  if (res.status === 404) return [];
  if (!res.ok) throw new Error("firestore list " + res.status + " " + (await res.text()));
  const data = await res.json();
  return (data.documents || []).map(fromDoc);
}

async function fsWrite(project, book) {
  const res = await fetch(docsUrl(project, book.id), {
    method: "PATCH",
    headers: await firestoreHeaders(),
    body: JSON.stringify(toDoc(book)),
  });
  if (!res.ok) throw new Error("firestore write " + res.status + " " + (await res.text()));
  return fromDoc(await res.json());
}

async function fsSeedIfEmpty(project) {
  const current = await fsList(project);
  if (current.length) return current;
  const seed = seedBooks();
  await Promise.all(seed.map((book) => fsWrite(project, book)));
  return seed;
}

async function fsDelete(project, id) {
  const res = await fetch(docsUrl(project, id), {
    method: "DELETE",
    headers: await firestoreHeaders(),
  });
  if (res.status === 404) return false;
  if (!res.ok) throw new Error("firestore delete " + res.status + " " + (await res.text()));
  return true;
}

function localRead() {
  try {
    if (fs.existsSync(LOCAL_DB)) return JSON.parse(fs.readFileSync(LOCAL_DB, "utf8"));
  } catch {}
  return seedBooks();
}

function localWrite(books) {
  fs.writeFileSync(LOCAL_DB, JSON.stringify(books, null, 2));
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
    const project = await projectId();
    const remote = Boolean(project);

    if (req.method === "GET" && (url.pathname === "/health" || url.pathname === "/healthz")) {
      return send(res, 200, { ok: true, store: remote ? "firestore" : "local", project: project || null });
    }

    if (req.method === "GET" && url.pathname === "/api/books") {
      const books = remote ? await fsSeedIfEmpty(project) : localRead();
      return send(res, 200, sortBooks(books));
    }

    if (req.method === "POST" && url.pathname === "/api/books") {
      const data = await body(req);
      const title = String(data.title || "").trim().slice(0, 120);
      if (!title) return send(res, 400, { error: "vacío" });
      const book = { id: "b" + Date.now(), title, read: Boolean(data.read) };
      if (remote) await fsWrite(project, book);
      else {
        const books = localRead();
        books.push(book);
        localWrite(books);
      }
      return send(res, 201, book);
    }

    const one = url.pathname.match(/^\/api\/books\/([^/]+)$/);
    if (one) {
      const id = one[1];
      if (req.method === "PATCH") {
        const data = await body(req);
        if (remote) {
          const books = await fsList(project);
          const book = books.find((b) => b.id === id);
          if (!book) return send(res, 404, { error: "no" });
          if (data.read != null) book.read = Boolean(data.read);
          if (data.title != null) {
            const title = String(data.title).trim().slice(0, 120);
            if (title) book.title = title;
          }
          return send(res, 200, await fsWrite(project, book));
        }
        const books = localRead();
        const book = books.find((b) => b.id === id);
        if (!book) return send(res, 404, { error: "no" });
        if (data.read != null) book.read = Boolean(data.read);
        if (data.title != null) {
          const title = String(data.title).trim().slice(0, 120);
          if (title) book.title = title;
        }
        localWrite(books);
        return send(res, 200, book);
      }
      if (req.method === "DELETE") {
        if (remote) {
          const ok = await fsDelete(project, id);
          return ok ? send(res, 200, { ok: true }) : send(res, 404, { error: "no" });
        }
        const books = localRead();
        const next = books.filter((b) => b.id !== id);
        if (next.length === books.length) return send(res, 404, { error: "no" });
        localWrite(next);
        return send(res, 200, { ok: true });
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
  console.log(`listening on http://${HOST}:${PORT}`);
});
