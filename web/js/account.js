// Sign-in (P7-L1–L3), Founder paywall (NOW · 07), account area (P7-05)
// and saved lists (NOW · 08). app.js passes in the helpers it owns (ctx).
import { SUPPORT_LINKS } from "./config.js";
import { PREVIEW, getSession, plan, canSave, canMakeLists, requestCode, verifyCode, signOut } from "./auth.js";

let ctx;
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const calm = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
const I = {
  x: '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg>',
  back: '<svg viewBox="0 0 24 24"><path d="M19 12H5M11 6l-6 6 6 6"/></svg>',
  arrow: '<svg viewBox="0 0 24 24"><path d="M5 12h14M13 6l6 6-6 6"/></svg>',
  mail: '<svg viewBox="0 0 24 24"><rect x="3.5" y="5.5" width="17" height="13" rx="2"/><path d="m4 7 8 6 8-6"/></svg>',
  star: '<svg viewBox="0 0 24 24"><path d="m12 4 2.4 5 5.4.6-4 3.7 1.1 5.4L12 16l-4.9 2.7 1.1-5.4-4-3.7 5.4-.6z"/></svg>',
  check: '<svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
  shield: '<svg viewBox="0 0 24 24"><path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z"/></svg>',
  home: '<svg viewBox="0 0 24 24"><path d="M4 11l8-7 8 7v8a1 1 0 0 1-1 1h-5v-6h-4v6H5a1 1 0 0 1-1-1z"/></svg>',
  plus: '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>',
  card: '<svg viewBox="0 0 24 24"><rect x="3" y="6" width="18" height="12" rx="2"/><path d="M3 10h18"/></svg>',
  sliders: '<svg viewBox="0 0 24 24"><path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/></svg>',
  out: '<svg viewBox="0 0 24 24"><path d="M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4M10 16l-4-4 4-4M6 12h10"/></svg>',
  dots: '<svg viewBox="0 0 24 24"><circle cx="5" cy="12" r="1.2"/><circle cx="12" cy="12" r="1.2"/><circle cx="19" cy="12" r="1.2"/></svg>',
};
const initial = (s) => esc((s?.name || s?.email || "?")[0].toUpperCase());
const founderBadge = (s) => s?.plan === "founder" ? `<span class="badge-founder">${I.star} FOUNDER${s.founderNo ? ` #${String(s.founderNo).padStart(4, "0")}` : ""}</span>`
  : s?.plan === "supporter" ? '<span class="badge-founder badge-founder--sup">♥ SUPPORTER</span>' : "";

export function initAccount(c) {
  ctx = c;
  migrateSaved();
  window.addEventListener("saorsa:session", () => { ctx.refresh(); if (!$("account").classList.contains("is-hidden")) renderAccount(); });
}

/* ================= modal shell ================= */
let onModalClose = null;
let closing = false;
function openModal(html, { wide = false, onClose = null } = {}) {
  const root = $("modalRoot");
  closing = false;
  onModalClose = onClose;
  root.innerHTML = `<div class="modal-scrim" data-mclose></div><div class="modal ${wide ? "modal--wide" : ""}" role="dialog" aria-modal="true">${html}</div>`;
  root.classList.remove("is-hidden");
  root.querySelectorAll("[data-mclose]").forEach((b) => b.addEventListener("click", closeModal));
  if (!calm()) {
    root.querySelector(".modal-scrim").animate([{ opacity: 0 }, { opacity: 1 }], { duration: 200 });
    root.querySelector(".modal").animate([{ opacity: 0, transform: "translateY(12px) scale(.98)" }, { opacity: 1, transform: "none" }], { duration: 260, easing: "cubic-bezier(.22,.8,.24,1)" });
  }
  setTimeout(() => (root.querySelector(".modal input") || root.querySelector(".modal .m-btn") || root.querySelector(".modal button"))?.focus(), 30);
  return root.querySelector(".modal");
}
function swapModal(html) {
  const m = $("modalRoot").querySelector(".modal");
  if (!m || closing) return openModal(html);
  m.innerHTML = html;
  m.querySelectorAll("[data-mclose]").forEach((b) => b.addEventListener("click", closeModal));
  if (!calm()) [...m.children].forEach((el) => el.animate([{ opacity: 0, transform: "translateX(16px)" }, { opacity: 1, transform: "none" }], { duration: 220, easing: "cubic-bezier(.22,.8,.24,1)" }));
  setTimeout(() => (m.querySelector("input") || m.querySelector(".m-btn") || m.querySelector("button"))?.focus(), 30);
  return m;
}
export function closeModal() {
  const root = $("modalRoot");
  if (root.classList.contains("is-hidden") || closing) return;
  closing = true;
  const done = () => { if (!closing) return; closing = false; root.classList.add("is-hidden"); root.innerHTML = ""; const f = onModalClose; onModalClose = null; f?.(); };
  if (calm()) return done();
  root.querySelector(".modal").animate([{ opacity: 1 }, { opacity: 0, transform: "translateY(8px)" }], { duration: 160 });
  root.querySelector(".modal-scrim").animate([{ opacity: 1 }, { opacity: 0 }], { duration: 160 }).onfinish = done;
}
export const modalOpen = () => !$("modalRoot").classList.contains("is-hidden") && !closing;
document.addEventListener("keydown", (e) => {
  if (!modalOpen()) return;
  if (e.key === "Escape") { e.stopImmediatePropagation(); e.preventDefault(); closeModal(); }
  else if (!/INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName)) e.stopImmediatePropagation(); // no shortcuts behind a modal
}, true);

