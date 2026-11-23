// Saorsa front end: left column, reader, report / suggest panels.
import { CATEGORIES, SUB_FILTERS, SUPPORT_LINKS } from "./config.js";
import { loadSources, sendReport, sendSuggestion, sendContact } from "./data.js";
import { loadSettings, initBackground, initTweakPanel } from "./background.js";
import { getSession, plan, canSave, previewPlan, setPreviewPlan, PREVIEW } from "./auth.js";
import { initAccount, openSignIn, openPaywall, openAccount, closeAccount, savedIds, toggleSaved, afterSaveToast, savedListHTML, handleSavedClick, modalOpen } from "./account.js";

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const catOf = (id) => CATEGORIES.find((c) => c.id === id);
const store = {
  get: (k, d) => { try { return JSON.parse(localStorage.getItem("saorsa." + k)) ?? d; } catch { return d; } },
  set: (k, v) => { try { localStorage.setItem("saorsa." + k, JSON.stringify(v)); } catch {} },
  getRaw: (k) => { try { return JSON.parse(localStorage.getItem("saorsa." + k)) || []; } catch { return []; } },
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
  recent: store.get("recent", []),
};

Object.defineProperty(state, "saved", { get: () => savedIds() });
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
  if (state.tab === "saved") return savedIds().map(findById).filter(Boolean);
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
  document.body.classList.toggle("tab-other", state.tab !== "all");
  document.querySelectorAll("#tabs .seg__btn").forEach((b) => {
    b.classList.toggle("is-on", b.dataset.tab === state.tab);
    if (b.dataset.tab === "saved") b.innerHTML = `Saved${canSave() && state.saved.length ? `<span class="badge">${state.saved.length}</span>` : ""}`;
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
    + `<button class="chip chip--more ${state.catsOpen ? "" : "is-hidden"}" id="catsMore" aria-label="${state.catsOpen ? "Show fewer categories" : "Show all categories"}"><svg viewBox="0 0 24 24"><path d="M6 9l6 6 6-6"/></svg></button>`;
  el.classList.toggle("is-open", state.catsOpen);
  // Put ▾ straight after the last chip that fits in two rows.
  if (!state.catsOpen) requestAnimationFrame(() => placeMore(swapIn));
}

// Shows ▾ only when the chips really don't fit on two lines. It measures
// only while the categories are on screen at full size (not rolled up, not
// on the Saved / Recent tabs, not mid-collapse, fonts loaded), otherwise it
// keeps ▾ hidden and measures again once they are visible.
function catsMeasurable(el) {
  return el.offsetParent !== null && el.clientHeight > 0 && !document.body.classList.contains("filters-rolled")
    && !document.body.classList.contains("is-collapsed") && el.getBoundingClientRect().width >= 200;
}
function placeMore(swapped) {
  const el = $("cats"); const more = $("catsMore"); if (!more) return;
  more.classList.add("is-hidden");
  if (!catsMeasurable(el)) return;
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
  const pill = (o) => `<button class="pill ${state.sub.includes(o.id) ? "is-on" : ""}" data-sub="${o.id}">${o.label}</button>`;
  el.innerHTML = `<button class="pill ${state.sub.length ? "" : "is-on"}" data-sub="">All</button>` + f.options.map(pill).join("");
}

// One source row. In the Saved tab rows get a ★ to un-save.
function rowHTML(s, { star = false, showCat = false } = {}) {
  return `<li class="src-row ${state.current?.id === s.id ? "is-on" : ""}" data-id="${esc(s.id)}" tabindex="0" title="${esc(s.name)}">
      <span class="ini">${esc(s.domain[0].toUpperCase())}</span>
      <span class="nm">${esc(s.domain)}</span>
      ${s.status === "pending" ? '<span class="pend">Preview</span>' : ""}
      ${showCat ? `<span class="cat">${esc(catOf(s.category)?.label || "")}</span>` : ""}
      ${star ? `<button class="row-star" data-unsave="${esc(s.id)}" aria-label="Remove ${esc(s.domain)} from Saved" data-label="Remove from Saved"><svg viewBox="0 0 24 24"><path d="m12 4 2.4 5 5.4.6-4 3.7 1.1 5.4L12 16l-4.9 2.7 1.1-5.4-4-3.7 5.4-.6z"/></svg></button>` : ""}
    </li>`;
}

function renderList() {
  const el = $("list");
  updateCounts();
  if (state.tab === "saved" && !(state.searching && state.search.trim())) { el.innerHTML = savedListHTML(rowHTML); return; }
  const items = visible();
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
  el.innerHTML = (head ? `<li class="list__head">${esc(head)}</li>` : "") + items.map((s) => rowHTML(s, { showCat })).join("");
}

// Breadcrumb (rolled-up filters) and the mobile "GEO · 48 SOURCES" line.
function updateCounts() {
  const c = catOf(state.category);
  const n = state.tab === "all" ? visible().length : null;
  const f = SUB_FILTERS[state.category];
  const subs = state.sub.map((id) => f.options.find((o) => o.id === id)?.label).filter(Boolean);
  const country = state.country ? $("countrySel").selectedOptions[0]?.textContent : "";
  const bits = [...subs, country].filter(Boolean);
  $("crumb").innerHTML = `<i style="--c:${c.color}"></i><b>${esc(c.label)}</b>${bits.length ? `<span class="crumb__sep">›</span><span class="crumb__sub">${esc(bits.join(", "))}</span>` : ""}<span class="grow"></span>${n !== null ? `<small>${n} site${n === 1 ? "" : "s"}</small>` : ""}<svg viewBox="0 0 24 24"><path d="M6 9l6 6 6-6"/></svg>`;
  $("mCount").textContent = state.tab === "all" ? `${c.label} · ${n} source${n === 1 ? "" : "s"}` : state.tab === "saved" ? "Saved" : "Recent";
  const sortLabel = { az: "A–Z", za: "Z–A", country: "By country" }[state.sort];
  $("mFilterLabel").textContent = `${state.country ? country : "Country"} · ${sortLabel}${state.sub.length ? ` · ${state.sub.length}` : ""}`;
  $("mFilterRow").classList.toggle("is-hidden", state.tab !== "all" || state.searching);
}

function renderAll() { renderTabs(); renderCats(); renderSub(); renderList(); renderRail(); }

/* ---------------- reader ---------------- */
function openSource(s, { push = true } = {}) {
  if (!s) return;
  state.current = s;
  hideAccount({ restore: false });
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
    tags.push(`<button class="tag tag--rating" data-rating="${o.id}" aria-label="Saorsa rating: ${o.label}. How we rate">${o.label}</button>`);
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
    startLoading(s);
    frame.src = s.url;
  }

  addRecent(s);
  store.set("last", s.id);
  maybeSwipeHint();
  if (push) history.pushState({ id: s.id }, "", `#/site/${encodeURIComponent(s.id)}`);
  renderList();
  scrollRowIntoView(s.id);
}

function addRecent(s) {
  state.recent = [s.id, ...state.recent.filter((id) => id !== s.id)].slice(0, 30);
  store.set("recent", state.recent);
}

// A click in the list: open inside Saorsa, or in a new tab if that's the reader's preference.
function pickSource(s) {
  if (!s) return;
  if (prefs.openIn === "tab" || alwaysTab().includes(s.id)) { window.open(s.url, "_blank", "noopener"); addRecent(s); if (state.tab === "recent") renderList(); return; }
  openSource(s);
}

