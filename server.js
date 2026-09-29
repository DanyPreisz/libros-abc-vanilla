const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const PORT = Number(process.env.PORT) || 8080;
const HOST = process.env.HOST || "0.0.0.0";
const ROOT = __dirname;
const PUBLIC = path.join(ROOT, "public");
const SEED = path.join(ROOT, "data", "books.json");
const LOCAL_DB = process.env.DB_PATH || path.join("/tmp", "libros-abc.json");
const MONGO_URI = process.env.MONGODB_URI || "";
const MONGO_DB = process.env.MONGODB_DB || "libros";
const MONGO_COL = process.env.MONGODB_COLLECTION || "books";

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

let colPromise = null;

async function collection() {
  if (!MONGO_URI) return null;
  if (!colPromise) {
    colPromise = (async () => {
      const { MongoClient } = require("mongodb");
      const client = new MongoClient(MONGO_URI);
      await client.connect();
      const col = client.db(MONGO_DB).collection(MONGO_COL);
      if ((await col.countDocuments()) === 0) {
        const seed = seedBooks();
        if (seed.length) await col.insertMany(seed);
      }
      return col;
    })();
  }
  return colPromise;
}

function publicBook(doc) {
  return { id: doc.id, title: doc.title, read: Boolean(doc.read) };
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
    const col = await collection();

    if (req.method === "GET" && (url.pathname === "/health" || url.pathname === "/healthz")) {
      return send(res, 200, { ok: true, store: col ? "mongodb" : "local" });
    }

    if (req.method === "GET" && url.pathname === "/api/books") {
      const books = col
        ? (await col.find({}, { projection: { _id: 0 } }).toArray()).map(publicBook)
        : localRead();
      return send(res, 200, sortBooks(books));
    }

    if (req.method === "POST" && url.pathname === "/api/books") {
      const data = await body(req);
      const title = String(data.title || "").trim().slice(0, 120);
      if (!title) return send(res, 400, { error: "vacío" });
      const book = { id: "b" + Date.now(), title, read: Boolean(data.read) };
      if (col) await col.insertOne({ ...book });
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
        const patch = {};
        if (data.read != null) patch.read = Boolean(data.read);
        if (data.title != null) {
          const title = String(data.title).trim().slice(0, 120);
          if (title) patch.title = title;
        }
        if (col) {
          const out = await col.findOneAndUpdate(
            { id },
            { $set: patch },
            { returnDocument: "after" }
          );
          const doc = out && out.value ? out.value : out;
          if (!doc || !doc.id) return send(res, 404, { error: "no" });
          return send(res, 200, publicBook(doc));
        }
        const books = localRead();
        const book = books.find((b) => b.id === id);
        if (!book) return send(res, 404, { error: "no" });
        Object.assign(book, patch);
        localWrite(books);
        return send(res, 200, book);
      }
      if (req.method === "DELETE") {
        if (col) {
          const out = await col.deleteOne({ id });
          return out.deletedCount
            ? send(res, 200, { ok: true })
            : send(res, 404, { error: "no" });
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
  console.log(`listening on http://${HOST}:${PORT} store=${MONGO_URI ? "mongodb" : "local"}`);
});
