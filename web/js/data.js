// Loading sources and sending reports / suggestions.
// Today: JSON files in /data. Later: PocketBase (set POCKETBASE_URL in config.js).
import { POCKETBASE_URL, SOURCES_FROM_SERVER } from "./config.js";

async function getJSON(url) {
  const res = await fetch(url, { cache: "no-cache" });
  if (!res.ok) throw new Error(`${url}: ${res.status}`);
  return res.json();
}

export async function loadSources({ includePreview }) {
  if (POCKETBASE_URL && SOURCES_FROM_SERVER) {
    const filter = includePreview ? "" : "&filter=" + encodeURIComponent("status='live'");
    const data = await getJSON(`${POCKETBASE_URL}/api/collections/sources/records?perPage=500${filter}`);
    return data.items;
  }
  const live = await getJSON("data/sources.json");
  if (!includePreview) return live;
  const preview = await getJSON("data/preview.json").catch(() => []);
  return live.concat(preview);
}

// Sends a reader report. Without a server it is kept in this browser so the
// flow can be tested, and logged to the console.
export async function sendReport(report) {
  return send("reports", report);
}

export async function sendContact(message) {
  return send("contact_messages", message);
}

export async function sendSuggestion(suggestion) {
  return send("suggestions", suggestion);
}

// PocketBase only accepts values its fields know; tidy the record first.
const COUNTRIES = ["UK", "US", "CA", "AU", "NZ", "IE"];
function clean(collection, body) {
  const r = Object.fromEntries(Object.entries(body).filter(([, v]) => v !== null && v !== undefined && v !== ""));
  if (r.country && !COUNTRIES.includes(r.country)) { r.note = [r.note, `Country: ${r.country}`].filter(Boolean).join(" · "); delete r.country; }
  if (collection === "reports" && r.suggested_topic === null) delete r.suggested_topic;
  return r;
}

async function send(collection, body) {
  const record = { ...body, created: new Date().toISOString() };
  // A copy stays in this browser too (the account page lists "Your suggestions").
  const key = `saorsa.${collection}`;
  const keep = () => {
    try { const list = JSON.parse(localStorage.getItem(key) || "[]"); list.push(record); localStorage.setItem(key, JSON.stringify(list.slice(-50))); } catch {}
  };
  if (POCKETBASE_URL) {
    const res = await fetch(`${POCKETBASE_URL}/api/collections/${collection}/records`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(clean(collection, body)),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      console.error(`[saorsa] ${collection} not saved (${res.status})`, detail);
      throw new Error(`Could not send (${res.status})`);
    }
    keep();
    return res.json();
  }
  keep();
  console.info(`[saorsa] ${collection} (stored locally, no server yet)`, record);
  return record;
}