/* ================= sign in (P7-L1 / L2 / L3) ================= */
const stepTag = (n, back) => `<div class="m-step"><span class="m-step__pill">Step ${n} of 3</span><span class="grow"></span>
  <button class="icon-btn" ${back ? "data-mback" : "data-mclose"} aria-label="${back ? "Back" : "Close"}">${back ? I.back : I.x}</button></div>`;

/** opts.site: the site they were saving (shows "Sign in to save …"). opts.after: run once signed in. */
export function openSignIn(opts = {}) {
  const ctxLine = opts.site ? `<div class="m-context">${I.star}<span>Sign in to save ${esc(opts.site.domain)}</span></div>` : "";
  const html = `${stepTag(1)}${ctxLine}
    <h2 class="m-title">Sign in or create an account</h2>
    <form id="siForm" class="m-form">
      <label class="m-field"><span>Email</span>
        <span class="m-input">${I.mail}<input id="siEmail" type="email" placeholder="alex@example.com" autocomplete="email" required value="${esc(getSession()?.email || "")}"></span></label>
      <button class="btn btn--accent m-btn" type="submit" id="siSend">Email me a code ${I.arrow}</button>
    </form>
    <div class="m-or"><span></span>or<span></span></div>
    <button class="btn btn--ghost m-btn" id="siGoogle">Continue with Google</button>
    <p class="m-note">New here? The same email creates your free account — no passwords to remember.</p>`;
  modalOpen() ? swapModal(html) : openModal(html);
  $("siForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = $("siEmail").value.trim();
    if (!$("siEmail").checkValidity()) return ctx.toast("Check the email address.");
    $("siSend").disabled = true;
    try { const req = await requestCode(email); codeStep(req, opts); }
    catch (err) { console.error(err); ctx.toast("Couldn’t send a code just now. Please try again."); $("siSend").disabled = false; }
  });
  $("siGoogle").addEventListener("click", () => ctx.toast("Google sign-in arrives with the Saorsa server — use your email for now."));
}

