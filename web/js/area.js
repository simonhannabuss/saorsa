// The account area (Phase 8): one full-window page that opens over Saorsa,
// signed in or out. It holds the account pages and the four "help" pages
// that used to open in the left column: Suggest a source, Contact us,
// Report a problem and Settings, plus Membership & support.
//   openArea(page, opts)  page = overview | suggestions | membership | settings
//                                | suggest | contact | report
//   closeArea()
// app.js passes in what it owns through initArea(ctx).
import { CATEGORIES, SUB_FILTERS, SUPPORT_LINKS } from "./config.js";
import { getSession, plan, canSave, canMakeLists, signOut, deleteAccount, PREVIEW } from "./auth.js";
import { sendSuggestion, sendContact, sendReport } from "./data.js";

let ctx;
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const calm = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
const EASE = "cubic-bezier(.22,.8,.24,1)";
const catOf = (id) => CATEGORIES.find((c) => c.id === id);
const fmt = (d) => d ? new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "";
const host = (u) => String(u || "").replace(/^https?:\/\/(www\.)?/, "").replace(/\/.*$/, "");

const I = {
  back: '<svg viewBox="0 0 24 24"><path d="M19 12H5M11 6l-6 6 6 6"/></svg>',
  x: '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg>',
  home: '<svg viewBox="0 0 24 24"><path d="M4 11l8-7 8 7v8a1 1 0 0 1-1 1h-5v-6h-4v6H5a1 1 0 0 1-1-1z"/></svg>',
  star: '<svg viewBox="0 0 24 24"><path d="m12 4 2.4 5 5.4.6-4 3.7 1.1 5.4L12 16l-4.9 2.7 1.1-5.4-4-3.7 5.4-.6z"/></svg>',
  plus: '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>',
  card: '<svg viewBox="0 0 24 24"><rect x="3" y="6" width="18" height="12" rx="2"/><path d="M3 10h18"/></svg>',
  sliders: '<svg viewBox="0 0 24 24"><path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/></svg>',
  mail: '<svg viewBox="0 0 24 24"><rect x="3.5" y="5.5" width="17" height="13" rx="2"/><path d="m4 7 8 6 8-6"/></svg>',
  flag: '<svg viewBox="0 0 24 24"><path d="M5 21V4M5 5c3-2 6 2 9 0s4-1 5-.5v8.5c-1-.5-2-.5-5 .5s-6-2.5-9-.5"/></svg>',
  out: '<svg viewBox="0 0 24 24"><path d="M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4M10 16l-4-4 4-4M6 12h10"/></svg>',
  check: '<svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
  search: '<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="6.5"/><path d="M16 16l4 4"/></svg>',
};

export function initArea(c) {
  ctx = c;
  window.addEventListener("saorsa:session", () => { if (isOpen()) render(); });
}
export const isOpen = () => !$("account").classList.contains("is-hidden");

let current = { page: "overview", opts: {} };

/* ---------------- open / close ---------------- */
export function openArea(page = "overview", opts = {}) {
  if (page === "overview" && !getSession()) page = "membership";
  if (page === "suggestions" && !getSession()) page = "suggest";
  current = { page, opts };
  const el = $("account");
  const wasOpen = isOpen();
  ctx.beforeOpen?.();
  el.classList.remove("is-hidden");
  document.body.classList.add("is-account");
  render();
  if (!calm()) {
    if (!wasOpen) el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 260, easing: "ease-out" });
    el.querySelector(".area-main")?.animate([{ opacity: 0, transform: "translateY(12px)" }, { opacity: 1, transform: "none" }], { duration: 340, easing: EASE });
  }
}
export function closeArea() {
  const el = $("account");
  if (!isOpen()) return;
  const done = () => { el.classList.add("is-hidden"); el.innerHTML = ""; ctx.afterClose?.(); };
  document.body.classList.remove("is-account");
  if (calm()) return done();
  el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 200, easing: "ease-in" }).onfinish = done;
}

