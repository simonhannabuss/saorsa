// Loading sources and sending reports / suggestions.
// Today: JSON files in /data. Later: PocketBase (set POCKETBASE_URL in config.js).
import { POCKETBASE_URL } from "./config.js";

async function getJSON(url) {
  const res = await fetch(url, { cache: "no-cache" });
  if (!res.ok) throw new Error(`${url}: ${res.status}`);
  return res.json();
}

export async function loadSources({ includePreview }) {
  if (POCKETBASE_URL) {
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

async function send(collection, body) {
  const record = { ...body, created: new Date().toISOString() };
  if (POCKETBASE_URL) {
    const res = await fetch(`${POCKETBASE_URL}/api/collections/${collection}/records`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(record),
    });
    if (!res.ok) throw new Error(`Could not send (${res.status})`);
    return res.json();
  }
  const key = `saorsa.${collection}`;
  const list = JSON.parse(localStorage.getItem(key) || "[]");
  list.push(record);
  localStorage.setItem(key, JSON.stringify(list));
  console.info(`[saorsa] ${collection} (stored locally, no server yet)`, record);
  return record;
}