function codeStep(req, opts) {
  swapModal(`${stepTag(2, true)}
    <h2 class="m-title">Check your email</h2>
    <p class="m-sub">Enter the 6-digit code we sent to <b>${esc(req.email)}</b></p>
    ${PREVIEW ? '<p class="m-preview">Preview mode: no email is sent — any 6 digits will work.</p>' : ""}
    <div class="m-code" id="siCode">${Array.from({ length: 6 }, (_, i) => `<input inputmode="numeric" autocomplete="${i ? "off" : "one-time-code"}" maxlength="1" aria-label="Digit ${i + 1}">`).join("")}</div>
    <div class="m-resend"><span id="siTimer"></span><span class="grow"></span><button class="m-textlink" data-mback>Use a different email</button></div>
    <button class="btn btn--accent m-btn" id="siVerify">Verify</button>
    <p class="m-note">Codes expire after 10 minutes. It signs you in automatically when the 6th digit is entered.</p>`);
  const m = $("modalRoot").querySelector(".modal");
  m.querySelectorAll("[data-mback]").forEach((b) => b.addEventListener("click", () => { clearInterval(timer); openSignIn(opts); }));
  const boxes = [...m.querySelectorAll("#siCode input")];
  const code = () => boxes.map((b) => b.value).join("");
  let busy = false;
  const go = async () => {
    if (busy) return; busy = true;
    try { const s = await verifyCode(req, code()); clearInterval(timer); welcomeStep(s, opts); }
    catch (err) { busy = false; ctx.toast(err.status ? "That code didn’t work. Check it or send a new one." : err.message); boxes.forEach((b) => (b.value = "")); boxes[0].focus(); }
  };
  boxes.forEach((b, i) => {
    b.addEventListener("input", () => {
      b.value = b.value.replace(/\D/g, "").slice(-1);
      if (b.value && i < 5) boxes[i + 1].focus();
      if (code().length === 6) go();
    });
    b.addEventListener("keydown", (e) => { if (e.key === "Backspace" && !b.value && i) { boxes[i - 1].focus(); boxes[i - 1].value = ""; } });
    b.addEventListener("paste", (e) => {
      const d = (e.clipboardData.getData("text") || "").replace(/\D/g, "").slice(0, 6); if (!d) return;
      e.preventDefault(); d.split("").forEach((c, j) => { if (boxes[j]) boxes[j].value = c; }); boxes[Math.min(d.length, 5)].focus();
      if (d.length === 6) go();
    });
  });
  $("siVerify").addEventListener("click", go);
  let left = 59;
  const tick = () => {
    const t = $("siTimer"); if (!t) return clearInterval(timer);
    t.innerHTML = left > 0 ? `Resend code in 0:${String(left).padStart(2, "0")}` : '<button class="m-textlink" id="siResend">Resend code</button>';
    if (left <= 0) { clearInterval(timer); $("siResend").addEventListener("click", async () => { await requestCode(req.email).catch(() => {}); ctx.toast("New code sent."); left = 59; timer = setInterval(() => { left--; tick(); }, 1000); tick(); }); }
  };
  let timer = setInterval(() => { left--; tick(); }, 1000); tick();
}

function welcomeStep(s, opts) {
  let line;
  if (opts.site && canSave()) { ctx.saveSite(opts.site, { quiet: true }); line = `${esc(opts.site.domain)} is saved. Your ${savedIds().length} saved source${savedIds().length === 1 ? " is" : "s are"} on this device${PREVIEW ? "" : " and synced"}.`; }
  else if (opts.site) line = "You’re signed in. Saving favourites comes with Supporter or Founder.";
  else line = canSave() ? `Your ${savedIds().length} saved source${savedIds().length === 1 ? " is" : "s are"} ready.` : "You’re signed in. Saorsa stays free to read, always.";
  swapModal(`${stepTag(3)}
    <div class="m-welcome">
      <span class="m-avatar">${initial(s)}</span>
      <h2 class="m-title">${s.isNew ? "Welcome to Saorsa" : "Welcome back"}, ${esc(s.name)}</h2>
      ${founderBadge(s)}
      <p class="m-sub">${line}</p>
    </div>
    <button class="btn btn--accent m-btn" data-mclose>${opts.site && !canSave() ? "See options" : "Continue reading"}</button>
    <button class="m-textlink m-center" id="siAccount">View account</button>`);
  $("siAccount").addEventListener("click", () => { closeModal(); openAccount(); });
  if (opts.site && !canSave()) $("modalRoot").querySelector(".m-btn").addEventListener("click", () => setTimeout(() => openPaywall({ site: opts.site }), 200));
  opts.after?.(s);
}