/* ---------------- frame: nav + page ---------------- */
function navHTML() {
  const s = getSession();
  const item = (page, label, icon, badge) => `<button class="${current.page === page ? "is-on" : ""}" data-go="${page}">${icon}<span>${label}</span>${badge ? `<b class="count">${badge}</b>` : ""}</button>`;
  const sugg = ctx.store.getRaw("suggestions").length;
  return `<nav class="area-nav" aria-label="Account">
    <button class="area-back" data-close>${I.back}<span>Back to Saorsa</span></button>
    ${s ? `<span class="m-label">Account</span>
      ${item("overview", "Overview", I.home)}
      ${item("saved", "Saved", I.star)}
      ${item("suggestions", "Your suggestions", I.plus, sugg || "")}
      ${item("membership", "Membership", I.card)}
      ${item("settings", "Settings", I.sliders)}
      <span class="m-label">Help & feedback</span>
      ${item("suggest", "Suggest a source", I.plus)}
      ${item("contact", "Contact us", I.mail)}
      ${item("report", "Report a problem", I.flag)}
      <span class="grow"></span>
      <button data-go="signout">${I.out}<span>Sign out</span></button>`
    : `<span class="m-label">Saorsa</span>
      ${item("membership", "Membership", I.card)}
      ${item("suggest", "Suggest a source", I.plus)}
      ${item("contact", "Contact us", I.mail)}
      ${item("report", "Report a problem", I.flag)}
      ${item("settings", "Settings", I.sliders)}
      <span class="grow"></span>
      <div class="area-signin"><p>Sign in to save sites, keep your settings on every device and track what you send us.</p><button class="btn btn--accent" data-go="signin">Sign in</button></div>`}
  </nav>`;
}
const head = (title, sub) => `<header class="area-head"><div><h1>${title}</h1>${sub ? `<p>${sub}</p>` : ""}</div>
  <button class="icon-btn area-x" data-close aria-label="Close">${I.x}</button></header>`;

function render() {
  const el = $("account");
  const page = PAGES[current.page] || PAGES.overview;
  el.innerHTML = `${navHTML()}<div class="area-scroll"><div class="area-main">${page.html(current.opts)}</div></div>`;
  el.onclick = onClick;
  page.wire?.(el.querySelector(".area-main"), current.opts);
  el.querySelector(".area-scroll").scrollTop = 0;
}

function onClick(e) {
  if (e.target.closest("[data-close]")) return closeArea();
  const go = e.target.closest("[data-go]")?.dataset.go; if (!go) return;
  if (go === "signin") return ctx.openSignIn();
  if (go === "saved") { closeArea(); return ctx.showSavedTab(); }
  if (go === "signout") { signOut(); ctx.toast("Signed out."); return openArea("membership"); }
  openArea(go);
}

/* ---------------- small builders ---------------- */
const pills = (name, items, { on = [], dots = false } = {}) => `<div class="chips-pick" data-pills="${name}">${items.map((o) =>
  `<button type="button" class="pill ${on.includes(o.id) ? "is-on" : ""}" data-v="${o.id}">${dots ? `<i style="--c:${o.color}"></i>` : ""}${esc(o.label)}</button>`).join("")}</div>`;
const sideCard = (title, body, extra = "") => `<section class="acc-card acc-card--side"><h2>${title}</h2>${body}${extra}</section>`;
const statusPill = (t, kind) => `<span class="status status--${kind}">${t}</span>`;
function sentState(main, title, text, again) {
  const col = main.querySelector(".area-col-main");
  col.innerHTML = `<section class="acc-card area-sent"><div class="tick">✓</div><h2>${title}</h2><p>${text}</p>
    <div class="row row--center"><button class="btn btn--ghost" data-again>${again}</button><button class="btn btn--accent" data-close>Back to Saorsa</button></div></section>`;
  if (!calm()) col.firstElementChild.animate([{ opacity: 0, transform: "scale(.98)" }, { opacity: 1, transform: "none" }], { duration: 260, easing: EASE });
  col.querySelector("[data-again]").onclick = () => openArea(current.page, {});
}
const COUNTRIES = [["", "Select a country"], ["UK", "UK"], ["US", "US"], ["CA", "Canada"], ["AU", "Australia"], ["NZ", "New Zealand"], ["IE", "Ireland"], ["other", "Somewhere else"]];

/* ================= pages ================= */
const PAGES = {};

