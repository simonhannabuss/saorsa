// Saorsa front end: left column, reader, report / suggest panels.
import { CATEGORIES, SUB_FILTERS } from "./config.js";
import { loadSources, sendReport, sendSuggestion } from "./data.js";
import { loadSettings, initBackground, initTweakPanel } from "./background.js";

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const catOf = (id) => CATEGORIES.find((c) => c.id === id);
const store = {
  get: (k, d) => { try { return JSON.parse(localStorage.getItem("saorsa." + k)) ?? d; } catch { return d; } },
  set: (k, v) => { try { localStorage.setItem("saorsa." + k, JSON.stringify(v)); } catch {} },
};

const state = {
  sources: [],
  tab: "all",
  category: "geo",
  sub: [],            // selected perspectives (geo) or one topic
  country: "",
  sort: "az",
  search: "",
  searching: false,
  catsOpen: false,
  current: null,
  saved: store.get("saved", []),
  recent: store.get("recent", []),
};

const settings = loadSettings();

/* ---------------- data ---------------- */
async function refreshSources() {
  try {
    state.sources = await loadSources({ includePreview: !!settings.preview });
  } catch (err) {
    console.error(err);
    state.sources = [];
  }
  renderAll();
}

function visible() {
  let list = state.sources;
  if (state.searching && state.search.trim()) {
    const q = state.search.trim().toLowerCase();
    return list.filter((s) => s.domain.includes(q) || (s.name || "").toLowerCase().includes(q)).sort(byName);
  }
  if (state.tab === "saved") return state.saved.map(findById).filter(Boolean);
  if (state.tab === "recent") return state.recent.map(findById).filter(Boolean);

  list = list.filter((s) => s.category === state.category);
  if (state.sub.length) {
    const f = SUB_FILTERS[state.category];
    list = f.kind === "perspective"
      ? list.filter((s) => state.sub.includes(s.perspective))
      : list.filter((s) => (s.topics || []).some((t) => state.sub.includes(t)));
  }
  if (state.country) list = list.filter((s) => s.country === state.country);
  const sorters = { az: byName, za: (a, b) => byName(b, a), country: (a, b) => (a.country || "zz").localeCompare(b.country || "zz") || byName(a, b) };
  return [...list].sort(sorters[state.sort]);
}
const byName = (a, b) => a.domain.localeCompare(b.domain);
const findById = (id) => state.sources.find((s) => s.id === id);

/* ---------------- render: left column ---------------- */
function renderTabs() {
  document.querySelectorAll("#tabs .seg__btn").forEach((b) => {
    b.classList.toggle("is-on", b.dataset.tab === state.tab);
    if (b.dataset.tab === "saved") b.innerHTML = `Saved${state.saved.length ? `<span class="badge">${state.saved.length}</span>` : ""}`;
  });
}

function renderCats(swapIn = false) {
  const el = $("cats");
  // Categories keep a fixed order. Only on narrow screens, where some chips
  // hide behind ▾, does a selected hidden chip swap into the last visible spot.
  const order = [...CATEGORIES];
  if (swapIn && !state.catsOpen) {
    const selIdx = order.findIndex((c) => c.id === state.category);
    const [sel] = order.splice(selIdx, 1); order.splice(swapIn - 1, 0, sel);
  }
  el.innerHTML = order.map((c) => `<button class="chip ${c.id === state.category ? "is-on" : ""}" data-cat="${c.id}" style="--c:${c.color}"><span class="dot"></span>${c.label}</button>`).join("")
    + `<button class="chip chip--more" id="catsMore" aria-label="${state.catsOpen ? "Show fewer categories" : "Show all categories"}"><svg viewBox="0 0 24 24"><path d="M6 9l6 6 6-6"/></svg></button>`;
  el.classList.toggle("is-open", state.catsOpen);
  // Put ▾ straight after the last chip that fits in two rows.
  if (!state.catsOpen) requestAnimationFrame(() => placeMore(swapIn));
}