/* ================= Founder paywall (NOW · 07) ================= */
export function openPaywall({ site = null } = {}) {
  const p = plan();
  const benefit = (t) => `<li>${I.check}<span>${t}</span></li>`;
  openModal(`<button class="icon-btn m-x" data-mclose aria-label="Close">${I.x}</button>
    <span class="pw-icon">${I.star}</span>
    <h2 class="pw-title">Saving favourites is a Founder feature</h2>
    <p class="pw-sub">Saorsa stays free to read, always. Founders pay for the servers and new sources, and get a few extras in return.</p>
    <div class="plans">
      <div class="plan"><h3>Free</h3><p class="plan__price">£0</p><ul>${benefit("Every source & category")}${benefit("Search & Shuffle")}${benefit("Recent history on this device")}</ul>
        <button class="btn btn--ghost plan__btn" disabled>${p === "free" || p === "anon" ? "Current plan" : "Included"}</button></div>
      <div class="plan"><h3>Supporter</h3><p class="plan__price">£3 <small>/ month</small></p><ul>${benefit("Everything in Free")}${benefit("Saved favourites, synced across devices")}${benefit("Supporter badge")}</ul>
        <button class="btn plan__btn plan__btn--grey" data-link="monthly" ${p === "supporter" ? "disabled" : ""}>${p === "supporter" ? "Current plan" : "Support monthly"}</button></div>
      <div class="plan plan--gold"><h3>Founder <em>BEST VALUE</em></h3><p class="plan__price">£29 <small>one-off</small></p><ul>${benefit("Everything, for life")}${benefit("Saved favourites + your own lists")}${benefit("Founder badge & name on the About page")}</ul>
        <button class="btn plan__btn plan__btn--gold" data-link="founder" ${p === "founder" ? "disabled" : ""}>${p === "founder" ? "You’re a Founder" : "Become a Founder"}</button>
        <small class="plan__note">Limited to the first 1,000 Founders</small></div>
    </div>
    <div class="pw-pay">${I.shield}<span>Secure checkout ·</span><b>Card</b><b>Apple Pay</b><b>Google Pay</b><b>PayPal</b></div>
    <div class="pw-foot">${p === "anon" ? '<span>Already a Founder?</span><button class="m-textlink" id="pwSignIn">Sign in with email</button>' : ""}<span class="grow"></span><button class="m-textlink m-textlink--grey" data-mclose>Maybe later</button></div>`, { wide: true });
  const m = $("modalRoot").querySelector(".modal");
  m.addEventListener("click", (e) => {
    const b = e.target.closest("[data-link]"); if (!b) return;
    const url = SUPPORT_LINKS[b.dataset.link];
    if (!url) return ctx.toast("Payments aren’t set up yet — coming soon.");
    window.open(url, "_blank", "noopener");
  });
  $("pwSignIn")?.addEventListener("click", () => { closeModal(); setTimeout(() => openSignIn({ site }), 180); });
}

/* ================= saved lists (NOW · 08) ================= */
// store "lists": [{ id, name, items: [sourceId] }]. Everyone who can save has
// one list ("Saved"); Founders can add their own (Morning read, Deep dives…).
export function lists() {
  let l = ctx.store.get("lists", null);
  if (!Array.isArray(l) || !l.length) l = [{ id: "saved", name: "Saved", items: [] }];
  return l;
}
const saveLists = (l) => { ctx.store.set("lists", l); ctx.refresh(); };
export const savedIds = () => [...new Set(lists().flatMap((l) => l.items))];
function migrateSaved() {
  const old = ctx.store.get("saved", null);
  if (Array.isArray(old) && old.length && !ctx.store.get("lists", null)) ctx.store.set("lists", [{ id: "saved", name: "Saved", items: old }]);
}
export function toggleSaved(s) {
  const l = lists();
  if (savedIds().includes(s.id)) { l.forEach((x) => (x.items = x.items.filter((id) => id !== s.id))); saveLists(l); return false; }
  const target = l.find((x) => x.id === ctx.store.get("lastList", l[0].id)) || l[0];
  target.items.unshift(s.id); saveLists(l);
  return target;
}
export function moveToList(sourceId, listId) {
  const l = lists(); l.forEach((x) => (x.items = x.items.filter((id) => id !== sourceId)));
  const t = l.find((x) => x.id === listId); t.items.unshift(sourceId); ctx.store.set("lastList", listId); saveLists(l);
}
export function newList(name) {
  const l = lists(); const id = "l" + Date.now().toString(36);
  l.push({ id, name: name.trim().slice(0, 40) || "New list", items: [] }); saveLists(l); return id;
}
export function renameList(id, name) { const l = lists(); const x = l.find((y) => y.id === id); if (x && name.trim()) { x.name = name.trim().slice(0, 40); saveLists(l); } }
export function deleteList(id) {
  let l = lists(); if (l.length < 2) return;
  const gone = l.find((x) => x.id === id); l = l.filter((x) => x.id !== id);
  l[0].items = [...new Set([...l[0].items, ...gone.items])]; saveLists(l);
}

