/// <reference path="../pb_data/types.d.ts" />
// Saorsa's first PocketBase schema (PocketBase v0.23+ migration format).
// PocketBase runs this automatically on start. Collections:
//   sources      – every site (live, pending, rejected), same fields as the review Sheet
//   suggestions  – "Suggest a source" form
//   reports      – "Report a problem" form + one-tap "broken"
//   saved_lists  – Founders' saved sites, synced across devices
// The built-in `users` collection is used for accounts (email code sign-in).

const CATS = ["geo", "spiritual", "health", "exo", "science", "money", "history"];
const TOPICS = ["faith", "eastern", "new-age", "occult", "sceptic", "natural", "mind", "evidence",
  "power", "markets", "economy", "crypto", "disclosure", "paranormal",
  "space", "nature", "tech", "hidden", "mainstream"];
const COUNTRIES = ["UK", "US", "CA", "AU", "NZ", "IE"];

migrate((app) => {
  const sources = new Collection({
    type: "base",
    name: "sources",
    // anyone can read live sites; only admins (superusers) can change them
    listRule: "status = 'live'",
    viewRule: "status = 'live'",
    createRule: null,
    updateRule: null,
    deleteRule: null,
    fields: [
      { name: "name", type: "text", required: true },
      { name: "url", type: "url", required: true },
      { name: "domain", type: "text", required: true },
      { name: "country", type: "select", values: COUNTRIES, maxSelect: 1 },
      { name: "category", type: "select", values: CATS, maxSelect: 1, required: true },
      { name: "perspective", type: "select", values: ["left", "centre", "right", "hidden"], maxSelect: 1 },
      { name: "topics", type: "select", values: TOPICS, maxSelect: 2 },
      { name: "status", type: "select", values: ["live", "pending", "needs-info", "rejected"], maxSelect: 1, required: true },
      { name: "embeddable", type: "bool" },
      { name: "down_nights", type: "number" },
      { name: "checked_at", type: "date" },
      { name: "ownership", type: "text" },
      { name: "why", type: "text" },
      { name: "evidence", type: "url" },
      { name: "notes", type: "text" },
      { name: "created", type: "autodate", onCreate: true },
      { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
    ],
    indexes: ["CREATE UNIQUE INDEX idx_sources_domain ON sources (domain)"],
  });
  app.save(sources);

  const suggestions = new Collection({
    type: "base",
    name: "suggestions",
    listRule: null, viewRule: null, updateRule: null, deleteRule: null,
    createRule: "", // anyone can suggest (add rate limiting in the proxy – see README)
    fields: [
      { name: "url", type: "url", required: true },
      { name: "category", type: "select", values: CATS, maxSelect: 1 },
      { name: "topics", type: "select", values: TOPICS, maxSelect: 2 },
      { name: "country", type: "select", values: COUNTRIES, maxSelect: 1 },
      { name: "note", type: "text", max: 2000 },
      { name: "user", type: "relation", collectionId: "_pb_users_auth_", maxSelect: 1 },
      { name: "status", type: "select", values: ["new", "checking", "added", "declined"], maxSelect: 1 },
      { name: "created", type: "autodate", onCreate: true },
    ],
  });
  app.save(suggestions);

  const reports = new Collection({
    type: "base",
    name: "reports",
    listRule: null, viewRule: null, updateRule: null, deleteRule: null,
    // "broken" can be sent by anyone; other types need a signed-in account
    createRule: "@request.body.type = 'broken' || @request.auth.id != ''",
    fields: [
      { name: "site", type: "text", required: true },
      { name: "url", type: "url" },
      { name: "type", type: "select", values: ["category", "broken", "independent", "other"], maxSelect: 1, required: true },
      { name: "listed_as", type: "text" },
      { name: "suggested_category", type: "select", values: CATS, maxSelect: 1 },
      { name: "suggested_topic", type: "text" },
      { name: "note", type: "text", max: 2000 },
      { name: "user", type: "relation", collectionId: "_pb_users_auth_", maxSelect: 1 },
      { name: "status", type: "select", values: ["new", "checking", "done"], maxSelect: 1 },
      { name: "decision", type: "select", values: ["move", "fix-address", "keep", "remove"], maxSelect: 1 },
      { name: "created", type: "autodate", onCreate: true },
    ],
  });
  app.save(reports);

  const contact = new Collection({
    type: "base",
    name: "contact_messages",
    listRule: null, viewRule: null, updateRule: null, deleteRule: null,
    createRule: "", // anyone can write in (rate-limit in the proxy)
    fields: [
      { name: "topic", type: "text", max: 60 },
      { name: "name", type: "text", max: 120 },
      { name: "email", type: "email", required: true },
      { name: "message", type: "text", required: true, max: 5000 },
      { name: "site", type: "text", max: 200 },
      { name: "status", type: "select", values: ["new", "replied", "closed"], maxSelect: 1 },
      { name: "created", type: "autodate", onCreate: true },
    ],
  });
  app.save(contact);

  const saved = new Collection({
    type: "base",
    name: "saved_lists",
    listRule: "user = @request.auth.id",
    viewRule: "user = @request.auth.id",
    createRule: "@request.auth.id != '' && (@request.auth.founder = true || @request.auth.supporter = true)",
    updateRule: "user = @request.auth.id",
    deleteRule: "user = @request.auth.id",
    fields: [
      { name: "user", type: "relation", collectionId: "_pb_users_auth_", maxSelect: 1, required: true },
      { name: "name", type: "text", required: true },
      { name: "sources", type: "json" },
    ],
  });
  app.save(saved);

  // Plans on accounts, and sign-in with an emailed 6-digit code (P7-L1–L3).
  // founder / supporter are set by the payment webhook, never by the reader.
  const users = app.findCollectionByNameOrId("users");
  users.fields.add(new BoolField({ name: "founder" }));
  users.fields.add(new BoolField({ name: "supporter" }));
  users.fields.add(new NumberField({ name: "founder_number", onlyInt: true }));
  users.otp = { enabled: true, duration: 600, length: 6 };
  users.passwordAuth = { enabled: false, identityFields: ["email"] };
  app.save(users);
}, (app) => {
  for (const name of ["saved_lists", "contact_messages", "reports", "suggestions", "sources"]) {
    try { app.delete(app.findCollectionByNameOrId(name)); } catch (_) {}
  }
});
