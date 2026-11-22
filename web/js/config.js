// Categories, filters and settings, matching the Phase 7 Figma designs.

export const CATEGORIES = [
  { id: "geo", label: "Geo", color: "var(--cat-geo)" },
  { id: "spiritual", label: "Spiritual", color: "var(--cat-spiritual)" },
  { id: "health", label: "Health", color: "var(--cat-health)" },
  { id: "exo", label: "Exo", color: "var(--cat-exo)" },
  { id: "science", label: "Science", color: "var(--cat-science)" },
  { id: "money", label: "Money", color: "var(--cat-money)" },
  { id: "history", label: "History", color: "var(--cat-history)" },
];

// Geo uses Perspective (multi-select). The others use topics; a site can have
// up to two (the first is its main one). No colour dots on sub-categories.
export const SUB_FILTERS = {
  geo: {
    kind: "perspective",
    multi: true,
    options: [
      { id: "left", label: "Left" },
      { id: "centre", label: "Centre" },
      { id: "right", label: "Right" },
      { id: "hidden", label: "Hidden" },
    ],
  },
  spiritual: { kind: "topic", options: [{ id: "faith", label: "Faith" }, { id: "eastern", label: "Eastern" }, { id: "new-age", label: "New Age" }, { id: "occult", label: "Occult" }] },
  health: { kind: "topic", options: [{ id: "sceptic", label: "Sceptic" }, { id: "natural", label: "Natural" }, { id: "mind", label: "Mind" }, { id: "evidence", label: "Evidence" }] },
  money: { kind: "topic", options: [{ id: "power", label: "Power" }, { id: "markets", label: "Markets" }, { id: "economy", label: "Economy" }, { id: "crypto", label: "Crypto" }] },
  exo: { kind: "topic", options: [{ id: "disclosure", label: "Disclosure" }, { id: "paranormal", label: "Paranormal" }] },
  science: { kind: "topic", options: [{ id: "space", label: "Space" }, { id: "nature", label: "Nature" }, { id: "tech", label: "Tech" }, { id: "hidden", label: "Hidden" }] },
  history: { kind: "topic", options: [{ id: "mainstream", label: "Mainstream" }, { id: "hidden", label: "Hidden" }] },
};

// Opposite sides for the "Other side" button on Geo sites.
// Parked for now (Simon, 20 Nov): "Other side" button removed from the reader.
export const OTHER_SIDE = { left: ["right", "centre"], right: ["left", "centre"], centre: ["left", "right"], hidden: ["centre"] };

// Background defaults. The tweak panel (press T) overrides them in this browser only.
export const BG_DEFAULTS = { overlay: 0.37, glow: 0.4, parallax: 12, grain: 0.26, speed: 0.6 };

// If a PocketBase server is reachable at this address, sources come from its
// `sources` collection and reports / suggestions are saved there.
// Leave empty to use the JSON files in /data (as now).
export const POCKETBASE_URL = "";

// Show review-queue candidates (pending) alongside live sites?
// On by default only on localhost and dev.* hosts. Never on in production.
export const PREVIEW_DEFAULT = /^(localhost|127\.|dev\.)/.test(location.hostname);

// Support Saorsa (NOW · 06). Paste each payment link when the account exists.
// An empty link shows "not set up yet" instead of opening anything.
export const SUPPORT_LINKS = {
  founder: "",        // Become a Founder (£29 once)
  donate: "",         // card / Apple Pay / Google Pay checkout (e.g. a Stripe Payment Link)
  paypal: "",         // PayPal.me or PayPal donate link
  monthly: "",        // Supporter · £3 / month
  kofi: "",
  buymeacoffee: "",
  opencollective: "",
  liberapay: "",
  bitcoin: "",        // a page with the address / Lightning invoice
  monero: "",
};
