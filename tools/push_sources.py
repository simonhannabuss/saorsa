#!/usr/bin/env python3
"""Copy the live site list (web/data/sources.json) into PocketBase's `sources`.

Run it ON THE SERVER after a deploy, as root or any user:
    python3 tools/push_sources.py
It asks for your PocketBase admin email and password (they stay on the
server). Sites are matched by domain: new ones are added, existing ones
updated. Sites no longer in the file are left alone (change them by hand).
Talks to PocketBase directly on 127.0.0.1:8090, so it works without the
public address.
"""
import getpass, json, os, sys, urllib.request, urllib.parse, urllib.error

PB = os.environ.get("PB_URL", "http://127.0.0.1:8090")
HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, "..", "web", "data", "sources.json")
FIELDS = ("name", "url", "domain", "country", "category", "perspective", "topics", "status")

def call(method, path, body=None, token=None):
    req = urllib.request.Request(PB + path, method=method,
        data=json.dumps(body).encode() if body is not None else None,
        headers={"Content-Type": "application/json", **({"Authorization": token} if token else {})})
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            return json.load(r)
    except urllib.error.HTTPError as e:
        raise SystemExit(f"{method} {path} failed ({e.code}): {e.read().decode()[:400]}")

def main():
    sites = json.load(open(SRC))
    email = input("PocketBase admin email: ").strip()
    pw = getpass.getpass("Password (not shown): ")
    token = call("POST", "/api/collections/_superusers/auth-with-password", {"identity": email, "password": pw})["token"]
    added = updated = 0
    for s in sites:
        rec = {k: s.get(k) for k in FIELDS}
        rec["topics"] = rec.get("topics") or []
        rec["status"] = "live" if rec.get("status") in (None, "live", "approved") else rec["status"]
        for k in ("country", "perspective"):
            if not rec.get(k): rec[k] = ""
        if s.get("embeddable") is not None: rec["embeddable"] = bool(s["embeddable"])
        q = urllib.parse.quote(f"domain='{rec['domain']}'")
        found = call("GET", f"/api/collections/sources/records?perPage=1&filter={q}", token=token)["items"]
        if found:
            call("PATCH", f"/api/collections/sources/records/{found[0]['id']}", rec, token); updated += 1
        else:
            call("POST", "/api/collections/sources/records", rec, token); added += 1
    print(f"Done: {added} added, {updated} updated, {len(sites)} in the file.")

if __name__ == "__main__":
    main()