/* ---- Overview (signed in) ---- */
PAGES.overview = {
  html() {
    const s = getSession(); if (!s) return "";
    const l = ctx.lists(); const ids = ctx.savedIds();
    const sugg = ctx.store.getRaw("suggestions");
    const memb = { founder: ["Founder · lifetime", `Joined ${fmt(s.joined)}`, ["Saved favourites + your own lists", "Unlimited suggestions, reviewed first", "Name on the About page (optional)"]],
      supporter: ["Supporter · £3 a month", `Since ${fmt(s.joined)} · cancel anytime`, ["Saved favourites, synced across devices", "Supporter badge"]],
      free: ["Free", "Saorsa stays free to read, always", ["Every source & category", "Search & Shuffle", "Recent history on this device"]] }[s.plan] || ["Free", "", []];
    const savedRows = l.flatMap((x) => x.items.map((id) => [ctx.findById(id), x.name])).filter(([src]) => src).slice(0, 4);
    return `<header class="area-head area-head--profile"><span class="m-avatar m-avatar--lg">${esc((s.name || s.email)[0].toUpperCase())}</span>
        <div><h1>${esc(s.name)}</h1><p>${esc(s.email)} · signed in with email code</p></div><span class="grow"></span>${badge(s)}
        <button class="icon-btn area-x" data-close aria-label="Close">${I.x}</button></header>
      <div class="acc-cards">
        <section class="acc-card"><div class="acc-card__head"><h2>Membership</h2><button class="m-textlink" data-go="membership">${s.plan === "free" ? "See options" : "Details"}</button></div>
          <p class="acc-big">${memb[0]}</p><small class="acc-muted">${memb[1]}</small><ul class="acc-ticks">${memb[2].map((b) => `<li>${I.check}${b}</li>`).join("")}</ul></section>
        <section class="acc-card"><div class="acc-card__head"><h2>Saved · ${ids.length} source${ids.length === 1 ? "" : "s"}${canMakeLists() ? `, ${l.length} list${l.length === 1 ? "" : "s"}` : ""}</h2><button class="m-textlink" data-go="saved">View all</button></div>
          ${!canSave() ? '<p class="acc-muted">Saved favourites come with Supporter and Founder.</p>'
            : savedRows.length ? savedRows.map(([src, ln]) => `<div class="acc-row"><span class="ini">${esc(src.domain[0].toUpperCase())}</span><span class="grow">${esc(src.domain)}</span><small>${esc(ln)}</small></div>`).join("")
            : '<p class="acc-muted">Nothing saved yet. Tap ☆ on any site.</p>'}</section>
        <section class="acc-card acc-card--wide"><div class="acc-card__head"><h2>Your suggestions</h2><button class="m-textlink" data-go="suggest">Suggest a source</button></div>
          ${suggRows(sugg, 4) || '<p class="acc-muted">You haven’t suggested a site yet. Know an independent site we’re missing?</p>'}</section>
      </div>`;
  },
};
const badge = (s) => s?.plan === "founder" ? `<span class="badge-founder">${I.star} FOUNDER${s.founderNo ? ` #${String(s.founderNo).padStart(4, "0")}` : ""}</span>`
  : s?.plan === "supporter" ? '<span class="badge-founder badge-founder--sup">♥ SUPPORTER</span>' : "";
const suggRows = (list, n = 50) => list.slice().reverse().slice(0, n).map((x) => `<div class="acc-row acc-row--sugg"><div class="grow"><b>${esc(host(x.url))}</b><small>Sent ${fmt(x.created)}${plan() === "founder" ? " · reviewed first" : ""}</small></div>${statusPill("IN REVIEW", "review")}</div>`).join("");

/* ---- Your suggestions ---- */
PAGES.suggestions = {
  html() {
    const list = ctx.store.getRaw("suggestions");
    return head("Your suggestions", "Sites you’ve suggested, and where they are in the queue.")
      + `<div class="area-cols"><div class="area-col-main"><section class="acc-card">${suggRows(list) || '<p class="acc-muted">Nothing yet.</p>'}
         <div class="row"><button class="btn btn--accent" data-go="suggest">Suggest a source</button></div></section></div>
         <div class="area-col-side">${sideCard("What happens next", '<p class="acc-muted">An editor checks each site for independence and recent posts. Founders’ suggestions are reviewed first.</p>')}</div></div>`;
  },
};

