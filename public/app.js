const LETTERS = "#ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
const tabs = document.querySelector("#tabs");
const panel = document.querySelector("#panel");
const form = document.querySelector("#add");
let books = [];
let letter = "A";

function key(title) {
  const ch = title
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .charAt(0)
    .toUpperCase();
  return /[A-Z]/.test(ch) ? ch : "#";
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const title = document.querySelector("#title").value;
  const read = document.querySelector("#read").checked;
  const created = await (
    await fetch("/api/books", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, read }),
    })
  ).json();
  form.reset();
  letter = key(created.title || title);
  load();
});

tabs.addEventListener("click", (event) => {
  const btn = event.target.closest("[data-l]");
  if (!btn || btn.disabled) return;
  letter = btn.dataset.l;
  paint();
});

panel.addEventListener("change", async (event) => {
  const box = event.target.closest("[data-read]");
  if (!box) return;
  await fetch("/api/books/" + box.dataset.read, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ read: box.checked }),
  });
  load();
});

panel.addEventListener("click", async (event) => {
  const btn = event.target.closest("[data-del]");
  if (!btn) return;
  await fetch("/api/books/" + btn.dataset.del, { method: "DELETE" });
  load();
});

async function load() {
  books = await (await fetch("/api/books")).json();
  paint();
}

function paint() {
  const counts = Object.fromEntries(LETTERS.map((l) => [l, 0]));
  books.forEach((b) => {
    counts[key(b.title)] += 1;
  });
  if (!counts[letter]) {
    const first = LETTERS.find((l) => counts[l]);
    if (first) letter = first;
  }
  tabs.innerHTML = LETTERS.map(
    (l) =>
      `<button type="button" data-l="${l}" class="${l === letter ? "is-on" : ""}" ${counts[l] ? "" : "disabled"}>${l}</button>`
  ).join("");
  const list = books.filter((b) => key(b.title) === letter);
  panel.innerHTML = list.length
    ? list
        .map(
          (b) => `
            <div class="row ${b.read ? "read" : ""}">
              <input type="checkbox" data-read="${b.id}" ${b.read ? "checked" : ""} />
              <span>${escapeHtml(b.title)}</span>
              <button type="button" class="ghost" data-del="${b.id}">✕</button>
            </div>
          `
        )
        .join("")
    : `<p class="empty">Nada en ${letter}.</p>`;
}

function escapeHtml(s) {
  return s.replaceAll("&", "&amp;").replaceAll("<", "&lt;");
}

load();
