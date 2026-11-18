#!/usr/bin/env python3
"""Nightly link checker for Saorsa.

For every site it works out:
  - is it up? (HTTP status, where it redirects to)
  - can it be shown inside Saorsa's frame? (X-Frame-Options and the
    Content-Security-Policy `frame-ancestors` rule)

and writes the result back into web/data/sources.json (and preview.json):
  embeddable: true / false / null (unknown)
  down_nights: how many nights in a row it failed. At 2 the site shows the
               "may be down" card and should be flagged for review.

Run it on the server once a night, for example with cron:
  15 3 * * *  cd /srv/saorsa && python3 tools/check_embeds.py --site-origin https://saorsa.example

Standard library only. Later this writes to the PocketBase `sources`
collection instead of the JSON files.
"""
import argparse
import concurrent.futures as cf
import datetime as dt
import json
import ssl
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
FILES = [ROOT / "web" / "data" / "sources.json", ROOT / "web" / "data" / "preview.json"]
UA = "Mozilla/5.0 (compatible; SaorsaLinkChecker/1.0; +https://github.com/simonhannabuss/saorsa)"


def frame_allowed(headers, site_origin):
    xfo = (headers.get("X-Frame-Options") or "").strip().lower()
    if xfo in ("deny", "sameorigin"):
        return False
    csp = headers.get("Content-Security-Policy") or ""
    for part in csp.split(";"):
        part = part.strip()
        if part.lower().startswith("frame-ancestors"):
            sources = part.split()[1:]
            if "*" in sources:
                return True
            if site_origin and any(site_origin.rstrip("/") == s.rstrip("/") for s in sources):
                return True
            return False  # 'none', 'self' or a list without us
    return True


def check(source, site_origin, timeout):
    req = urllib.request.Request(source["url"], headers={"User-Agent": UA, "Accept": "text/html"})
    try:
        with urllib.request.urlopen(req, timeout=timeout, context=ssl.create_default_context()) as res:
            return {"ok": 200 <= res.status < 400, "status": res.status, "final_url": res.geturl(),
                    "embeddable": frame_allowed(res.headers, site_origin)}
    except urllib.error.HTTPError as e:
        # 401/403 from bot protection doesn't mean the site is down for readers
        return {"ok": e.code in (401, 403, 429), "status": e.code, "final_url": source["url"],
                "embeddable": frame_allowed(e.headers, site_origin) if e.headers else None}
    except Exception as e:  # DNS, timeout, TLS…
        return {"ok": False, "status": None, "final_url": source["url"], "embeddable": None, "error": str(e)[:120]}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--site-origin", default="", help="Saorsa's own origin, e.g. https://saorsa.example")
    ap.add_argument("--timeout", type=int, default=15)
    ap.add_argument("--workers", type=int, default=8)
    args = ap.parse_args()
    now = dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds")

    for path in FILES:
        if not path.exists():
            continue
        sources = json.loads(path.read_text(encoding="utf-8"))
        with cf.ThreadPoolExecutor(args.workers) as pool:
            results = list(pool.map(lambda s: check(s, args.site_origin, args.timeout), sources))
        flagged = []
        for s, r in zip(sources, results):
            s["checked_at"] = now
            s["http_status"] = r["status"]
            if r["embeddable"] is not None:
                s["embeddable"] = r["embeddable"]
            s["down_nights"] = 0 if r["ok"] else s.get("down_nights", 0) + 1
            if r["final_url"] and r["final_url"].rstrip("/") != s["url"].rstrip("/"):
                s["redirects_to"] = r["final_url"]
            if s["down_nights"] >= 2:
                flagged.append(s["domain"])
        path.write_text(json.dumps(sources, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")
        blocked = sum(1 for s in sources if s.get("embeddable") is False)
        print(f"{path.name}: {len(sources)} checked · {blocked} block framing · {len(flagged)} down 2+ nights {flagged or ''}")


if __name__ == "__main__":
    main()