/* ---- Membership & support ---- */
PAGES.membership = {
  html() {
    const s = getSession(); const p = plan();
    const tick = (t) => `<li>${I.check}<span>${t}</span></li>`;
    const planCard = (name, price, unit, ticks, btnHTML, gold, tag, note, mine) => `<div class="plan ${gold ? "plan--gold" : ""} ${mine ? "is-mine" : ""}">
      <h3>${name}${tag ? `<em>${tag}</em>` : ""}</h3><p class="plan__price">${price}${unit ? ` <small>${unit}</small>` : ""}</p><ul>${ticks.map(tick).join("")}</ul>${btnHTML}${note ? `<small class="plan__note">${note}</small>` : ""}</div>`;
    return head(p === "founder" || p === "supporter" ? "Membership" : "Support Saorsa",
      p === "founder" ? "Thank you for being a Founder — here’s what your plan includes, and other ways to help." : "No ads, no tracking, no paywall on the news. Readers keep it running.")
      + `<div class="plans plans--area">
        ${planCard("Free", "£0", "", ["Every source & category", "Search & Shuffle", "Recent history on this device"],
          `<button class="btn plan__btn plan__btn--grey" disabled>${p === "free" || p === "anon" ? "Current plan" : "Included"}</button>`, false, "", p === "anon" ? "No account needed" : "", p === "free" || p === "anon")}
        ${planCard("Supporter", "£3", "/ month", ["Everything in Free", "Saved favourites, synced across devices", "Supporter badge"],
          p === "supporter" ? '<button class="btn plan__btn plan__btn--grey" disabled>✓ Your plan</button>' : p === "founder" ? '<button class="btn plan__btn plan__btn--grey" disabled>Included in Founder</button>' : '<button class="btn plan__btn plan__btn--grey" data-link="monthly">Support monthly</button>',
          false, "", "Cancel anytime", p === "supporter")}
        ${planCard("Founder", "£29", "one-off", ["Everything, for life", "Saved favourites + your own lists", "Founder badge & name on the About page"],
          p === "founder" ? `<button class="btn plan__btn plan__btn--gold" disabled>✓ Your plan${s?.founderNo ? ` · Founder #${String(s.founderNo).padStart(4, "0")}` : ""}</button>` : '<button class="btn plan__btn plan__btn--gold" data-link="founder">Become a Founder</button>',
          true, "BEST VALUE", p === "founder" ? `Since ${fmt(s?.joined)}` : "Limited to the first 1,000 Founders", p === "founder")}
      </div>
      <div class="area-cols area-cols--even">
        <section class="acc-card"><span class="m-label">One-off donation</span>
          <div class="amounts" data-amounts>${[3, 5, 10, 25].map((a) => `<button data-amt="${a}" class="${a === 10 ? "is-on" : ""}">£${a}</button>`).join("")}<button data-amt="other">Other</button></div>
          <div class="pay"><button class="btn btn--accent" data-link="donate" data-donate>Donate £10</button><button class="btn btn--paypal" data-link="paypal">PayPal</button></div>
          <p class="acc-muted">Card, Apple Pay & Google Pay through one secure checkout. Donations don’t unlock features — they keep Saorsa free for everyone.</p></section>
        <section class="acc-card"><span class="m-label">Other ways to give</span>
          <div class="platforms">${[["kofi", "Ko-fi", "Tips & memberships"], ["buymeacoffee", "Buy Me a Coffee", "Quick tips"], ["opencollective", "Open Collective", "Public, transparent budget"], ["liberapay", "Liberapay", "Recurring, non-profit"], ["bitcoin", "Bitcoin / Lightning", "On-chain or instant"], ["monero", "Monero", "Private donations"]]
            .map(([k, n, d]) => `<button data-link="${k}">${n}<small>${d}</small></button>`).join("")}</div></section>
      </div>
      <section class="acc-card"><span class="m-label">Where your money goes</span>
        <div class="money-goes"><div><b>Servers & site checks</b><small>Hosting, the nightly link checker and backups</small></div>
        <div><b>Finding new sources</b><small>Reviewing suggestions and new categories</small></div>
        <div><b>Staying ad-free</b><small>No ads, no trackers, no paywall on the news</small></div></div></section>`;
  },
  wire(main) {
    let amount = 10;
    main.addEventListener("click", (e) => {
      const a = e.target.closest("[data-amt]");
      if (a) {
        amount = a.dataset.amt === "other" ? "other" : Number(a.dataset.amt);
        main.querySelectorAll("[data-amt]").forEach((x) => x.classList.toggle("is-on", x === a));
        main.querySelector("[data-donate]").textContent = amount === "other" ? "Donate" : `Donate £${amount}`;
        return;
      }
      const b = e.target.closest("[data-link]"); if (!b) return;
      if ((b.dataset.link === "founder" || b.dataset.link === "monthly") && !getSession()) return ctx.openSignIn();
      let url = SUPPORT_LINKS[b.dataset.link];
      if (!url) return ctx.toast("Payments aren’t set up yet — coming soon.");
      if (b.dataset.link === "donate" && amount !== "other") url += (url.includes("?") ? "&" : "?") + `amount=${amount}`;
      window.open(url, "_blank", "noopener");
    });
  },
};