function visibleFor(s) {
  // the list the site belongs to, for "3 of 34" and prev / next
  const v = visible();
  return v.some((x) => x.id === s.id) ? v : state.sources.filter((x) => x.category === s.category).sort(byName);
}

/* ---------------- loading a site (P7-22 / 23 / 24) ---------------- */
// Something is always moving after a click: a thin bar under the toolbar and
// "Opening site.com" with three waving dots. After ~1 s a reassurance line,
// after ~6 s the choice to keep waiting or open the site in a new tab.
const loading = { site: null, timers: [] };
function setBar(pct, ms, ease = "ease-out") {
  const bar = $("progress").firstElementChild;
  bar.style.transition = ms ? `width ${ms}ms ${ease}` : "none";
  bar.style.width = pct + "%";
}
function clearLoadingTimers() { loading.timers.forEach(clearTimeout); loading.timers = []; }
function startLoading(s) {
  clearLoadingTimers();
  loading.site = s;
  $("fallback").classList.add("is-hidden");
  $("ldTitle").textContent = `Opening ${s.domain}`;
  $("ldSub").classList.add("is-hidden");
  $("ldDots").classList.remove("is-hidden");
  $("ldActions").classList.add("is-hidden");
  $("ldReport").classList.add("is-hidden");
  $("ldOpen").href = s.url;
  $("loading").classList.remove("is-hidden");
  const p = $("progress");
  p.classList.remove("is-hidden", "is-done");
  setBar(0, 0);
  requestAnimationFrame(() => requestAnimationFrame(() => setBar(30, 300)));
  loading.timers.push(setTimeout(() => setBar(70, 900), 320));
  loading.timers.push(setTimeout(() => {
    setBar(90, 9000, "cubic-bezier(.1,.6,.3,1)");
    $("ldSub").textContent = "Some independent sites are a little slow";
    $("ldSub").classList.remove("is-hidden");
  }, 1000));
  loading.timers.push(setTimeout(slowLoading, 6000));
}
function slowLoading() {
  const s = loading.site; if (!s) return;
  $("ldTitle").textContent = `${s.domain} is taking a while`;
  $("ldSub").textContent = "It may be busy. You can keep waiting or try another way.";
  $("ldSub").classList.remove("is-hidden");
  $("ldDots").classList.add("is-hidden");
  $("ldActions").classList.remove("is-hidden");
  $("ldReport").classList.remove("is-hidden");
}
function keepWaiting() {
  const s = loading.site; if (!s) return;
  clearLoadingTimers();
  $("ldTitle").textContent = `Still opening ${s.domain}`;
  $("ldSub").textContent = "We’ll show it as soon as it arrives.";
  $("ldDots").classList.remove("is-hidden");
  $("ldActions").classList.add("is-hidden");
  $("ldReport").classList.add("is-hidden");
  loading.timers.push(setTimeout(slowLoading, 10000));
}
function finishLoading() {
  if (!loading.site) return;
  clearLoadingTimers();
  loading.site = null;
  setBar(100, 200);
  $("loading").classList.add("is-hidden");
  loading.timers.push(setTimeout(() => $("progress").classList.add("is-done"), 220));
  loading.timers.push(setTimeout(() => { $("progress").classList.add("is-hidden"); setBar(0, 0); }, 450));
}
function stopLoading() {
  clearLoadingTimers();
  loading.site = null;
  $("loading").classList.add("is-hidden");
  $("progress").classList.add("is-hidden");
}

// P7-27: the nightly check knows this site blocks frames → one clear way out.
// P7-28: it should load but has been failing → try again, open, or report.
function showFallback(s, kind) {
  stopLoading();
  const blocked = kind === "blocked";
  $("fbTitle").textContent = blocked ? `${s.domain} opens in its own tab` : `${s.domain} didn’t load`;
  $("fbText").textContent = blocked
    ? "This publisher doesn’t allow its pages to be shown inside other sites. Nothing’s wrong — it just needs a tab of its own."
    : "It may be down for a moment, or it may have moved. You can try again or open it directly.";
  $("fbRetry").classList.toggle("is-hidden", blocked);
  $("fbReport").classList.toggle("is-hidden", blocked);
  $("fbAlwaysRow").classList.toggle("is-hidden", !blocked);
  $("fbAlways").checked = alwaysTab().includes(s.id);
  $("fallback").classList.remove("is-hidden");
}
const alwaysTab = () => store.get("alwaysTab", []);

