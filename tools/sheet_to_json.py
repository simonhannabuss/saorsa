#!/usr/bin/env python3
"""Turn the review Sheet's CSV exports into the JSON the front end reads.

Usage:
    python3 tools/sheet_to_json.py

Reads:
    data/already-on-saorsa.csv   (tab "Already on Saorsa": Domain, Category, Notes)
    data/review-queue.csv        (tab "Review queue", exported as CSV)

Writes:
    web/data/sources.json  - live sites: everything in "Already on Saorsa"
                             plus every Review queue row set to Approved
    web/data/preview.json  - Pending / Needs info rows, only shown when the
                             "preview" switch is on (dev only, never in production)

Rejected rows are dropped. Standard library only, no installs needed.
Once Saorsa runs on PocketBase this script is replaced by the
`sources` collection, but the field names stay the same.
"""
import csv
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
OUT = ROOT / "web" / "data"

CATEGORY = {
    "geo": "geo",
    "spiritual": "spiritual",
    "spiritual & religion": "spiritual",
    "health": "health",
    "exo": "exo",
    "exo & ufo": "exo",
    "science": "science",
    "money": "money",
    "history": "history",
}


def domain_of(url: str) -> str:
    url = (url or "").strip().lower()
    url = re.sub(r"^https?://", "", url)
    url = re.sub(r"^www\.", "", url)
    return url.split("/")[0]


def clean(value):
    value = (value or "").strip()
    return value or None


def slug(value):
    value = clean(value)
    return value.lower().replace(" ", "-") if value else None


def row_to_source(row, status):
    url = clean(row.get("URL"))
    if not url or not url.startswith("http"):
        return None
    category = CATEGORY.get((row.get("Category") or "").strip().lower())
    if not category:
        return None
    topics = [slug(row.get("Sub-category")), slug(row.get("Second sub-category"))]
    return {
        "id": domain_of(url),
        "name": clean(row.get("Site")) or domain_of(url),
        "url": url,
        "domain": domain_of(url),
        "country": clean(row.get("Country")),
        "category": category,
        "perspective": slug(row.get("Perspective (Geo)")) if category == "geo" else None,
        "topics": [t for t in topics if t],
        "status": status,
        "embeddable": None,  # filled in by tools/check_embeds.py
    }


def main():
    live, preview, seen = [], [], set()

    with open(DATA / "already-on-saorsa.csv", newline="", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            d = domain_of(row["Domain"])
            if not d or d in seen:
                continue
            seen.add(d)
            live.append({
                "id": d,
                "name": d,
                "url": f"https://{d}",
                "domain": d,
                "country": None,
                "category": CATEGORY.get((row.get("Category") or "").strip().lower(), "geo"),
                "perspective": None,  # still to be set by Simon
                "topics": [],
                "status": "live",
                "embeddable": None,
                "note": clean(row.get("Notes")),
            })

    with open(DATA / "review-queue.csv", newline="", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            status = (row.get("Status") or "").strip().lower()
            if status == "rejected":
                continue
            src = row_to_source(row, "live" if status == "approved" else "pending")
            if not src or src["id"] in seen:
                continue
            seen.add(src["id"])
            (live if src["status"] == "live" else preview).append(src)

    OUT.mkdir(parents=True, exist_ok=True)
    for name, items in (("sources.json", live), ("preview.json", preview)):
        items.sort(key=lambda s: s["domain"])
        (OUT / name).write_text(json.dumps(items, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"{len(live)} live sites -> web/data/sources.json")
    print(f"{len(preview)} preview sites -> web/data/preview.json")


if __name__ == "__main__":
    main()