/* ---- Settings (was Preferences) ---- */
PAGES.settings = {
  html() {
    const p = ctx.prefs; const s = getSession();
    const tog = (k, on) => `<button class="toggle ${on ? "is-on" : ""}" data-pref="${k}" aria-pressed="${!!on}" aria-label="${k}"></button>`;
    const row = (t, sub, ctl) => `<div class="pref"><div>${t}${sub ? `<small>${sub}</small>` : ""}</div>${ctl}</div>`;
    return head("Settings", s && !PREVIEW ? "Saved on this device for now — they’ll follow your account to every device soon." : "Saved on this device. Sign in to keep them everywhere.")
      + `<div class="area-cols"><div class="area-col-main">
        <section class="acc-card set-card"><span class="m-label">Reading</span>
          ${row("Open sources in", "Inside Saorsa, or straight in a new tab", `<div class="mini-seg" data-openin><button data-v="saorsa" class="${p.openIn === "saorsa" ? "is-on" : ""}">Saorsa</button><button data-v="tab" class="${p.openIn === "tab" ? "is-on" : ""}">New tab</button></div>`)}
          ${row("Remember last source", "Reopen where you left off", tog("remember", p.remember))}
          ${row("Show intro splash", "", tog("splash", p.splash))}</section>
        <section class="acc-card set-card"><span class="m-label">Appearance</span>
          ${row("Background motion", "Off automatically for reduced-motion devices", tog("motion", p.motion))}
          ${row("Keep filters rolled up", "Show the one-line breadcrumb instead", tog("rolled", ctx.store.get("rolled", false)))}</section>
        ${s ? `<section class="acc-card set-card"><span class="m-label">Emails</span>
          ${row("When a suggestion is reviewed", "", tog("mailSuggest", p.mailSuggest !== false))}
          ${row("When a report is resolved", "", tog("mailReport", p.mailReport !== false))}
          ${row("Occasional news from Saorsa", "A few times a year", tog("mailNews", !!p.mailNews))}</section>` : ""}
      </div><div class="area-col-side">
        ${s ? sideCard("Account", `<div class="acc-row"><div class="grow"><b>${esc(s.email)}</b><small>Email</small></div></div>
            <div class="acc-row"><div class="grow"><b>Email code</b><small>Sign-in method</small></div></div>
            <button class="m-textlink" data-act="download">Download a copy of your data</button>
            <button class="m-textlink danger" data-act="delete">Delete account</button>`)
          : sideCard("Keep settings everywhere", '<p class="acc-muted">Sign in and your settings, saved sites and history follow you to every device.</p>', '<button class="btn btn--accent" data-go="signin">Sign in</button>')}
      </div></div>`;
  },
  wire(main) {
    main.addEventListener("click", (e) => {
      const t = e.target.closest("[data-pref]");
      if (t) {
        const k = t.dataset.pref;
        if (k === "rolled") { const v = !ctx.store.get("rolled", false); ctx.setRolled(v); t.classList.toggle("is-on", v); return; }
        const cur = k.startsWith("mail") && k !== "mailNews" ? ctx.prefs[k] !== false : !!ctx.prefs[k];
        ctx.prefs[k] = !cur; t.classList.toggle("is-on", !cur); t.setAttribute("aria-pressed", String(!cur)); ctx.savePrefs(); return;
      }
      const o = e.target.closest("[data-openin] [data-v]");
      if (o) { ctx.prefs.openIn = o.dataset.v; main.querySelectorAll("[data-openin] button").forEach((b) => b.classList.toggle("is-on", b === o)); ctx.savePrefs(); return; }
      const act = e.target.closest("[data-act]")?.dataset.act;
      if (act === "download") downloadData();
      if (act === "delete" && confirm("Delete your account? Your account, saved lists and settings will be removed. This can’t be undone.")) {
        deleteAccount().catch(() => ctx.toast("Couldn’t reach the server — please try again, or contact us."));
        ["lists", "lastList", "saved", "suggestions", "reports", "contact_messages"].forEach((k) => localStorage.removeItem("saorsa." + k));
        signOut(); ctx.toast("Account deleted."); openArea("membership");
      }
    });
  },
};
function downloadData() {
  const s = getSession();
  const data = { exported: new Date().toISOString(), account: { email: s?.email, name: s?.name, plan: s?.plan }, lists: ctx.lists(),
    recent: ctx.store.get("recent", []), preferences: ctx.store.get("prefs", {}), suggestions: ctx.store.getRaw("suggestions"), reports: ctx.store.getRaw("reports") };
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
  a.download = "saorsa-my-data.json"; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

/* ---- Suggest a source ---- */
PAGES.suggest = {
  html() {
    const s = getSession(); const mine = ctx.store.getRaw("suggestions");
    return head("Suggest a source", "Know an independent site we’re missing? Paste the address and we’ll check it.")
      + `<div class="area-cols"><div class="area-col-main"><form class="acc-card area-form" id="sgForm" novalidate>
        <label class="field"><span class="field-label">Website address</span><input class="text-input" name="url" type="url" placeholder="https://www.example-news.org" required></label>
        <p class="check-note is-hidden" id="sgCheck"></p>
        <hr class="divider-h">
        <span class="field-label">Category</span>${pills("cat", CATEGORIES, { dots: true })}
        <div id="sgPersp" class="is-hidden"><span class="field-label">Perspective <small>Geo only · optional</small></span>${pills("persp", SUB_FILTERS.geo.options)}</div>
        <hr class="divider-h">
        <label class="field"><span class="field-label">Country</span><span class="ctl ctl--select field-select"><select name="country">${COUNTRIES.map(([v, l]) => `<option value="${v}">${l}</option>`).join("")}</select></span></label>
        <hr class="divider-h">
        <label class="field"><span class="field-label">Why should it be on Saorsa? <small>optional</small></span><textarea name="note" rows="3" placeholder="A sentence or two helps us check it faster."></textarea></label>
        <div class="area-foot"><button type="button" class="btn btn--ghost" data-close>Cancel</button><button class="btn btn--accent" type="submit">Send suggestion</button></div>
      </form></div><div class="area-col-side">
        ${s ? sideCard("Your suggestions", suggRows(mine, 4) || '<p class="acc-muted">Nothing yet — this is where they’ll show.</p>')
          : sideCard("Track what you suggest", '<p class="acc-muted">You can suggest without an account. Sign in to see when we review it and whether it’s added.</p>', '<button class="btn btn--ghost" data-go="signin">Sign in</button>')}
        ${sideCard("What we look for", '<ul class="acc-list"><li>Independent — not a big media group or state broadcaster</li><li>Its own original writing, in English</li><li>Posted something in the last two months</li></ul>')}
      </div></div>`;
  },
  wire(main) {
    const f = main.querySelector("#sgForm"); let cat = null, persp = null;
    main.querySelector('[data-pills="cat"]').addEventListener("click", (e) => { const b = e.target.closest("[data-v]"); if (!b) return; cat = b.dataset.v; e.currentTarget.querySelectorAll(".pill").forEach((p) => p.classList.toggle("is-on", p === b)); $("sgPersp").classList.toggle("is-hidden", cat !== "geo"); });
    main.querySelector('[data-pills="persp"]').addEventListener("click", (e) => { const b = e.target.closest("[data-v]"); if (!b) return; persp = persp === b.dataset.v ? null : b.dataset.v; e.currentTarget.querySelectorAll(".pill").forEach((p) => p.classList.toggle("is-on", p.dataset.v === persp)); });
    // quick check against the list (no outside calls)
    f.url.addEventListener("input", () => {
      const h = host(f.url.value), note = $("sgCheck");
      if (!h.includes(".")) return note.classList.add("is-hidden");
      const found = ctx.allSources().find((s) => s.domain === h || s.domain === h.replace(/^www\./, ""));
      note.classList.remove("is-hidden"); note.classList.toggle("is-warn", !!found);
      note.textContent = found ? `✓ ${found.domain} is already on Saorsa, in ${catOf(found.category)?.label}.` : `${h} isn’t on Saorsa yet.`;
    });
    f.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (!f.url.value || !f.url.checkValidity()) { f.url.focus(); return ctx.toast("Add the site’s full address, starting with https://"); }
      const note = [f.note.value.trim(), persp ? `Perspective: ${persp}` : ""].filter(Boolean).join(" · ");
      try { await sendSuggestion({ url: f.url.value.trim(), category: cat, country: f.country.value || null, note: note || null }); }
      catch { return ctx.toast("Couldn’t send that just now. Please try again in a moment."); }
      sentState(main, "Thanks — it’s in the queue", "We check every suggestion before it goes on Saorsa.", "Suggest another");
    });
  },
};