function placeMore(swapped) {
  const el = $("cats"); const more = $("catsMore"); if (!more) return;
  const chips = [...el.querySelectorAll(".chip:not(.chip--more)")];
  const limit = el.getBoundingClientRect().top + el.clientHeight;
  let lastFit = null;
  for (const c of chips) { if (c.getBoundingClientRect().bottom <= limit + 1) lastFit = c; }
  const hidden = chips.filter((c) => c.getBoundingClientRect().bottom > limit + 1);
  if (!hidden.length) { more.classList.add("is-hidden"); return; }
  if (!swapped && hidden.some((c) => c.dataset.cat === state.category)) {
    return renderCats(chips.length - hidden.length || 1);
  }
  more.classList.remove("is-hidden");
  // move ▾ before the first hidden chip; if it then doesn't fit, move it one earlier
  el.insertBefore(more, hidden[0]);
  if (more.getBoundingClientRect().bottom > limit + 1 && lastFit) el.insertBefore(more, lastFit);
}

function renderSub() {
  const f = SUB_FILTERS[state.category];
  const el = $("subFilter");
  const pill = (o) => `<button class="pill ${state.sub.includes(o.id) ? "is-on" : ""}" data-sub="${o.id}" style="--c:${o.color || "var(--edge)"}">${o.edge || f.kind === "perspective" ? '<span class="dot"></span>' : ""}${o.label}</button>`;
  el.innerHTML = `<button class="pill ${state.sub.length ? "" : "is-on"}" data-sub="">All</button>` + f.options.map(pill).join("");
}

function renderList() {
  const items = visible();
  const el = $("list");
  let head = "";
  if (state.searching && state.search.trim()) head = `${items.length} result${items.length === 1 ? "" : "s"} · all categories`;
  if (!items.length) {
    const msg = state.tab === "saved" ? "Nothing saved yet. Tap ☆ on any site to keep it here."
      : state.tab === "recent" ? "Sites you open will show here."
      : state.searching ? "No sites match that search." : "No sites here yet. Try All, another country or switch on preview (press T).";
    el.innerHTML = (head ? `<li class="list__head">${head}</li>` : "") + `<li class="list__empty">${msg}</li>`;
    return;
  }
  const showCat = state.searching || state.tab !== "all";
  el.innerHTML = (head ? `<li class="list__head">${esc(head)}</li>` : "") + items.map((s) => `
    <li class="src-row ${state.current?.id === s.id ? "is-on" : ""}" data-id="${esc(s.id)}" tabindex="0" title="${esc(s.name)}">
      <span class="ini">${esc(s.domain[0].toUpperCase())}</span>
      <span class="nm">${esc(s.domain)}</span>
      ${s.status === "pending" ? '<span class="pend">Preview</span>' : ""}
      ${showCat ? `<span class="cat">${esc(catOf(s.category)?.label || "")}</span>` : ""}
    </li>`).join("");
}

function renderAll() { renderTabs(); renderCats(); renderSub(); renderList(); }

/* ---------------- reader ---------------- */
function openSource(s, { push = true } = {}) {
  if (!s) return;
  state.current = s;
  document.body.classList.add("is-reading");
  $("home").classList.add("is-hidden");
  $("reader").classList.remove("is-hidden");

  const peers = visibleFor(s);
  const pos = peers.findIndex((p) => p.id === s.id);
  $("rFav").textContent = s.domain[0].toUpperCase();
  $("rDomain").textContent = s.domain;
  $("rMeta").textContent = `${catOf(s.category)?.label || ""}${pos >= 0 ? ` · ${pos + 1} of ${peers.length}` : ""}${s.status === "pending" ? " · preview" : ""}`;
  $("openBtn").href = s.url; $("fbOpen").href = s.url;

  const tags = [];
  if (s.category === "geo" && s.perspective) {
    const o = SUB_FILTERS.geo.options.find((x) => x.id === s.perspective);
    tags.push(`<span class="tag" style="--c:${o.color}"><span class="dot"></span>${o.label}</span>`);
  }
  (s.topics || []).forEach((t, i) => {
    const o = SUB_FILTERS[s.category]?.options.find((x) => x.id === t);
    if (o) tags.push(`<span class="tag">${o.label}${i === 0 && s.topics.length > 1 ? " <small>main</small>" : ""}</span>`);
  });
  $("rTags").innerHTML = tags.join("");
  $("saveBtn").classList.toggle("is-on", state.saved.includes(s.id));

  const frame = $("frame");
  if (s.embeddable === false) {
    frame.src = "about:blank";
    showFallback(s, "blocked");
  } else if ((s.down_nights || 0) >= 2) {
    frame.src = "about:blank";
    showFallback(s, "down");
  } else {
    $("fallback").classList.add("is-hidden");
    frame.src = s.url;
  }

  state.recent = [s.id, ...state.recent.filter((id) => id !== s.id)].slice(0, 30);
  store.set("recent", state.recent);
  if (push) history.pushState({ id: s.id }, "", `#/site/${encodeURIComponent(s.id)}`);
  renderList();
  scrollRowIntoView(s.id);
}

