/// <reference path="../pb_data/types.d.ts" />
// The sign-in code email (P7-L2), in Saorsa's style. {OTP} is the 6-digit code.
const BODY = `
<div style="margin:0;padding:32px 16px;background:#1c1c1e;font-family:Quicksand,Helvetica,Arial,sans-serif;color:#ffffff">
  <div style="max-width:440px;margin:0 auto;background:#2c2c2c;border-radius:16px;padding:32px 28px;text-align:center">
    <div style="font-family:Raleway,Helvetica,Arial,sans-serif;font-weight:700;letter-spacing:.32em;font-size:20px;margin-bottom:24px">SAORSA</div>
    <h1 style="margin:0 0 8px;font-size:20px;font-weight:700">Your sign-in code</h1>
    <p style="margin:0 0 22px;font-size:14px;line-height:1.5;color:#b4b4b9">Enter this code on Saorsa to sign in. It works for 10 minutes.</p>
    <div style="display:inline-block;padding:14px 22px;border-radius:12px;background:#1f1f21;border:1px solid #3b3b3d;font-size:32px;font-weight:700;letter-spacing:.3em;color:#50bfe3">{OTP}</div>
    <p style="margin:24px 0 0;font-size:12px;line-height:1.5;color:#808087">If you didn’t ask for this, you can ignore this email — nobody can sign in without the code.</p>
  </div>
  <p style="max-width:440px;margin:16px auto 0;text-align:center;font-size:11px;color:#808087">Saorsa · independent media, one window · <a href="https://saorsa.space" style="color:#808087">saorsa.space</a></p>
</div>`;

migrate((app) => {
  const users = app.findCollectionByNameOrId("users");
  users.otp.emailTemplate = { subject: "Your Saorsa sign-in code: {OTP}", body: BODY };
  app.save(users);
}, (app) => {});