/* ---- Contact us ---- */
PAGES.contact = {
  html() {
    const s = getSession(); const topics = ["General", "Report a problem", "Rating feedback", "Membership & billing", "Press", "Suggest a website"];
    return head("Contact Saorsa", "Questions, problems, press — we read everything.")
      + `<div class="area-cols"><div class="area-col-main"><form class="acc-card area-form" id="ctForm" novalidate>
        <span class="field-label">What’s it about?</span>${pills("topic", topics.map((t) => ({ id: t, label: t })), { on: ["General"] })}
        <p class="check-note is-hidden" id="ctHint">Suggesting a website? <button type="button" class="m-textlink" data-go="suggest">Use Suggest a source</button> so it can be tracked.</p>
        <hr class="divider-h">
        <div class="area-two"><label class="field"><span class="field-label">Name</span><input class="text-input" name="name" placeholder="Your name" autocomplete="name" value="${esc(s?.name || "")}"></label>
        <label class="field"><span class="field-label">Email</span><input class="text-input" name="email" type="email" placeholder="you@example.com" autocomplete="email" required value="${esc(s?.email || "")}"></label></div>
        <hr class="divider-h">
        <label class="field"><span class="field-label">Message</span><textarea name="message" rows="6" placeholder="How can we help?"></textarea></label>
        <label class="field"><span class="field-label">Related source <small>optional</small></span><input class="text-input" name="site" list="ctSites" placeholder="Pick a source from the list" value="${esc(ctx.current()?.domain || "")}"></label>
        <datalist id="ctSites">${ctx.allSources().map((x) => `<option value="${esc(x.domain)}">`).join("")}</datalist>
        <div class="area-foot"><small class="acc-muted grow">We only use your email to reply.</small><button class="btn btn--accent" type="submit">Send message</button></div>
      </form></div><div class="area-col-side">
        ${plan() === "founder" || plan() === "supporter" ? sideCard("★ Priority replies", `<p class="acc-muted">As a ${plan() === "founder" ? "Founder" : "Supporter"}, your messages go to the top of the pile.</p>`)
          : sideCard("Replies", '<p class="acc-muted">We usually reply within a few days. Founders and Supporters get priority replies.</p>')}
        ${sideCard("Quick answers", '<button class="m-textlink" data-act="howrate">How we rate perspective →</button><button class="m-textlink" data-go="report">A site won’t load →</button><button class="m-textlink" data-go="membership">Membership & donations →</button>')}
      </div></div>`;
  },
  wire(main) {
    const f = main.querySelector("#ctForm"); let topic = "General";
    main.querySelector('[data-pills="topic"]').addEventListener("click", (e) => { const b = e.target.closest("[data-v]"); if (!b) return; topic = b.dataset.v; e.currentTarget.querySelectorAll(".pill").forEach((p) => p.classList.toggle("is-on", p === b)); $("ctHint").classList.toggle("is-hidden", topic !== "Suggest a website"); });
    main.querySelector('[data-act="howrate"]').onclick = () => { closeArea(); ctx.openHowWeRate(); };
    f.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (!f.email.value || !f.email.checkValidity()) { f.email.focus(); return ctx.toast("Add your email so we can reply."); }
      if (!f.message.value.trim()) { f.message.focus(); return ctx.toast("Write a message first."); }
      try { await sendContact({ topic, name: f.name.value.trim() || null, email: f.email.value.trim(), message: f.message.value.trim(), site: f.site.value.trim() || null }); }
      catch { return ctx.toast("Couldn’t send your message just now. Please try again in a moment."); }
      sentState(main, "Thanks — we’ll reply soon", "We usually answer within a few days.", "Send another");
    });
  },
};