function goHome({ push = true } = {}) {
  state.current = null;
  hideAccount({ restore: false });
  document.body.classList.remove("is-reading");
  $("reader").classList.add("is-hidden");
  $("home").classList.remove("is-hidden");
  stopLoading();
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
// A panel takes over the left column. `back` is where the ‹ button goes
// (e.g. the menu); without one, ‹ and × both close the panel.
let panelBack = null;
let panelDir = null;        // "back" when the ‹ button (or Esc) is going back a step
let panelAnim = null;
const calm = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
const EASE = "cubic-bezier(.22,.8,.24,1)";

// Panels slide: the first one glides in over the column from the left, moving
// deeper (Menu → Suggest) pushes the new page in from the right, going back
// brings the previous page in from the left, and closing slides it away.
function openPanel(html, back = null) {
  const p = $("panel");
  const wasOpen = !p.classList.contains("is-hidden") && !p.dataset.closing;
  const dir = panelDir || (wasOpen ? "forward" : "open");
  panelDir = null;
  panelAnim?.cancel(); delete p.dataset.closing;
  panelBack = back;
  // Keep a picture of the page we're leaving so the two can slide past each other.
  document.querySelectorAll(".panel-ghost").forEach((g) => g.remove());
  const ghost = wasOpen && !calm() && dir !== "open" ? p.cloneNode(true) : null;
  if (ghost) { ghost.removeAttribute("id"); ghost.classList.add("panel-ghost"); ghost.setAttribute("aria-hidden", "true"); ghost.inert = true; ghost.querySelector(".panel__body")?.scrollTo?.(0, p.querySelector(".panel__body")?.scrollTop || 0); }
  p.innerHTML = html;
  p.classList.remove("is-hidden");
  if (document.body.classList.contains("is-collapsed")) setCollapsed(false);
  p.querySelector("[data-back],[data-close]")?.focus({ preventScroll: true });
  p.querySelectorAll("[data-close]").forEach((b) => b.addEventListener("click", closePanel));
  p.querySelectorAll("[data-back]").forEach((b) => b.addEventListener("click", goBackPanel));
  if (calm()) return;
  if (dir === "open") {
    panelAnim = p.animate([{ transform: "translateX(-100%)" }, { transform: "none" }], { duration: 320, easing: EASE });
  } else if (ghost) {
    // Forward: the new page slides in from the right over the old one, which
    // drifts left and dims. Back: the old page slides off to the right and
    // the previous one comes forward from underneath.
    const T = { duration: 340, easing: EASE };
    if (dir === "forward") {
      p.before(ghost);
      ghost.animate([{ transform: "none", filter: "brightness(1)" }, { transform: "translateX(-30%)", filter: "brightness(.55)" }], T).onfinish = () => ghost.remove();
      panelAnim = p.animate([{ transform: "translateX(100%)", boxShadow: "-10px 0 24px rgba(0,0,0,.35)" }, { transform: "none", boxShadow: "-10px 0 24px rgba(0,0,0,0)" }], T);
    } else {
      p.after(ghost);
      ghost.style.boxShadow = "-10px 0 24px rgba(0,0,0,.35)";
      ghost.animate([{ transform: "none" }, { transform: "translateX(100%)" }], T).onfinish = () => ghost.remove();
      panelAnim = p.animate([{ transform: "translateX(-30%)", filter: "brightness(.55)" }, { transform: "none", filter: "brightness(1)" }], T);
    }
  }
}
function goBackPanel() {
  if (!panelBack) return closePanel();
  panelDir = "back";
  panelBack();
}
function closePanel() {
  const p = $("panel");
  panelBack = null;
  if (p.classList.contains("is-hidden")) return;
  const done = () => { delete p.dataset.closing; p.classList.add("is-hidden"); p.innerHTML = ""; };
  if (calm()) return done();
  p.dataset.closing = "1";
  panelAnim?.cancel();
  panelAnim = p.animate([{ transform: "none" }, { transform: "translateX(-100%)" }], { duration: 260, easing: "cubic-bezier(.4,0,.8,.4)" });
  panelAnim.onfinish = () => { if (p.dataset.closing) done(); };
}

const ICON = {
  back: '<svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7"/></svg>',
  x: '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg>',
  chev: '<svg class="chev" viewBox="0 0 24 24"><path d="M9 5l7 7-7 7"/></svg>',
  heart: '<svg viewBox="0 0 24 24"><path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/></svg>',
  plus: '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>',
  mail: '<svg viewBox="0 0 24 24"><rect x="3.5" y="5.5" width="17" height="13" rx="2"/><path d="m4 7 8 6 8-6"/></svg>',
  flag: '<svg viewBox="0 0 24 24"><path d="M5 21V4M5 5c3-2 6 2 9 0s4-1 5-.5v8.5c-1-.5-2-.5-5 .5s-6-2.5-9-.5"/></svg>',
  star: '<svg viewBox="0 0 24 24"><path d="m12 4 2.4 5 5.4.6-4 3.7 1.1 5.4L12 16l-4.9 2.7 1.1-5.4-4-3.7 5.4-.6z"/></svg>',
  keys: '<svg viewBox="0 0 24 24"><rect x="2.5" y="6.5" width="19" height="11" rx="2"/><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M7 14h10"/></svg>',
  user: '<svg viewBox="0 0 24 24"><circle cx="12" cy="9" r="3.5"/><path d="M5 19c1.5-3 4-4.5 7-4.5s5.5 1.5 7 4.5"/></svg>',
};

// ‹ back on the left only when there is somewhere to go back to; × always closes.
const panelHead = (title, { back = false } = {}) => `<header class="panel__head">
  ${back ? `<button class="icon-btn" data-back aria-label="Back">${ICON.back}</button>` : ""}
  <h2 ${back ? "" : 'style="padding-left:8px"'}>${title}</h2>
  <button class="icon-btn" data-close aria-label="Close">${ICON.x}</button></header>`;

/* ---- Report a problem (P7-13 / 14 / 15) ---- */
function openReport(s = state.current, preset = "category", back = null) {
  if (!s) return openReportPicker(preset, back);
  const listed = [catOf(s.category)?.label, s.perspective && SUB_FILTERS.geo.options.find((o) => o.id === s.perspective)?.label,
    ...(s.topics || []).map((t) => SUB_FILTERS[s.category]?.options.find((o) => o.id === t)?.label)].filter(Boolean).join(" · ");
  const types = [["category", "Wrong category or topic"], ["broken", "Broken or won’t load"], ["independent", "No longer independent"], ["other", "Something else"]];
  openPanel(`${panelHead("Report a problem", { back: !!back })}
  <form class="panel__body" id="reportForm">
    <p>Tell us what’s wrong with this site. We check every report before changing anything.</p>
    <div class="site-card"><span class="ini">${esc(s.domain[0].toUpperCase())}</span><div><strong>${esc(s.domain)}</strong><small>Listed in: ${esc(listed || "—")}${s.country ? ` · ${esc(s.country)}` : ""}</small></div></div>
    <span class="field-label">What’s wrong?</span>
    ${types.map(([v, l]) => `<label class="choice"><input type="radio" name="type" value="${v}" ${v === preset ? "checked" : ""}> ${l}</label>`).join("")}
    <div id="moveTo">
      <span class="field-label">Where should it go?</span>
      <div class="chips-pick" id="rCats" style="margin-top:12px">${CATEGORIES.map((c) => `<button type="button" class="pill" data-cat="${c.id}">${c.label}</button>`).join("")}</div>
      <span class="field-label" style="display:block;margin-top:14px">Topic <small style="color:var(--text-3)">optional</small></span>
      <div class="chips-pick" id="rTopics" style="margin-top:12px"></div>
    </div>
    <textarea name="note" rows="3" placeholder="Anything else? (optional)"></textarea>
    <p class="hint">Broken reports need no account. The others will need a free account once accounts are live.</p>
  </form>
  <footer class="panel__foot"><button class="btn btn--ghost" data-close>Cancel</button><button class="btn btn--accent" id="reportSend">Send report</button></footer>`, back);

  const form = $("reportForm");
  let cat = null, topic = null;
  const syncType = () => { $("moveTo").classList.toggle("is-hidden", form.type.value !== "category"); };
  const drawTopics = () => {
    const f = cat && SUB_FILTERS[cat];
    $("rTopics").innerHTML = f ? f.options.map((o) => `<button type="button" class="pill ${topic === o.id ? "is-on" : ""}" data-t="${o.id}">${o.label}</button>`).join("") : '<small style="color:var(--text-3)">Pick a category first</small>';
  };
  drawTopics(); syncType();
  form.addEventListener("change", syncType);
  form.addEventListener("submit", (e) => e.preventDefault());
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
    const type = form.type.value;
    if (type === "category" && !cat) return toast("Pick the category it should be in.");
    if ((type === "other" || type === "independent") && !form.note.value.trim()) { form.note.focus(); return toast("Add a short note so we know what to check."); }
    const report = { site: s.domain, url: s.url, type, listed_as: listed, suggested_category: type === "category" ? cat : null, suggested_topic: type === "category" ? topic : null, note: form.note.value.trim() || null };
    try {
      await sendReport(report);
      if (type === "broken") store.set(`broken:${s.id}:${new Date().toISOString().slice(0, 10)}`, true);
      showSent(s, report);
    } catch (err) { toast("Couldn’t send that. Please try again."); console.error(err); }
  });
}