function visibleFor(s) {
  // the list the site belongs to, for "3 of 34" and prev / next
  const v = visible();
  return v.some((x) => x.id === s.id) ? v : state.sources.filter((x) => x.category === s.category).sort(byName);
}

function showFallback(s, kind) {
  $("fbTitle").textContent = kind === "blocked" ? `${s.domain} can’t be shown inside Saorsa` : `${s.domain} didn’t load`;
  $("fbText").textContent = kind === "blocked"
    ? "Some publishers block being shown inside other sites. You can still read it in a new tab."
    : "It may be down, moved to a new address, or no longer exist. Try again, open it directly, or let us know it’s broken.";
  $("fallback").classList.remove("is-hidden");
}

function goHome({ push = true } = {}) {
  state.current = null;
  document.body.classList.remove("is-reading");
  $("reader").classList.add("is-hidden");
  $("home").classList.remove("is-hidden");
  $("frame").src = "about:blank";
  if (push) history.pushState({}, "", location.pathname + location.search);
  renderList();
}

function step(dir) {
  const list = state.current ? visibleFor(state.current) : visible();
  if (!list.length) return;
  const i = state.current ? list.findIndex((s) => s.id === state.current.id) : -1;
  openSource(list[(i + dir + list.length) % list.length]);
}

function shuffle() {
  const pool = visible().filter((s) => s.id !== state.current?.id);
  const all = pool.length ? pool : state.sources;
  if (all.length) openSource(all[Math.floor(Math.random() * all.length)]);
}

function scrollRowIntoView(id) {
  const row = document.querySelector(`.src-row[data-id="${CSS.escape(id)}"]`);
  row?.scrollIntoView({ block: "nearest" });
}

/* ---------------- panels ---------------- */
function openPanel(html) {
  const p = $("panel");
  p.innerHTML = html;
  p.classList.remove("is-hidden");
  p.querySelector("[data-close]")?.focus();
  p.querySelectorAll("[data-close]").forEach((b) => b.addEventListener("click", closePanel));
}
function closePanel() { $("panel").classList.add("is-hidden"); $("panel").innerHTML = ""; }

const panelHead = (title) => `<header class="panel__head">
  <button class="icon-btn" data-close aria-label="Back"><svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7"/></svg></button>
  <h2>${title}</h2>
  <button class="icon-btn" data-close aria-label="Close"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg></button></header>`;

