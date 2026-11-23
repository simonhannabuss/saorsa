/// <reference path="../pb_data/types.d.ts" />
// Until accounts go live, every kind of report can be sent without signing in
// (the site already limits it to one per site per day in the browser).
// Turn PocketBase's rate limiting on in Settings → Application as well.
// When accounts launch, put the stricter rule back (see the second function).
migrate((app) => {
  const reports = app.findCollectionByNameOrId("reports");
  reports.createRule = "";
  app.save(reports);
}, (app) => {
  const reports = app.findCollectionByNameOrId("reports");
  reports.createRule = "@request.body.type = 'broken' || @request.auth.id != ''";
  app.save(reports);
});