// From the menu with no site open: pick the site first.
function openReportPicker(preset = "category", back = null) {
  openPanel(`${panelHead("Report a problem", { back: !!back })}
  <div class="panel__body">
    <p>Which site is the problem with?</p>
    <label class="search"><svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="6.5"/><path d="M16 16l4 4"/></svg>
      <input id="pickInput" type="search" placeholder="Type the site’s name" autocomplete="off" spellcheck="false"></label>
    <ul class="pick-list" id="pickList"></ul>
  </div>`, back);
  const draw = () => {
    const q = $("pickInput").value.trim().toLowerCase();
    const items = (q ? state.sources.filter((s) => s.domain.includes(q) || (s.name || "").toLowerCase().includes(q)) : state.recent.map(findById).filter(Boolean)).slice(0, 30);
    $("pickList").innerHTML = (q ? "" : `<li class="list__head">${items.length ? "Recently opened" : "Start typing to find a site"}</li>`)
      + items.map((s) => `<li class="src-row" data-id="${esc(s.id)}" tabindex="0"><span class="ini">${esc(s.domain[0].toUpperCase())}</span><span class="nm">${esc(s.domain)}</span><span class="cat">${esc(catOf(s.category)?.label || "")}</span></li>`).join("")
      + (q && !items.length ? '<li class="list__empty">No site matches that.</li>' : "");
  };
  draw();
  $("pickInput").addEventListener("input", draw);
  $("pickInput").focus();
  $("pickList").addEventListener("click", (e) => {
    const r = e.target.closest("[data-id]"); if (!r) return;
    openReport(findById(r.dataset.id), preset, () => openReportPicker(preset, back));
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

/* ---- Suggest a source (P7-02 / 03) ---- */
const COUNTRY_OPTIONS = '<option value="">Select a country</option><option value="UK">UK</option><option value="US">US</option><option value="CA">Canada</option><option value="AU">Australia</option><option value="NZ">New Zealand</option><option value="IE">Ireland</option><option value="other">Somewhere else</option>';

function openSuggest(back = openMenu) {
  openPanel(`${panelHead("Suggest a source", { back: !!back })}
  <form class="panel__body" id="suggestForm">
    <p>Know an independent site we’re missing? Paste the address and we’ll check it.</p>
    <hr class="divider-h">
    <span class="field-label">Website address</span>
    <input class="text-input" name="url" type="url" placeholder="https://www.example-news.org" required>
    <hr class="divider-h">
    <span class="field-label">Category</span>
    <div class="chips-pick" id="sCats">${CATEGORIES.map((c) => `<button type="button" class="pill" data-cat="${c.id}">${c.label}</button>`).join("")}</div>
    <hr class="divider-h">
    <span class="field-label">Country</span>
    <label class="ctl ctl--select field-select"><select name="country">${COUNTRY_OPTIONS}</select></label>
    <hr class="divider-h">
    <textarea name="note" rows="3" placeholder="Why should it be on Saorsa? (optional)"></textarea>
  </form>
  <footer class="panel__foot"><button class="btn btn--ghost" data-close>Cancel</button><button class="btn btn--accent" id="suggestSend">Send suggestion</button></footer>`, back);
  let cat = null;
  $("suggestForm").addEventListener("submit", (e) => e.preventDefault());
  $("sCats").addEventListener("click", (e) => { const b = e.target.closest("[data-cat]"); if (!b) return; cat = b.dataset.cat; $("sCats").querySelectorAll(".pill").forEach((p) => p.classList.toggle("is-on", p === b)); });
  $("suggestSend").addEventListener("click", async () => {
    const f = $("suggestForm");
    if (!f.url.value || !f.url.checkValidity()) { f.url.focus(); return toast("Add the site’s full address, starting with https://"); }
    try { await sendSuggestion({ url: f.url.value.trim(), category: cat, country: f.country.value || null, note: f.note.value.trim() || null }); }
    catch { return toast("Couldn’t send that just now. Please try again in a moment."); }
    openPanel(`${panelHead("Suggestion sent")}<div class="panel__body sent"><div class="tick">✓</div><h2>Thanks — it’s in the queue</h2><p>We check every suggestion before it goes on Saorsa.</p><div class="row row--center"><button class="btn btn--accent" data-close>Done</button></div></div>`);
  });
}

/* ---- Contact (P7-04) ---- */
function openContact(back = openMenu) {
  const topics = ["General", "Report a problem", "Rating feedback", "Membership & billing", "Press", "Suggest a website"];
  openPanel(`${panelHead("Contact Saorsa", { back: !!back })}
  <form class="panel__body" id="contactForm">
    <p>Questions, problems, press — we read everything.</p>
    <hr class="divider-h">
    <span class="field-label">What’s it about?</span>
    <div class="chips-pick" id="cTopics">${topics.map((t, i) => `<button type="button" class="pill ${i === 0 ? "is-on" : ""}" data-t="${esc(t)}">${t}</button>`).join("")}</div>
    <p class="hint is-hidden" id="cSuggestHint">Suggesting a website? <button type="button" class="m-textlink" id="cToSuggest">Use Suggest a source</button> so it can be tracked.</p>
    <hr class="divider-h">
    <span class="field-label">Name</span>
    <input class="text-input" name="name" placeholder="Your name" autocomplete="name">
    <span class="field-label">Email</span>
    <input class="text-input" name="email" type="email" placeholder="you@example.com" autocomplete="email" required>
    <hr class="divider-h">
    <span class="field-label">Message</span>
    <textarea name="message" rows="5" placeholder="How can we help?"></textarea>
    <p class="hint">We only use your email to reply.</p>
  </form>
  <footer class="panel__foot"><button class="btn btn--ghost" data-close>Cancel</button><button class="btn btn--accent" id="contactSend">Send message</button></footer>`, back);
  let topic = topics[0];
  $("contactForm").addEventListener("submit", (e) => e.preventDefault());
  $("cTopics").addEventListener("click", (e) => {
    const b = e.target.closest("[data-t]"); if (!b) return; topic = b.dataset.t;
    $("cTopics").querySelectorAll(".pill").forEach((p) => p.classList.toggle("is-on", p === b));
    $("cSuggestHint").classList.toggle("is-hidden", topic !== "Suggest a website");
  });
  $("cToSuggest").addEventListener("click", () => openSuggest(() => openContact(back)));
  $("contactSend").addEventListener("click", async () => {
    const f = $("contactForm");
    if (!f.email.value || !f.email.checkValidity()) { f.email.focus(); return toast("Add your email so we can reply."); }
    if (!f.message.value.trim()) { f.message.focus(); return toast("Write a message first."); }
    try { await sendContact({ topic, name: f.name.value.trim() || null, email: f.email.value.trim(), message: f.message.value.trim(), site: state.current?.domain || null }); }
    catch { return toast("Couldn’t send your message just now. Please try again in a moment."); }
    openPanel(`${panelHead("Message sent")}<div class="panel__body sent"><div class="tick">✓</div><h2>Thanks — we’ll reply soon</h2><p>We usually answer within a few days.</p><div class="row row--center"><button class="btn btn--accent" data-close>Done</button></div></div>`);
  });
}

/* ---- Support Saorsa (NOW · 06) ---- */
function openSupport(back = null) {
  const amounts = [3, 5, 10, 25];
  let amount = 10;
  const platforms = [["kofi", "Ko-fi", "Tips & memberships"], ["buymeacoffee", "Buy Me a Coffee", "Quick tips"], ["opencollective", "Open Collective", "Public, transparent budget"], ["liberapay", "Liberapay", "Recurring, non-profit"], ["bitcoin", "Bitcoin / Lightning", "On-chain or instant"], ["monero", "Monero", "Private donations"]];
  openPanel(`${panelHead("Support Saorsa", { back: !!back })}
  <div class="panel__body" id="supportBody">
    <p>No ads, no tracking, and no paywall on the news. Pick whatever suits you.</p>
    <button class="founder" data-link="founder"><span class="badge-star">${ICON.star}</span><span class="m-txt">Become a Founder · £29 once<small>Saved favourites for life + Founder badge</small></span>${ICON.chev}</button>
    <span class="m-label">One-off donation</span>
    <div class="amounts" id="amounts">${amounts.map((a) => `<button data-amt="${a}" class="${a === amount ? "is-on" : ""}">£${a}</button>`).join("")}<button data-amt="other">Other</button></div>
    <div class="pay"><button class="btn btn--accent" data-link="donate" id="donateBtn">Donate £${amount}</button><button class="btn btn--paypal" data-link="paypal">PayPal</button></div>
    <p class="hint">Card, Apple Pay & Google Pay via one secure checkout</p>
    <span class="m-label">Monthly</span>
    <button class="m-link m-link--heart" data-link="monthly">${ICON.heart}<span class="m-txt">Supporter · £3 / month</span><small>Cancel anytime</small>${ICON.chev}</button>
    <span class="m-label">Other ways to give</span>
    <div class="platforms">${platforms.map(([k, n, d]) => `<button data-link="${k}">${n}<small>${d}</small></button>`).join("")}</div>
  </div>`, back);
  $("amounts").addEventListener("click", (e) => {
    const b = e.target.closest("[data-amt]"); if (!b) return;
    amount = b.dataset.amt === "other" ? "other" : Number(b.dataset.amt);
    $("amounts").querySelectorAll("button").forEach((x) => x.classList.toggle("is-on", x === b));
    $("donateBtn").textContent = amount === "other" ? "Donate" : `Donate £${amount}`;
  });
  $("supportBody").addEventListener("click", (e) => {
    const b = e.target.closest("[data-link]"); if (!b) return;
    let url = SUPPORT_LINKS[b.dataset.link];
    if (!url) return toast("That option isn’t set up yet — coming soon.");
    if (b.dataset.link === "donate" && amount !== "other") url += (url.includes("?") ? "&" : "?") + `amount=${amount}`;
    window.open(url, "_blank", "noopener");
  });
}

/* ---- Keyboard shortcuts ---- */
function openShortcuts(back = openMenu) {
  openPanel(`${panelHead("Keyboard shortcuts", { back: !!back })}<div class="panel__body">
    ${[["/", "Search"], ["S", "Shuffle"], ["← →", "Previous / next site"], ["R", "Report a problem"], ["?", "Keyboard shortcuts"], ["Esc", "Close / back"], ["T", "Background tweaks"]].map(([k, l]) => `<div class="row"><kbd class="choice" style="width:64px;justify-content:center">${k}</kbd><span>${l}</span></div>`).join("")}</div>`, back);
}

/* ---- Support card at the top of the menu (P7-29, version A) ---- */
const supportCard = () => `<section class="sup" aria-label="Support Saorsa">
  <div class="sup__head"><span class="sup__heart">${ICON.heart}</span><div><strong>Keep Saorsa independent</strong><small>No ads. No paywall. Funded by readers.</small></div></div>
  <button class="tier tier--gold" data-link="founder"><span class="tier__ic">${ICON.star}</span><span class="tier__txt"><b>Founder <em>Best value</em></b><small>Saved favourites for life + badge</small></span><span class="tier__price"><b>£29</b><small>once</small></span></button>
  <button class="tier" data-link="monthly"><span class="tier__ic tier__ic--red">${ICON.heart}</span><span class="tier__txt"><b>Supporter</b><small>Keeps Saorsa running</small></span><span class="tier__price"><b>£3</b><small>a month</small></span></button>
  <div class="sup__or"><span></span>or give once<span></span></div>
  <div class="sup__amts">${[3, 5, 10, 25].map((a) => `<button data-amt="${a}" class="${a === 10 ? "is-on" : ""}">£${a}</button>`).join("")}<button data-amt="other">Other</button></div>
  <div class="sup__pay"><button class="btn btn--accent" data-link="donate" data-donate>Donate £10</button><button class="btn btn--paypal" data-link="paypal">PayPal</button></div>
  <button class="m-textlink" data-act="support">More ways to give →</button>
</section>`;

function wireSupportCard(root) {
  let amount = 10;
  const card = root.querySelector(".sup"); if (!card) return;
  card.addEventListener("click", (e) => {
    const a = e.target.closest("[data-amt]");
    if (a) {
      amount = a.dataset.amt === "other" ? "other" : Number(a.dataset.amt);
      card.querySelectorAll("[data-amt]").forEach((x) => x.classList.toggle("is-on", x === a));
      card.querySelector("[data-donate]").textContent = amount === "other" ? "Donate" : `Donate £${amount}`;
      return;
    }
    const b = e.target.closest("[data-link]"); if (!b) return;
    let url = SUPPORT_LINKS[b.dataset.link];
    if (!url) return toast("That option isn’t set up yet — coming soon.");
    if (b.dataset.link === "donate" && amount !== "other") url += (url.includes("?") ? "&" : "?") + `amount=${amount}`;
    window.open(url, "_blank", "noopener");
  });
}

/* ---- Menu (NOW · 05) ---- */
function openMenu() {
  const p = prefs;
  openPanel(`${panelHead("Menu")}
  <div class="panel__body" id="menuBody" style="gap:18px">
    ${accountRow()}
    ${supportCard()}
    <section class="m-section"><span class="m-label">About</span>
      <p class="m-about">One window onto independent media from every corner. Saorsa doesn’t rank or rewrite anything: you choose what to read.</p>
      <button class="m-textlink" data-act="howrate">How we rate perspective →</button>
    </section>
    <section class="m-section"><span class="m-label">Preferences</span>
      <div class="pref"><div>Open sources in</div><div class="mini-seg" id="prefOpen" style="flex:none"><button data-v="saorsa" class="${p.openIn === "saorsa" ? "is-on" : ""}">Saorsa</button><button data-v="tab" class="${p.openIn === "tab" ? "is-on" : ""}">New tab</button></div></div>
      <div class="pref"><div>Background motion<small>Off for reduced-motion devices</small></div><button class="toggle ${p.motion ? "is-on" : ""}" data-pref="motion" aria-label="Background motion"></button></div>
      <div class="pref"><div>Remember last source</div><button class="toggle ${p.remember ? "is-on" : ""}" data-pref="remember" aria-label="Remember last source"></button></div>
      <div class="pref"><div>Show intro splash</div><button class="toggle ${p.splash ? "is-on" : ""}" data-pref="splash" aria-label="Show intro splash"></button></div>
    </section>
    <section class="m-section"><span class="m-label">Contribute</span>
      <button class="m-link" data-act="suggest">${ICON.plus}<span class="m-txt">Suggest a source</span>${ICON.chev}</button>
      <button class="m-link" data-act="contact">${ICON.mail}<span class="m-txt">Contact us</span>${ICON.chev}</button>
      <button class="m-link" data-act="report">${ICON.flag}<span class="m-txt">Report a problem${state.current ? `<small>${esc(state.current.domain)} or another site</small>` : ""}</span>${ICON.chev}</button>
    </section>
  </div>
  <footer class="m-foot"><button data-act="keys">${ICON.keys} Shortcuts <kbd>?</kbd></button></footer>`);
  // listen on the menu's own elements (they are rebuilt each time), not on #panel
  const onClick = (e) => {
    const act = e.target.closest("[data-act]")?.dataset.act;
    if (act === "account") { closePanel(); getSession() ? openAccount() : openSignIn(); }
    if (act === "howrate") openHowWeRate(openMenu);
    if (act === "support") openSupport(openMenu);
    if (act === "suggest") openSuggest(openMenu);
    if (act === "contact") openContact(openMenu);
    if (act === "report") openReport(state.current, "category", openMenu);
    if (act === "keys") openShortcuts(openMenu);
    const t = e.target.closest("[data-pref]");
    if (t) { prefs[t.dataset.pref] = !prefs[t.dataset.pref]; t.classList.toggle("is-on", prefs[t.dataset.pref]); savePrefs(); }
    const o = e.target.closest("#prefOpen [data-v]");
    if (o) { prefs.openIn = o.dataset.v; $("prefOpen").querySelectorAll("button").forEach((b) => b.classList.toggle("is-on", b === o)); savePrefs(); }
  };
  $("menuBody").addEventListener("click", onClick);
  wireSupportCard($("menuBody"));
  $("panel").querySelector(".m-foot").addEventListener("click", onClick);
}

/* ---------------- preferences ---------------- */
const prefs = { openIn: "saorsa", motion: true, remember: false, splash: true, ...store.get("prefs", {}) };
function savePrefs() { store.set("prefs", prefs); applyPrefs(); }
function applyPrefs() { document.documentElement.classList.toggle("no-motion", !prefs.motion); }
applyPrefs();

/* ---------------- collapsed rail ---------------- */
function setCollapsed(on) {
  document.body.classList.toggle("is-collapsed", on);
  store.set("collapsed", on);
}
function renderRail() {
  $("railCats").innerHTML = CATEGORIES.map((c) => `<button class="rail__cat ${c.id === state.category && state.tab === "all" ? "is-on" : ""}" data-rail-cat="${c.id}" style="--c:${c.color}" data-label="${c.label}" data-meta="${(() => { const n = state.sources.filter((s) => s.category === c.id).length; return `${n} site${n === 1 ? "" : "s"}`; })()}" aria-label="${c.label}"><span></span></button>`).join("");
  document.querySelectorAll("#rail [data-rail]").forEach((b) => b.classList.toggle("is-on", (b.dataset.rail === "saved" || b.dataset.rail === "recent") && state.tab === b.dataset.rail));
}

/* ---------------- toast ---------------- */
let toastTimer;
function toast(msg, action = null) {
  const t = $("toast");
  t.textContent = msg;
  if (action) { const b = document.createElement("button"); b.textContent = action.label; b.onclick = () => { t.classList.add("is-hidden"); action.fn(); }; t.appendChild(b); }
  t.classList.remove("is-hidden");
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.add("is-hidden"), action ? 6000 : 3800);
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
$("tabs").addEventListener("click", (e) => { const b = e.target.closest("[data-tab]"); if (!b) return; state.tab = b.dataset.tab; renderTabs(); renderList(); renderRail(); });
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
$("list").addEventListener("click", (e) => {
  if (state.tab === "saved" && handleSavedClick(e)) return;
  const r = e.target.closest(".src-row"); if (r) pickSource(findById(r.dataset.id));
});
$("list").addEventListener("keydown", (e) => { if (e.key === "Enter") { const r = e.target.closest(".src-row"); if (r) pickSource(findById(r.dataset.id)); } });
$("homeLink").addEventListener("click", (e) => { e.preventDefault(); goHome(); });
$("collapseBtn").addEventListener("click", () => setCollapsed(true));
$("rail").addEventListener("click", (e) => {
  const c = e.target.closest("[data-rail-cat]");
  if (c) { state.category = c.dataset.railCat; state.sub = []; state.tab = "all"; setCollapsed(false); renderAll(); return; }
  const act = e.target.closest("[data-rail]")?.dataset.rail; if (!act) return;
  if (act === "menu") return openMenu();
  if (act === "home") return goHome();
  if (act === "shuffle") return shuffle();
  if (act === "support") return openSupport();
  setCollapsed(false);
  if (act === "search") setSearching(true);
  if (act === "saved" || act === "recent") { state.tab = act; renderAll(); }
});
$("menuBtn").addEventListener("click", openMenu);
$("supportLink").addEventListener("click", (e) => { e.preventDefault(); openSupport(); });
$("backBtn").addEventListener("click", () => goHome());
$("prevBtn").addEventListener("click", () => step(-1));
$("nextBtn").addEventListener("click", () => step(1));
$("reloadBtn").addEventListener("click", () => {
  const s = state.current; if (!s || s.embeddable === false) return;
  startLoading(s); $("frame").src = "about:blank"; setTimeout(() => { $("frame").src = s.url; }, 0);
});
$("saveBtn").addEventListener("click", () => { if (state.current) saveSite(state.current); });
$("shareBtn").addEventListener("click", async () => {
  try { await navigator.clipboard.writeText(location.href); toast("Link copied."); } catch { toast(location.href); }
});
$("reportBtn").addEventListener("click", () => openReport());
$("fbAlways").addEventListener("change", (e) => {
  const s = state.current; if (!s) return;
  const list = alwaysTab().filter((id) => id !== s.id);
  store.set("alwaysTab", e.target.checked ? [s.id, ...list] : list);
  toast(e.target.checked ? `${s.domain} will open in a new tab from the list.` : `${s.domain} will open in Saorsa again.`);
});
$("fbRetry").addEventListener("click", () => {
  const s = state.current; if (!s) return;
  $("fallback").classList.add("is-hidden");
  startLoading(s); $("frame").src = "about:blank"; setTimeout(() => { $("frame").src = s.url; }, 0);
});
$("frame").addEventListener("load", () => { if (loading.site && $("frame").getAttribute("src") !== "about:blank") finishLoading(); });
$("ldWait").addEventListener("click", keepWaiting);
$("ldReport").addEventListener("click", () => reportBroken(loading.site || state.current));
$("fbReport").addEventListener("click", () => reportBroken());

window.addEventListener("popstate", () => routeFromHash(false));
window.addEventListener("resize", () => { if (!state.catsOpen) renderCats(); });
document.fonts?.ready.then(() => { if (!state.catsOpen) renderCats(); });
// re-check once the filters finish unrolling or the column finishes opening
$("filters").addEventListener("transitionend", (e) => { if (e.propertyName === "grid-template-rows" && !state.catsOpen) renderCats(); });
document.body.addEventListener("transitionend", (e) => { if (e.target === document.body && !state.catsOpen) renderCats(); });

document.addEventListener("keydown", (e) => {
  const typing = /INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName);
  if (e.key === "Escape") {
    if (!$("panel").classList.contains("is-hidden")) return goBackPanel();
    if (!$("sheetRoot").classList.contains("is-hidden")) return closeSheet();
    if (!$("account").classList.contains("is-hidden")) return hideAccount();
    if (state.searching) return setSearching(false);
    if (state.current) return goHome();
  }
  if (typing || e.metaKey || e.ctrlKey || e.altKey) return;
  if (e.key === "/") { e.preventDefault(); setSearching(true); }
  else if (e.key.toLowerCase() === "s") shuffle();
  else if (e.key.toLowerCase() === "r") openReport();
  else if (e.key.toLowerCase() === "t") tweak.toggle();
  else if (e.key === "?") openShortcuts(null);
  else if (e.key === "ArrowRight") step(1);
  else if (e.key === "ArrowLeft") step(-1);
});

function routeFromHash(push) {
  const m = location.hash.match(/^#\/site\/(.+)$/);
  const s = m && findById(decodeURIComponent(m[1]));
  if (s) { state.category = s.category; renderAll(); openSource(s, { push }); }
  else if (state.current) goHome({ push: false });
}

/* ---------------- hover labels (r7/Hover label) ---------------- */
// Anything with data-label gets a label that fades up after a 350 ms rest.
// Toolbar items: label under the item. Rail items: label to the right.
// Once a label is showing, the next one appears straight away.
const hover = { el: $("hoverLabel"), target: null, timer: 0, warmUntil: 0 };
function showLabel(t) {
  const el = hover.el, d = t.dataset;
  el.innerHTML = (d.dot ? `<span class="hl-dot" style="--c:${d.dot}"></span>` : "") + esc(d.label)
    + (d.meta ? ` <small>${esc(d.meta)}</small>` : "") + (d.key ? ` <kbd>${esc(d.key)}</kbd>` : "");
  el.classList.remove("is-on", "from-left");
  el.style.left = "-999px"; el.style.top = "0px"; el.style.visibility = "hidden";
  const r = t.getBoundingClientRect(), w = el.offsetWidth, h = el.offsetHeight;
  const side = !!t.closest(".rail");
  let x, y;
  if (side) { x = r.right + 10; y = r.top + (r.height - h) / 2; }
  else { x = r.left + r.width / 2 - w / 2; y = r.bottom + 8; }
  x = Math.max(8, Math.min(x, innerWidth - w - 8));
  el.style.left = x + "px"; el.style.top = y + "px"; el.style.visibility = "";
  void el.offsetWidth;
  el.classList.add("is-on"); if (side) el.classList.add("from-left");
}
function hideLabel() {
  clearTimeout(hover.timer);
  if (hover.el.classList.contains("is-on")) hover.warmUntil = Date.now() + 300;
  hover.el.classList.remove("is-on", "from-left");
  hover.target = null;
}
function queueLabel(t) {
  if (hover.target === t) return;
  clearTimeout(hover.timer);
  hover.target = t;
  const warm = hover.el.classList.contains("is-on") || Date.now() < hover.warmUntil;
  hover.el.classList.remove("is-on");
  hover.timer = setTimeout(() => showLabel(t), warm ? 0 : 350);
}
if (matchMedia("(hover: hover)").matches) {
  document.addEventListener("pointerover", (e) => { const t = e.target.closest("[data-label]"); if (t) queueLabel(t); });
  document.addEventListener("pointerout", (e) => { const t = e.target.closest("[data-label]"); if (t && !t.contains(e.relatedTarget)) hideLabel(); });
}
document.addEventListener("focusin", (e) => { const t = e.target.closest?.("[data-label]"); if (t && t.matches(":focus-visible")) { hover.target = t; showLabel(t); } });
document.addEventListener("focusout", (e) => { if (e.target.closest?.("[data-label]")) hideLabel(); });
document.addEventListener("pointerdown", hideLabel, true);

/* ---------------- saving, account area ---------------- */
// ☆ needs Supporter or Founder (NOW · 07). Signed-out / free → the plans.
function saveSite(s, { quiet = false } = {}) {
  if (!canSave()) return openPaywall({ site: s });
  const target = toggleSaved(s);
  if (!quiet) target ? afterSaveToast(s, target) : toast("Removed from Saved.");
}
function accountRow() {
  const s = getSession();
  if (!s) return `<button class="m-link m-account" data-act="account"><span class="avatar">${ICON.user}</span><span class="m-txt">Sign in<small>Free account · email code, no password</small></span>${ICON.chev}</button>`;
  const badge = s.plan === "founder" ? `<small class="gold">★ Founder${s.founderNo ? ` #${String(s.founderNo).padStart(4, "0")}` : ""} · Account</small>`
    : s.plan === "supporter" ? '<small class="gold">♥ Supporter · Account</small>' : "<small>Free · Account</small>";
  return `<button class="m-link m-account" data-act="account"><span class="avatar avatar--txt">${esc(s.name[0].toUpperCase())}</span><span class="m-txt">${esc(s.name)}${badge}</span>${ICON.chev}</button>`;
}
function showAccount() {
  closePanel();
  stopLoading();
  $("home").classList.add("is-hidden");
  $("reader").classList.add("is-hidden");
  $("account").classList.remove("is-hidden");
  document.body.classList.add("is-account");
  $("account").scrollTop = 0;
  if (!calm()) {
    $("account").animate([{ opacity: 0 }, { opacity: 1 }], { duration: 240, easing: "ease-out" });
    $("account").querySelector(".acc-body")?.animate([{ transform: "translateY(14px)", opacity: 0 }, { transform: "none", opacity: 1 }], { duration: 360, easing: EASE });
  }
}
function hideAccount({ restore = true } = {}) {
  if ($("account").classList.contains("is-hidden")) return;
  if (restore && !calm()) {
    // fade the account away over whatever it was covering
    const ghost = $("account").cloneNode(true); ghost.removeAttribute("id"); ghost.inert = true;
    $("account").after(ghost);
    ghost.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 200, easing: "ease-in" }).onfinish = () => ghost.remove();
  }
  closeAccount();
  document.body.classList.remove("is-account");
  if (!restore) return;
  if (state.current) $("reader").classList.remove("is-hidden"); else $("home").classList.remove("is-hidden");
}
function showSavedTab() {
  hideAccount();
  setCollapsed(false);
  if (state.searching) setSearching(false);
  state.tab = "saved"; renderAll();
  document.body.classList.remove("is-reading");
}

/* ---------------- perspective rating (NOW · 02) + How we rate ---------------- */
const RATING = {
  left: "Leans left: workers, public services, social justice.",
  centre: "Broadly balanced, or mixes left and right views.",
  right: "Leans right: markets, tradition, smaller state.",
  hidden: "Focuses on hidden agendas, cover-ups and power behind the scenes.",
};
const ratingPop = $("ratingPop");
let ratingTimer = 0;
function showRating(tag) {
  const id = tag.dataset.rating, o = SUB_FILTERS.geo.options.find((x) => x.id === id); if (!o) return;
  ratingPop.innerHTML = `<b>Saorsa rating: ${esc(o.label)}</b><span>${id === "hidden" ? RATING.hidden : `Where this independent site sits, left to right. ${RATING[id]}`}</span><button class="m-textlink" id="howRateLink">How we rate →</button>`;
  ratingPop.classList.remove("is-hidden");
  const r = tag.getBoundingClientRect();
  ratingPop.style.left = Math.max(8, Math.min(r.left, innerWidth - ratingPop.offsetWidth - 8)) + "px";
  ratingPop.style.top = r.bottom + 8 + "px";
  if (!calm()) ratingPop.animate([{ opacity: 0, transform: "translateY(6px)" }, { opacity: 1, transform: "none" }], { duration: 160, easing: "ease-out" });
  $("howRateLink").onclick = () => { hideRating(); openHowWeRate(null); };
}
function hideRating() { clearTimeout(ratingTimer); ratingPop.classList.add("is-hidden"); }
$("rTags").addEventListener("pointerover", (e) => { const t = e.target.closest("[data-rating]"); if (!t) return; clearTimeout(ratingTimer); ratingTimer = setTimeout(() => showRating(t), 300); });
$("rTags").addEventListener("pointerout", (e) => { if (e.target.closest("[data-rating]")) { clearTimeout(ratingTimer); ratingTimer = setTimeout(() => { if (!ratingPop.matches(":hover")) hideRating(); }, 200); } });
$("rTags").addEventListener("click", (e) => { const t = e.target.closest("[data-rating]"); if (t) ratingPop.classList.contains("is-hidden") ? showRating(t) : hideRating(); });
ratingPop.addEventListener("pointerleave", () => { ratingTimer = setTimeout(hideRating, 200); });
ratingPop.addEventListener("pointerenter", () => clearTimeout(ratingTimer));

function openHowWeRate(back = null) {
  const per = SUB_FILTERS.geo.options.map((o) => `<li><b>${o.label}</b> ${RATING[o.id]}</li>`).join("");
  openPanel(`${panelHead("How we rate", { back: !!back })}
  <div class="panel__body prose">
    <p>Every site on Saorsa is independent, and every Geo site gets a <b>perspective</b> so you can read across the spectrum on purpose.</p>
    <hr class="divider-h">
    <span class="m-label">The four perspectives</span>
    <ul class="rate-list">${per}</ul>
    <hr class="divider-h">
    <span class="m-label">How we decide</span>
    <ul class="rate-list">
      <li>What the site says about itself, and who runs and funds it.</li>
      <li>At least one outside view, such as Media Bias/Fact Check, AllSides or Wikipedia — a guide, not the verdict.</li>
      <li>An editor reading a spread of recent articles before it goes live.</li>
    </ul>
    <hr class="divider-h">
    <span class="m-label">What counts as independent</span>
    <p>Not owned by a big media group, a listed media company or a government. Reader-funded sites, nonprofits, small publishers and individual writers all count — as long as they publish their own work and are still active.</p>
    <hr class="divider-h">
    <span class="m-label">A guide, not a judgement</span>
    <p>A rating says where a site sits, not whether it is right. Topics on other categories (Health, Money and so on) work the same way.</p>
    <button class="btn btn--ghost" id="rateReport">Think we got one wrong? Report it</button>
  </div>`, back);
  $("rateReport").addEventListener("click", () => openReport(state.current, "category", () => openHowWeRate(back)));
}

/* ---------------- roll-up filters (P7-17 / 18) ---------------- */
function setRolled(on, { animate = true } = {}) {
  document.body.classList.toggle("filters-rolled", on);
  store.set("rolled", on);
  if (!animate) document.body.classList.add("no-anim"), requestAnimationFrame(() => document.body.classList.remove("no-anim"));
  updateCounts();
}
$("hideFilters").addEventListener("click", () => setRolled(true));
$("crumb").addEventListener("click", () => setRolled(false));
$("shuffleBtn2").addEventListener("click", shuffle);

/* ---------------- mobile (NOW · 10 / 11 / 12) ---------------- */
const isMobile = () => matchMedia("(max-width: 760px)").matches;
$("mSearchBtn").addEventListener("click", () => setSearching(true));
$("fabShuffle").addEventListener("click", shuffle);
function openSheet() {
  const f = SUB_FILTERS[state.category];
  $("sheetTitle").textContent = `Filter ${catOf(state.category).label}`;
  $("sheetSub").innerHTML = `<button class="pill ${state.sub.length ? "" : "is-on"}" data-sub="">All</button>` + f.options.map((o) => `<button class="pill ${state.sub.includes(o.id) ? "is-on" : ""}" data-sub="${o.id}">${o.label}</button>`).join("");
  $("sheetCountry").value = state.country; $("sheetSort").value = state.sort;
  sheetCount();
  $("sheetRoot").classList.remove("is-hidden");
  if (!calm()) { $("sheetRoot").querySelector(".sheet").animate([{ transform: "translateY(100%)" }, { transform: "none" }], { duration: 300, easing: "cubic-bezier(.22,.8,.24,1)" }); $("sheetRoot").animate([{ backgroundColor: "rgba(0,0,0,0)" }, { backgroundColor: "rgba(0,0,0,.55)" }], { duration: 300 }); }
}
function sheetCount() { $("sheetGo").textContent = `Show ${visible().length} sources`; }
function closeSheet() {
  const root = $("sheetRoot"); if (root.classList.contains("is-hidden")) return;
  if (calm()) return root.classList.add("is-hidden");
  root.querySelector(".sheet").animate([{ transform: "none" }, { transform: "translateY(100%)" }], { duration: 220, easing: "ease-in" }).onfinish = () => root.classList.add("is-hidden");
}
$("mFilterBtn").addEventListener("click", openSheet);
$("sheetRoot").addEventListener("click", (e) => { if (e.target === $("sheetRoot")) closeSheet(); });
$("sheetSub").addEventListener("click", (e) => {
  const b = e.target.closest("[data-sub]"); if (!b) return;
  const id = b.dataset.sub, f = SUB_FILTERS[state.category];
  if (!id) state.sub = []; else if (f.multi) state.sub = state.sub.includes(id) ? state.sub.filter((x) => x !== id) : [...state.sub, id]; else state.sub = state.sub[0] === id ? [] : [id];
  $("sheetSub").querySelectorAll(".pill").forEach((p) => p.classList.toggle("is-on", p.dataset.sub ? state.sub.includes(p.dataset.sub) : !state.sub.length));
  renderSub(); renderList(); sheetCount();
});
$("sheetCountry").addEventListener("change", (e) => { state.country = e.target.value; $("countrySel").value = state.country; renderList(); sheetCount(); });
$("sheetSort").addEventListener("change", (e) => { state.sort = e.target.value; $("sortSel").value = state.sort; renderList(); });
$("sheetReset").addEventListener("click", () => { state.sub = []; state.country = ""; state.sort = "az"; $("countrySel").value = ""; $("sortSel").value = "az"; renderSub(); renderList(); openSheet(); });
$("sheetGo").addEventListener("click", closeSheet);

document.querySelector(".mbar").addEventListener("click", (e) => {
  const m = e.target.closest("[data-m]")?.dataset.m; if (!m) return;
  if (m === "prev") step(-1);
  if (m === "next") step(1);
  if (m === "shuffle") shuffle();
  if (m === "sources") goHome();
  if (m === "saved") { goHome(); state.tab = "saved"; renderAll(); }
});
// Swipe left / right on the reader header for next / previous.
(() => {
  const bar = document.querySelector(".toolbar"); let x0 = null, y0 = 0;
  bar.addEventListener("touchstart", (e) => { x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; }, { passive: true });
  bar.addEventListener("touchend", (e) => {
    if (x0 === null) return; const dx = e.changedTouches[0].clientX - x0, dy = e.changedTouches[0].clientY - y0; x0 = null;
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) step(dx < 0 ? 1 : -1);
  }, { passive: true });
})();
function maybeSwipeHint() {
  if (!isMobile() || store.get("swipeHinted", false)) return;
  store.set("swipeHinted", true);
  const h = $("swipeHint"); h.classList.remove("is-hidden");
  setTimeout(() => h.classList.add("is-hidden"), 3500);
}