function openReport(s = state.current, preset = "category") {
  if (!s) return toast("Open a site first, then report it.");
  const listed = [catOf(s.category)?.label, s.perspective && SUB_FILTERS.geo.options.find((o) => o.id === s.perspective)?.label,
    ...(s.topics || []).map((t) => SUB_FILTERS[s.category]?.options.find((o) => o.id === t)?.label)].filter(Boolean).join(" · ");
  const types = [["category", "Wrong category or topic"], ["broken", "Broken or won’t load"], ["independent", "No longer independent"], ["other", "Something else"]];
  openPanel(`${panelHead("Report a problem")}
  <form class="panel__body" id="reportForm">
    <p>Tell us what’s wrong with this site. We check every report before changing anything.</p>
    <div class="site-card"><span class="ini">${esc(s.domain[0].toUpperCase())}</span><div><strong>${esc(s.domain)}</strong><small>Listed in: ${esc(listed || "—")}${s.country ? ` · ${esc(s.country)}` : ""}</small></div></div>
    <span class="field-label">What’s wrong?</span>
    ${types.map(([v, l]) => `<label class="choice"><input type="radio" name="type" value="${v}" ${v === preset ? "checked" : ""}> ${l}</label>`).join("")}
    <div id="moveTo">
      <span class="field-label">Where should it go?</span>
      <div class="chips-pick" id="rCats" style="margin-top:12px">${CATEGORIES.map((c) => `<button type="button" class="pill" data-cat="${c.id}" style="--c:${c.color}"><span class="dot"></span>${c.label}</button>`).join("")}</div>
      <span class="field-label" style="display:block;margin-top:14px">Topic <small style="color:var(--text-3)">optional</small></span>
      <div class="chips-pick" id="rTopics" style="margin-top:12px"></div>
    </div>
    <textarea name="note" rows="3" placeholder="Anything else? (optional)"></textarea>
  </form>
  <footer class="panel__foot"><button class="btn btn--ghost" data-close>Cancel</button><button class="btn btn--accent" id="reportSend">Send report</button></footer>`);

  const form = $("reportForm");
  let cat = null, topic = null;
  const syncType = () => { $("moveTo").classList.toggle("is-hidden", form.type.value !== "category"); };
  const drawTopics = () => {
    const f = cat && SUB_FILTERS[cat];
    $("rTopics").innerHTML = f ? f.options.map((o) => `<button type="button" class="pill ${topic === o.id ? "is-on" : ""}" data-t="${o.id}">${o.label}</button>`).join("") : '<small style="color:var(--text-3)">Pick a category first</small>';
  };
  drawTopics(); syncType();
  form.addEventListener("change", syncType);
  $("rCats").addEventListener("click", (e) => {
    const b = e.target.closest("[data-cat]"); if (!b) return;
    cat = b.dataset.cat; topic = null;
    $("rCats").querySelectorAll(".pill").forEach((p) => p.classList.toggle("is-on", p === b)); drawTopics();
  });
  $("rTopics").addEventListener("click", (e) => {
    const b = e.target.closest("[data-t]"); if (!b) return;
    topic = topic === b.dataset.t ? null : b.dataset.t; drawTopics();
  });
  $("reportSend").addEventListener("click", async () => {
    const report = { site: s.domain, url: s.url, type: form.type.value, listed_as: listed, suggested_category: form.type.value === "category" ? cat : null, suggested_topic: form.type.value === "category" ? topic : null, note: form.note.value.trim() || null };
    try { await sendReport(report); showSent(s, report); } catch (err) { toast("Couldn’t send that. Please try again."); console.error(err); }
  });
}

function showSent(s, report) {
  const move = report.type === "category" && report.suggested_category
    ? `You suggested moving ${esc(s.domain)} to ${esc(catOf(report.suggested_category)?.label)}${report.suggested_topic ? ` · ${esc(SUB_FILTERS[report.suggested_category].options.find((o) => o.id === report.suggested_topic)?.label)}` : ""}. `
    : "";
  openPanel(`${panelHead("Report sent")}
  <div class="panel__body sent"><div class="tick">✓</div><h2>Thanks — we’ll take a look</h2>
  <p>${move}Nothing changes until an editor checks it.</p>
  <p class="hint">If 3 people report the same thing, it goes to the top of the queue.</p>
  <div class="row row--center"><button class="btn btn--accent" data-close>Done</button></div></div>`);
}

async function reportBroken(s = state.current) {
  if (!s) return;
  const key = `broken:${s.id}:${new Date().toISOString().slice(0, 10)}`;
  if (store.get(key, false)) return toast("You’ve already reported this one today. Thanks!");
  await sendReport({ site: s.domain, url: s.url, type: "broken", note: null }).catch(() => {});
  store.set(key, true);
  toast("Reported as broken — thanks. Our nightly check will confirm it.");
}

