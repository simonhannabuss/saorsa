# Saorsa

Independent news sites from every side, in one place. *Saorsa* (Scottish Gaelic) means freedom, liberty.

This is the first working build of the **Phase 7** Figma designs: the compact left column, the reader with the source in a frame, the video background with the 45% overlay, and the report / suggest forms.

## What's here

```
web/                      the site (plain HTML, CSS and JavaScript, no build step)
  index.html
  css/saorsa.css          design tokens from the Figma variables + all styles
  js/app.js               left column, reader, report / suggest panels, keyboard
  js/background.js        video, overlay, cursor glow, parallax, grain, tweak panel
  js/config.js            categories, topics, perspectives, background defaults
  js/data.js              loads sources; sends reports / suggestions
  data/sources.json       live sites (generated, don't edit by hand)
  data/preview.json       review-queue candidates, only shown in preview mode
  media/                  bg-loop.mp4, bg-poster.jpg, grain.png
data/                     CSV exports from the review Sheet (the source of truth for now)
tools/sheet_to_json.py    turns those CSVs into web/data/*.json
tools/check_embeds.py     nightly checker: is each site up, and can it be framed?
pocketbase/pb_migrations/ first PocketBase schema (sources, suggestions, reports, saved_lists)
deploy/Caddyfile.example  web server config for EuroVPS
```

There's no npm and no framework, so there's nothing to install. PocketBase can serve the `web/` folder itself (`pb_public`), or Caddy can.

## Run it on your computer

```bash
cd web
python3 -m http.server 8765
# open http://localhost:8765
```

Useful while testing:

- **T** opens the **background tweak panel**. It has sliders for the dark overlay (starts at 45%), cursor glow, parallax, grain and video speed, plus a switch to include review-queue sites. Settings are kept in your browser only. When you're happy, copy the numbers into `BG_DEFAULTS` in `js/config.js`.
- Adding `?tweak` to the address opens the panel straight away.
- Other keys:
  - **/** search
  - **S** shuffle
  - **← →** previous or next site
  - **R** report a problem
  - **Esc** close or go back

## Updating the list of sites

1. In the review Sheet, export **Review queue** and **Already on Saorsa** as CSV.
2. Save them over `data/review-queue.csv` and `data/already-on-saorsa.csv`.
3. Run `python3 tools/sheet_to_json.py`.

Rows set to **Approved** become live. **Pending** and **Needs info** rows go to `preview.json`. **Rejected** rows are dropped.

Once PocketBase is running, set `POCKETBASE_URL` in `js/config.js` and the site reads from the `sources` collection instead.

## Status of each feature

| | Status |
|---|---|
| Left column: tabs, 2-row categories + ▾, perspective/topic filters, countries, sort, shuffle | ✅ working |
| Search across all categories | ✅ |
| Reader: frame, prev/next, Other side, save, share link, open original, report | ✅ |
| Blocked / down fallback card + one-tap "Report as broken" | ✅ (needs `check_embeds.py` data) |
| Report a problem / Suggest a source panels | ✅ saved in the browser until PocketBase is connected |
| Saved & Recent | ✅ in the browser. Founders get them synced via PocketBase later |
| Video background, 45% overlay, cursor glow, parallax, grain, reduced-motion still | ✅ |
| Splash (first visit per session) | ✅ |
| Mobile list ↔ reader | ✅ basic |
| Sign in (email code), account area, Founder payments, support slide-out, contact | ⏳ next |
| Rail (collapsed sidebar) | ⏳ (collapse hides the column for now) |

## Before going live

These are the things to check before this goes on the dev server. They're roughly in order of importance.

1. **Many sites refuse to be shown in a frame.** Publishers use `X-Frame-Options` or CSP `frame-ancestors` to block it, and it's the biggest risk for Saorsa. A browser can't detect it reliably, so run `tools/check_embeds.py` on the server every night. Sites it marks `embeddable: false` show the "can't be shown" card with *Open in new tab*. Run it once before launch to see how many of your sites are affected.
2. **Perspective and topics for the 16 live sites are blank.** Only the review-queue candidates have them so far. Fill them in (Sheet, then CSV, then `sheet_to_json.py`), otherwise the live sites only appear under **All**.
3. **Preview data is public if this repo is public.** `web/data/preview.json` holds the review-queue suggestions, with perspective labels on named outlets. Keep the repo **private**, or remove `preview.json` before making it public. In production, preview is off unless the host is `localhost` or `dev.*`.
4. **The background video is a 5-second test clip.** Replace `web/media/bg-loop.mp4` and `bg-poster.jpg` with the final seamless loop: 1280 × 720 H.264, no audio, under about 2 MB. Also check the Freeject image's licence, since the video started from it.
5. **Fonts are loaded from Google Fonts.** Self-host Raleway, Quicksand and IBM Plex Mono before launch. Loading them from Google sends visitors' IP addresses to Google, which is a GDPR issue for EU and UK visitors.
6. **Privacy and legal.** You need a short privacy notice (what's stored: saved sites, reports, email for sign-in). You also need a line saying Saorsa doesn't host or endorse the sites it shows. If you add analytics, use one that doesn't set cookies, such as Plausible or Umami, so no cookie banner is needed.
7. **Spam protection.** The report and suggest forms need rate limiting, either in Caddy or PocketBase. "Broken" reports are open to anyone, and the other report types need an account (the PocketBase rules already do this).
8. **PocketBase migration.** It's written for PocketBase v0.23+ but hasn't been run yet. Start PocketBase once on the server, check the collections in the admin panel, and adjust if anything is refused.
9. **Password-protect the dev site.** Keep `dev.` behind basic auth (see the Caddy example) until you're ready.
10. **Accessibility.** Check keyboard focus order, contrast of the small grey text over the video, and screen-reader labels. Most are in place, but they need a proper pass.

## Deploying to EuroVPS (outline)

1. On the server, clone the repo to `/srv/saorsa`.
2. Copy `deploy/Caddyfile.example` to `/etc/caddy/Caddyfile`, set your domain and the password hash, then reload Caddy.
3. (Later) download PocketBase, point it at `pocketbase/pb_migrations`, and run it as a service on port 8090.
4. Add the nightly checker to cron: `15 3 * * * cd /srv/saorsa && python3 tools/check_embeds.py --site-origin https://your-domain`
5. To deploy an update: `git pull` on the server. There's no build step.