/* ---------------- splash ---------------- */
function splash() {
  const el = $("splash");
  if (!prefs.splash || sessionStorage.getItem("saorsa.splash") || matchMedia("(prefers-reduced-motion: reduce)").matches || location.hash) { el.remove(); return; }
  sessionStorage.setItem("saorsa.splash", "1");
  const hide = () => { el.classList.add("is-gone"); setTimeout(() => el.remove(), 700); };
  setTimeout(hide, 1200);
  window.addEventListener("keydown", hide, { once: true });
  el.addEventListener("click", hide, { once: true });
}

/* ---------------- start ---------------- */
initAccount({
  store, toast, findById: (id) => findById(id),
  refresh: () => { renderTabs(); renderList(); renderRail(); if (state.current) $("saveBtn").classList.toggle("is-on", state.saved.includes(state.current.id)); },
  saveSite, showAccount, hideAccount, showSavedTab, openMenu, openContact: (b) => openContact(b), openSuggest: (b) => openSuggest(b),
});
const bgApi = initBackground(settings);
const tweak = initTweakPanel(settings, bgApi, refreshSources);
$("t_plan").value = previewPlan();
$("t_plan").addEventListener("change", (e) => { setPreviewPlan(e.target.value); toast(`Preview account: ${e.target.selectedOptions[0].textContent}${getSession() ? "" : " (sign in to use it)"}.`); });
splash();
if (store.get("collapsed", false)) setCollapsed(true);
if (store.get("rolled", false)) setRolled(true, { animate: false });
await refreshSources();
routeFromHash(false);
// "Remember last source": reopen it when Saorsa starts on the home page.
if (!state.current && prefs.remember && prefs.openIn === "saorsa") { const last = findById(store.get("last", null)); if (last) openSource(last); }