/** The Saved tab's contents (left column). */
export function savedListHTML(rowHTML) {
  if (!canSave()) {
    return `<li class="gate">
      <span class="gate__icon">${I.star}</span>
      <strong>Keep your favourite sites here</strong>
      <p>Saved favourites come with Supporter and Founder. Saorsa itself stays free to read.</p>
      <button class="btn btn--accent" data-gate="plans">See options</button>
      ${plan() === "anon" ? '<button class="m-textlink" data-gate="signin">Already a member? Sign in</button>' : ""}
    </li>`;
  }
  const l = lists();
  const founder = canMakeLists();
  const body = l.map((x) => {
    const rows = x.items.map(ctx.findById).filter(Boolean);
    return `<li class="list-head" data-list="${x.id}"><span>${esc(x.name)} · ${rows.length}</span>${founder ? `<button class="icon-btn" data-listmenu="${x.id}" aria-label="List options">${I.dots}</button>` : ""}</li>`
      + (rows.length ? rows.map((s) => rowHTML(s, { star: true, list: x.id })).join("") : '<li class="list__empty list__empty--sm">Nothing here yet.</li>');
  }).join("");
  return body + (founder ? `<li><button class="new-list" data-newlist>${I.plus} New list</button></li>` : "")
    + `<li class="synced">${I.star}<span>${PREVIEW ? "Saved on this device · syncs once accounts are live" : "Synced across your devices"}</span></li>`;
}

/** Handles clicks inside the Saved tab. Returns true if it dealt with it. */
export function handleSavedClick(e) {
  const g = e.target.closest("[data-gate]");
  if (g) { g.dataset.gate === "plans" ? openPaywall() : openSignIn(); return true; }
  const star = e.target.closest("[data-unsave]");
  if (star) { const s = ctx.findById(star.dataset.unsave); if (s) { toggleSaved(s); ctx.toast(`Removed ${s.domain} from Saved.`); } return true; }
  if (e.target.closest("[data-newlist]")) {
    const name = prompt("Name the new list", "Morning read");
    if (name !== null) { newList(name); ctx.toast(`List “${name.trim() || "New list"}” added.`); }
    return true;
  }
  const lm = e.target.closest("[data-listmenu]");
  if (lm) { listMenu(lm); return true; }
  return false;
}

function listMenu(btn) {
  const id = btn.dataset.listmenu;
  const x = lists().find((y) => y.id === id); if (!x) return;
  document.querySelector(".pop-menu")?.remove();
  const menu = document.createElement("div");
  menu.className = "pop-menu";
  menu.innerHTML = `<button data-a="rename">Rename</button>${lists().length > 1 ? '<button data-a="delete" class="danger">Delete list</button>' : ""}<button data-a="default">Save new sites here</button>`;
  document.body.appendChild(menu);
  const r = btn.getBoundingClientRect();
  menu.style.left = Math.min(r.right - menu.offsetWidth, innerWidth - menu.offsetWidth - 8) + "px";
  menu.style.top = r.bottom + 4 + "px";
  const close = () => { menu.remove(); document.removeEventListener("pointerdown", outside, true); };
  const outside = (e) => { if (!menu.contains(e.target)) close(); };
  setTimeout(() => document.addEventListener("pointerdown", outside, true));
  menu.addEventListener("click", (e) => {
    const a = e.target.closest("[data-a]")?.dataset.a; if (!a) return; close();
    if (a === "rename") { const n = prompt("Rename list", x.name); if (n) renameList(id, n); }
    if (a === "delete" && confirm(`Delete “${x.name}”? Its sites move to “${lists().find((y) => y.id !== id).name}”.`)) deleteList(id);
    if (a === "default") { ctx.store.set("lastList", id); ctx.toast(`New saves go to “${x.name}”.`); }
  });
}