function openSuggest() {
  openPanel(`${panelHead("Suggest a source")}
  <form class="panel__body" id="suggestForm">
    <p>Know an independent site we’re missing? Paste the address and we’ll check it.</p>
    <span class="field-label">Website address</span>
    <input class="text-input" name="url" type="url" placeholder="https://www.example-news.org" required>
    <span class="field-label">Category</span>
    <div class="chips-pick" id="sCats">${CATEGORIES.map((c) => `<button type="button" class="pill" data-cat="${c.id}" style="--c:${c.color}"><span class="dot"></span>${c.label}</button>`).join("")}</div>
    <span class="field-label">Country</span>
    <label class="ctl ctl--select" style="height:40px"><select name="country"><option value="">Select a country</option><option>UK</option><option>US</option><option value="CA">Canada</option><option value="AU">Australia</option><option value="NZ">New Zealand</option><option value="IE">Ireland</option></select></label>
    <textarea name="note" rows="3" placeholder="Why should it be on Saorsa? (optional)"></textarea>
  </form>
  <footer class="panel__foot"><button class="btn btn--ghost" data-close>Cancel</button><button class="btn btn--accent" id="suggestSend">Send suggestion</button></footer>`);
  let cat = null;
  $("sCats").addEventListener("click", (e) => { const b = e.target.closest("[data-cat]"); if (!b) return; cat = b.dataset.cat; $("sCats").querySelectorAll(".pill").forEach((p) => p.classList.toggle("is-on", p === b)); });
  $("suggestSend").addEventListener("click", async () => {
    const f = $("suggestForm");
    if (!f.url.value || !f.url.checkValidity()) { f.url.focus(); return toast("Add the site’s full address, starting with https://"); }
    await sendSuggestion({ url: f.url.value.trim(), category: cat, country: f.country.value || null, note: f.note.value.trim() || null }).catch(() => {});
    openPanel(`${panelHead("Suggestion sent")}<div class="panel__body sent"><div class="tick">✓</div><h2>Thanks — it’s in the queue</h2><p>We check every suggestion before it goes on Saorsa.</p><div class="row row--center"><button class="btn btn--accent" data-close>Done</button></div></div>`);
  });
}

function openMenu() {
  openPanel(`${panelHead("Menu")}
  <div class="panel__body">
    <button class="choice" data-act="suggest">Suggest a source</button>
    <button class="choice" data-act="report">Report a problem with this site</button>
    <button class="choice" data-act="tweak">Background tweaks (T)</button>
    <button class="choice" data-act="keys">Keyboard shortcuts</button>
    <p class="hint">Account, Founder membership and support links come next (see README).</p>
  </div>`);
  $("panel").querySelector(".panel__body").addEventListener("click", (e) => {
    const act = e.target.closest("[data-act]")?.dataset.act;
    if (act === "suggest") openSuggest();
    if (act === "report") { closePanel(); openReport(); }
    if (act === "tweak") { closePanel(); tweak.toggle(); }
    if (act === "keys") openPanel(`${panelHead("Keyboard shortcuts")}<div class="panel__body">
      ${[["/", "Search"], ["S", "Shuffle"], ["← →", "Previous / next site"], ["R", "Report a problem"], ["Esc", "Close / back"], ["T", "Background tweaks"]].map(([k, l]) => `<div class="row"><kbd class="choice" style="width:64px;justify-content:center">${k}</kbd><span>${l}</span></div>`).join("")}</div>`);
  });
}

/* ---------------- toast ---------------- */
let toastTimer;
function toast(msg) {
  const t = $("toast");
  t.textContent = msg; t.classList.remove("is-hidden");
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.add("is-hidden"), 3800);
}

/* ---------------- search ---------------- */
function setSearching(on) {
  state.searching = on;
  $("browseControls").classList.toggle("is-hidden", on);
  $("searchControls").classList.toggle("is-hidden", !on);
  if (on) { $("searchInput").value = state.search; $("searchInput").focus(); }
  else { state.search = ""; }
  renderList();
}

