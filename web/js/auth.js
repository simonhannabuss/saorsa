// Accounts: sign in with an email code (P7-L1–L3), plan (Free / Supporter / Founder).
//
// With POCKETBASE_URL set, this uses PocketBase's one-time-password sign-in
// (users collection, OTP turned on). Without a server it runs in PREVIEW mode:
// no email is sent, any 6 digits sign you in, and the plan comes from the
// tweak panel (press T → "Preview account as"). Nothing leaves the browser.
import { POCKETBASE_URL, ACCOUNTS_LIVE } from "./config.js";

const KEY = "saorsa.session";
export const PREVIEW = !POCKETBASE_URL || !ACCOUNTS_LIVE;

export function getSession() {
  try { return JSON.parse(localStorage.getItem(KEY)) || null; } catch { return null; }
}
function setSession(s) {
  try { s ? localStorage.setItem(KEY, JSON.stringify(s)) : localStorage.removeItem(KEY); } catch {}
  window.dispatchEvent(new CustomEvent("saorsa:session"));
}

export const previewPlan = () => { try { return localStorage.getItem("saorsa.previewPlan") || "free"; } catch { return "free"; } };
export function setPreviewPlan(plan) {
  try { localStorage.setItem("saorsa.previewPlan", plan); } catch {}
  const s = getSession();
  if (s?.preview) setSession({ ...s, plan, founderNo: plan === "founder" ? s.founderNo || 127 : null });
}

/** "anon" when signed out, otherwise "free" | "supporter" | "founder". */
export const plan = () => getSession()?.plan || "anon";
export const canSave = () => ["supporter", "founder"].includes(plan());
export const canMakeLists = () => plan() === "founder";

const nameFrom = (email) => {
  const local = email.split("@")[0].replace(/[._-]+/g, " ").trim();
  return local ? local.replace(/\b\w/g, (c) => c.toUpperCase()).split(" ")[0] : "there";
};

async function pb(path, body, token) {
  const res = await fetch(`${POCKETBASE_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: token } : {}) },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.message || `Error ${res.status}`), { status: res.status });
  return data;
}

/** Step 1: send a code. Returns an otpId for step 2. */
export async function requestCode(email) {
  if (PREVIEW) return { otpId: "preview", email };
  // New readers: create the account first (fails harmlessly if it exists).
  const pw = crypto.getRandomValues(new Uint32Array(4)).join("-");
  await pb("/api/collections/users/records", { email, password: pw, passwordConfirm: pw }).catch(() => {});
  const { otpId } = await pb("/api/collections/users/request-otp", { email });
  return { otpId, email };
}

/** Step 2: check the 6-digit code. Resolves to the session, or throws. */
export async function verifyCode({ otpId, email }, code) {
  if (!/^\d{6}$/.test(code)) throw new Error("Enter all 6 digits.");
  let s;
  if (PREVIEW) {
    const p = previewPlan();
    s = { email, name: nameFrom(email), plan: p, founderNo: p === "founder" ? 127 : null, joined: new Date().toISOString(), preview: true, isNew: !getSession() };
  } else {
    const { token, record } = await pb("/api/collections/users/auth-with-otp", { otpId, password: code });
    s = {
      email: record.email, name: record.name || nameFrom(record.email), id: record.id, token,
      plan: record.founder ? "founder" : record.supporter ? "supporter" : "free",
      founderNo: record.founder_number || null, joined: record.created, isNew: !record.name,
    };
  }
  setSession(s);
  return s;
}

export function signOut() { setSession(null); }
