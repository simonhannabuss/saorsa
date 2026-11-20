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

// Geo uses Perspective (multi-select). History uses Mainstream / Alternative.
// The others use topics; a site can have up to two (the first is its main one).
// `edge: true` marks the option that gets the red dot.
export const SUB_FILTERS = {
  geo: {
    kind: "perspective",
    multi: true,
    options: [
      { id: "hidden", label: "Hidden", color: "var(--p-hidden)", edge: true },
      { id: "left", label: "Left", color: "var(--p-left)" },
      { id: "centre", label: "Centre", color: "var(--p-centre)" },
      { id: "right", label: "Right", color: "var(--p-right)" },
    ],
  },
  spiritual: { kind: "topic", options: [{ id: "occult", label: "Occult", edge: true }, { id: "faith", label: "Faith" }, { id: "eastern", label: "Eastern" }, { id: "new-age", label: "New Age" }] },
  health: { kind: "topic", options: [{ id: "sceptic", label: "Sceptic", edge: true }, { id: "natural", label: "Natural" }, { id: "mind", label: "Mind" }, { id: "evidence", label: "Evidence" }] },
  money: { kind: "topic", options: [{ id: "power", label: "Power", edge: true }, { id: "markets", label: "Markets" }, { id: "economy", label: "Economy" }, { id: "crypto", label: "Crypto" }] },
  exo: { kind: "topic", options: [{ id: "ancient", label: "Ancient", edge: true }, { id: "disclosure", label: "Disclosure" }, { id: "sightings", label: "Sightings" }] },
  science: { kind: "topic", options: [{ id: "fringe", label: "Fringe", edge: true }, { id: "space", label: "Space" }, { id: "nature", label: "Nature" }, { id: "tech", label: "Tech" }] },
  history: { kind: "topic", options: [{ id: "mainstream", label: "Mainstream" }, { id: "alternative", label: "Alternative", edge: true }] },
};

// Opposite sides for the "Other side" button on Geo sites.
// Parked for now (Simon, 20 Nov): "Other side" button removed from the reader.
export const OTHER_SIDE = { left: ["right", "centre"], right: ["left", "centre"], centre: ["left", "right"], hidden: ["centre"] };

// Background defaults. The tweak panel (press T) overrides them in this browser only.
export const BG_DEFAULTS = { overlay: 0.45, glow: 0.22, parallax: 12, grain: 0.08, speed: 0.6 };

// If a PocketBase server is reachable at this address, sources come from its
// `sources` collection and reports / suggestions are saved there.
// Leave empty to use the JSON files in /data (as now).
export const POCKETBASE_URL = "";

// Show review-queue candidates (pending) alongside live sites?
// On by default only on localhost and dev.* hosts. Never on in production.
export const PREVIEW_DEFAULT = /^(localhost|127\.|dev\.)/.test(location.hostname);
