/// <reference path="../pb_data/types.d.ts" />
// Emails every PocketBase admin (superuser) when a reader sends a report,
// a suggestion or a contact message. Uses the mail settings (Brevo SMTP).
// A failed alert never stops the reader's message being saved.

onRecordAfterCreateSuccess((e) => {
  e.next();
  try {
    const r = e.record;
    const kind = r.collection().name;
    const lines = {
      reports: () => [`Site: ${r.get("site")}`, `Problem: ${r.get("type")}`, `Listed as: ${r.get("listed_as") || "—"}`,
        `Suggested category: ${r.get("suggested_category") || "—"}`, `Suggested topic: ${r.get("suggested_topic") || "—"}`, `Note: ${r.get("note") || "—"}`],
      suggestions: () => [`Site: ${r.get("url")}`, `Category: ${r.get("category") || "—"}`, `Country: ${r.get("country") || "—"}`, `Note: ${r.get("note") || "—"}`],
      contact_messages: () => [`From: ${r.get("name") || "—"} <${r.get("email")}>`, `About: ${r.get("topic") || "—"}`, `Site: ${r.get("site") || "—"}`, "", `${r.get("message")}`],
    }[kind]();
    const title = { reports: "New report", suggestions: "New suggestion", contact_messages: "New message" }[kind];
    const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
    const admins = e.app.findAllRecords("_superusers");
    const to = admins.map((a) => ({ address: a.email() }));
    if (!to.length) return;
    const meta = e.app.settings().meta;
    const message = new MailerMessage({
      from: { address: meta.senderAddress, name: meta.senderName },
      to: to,
      subject: `Saorsa · ${title}${kind === "reports" ? `: ${r.get("site")}` : ""}`,
      html: `<div style="font-family:Helvetica,Arial,sans-serif;font-size:14px;line-height:1.5">
        <h2 style="margin:0 0 12px">${title}</h2>
        <p>${lines.map(esc).join("<br>")}</p>
        <p style="color:#888">Open it in the admin: <a href="${meta.appURL || "https://api.saorsa.space"}/_/#/collections?collection=${kind}">${kind}</a></p></div>`,
    });
    if (kind === "contact_messages" && r.get("email")) message.headers = { "Reply-To": r.get("email") };
    e.app.newMailClient().send(message);
  } catch (err) {
    e.app.logger().error("Saorsa alert email failed", "error", String(err));
  }
}, "reports", "suggestions", "contact_messages");