/* ---- Report a problem ---- */
PAGES.report = {
  html({ site, preset = "category" } = {}) {
    const s = site || ctx.current();
    const types = [["category", "Wrong category or topic"], ["broken", "Broken or won’t load"], ["independent", "No longer independent"], ["other", "Something else"]];
    const mine = ctx.store.getRaw("reports");
    return head("Report a problem", "Tell us what’s wrong with a site. We check every report before changing anything.")
      + `<div class="area-cols"><div class="area-col-main"><form class="acc-card area-form" id="rpForm" novalidate>
        <div class="site-pick" id="rpSite">${s ? siteCard(s) : sitePicker()}</div>
        <hr class="divider-h">
        <span class="field-label">What’s wrong?</span>
        <div class="choices">${types.map(([v, l]) => `<label class="choice"><input type="radio" name="type" value="${v}" ${v === preset ? "checked" : ""}> ${l}</label>`).join("")}</div>
        <div id="rpMove"><hr class="divider-h"><span class="field-label">Where should it go?</span>${pills("cat", CATEGORIES, { dots: true })}
          <span class="field-label">Topic <small>optional</small></span><div id="rpTopics"><small class="acc-muted">Pick a category first</small></div></div>
        <hr class="divider-h">
        <label class="field"><span class="field-label">Anything else? <small>optional</small></span><textarea name="note" rows="3" placeholder="Add a note for the editor"></textarea></label>
        <div class="area-foot"><button type="button" class="btn btn--ghost" data-close>Cancel</button><button class="btn btn--accent" type="submit">Send report</button></div>
      </form></div><div class="area-col-side">
        ${sideCard("How reports work", '<ol class="acc-list"><li>An editor checks every report</li><li>Three matching reports jump the queue</li><li>Broken sites are re-checked overnight</li></ol>')}
        ${getSession() ? sideCard("Your reports", mine.length ? mine.slice().reverse().slice(0, 4).map((r) => `<div class="acc-row acc-row--sugg"><div class="grow"><b>${esc(r.site)}</b><small>${esc({ category: "Wrong category", broken: "Broken", independent: "Not independent", other: "Something else" }[r.type] || r.type)} · ${fmt(r.created)}</small></div>${statusPill("CHECKING", "review")}</div>`).join("") : '<p class="acc-muted">Nothing yet.</p>')
          : sideCard("No account needed", '<p class="acc-muted">Anyone can report a problem. Sign in to see what happened to your reports.</p>')}
      </div></div>`;
  },
  wire(main, opts = {}) {
    const f = main.querySelector("#rpForm"); let s = opts.site || ctx.current(); let cat = null, topic = null;
    const listed = (x) => [catOf(x.category)?.label, x.perspective && SUB_FILTERS.geo.options.find((o) => o.id === x.perspective)?.label,
      ...(x.topics || []).map((t) => SUB_FILTERS[x.category]?.options.find((o) => o.id === t)?.label)].filter(Boolean).join(" · ");
    const sync = () => $("rpMove").classList.toggle("is-hidden", f.type.value !== "category");
    const drawTopics = () => { const fl = cat && SUB_FILTERS[cat]; $("rpTopics").innerHTML = fl ? pills("topic", fl.options, { on: topic ? [topic] : [] }) : '<small class="acc-muted">Pick a category first</small>'; };
    const pickSite = () => {
      $("rpSite").innerHTML = sitePicker();
      const inp = $("rpSite").querySelector("input"); const list = $("rpSite").querySelector("ul");
      const draw = () => { const q = inp.value.trim().toLowerCase(); const items = (q ? ctx.allSources().filter((x) => x.domain.includes(q) || (x.name || "").toLowerCase().includes(q)) : ctx.recent()).slice(0, 8);
        list.innerHTML = items.map((x) => `<li><button type="button" data-site="${esc(x.id)}"><span class="ini">${esc(x.domain[0].toUpperCase())}</span>${esc(x.domain)}<small>${esc(catOf(x.category)?.label || "")}</small></button></li>`).join("") || `<li class="acc-muted">${q ? "No site matches that." : "Start typing a site’s name."}</li>`; };
      inp.addEventListener("input", draw); draw(); inp.focus();
    };
    main.querySelector("#rpSite").addEventListener("click", (e) => {
      if (e.target.closest("[data-change]")) return pickSite();
      const b = e.target.closest("[data-site]"); if (b) { s = ctx.findById(b.dataset.site); $("rpSite").innerHTML = siteCard(s); }
    });
    if (!s) pickSite();
    f.addEventListener("change", sync); sync();
    main.querySelector('#rpMove [data-pills="cat"]').addEventListener("click", (e) => { const b = e.target.closest("[data-v]"); if (!b) return; cat = b.dataset.v; topic = null; e.currentTarget.querySelectorAll(".pill").forEach((p) => p.classList.toggle("is-on", p === b)); drawTopics(); });
    $("rpTopics").addEventListener("click", (e) => { const b = e.target.closest("[data-v]"); if (!b) return; topic = topic === b.dataset.v ? null : b.dataset.v; drawTopics(); });
    f.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (!s) return ctx.toast("Pick the site first.");
      const type = f.type.value;
      if (type === "category" && !cat) return ctx.toast("Pick the category it should be in.");
      if ((type === "other" || type === "independent") && !f.note.value.trim()) { f.note.focus(); return ctx.toast("Add a short note so we know what to check."); }
      const report = { site: s.domain, url: s.url, type, listed_as: listed(s), suggested_category: type === "category" ? cat : null, suggested_topic: type === "category" ? topic : null, note: f.note.value.trim() || null };
      try { await sendReport(report); } catch { return ctx.toast("Couldn’t send that. Please try again."); }
      if (type === "broken") ctx.store.set(`broken:${s.id}:${new Date().toISOString().slice(0, 10)}`, true);
      sentState(main, "Thanks — we’ll take a look", `${type === "category" && cat ? `You suggested moving ${esc(s.domain)} to ${esc(catOf(cat)?.label)}. ` : ""}Nothing changes until an editor checks it.`, "Report another");
    });
  },
};
const siteCard = (s) => `<div class="site-card"><span class="ini">${esc(s.domain[0].toUpperCase())}</span><div class="grow"><strong>${esc(s.domain)}</strong><small>Listed in: ${esc(catOf(s.category)?.label || "—")}${s.country ? ` · ${esc(s.country)}` : ""}</small></div><button type="button" class="m-textlink" data-change>Change site</button></div>`;
const sitePicker = () => `<span class="field-label">Which site?</span><label class="search">${I.search}<input type="search" placeholder="Type the site’s name" autocomplete="off" spellcheck="false"></label><ul class="pick-sites"></ul>`;