/** After saving: offer to move it to another list (Founders with 2+ lists). */
export function afterSaveToast(s, target) {
  const l = lists();
  if (l.length > 1) ctx.toast(target.name === "Saved" ? "Saved." : `Saved to ${target.name}.`, { label: "Change list", fn: () => pickList(s) });
  else ctx.toast("Saved.");
}
function pickList(s) {
  openModal(`<button class="icon-btn m-x" data-mclose aria-label="Close">${I.x}</button>
    <h2 class="m-title">Save ${esc(s.domain)} to…</h2>
    <div class="pick-lists">${lists().map((x) => `<button class="m-link" data-to="${x.id}">${esc(x.name)}<small>${x.items.length}</small></button>`).join("")}</div>`);
  $("modalRoot").querySelector(".pick-lists").addEventListener("click", (e) => {
    const b = e.target.closest("[data-to]"); if (!b) return;
    moveToList(s.id, b.dataset.to); closeModal(); ctx.toast(`Moved to ${lists().find((x) => x.id === b.dataset.to).name}.`);
  });
}

/* ================= account area (P7-05) ================= */
export function openAccount() {
  if (!getSession()) return openSignIn();
  ctx.showAccount();
  renderAccount();
}
export function closeAccount() { $("account").classList.add("is-hidden"); }