/* ---------------- events ---------------- */
$("tabs").addEventListener("click", (e) => { const b = e.target.closest("[data-tab]"); if (!b) return; state.tab = b.dataset.tab; renderTabs(); renderList(); });
$("cats").addEventListener("click", (e) => {
  if (e.target.closest("#catsMore")) { state.catsOpen = !state.catsOpen; renderCats(); return; }
  const b = e.target.closest("[data-cat]"); if (!b) return;
  state.category = b.dataset.cat; state.sub = []; state.tab = "all"; renderAll();
});
$("subFilter").addEventListener("click", (e) => {
  const b = e.target.closest("[data-sub]"); if (!b) return;
  const id = b.dataset.sub, f = SUB_FILTERS[state.category];
  if (!id) state.sub = [];
  else if (f.multi) state.sub = state.sub.includes(id) ? state.sub.filter((x) => x !== id) : [...state.sub, id];
  else state.sub = state.sub[0] === id ? [] : [id];
  renderSub(); renderList();
});
$("countrySel").addEventListener("change", (e) => { state.country = e.target.value; renderList(); });
$("sortSel").addEventListener("change", (e) => { state.sort = e.target.value; renderList(); });
$("shuffleBtn").addEventListener("click", shuffle);
$("searchBtn").addEventListener("click", () => setSearching(true));
$("searchClose").addEventListener("click", () => setSearching(false));
$("searchInput").addEventListener("input", (e) => { state.search = e.target.value; renderList(); });
$("list").addEventListener("click", (e) => { const r = e.target.closest(".src-row"); if (r) openSource(findById(r.dataset.id)); });
$("list").addEventListener("keydown", (e) => { if (e.key === "Enter") { const r = e.target.closest(".src-row"); if (r) openSource(findById(r.dataset.id)); } });
$("homeLink").addEventListener("click", (e) => { e.preventDefault(); goHome(); });
$("collapseBtn").addEventListener("click", () => document.body.classList.toggle("is-collapsed"));
$("menuBtn").addEventListener("click", openMenu);
$("supportLink").addEventListener("click", (e) => { e.preventDefault(); openPanel(`${panelHead("Support Saorsa")}<div class="panel__body"><p>Saorsa is independent and ad-free, kept alive by readers.</p><p class="hint">PayPal quick donation, other ways to give and the Founder membership go here (see the NOW · 06 design).</p></div>`); });
$("backBtn").addEventListener("click", () => goHome());
$("prevBtn").addEventListener("click", () => step(-1));
$("nextBtn").addEventListener("click", () => step(1));
$("reloadBtn").addEventListener("click", () => { if (state.current) $("frame").src = state.current.url; });
$("saveBtn").addEventListener("click", () => {
  const s = state.current; if (!s) return;
  state.saved = state.saved.includes(s.id) ? state.saved.filter((x) => x !== s.id) : [s.id, ...state.saved];
  store.set("saved", state.saved);
  $("saveBtn").classList.toggle("is-on", state.saved.includes(s.id));
  toast(state.saved.includes(s.id) ? "Saved. Founders get Saved synced across devices." : "Removed from Saved.");
  renderTabs(); if (state.tab === "saved") renderList();
});
$("shareBtn").addEventListener("click", async () => {
  try { await navigator.clipboard.writeText(location.href); toast("Link copied."); } catch { toast(location.href); }
});
$("reportBtn").addEventListener("click", () => openReport());
$("fbNext").addEventListener("click", () => step(1));
$("fbReport").addEventListener("click", () => reportBroken());

window.addEventListener("popstate", () => routeFromHash(false));
window.addEventListener("resize", () => { if (!state.catsOpen) renderCats(); });

document.addEventListener("keydown", (e) => {
  const typing = /INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName);
  if (e.key === "Escape") {
    if (!$("panel").classList.contains("is-hidden")) return closePanel();
    if (state.searching) return setSearching(false);
    if (state.current) return goHome();
  }
  if (typing || e.metaKey || e.ctrlKey || e.altKey) return;
  if (e.key === "/") { e.preventDefault(); setSearching(true); }
  else if (e.key.toLowerCase() === "s") shuffle();
  else if (e.key.toLowerCase() === "r") openReport();
  else if (e.key.toLowerCase() === "t") tweak.toggle();
  else if (e.key === "ArrowRight") step(1);
  else if (e.key === "ArrowLeft") step(-1);
});

function routeFromHash(push) {
  const m = location.hash.match(/^#\/site\/(.+)$/);
  const s = m && findById(decodeURIComponent(m[1]));
  if (s) { state.category = s.category; renderAll(); openSource(s, { push }); }
  else if (state.current) goHome({ push: false });
}

/* ---------------- splash ---------------- */
function splash() {
  const el = $("splash");
  if (sessionStorage.getItem("saorsa.splash") || matchMedia("(prefers-reduced-motion: reduce)").matches || location.hash) { el.remove(); return; }
  sessionStorage.setItem("saorsa.splash", "1");
  const hide = () => { el.classList.add("is-gone"); setTimeout(() => el.remove(), 700); };
  setTimeout(hide, 1200);
  window.addEventListener("keydown", hide, { once: true });
  el.addEventListener("click", hide, { once: true });
}

/* ---------------- start ---------------- */
const bgApi = initBackground(settings);
const tweak = initTweakPanel(settings, bgApi, refreshSources);
splash();
await refreshSources();
routeFromHash(false);
