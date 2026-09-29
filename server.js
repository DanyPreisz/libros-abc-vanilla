const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const PORT = Number(process.env.PORT) || 8080;
const HOST = process.env.HOST || "0.0.0.0";
const ROOT = __dirname;
const PUBLIC = path.join(ROOT, "public");
const SEED = path.join(ROOT, "data", "books.json");
const DB = process.env.DB_PATH || path.join("/tmp", "libros-abc.json");
const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
};

function load() {
  try {
    if (fs.existsSync(DB)) return JSON.parse(fs.readFileSync(DB, "utf8"));
  } catch {}
  try {
    return JSON.parse(fs.readFileSync(SEED, "utf8"));
  } catch {
    return [];
  }
}

let store = load();

function read() {
  return store;
}

function write(next) {
  store = next;
  try {
    fs.writeFileSync(DB, JSON.stringify(next, null, 2));
  } catch (err) {
    console.error("persist skipped", err.message);
  }
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
  const url = new URL(req.url, "http://localhost");

  if (req.method === "GET" && (url.pathname === "/health" || url.pathname === "/healthz")) {
    return send(res, 200, { ok: true });
  }

  if (req.method === "GET" && url.pathname === "/api/books") {
    return send(res, 200, sortBooks(read()));
  }

  if (req.method === "POST" && url.pathname === "/api/books") {
    const data = await body(req);
    const title = String(data.title || "").trim().slice(0, 120);
    if (!title) return send(res, 400, { error: "vacío" });
    const books = read();
    const book = {
      id: "b" + Date.now(),
      title,
      read: Boolean(data.read),
    };
    books.push(book);
    write(books);
    return send(res, 201, book);
  }

  const one = url.pathname.match(/^\/api\/books\/([^/]+)$/);
  if (one) {
    const books = read();
    const book = books.find((b) => b.id === one[1]);
    if (!book) return send(res, 404, { error: "no" });
    if (req.method === "PATCH") {
      const data = await body(req);
      if (data.read != null) book.read = Boolean(data.read);
      if (data.title != null) {
        const title = String(data.title).trim().slice(0, 120);
        if (title) book.title = title;
      }
      write(books);
      return send(res, 200, book);
    }
    if (req.method === "DELETE") {
      write(books.filter((b) => b.id !== book.id));
      return send(res, 200, { ok: true });
    }
  }

  const rel = url.pathname === "/" ? "/index.html" : url.pathname;
  const safe = path.normalize(rel).replace(/^(\.\.[/\\])+/, "");
  file(res, path.join(PUBLIC, safe));
});

server.listen(PORT, HOST, () => {
  console.log(`listening on http://${HOST}:${PORT}`);
});