function renderAccount() {
  const s = getSession(); if (!s) { ctx.hideAccount(); return; }
  const l = lists(); const ids = savedIds();
  const sugg = ctx.store.getRaw("suggestions");
  const fmt = (d) => d ? new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "";
  const memb = {
    founder: { t: "Founder · lifetime", sub: `Joined ${fmt(s.joined)}`, b: ["Saved favourites + your own lists", "Unlimited suggestions, reviewed first", "Name on the About page (optional)"] },
    supporter: { t: "Supporter · £3 a month", sub: `Since ${fmt(s.joined)} · cancel anytime`, b: ["Saved favourites, synced across devices", "Supporter badge"] },
    free: { t: "Free", sub: "Saorsa stays free to read, always", b: ["Every source & category", "Search & Shuffle", "Recent history on this device"] },
  }[s.plan] || { t: "Free", sub: "", b: [] };
  const savedRows = l.flatMap((x) => x.items.map((id) => [ctx.findById(id), x.name])).filter(([src]) => src).slice(0, 4);
  $("account").innerHTML = `
    <nav class="acc-nav">
      <span class="m-label">Account</span>
      <button class="is-on" data-acc="overview">${I.home}Overview</button>
      <button data-acc="saved">${I.star}Saved</button>
      <button data-acc="suggestions">${I.plus}Suggestions${sugg.length ? `<span class="count">${sugg.length}</span>` : ""}</button>
      <button data-acc="membership">${I.card}Membership</button>
      <button data-acc="preferences">${I.sliders}Preferences</button>
      <button data-acc="contact">${I.mail}Contact</button>
      <span class="grow"></span>
      <button data-acc="signout">${I.out}Sign out</button>
    </nav>
    <div class="acc-body">
      <button class="icon-btn acc-close" data-acc="close" aria-label="Close account">${I.x}</button>
      <header class="acc-head">
        <span class="m-avatar m-avatar--lg">${initial(s)}</span>
        <div><h1>${esc(s.name)}</h1><small>${esc(s.email)} · signed in with email code${s.preview ? " (preview)" : ""}</small></div>
        <span class="grow"></span>${founderBadge(s)}
      </header>
      <div class="acc-cards">
        <section class="acc-card" id="accMembership">
          <div class="acc-card__head"><h2>Membership</h2>${s.plan === "free" ? '<button class="m-textlink" data-acc="upgrade">See options</button>' : '<button class="m-textlink" data-acc="receipts">Receipts</button>'}</div>
          <p class="acc-big">${memb.t}</p><small class="acc-muted">${memb.sub}</small>
          <ul class="acc-ticks">${memb.b.map((b) => `<li>${I.check}${b}</li>`).join("")}</ul>
        </section>
        <section class="acc-card" id="accSaved">
          <div class="acc-card__head"><h2>Saved · ${ids.length} source${ids.length === 1 ? "" : "s"}${canMakeLists() ? `, ${l.length} list${l.length === 1 ? "" : "s"}` : ""}</h2><button class="m-textlink" data-acc="saved">View all</button></div>
          ${!canSave() ? '<p class="acc-muted">Saved favourites come with Supporter and Founder.</p>'
            : savedRows.length ? savedRows.map(([src, ln]) => `<div class="acc-row"><span class="ini">${esc(src.domain[0].toUpperCase())}</span><span class="grow">${esc(src.domain)}</span><small>${esc(ln)}</small></div>`).join("")
            : '<p class="acc-muted">Nothing saved yet. Tap ☆ on any site.</p>'}
          ${canMakeLists() ? `<button class="m-textlink acc-new" data-acc="newlist">${I.plus} New list</button>` : ""}
        </section>
        <section class="acc-card acc-card--wide" id="accSuggestions">
          <div class="acc-card__head"><h2>Your suggestions</h2><button class="m-textlink" data-acc="suggest">Suggest a source</button></div>
          ${sugg.length ? sugg.slice().reverse().slice(0, 5).map((x) => `<div class="acc-row acc-row--sugg"><div class="grow"><b>${esc(String(x.url || "").replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, ""))}</b><small>Sent ${fmt(x.created)}${s.plan === "founder" ? " · reviewed first (Founder)" : ""}</small></div><span class="status status--review">IN REVIEW</span></div>`).join("")
            : '<p class="acc-muted">You haven’t suggested a site yet. Know an independent site we’re missing?</p>'}
        </section>
      </div>
      <section class="acc-settings">
        <div><small>Email</small><span>${esc(s.email)} · <button class="m-textlink" data-acc="email">Change</button></span></div>
        <div><small>Sign-in</small><span>Email code</span></div>
        <div><small>Your data</small><span><button class="m-textlink" data-acc="download">Download a copy</button></span></div>
        <span class="grow"></span>
        <button class="m-textlink danger" data-acc="delete">Delete account</button>
      </section>
    </div>`;
  $("account").onclick = (e) => {
    const a = e.target.closest("[data-acc]")?.dataset.acc; if (!a) return;
    const jump = (id) => $(id)?.scrollIntoView({ behavior: calm() ? "auto" : "smooth", block: "start" });
    if (a === "overview") jump("account");
    if (a === "saved") ctx.showSavedTab();
    if (a === "suggestions") jump("accSuggestions");
    if (a === "membership") jump("accMembership");
    if (a === "preferences") ctx.openMenu();
    if (a === "contact") ctx.openContact(null);
    if (a === "suggest") ctx.openSuggest(null);
    if (a === "upgrade") openPaywall();
    if (a === "receipts") ctx.toast("Receipts arrive with payments.");
    if (a === "newlist") { const n = prompt("Name the new list", "Morning read"); if (n !== null) { newList(n); renderAccount(); } }
    if (a === "email") ctx.toast("Changing your email arrives with the Saorsa server.");
    if (a === "download") downloadData();
    if (a === "close") ctx.hideAccount();
    if (a === "signout") { signOut(); ctx.hideAccount(); ctx.toast("Signed out."); }
    if (a === "delete" && confirm("Delete your account? Your saved lists and settings on this device will be removed. This can’t be undone.")) {
      ["lists", "lastList", "saved", "suggestions", "reports", "contact_messages"].forEach((k) => localStorage.removeItem("saorsa." + k));
      signOut(); ctx.hideAccount(); ctx.toast("Account deleted.");
    }
    if (["overview", "suggestions", "membership"].includes(a)) $("account").querySelectorAll(".acc-nav button").forEach((b) => b.classList.toggle("is-on", b.dataset.acc === a));
  };
}

function downloadData() {
  const s = getSession();
  const data = { exported: new Date().toISOString(), account: { email: s?.email, name: s?.name, plan: s?.plan }, lists: lists(),
    recent: ctx.store.get("recent", []), preferences: ctx.store.get("prefs", {}), suggestions: ctx.store.getRaw("suggestions"), reports: ctx.store.getRaw("reports") };
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
  a.download = "saorsa-my-data.json"; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
