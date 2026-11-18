// Animated background: looping video, dark overlay, cursor glow, parallax, grain.
// Values come from config.js and can be changed live with the tweak panel (T).
import { BG_DEFAULTS, PREVIEW_DEFAULT } from "./config.js";

const KEY = "saorsa.bg";
const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)");

export function loadSettings() {
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(KEY) || "{}"); } catch {}
  return { ...BG_DEFAULTS, preview: PREVIEW_DEFAULT, ...saved };
}

export function saveSettings(s) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch {}
}

export function initBackground(settings) {
  const root = document.documentElement;
  const bg = document.getElementById("bg");
  const move = document.getElementById("bgMove");
  const glow = document.getElementById("bgGlow");
  const video = document.getElementById("bgVideo");

  const apply = () => {
    root.style.setProperty("--overlay", settings.overlay);
    root.style.setProperty("--glow", settings.glow);
    root.style.setProperty("--grain", settings.grain);
    video.playbackRate = settings.speed;
  };
  apply();

  // Reduced motion: keep the still poster frame only.
  const motionCheck = () => {
    if (reduceMotion.matches) { video.pause(); video.removeAttribute("autoplay"); }
    else video.play().catch(() => {});
  };
  motionCheck();
  reduceMotion.addEventListener?.("change", motionCheck);
  video.addEventListener("loadedmetadata", () => { video.playbackRate = settings.speed; });

  // Pause when the tab is hidden or a site is open (saves battery).
  const playState = () => {
    const reading = document.body.classList.contains("is-reading");
    if (document.hidden || reading || reduceMotion.matches) video.pause();
    else video.play().catch(() => {});
  };
  document.addEventListener("visibilitychange", playState);
  new MutationObserver(playState).observe(document.body, { attributes: true, attributeFilter: ["class"] });

  // Cursor glow + parallax, eased so it feels heavy.
  let tx = 0, ty = 0, gx = -999, gy = -999, cx = -999, cy = -999, px = 0, py = 0;
  window.addEventListener("pointermove", (e) => {
    const r = bg.getBoundingClientRect();
    tx = e.clientX - r.left; ty = e.clientY - r.top;
    const nx = (tx / r.width) * 2 - 1, ny = (ty / r.height) * 2 - 1;
    px = -nx * settings.parallax; py = -ny * settings.parallax;
  }, { passive: true });

  const tick = () => {
    if (!reduceMotion.matches && !document.hidden) {
      cx += (tx - cx) * 0.08; cy += (ty - cy) * 0.08;
      if (Math.abs(cx - gx) > 0.3 || Math.abs(cy - gy) > 0.3) {
        gx = cx; gy = cy;
        glow.style.transform = `translate3d(${gx}px, ${gy}px, 0)`;
      }
      move.style.transform = `translate3d(${px}px, ${py}px, 0)`;
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);

  return { apply };
}

export function initTweakPanel(settings, bgApi, onPreviewChange) {
  const panel = document.getElementById("tweak");
  const fields = ["overlay", "glow", "parallax", "grain", "speed"];
  const fmt = { overlay: (v) => Math.round(v * 100) + "%", glow: (v) => Math.round(v * 100) + "%", grain: (v) => Math.round(v * 100) + "%", parallax: (v) => v + "px", speed: (v) => v + "×" };

  const sync = () => {
    for (const f of fields) {
      document.getElementById("t_" + f).value = settings[f];
      document.getElementById("o_" + f).textContent = fmt[f](settings[f]);
    }
    document.getElementById("t_preview").checked = !!settings.preview;
  };
  for (const f of fields) {
    document.getElementById("t_" + f).addEventListener("input", (e) => {
      settings[f] = parseFloat(e.target.value);
      document.getElementById("o_" + f).textContent = fmt[f](settings[f]);
      bgApi.apply(); saveSettings(settings);
    });
  }
  document.getElementById("t_preview").addEventListener("change", (e) => {
    settings.preview = e.target.checked; saveSettings(settings); onPreviewChange();
  });
  document.getElementById("tweakReset").addEventListener("click", () => {
    Object.assign(settings, BG_DEFAULTS, { preview: PREVIEW_DEFAULT });
    saveSettings(settings); sync(); bgApi.apply(); onPreviewChange();
  });
  document.getElementById("tweakClose").addEventListener("click", () => panel.classList.add("is-hidden"));

  const toggle = () => { sync(); panel.classList.toggle("is-hidden"); };
  if (new URLSearchParams(location.search).has("tweak")) toggle();
  return { toggle };
}
