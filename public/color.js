// Color math for Token Lab. Pure functions, hex in / hex out ('#RRGGBB', uppercase).
// Scales are built in OKLCH and gamut-mapped into sRGB by reducing chroma.

export const STEPS = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950];

const L_MAX = 0.975; // lightness of step 50 (reference ramp)
const L_MIN = 0.17; // lightness of step 950 (reference ramp)
const EDGE_CHROMA_LIGHT = 0.12; // chroma factor at step 50
const EDGE_CHROMA_DARK = 0.3; // chroma factor at step 950
const NEUTRAL_L_MAX = 0.985;
const NEUTRAL_L_MIN = 0.14;
const NEUTRAL_C_EDGE = 0.006;
const NEUTRAL_C_MID = 0.018;
const GAMUT_EPS = 1e-6;
// Reference ramp: step 500 sits at REF_MID_BASE + REF_MID_CUSP * (lightness of the hue's sRGB cusp).
// Hues whose most vivid color is light (yellow, lime, cyan) get a lighter middle, so #FACC15 lands
// near 400 and not at 100, while indigo/blue/red stay around 600.
const REF_MID_STEP = 5; // index of step 500
const REF_MID_BASE = 0.3;
const REF_MID_CUSP = 0.58;
const ANCHOR_CHROMA_WEIGHT = 0.5; // how much chroma counts next to lightness when picking the anchor
const MIN_EDGE_GAP = 0.012; // min lightness gap per step when the anchor is close to step 50 / 950
const L_TOP = 0.995;
const L_BOTTOM = 0.08;
// Yellows darken towards amber/brown instead of olive (and lighten slightly towards lemon).
const YELLOW_HUE_FADE_IN = [60, 85];
const YELLOW_HUE_FADE_OUT = [112, 130];
const YELLOW_SHIFT_DARK = -35; // degrees at step 950
const YELLOW_SHIFT_LIGHT = 8; // degrees at step 50

/* ---------- hex helpers ---------- */

export function normalizeHex(input) {
  if (typeof input !== 'string') return null;
  let s = input.trim();
  if (s.startsWith('#')) s = s.slice(1);
  if (/^[0-9a-fA-F]{3}$/.test(s)) s = s.replace(/./g, (c) => c + c);
  if (!/^[0-9a-fA-F]{6}$/.test(s)) return null;
  return '#' + s.toUpperCase();
}

export function isValidHex(input) {
  return normalizeHex(input) !== null;
}

function requireHex(input) {
  const hex = normalizeHex(input);
  if (hex === null) throw new TypeError(`Invalid hex color: ${String(input)}`);
  return hex;
}

function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgbToHex(r, g, b) {
  return (
    '#' +
    [r, g, b]
      .map((v) => Math.min(255, Math.max(0, Math.round(v))).toString(16).padStart(2, '0'))
      .join('')
      .toUpperCase()
  );
}

/* ---------- sRGB <-> OKLab / OKLCH ---------- */

const toLinear = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const fromLinear = (c) => (c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055);

function hexToOklch(hex) {
  const [r, g, b] = hexToRgb(hex).map((v) => toLinear(v / 255));
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const a = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const bb = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  const C = Math.hypot(a, bb);
  const h = C < 1e-4 ? 0 : ((Math.atan2(bb, a) * 180) / Math.PI + 360) % 360;
  return { L, C, h };
}

// Linear sRGB channels (unclamped) for an OKLCH color.
function oklchToLinear(L, C, h) {
  const hr = (h * Math.PI) / 180;
  const a = C * Math.cos(hr);
  const b = C * Math.sin(hr);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}

const inGamut = (rgb) => rgb.every((v) => v >= -GAMUT_EPS && v <= 1 + GAMUT_EPS);

// Lower chroma at fixed L and h until the color fits sRGB (no channel clipping).
function oklchToHex(L, C, h) {
  const Lc = Math.min(1, Math.max(0, L));
  let rgb = oklchToLinear(Lc, C, h);
  if (!inGamut(rgb)) {
    let lo = 0;
    let hi = C;
    for (let i = 0; i < 24; i++) {
      const mid = (lo + hi) / 2;
      if (inGamut(oklchToLinear(Lc, mid, h))) lo = mid;
      else hi = mid;
    }
    rgb = oklchToLinear(Lc, lo, h);
  }
  const [r, g, b] = rgb.map((v) => fromLinear(Math.min(1, Math.max(0, v))) * 255);
  return rgbToHex(r, g, b);
}

/* ---------- scales ---------- */

// Largest chroma that fits sRGB at this L and h.
function maxChroma(L, h) {
  let lo = 0;
  let hi = 0.4;
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2;
    if (inGamut(oklchToLinear(L, mid, h))) lo = mid;
    else hi = mid;
  }
  return lo;
}

// Lightness where the hue reaches its maximum sRGB chroma (coarse search, enough for the anchor).
function cuspLightness(h) {
  let bestL = 0.5;
  let bestC = -1;
  for (let L = 0.2; L <= 0.99; L += 0.005) {
    const c = maxChroma(L, h);
    if (c > bestC) {
      bestC = c;
      bestL = L;
    }
  }
  return bestL;
}

const lightTaper = (s) => 1 - (1 - EDGE_CHROMA_LIGHT) * s ** 1.4;
const darkTaper = (s) => 1 - (1 - EDGE_CHROMA_DARK) * s ** 1.4;

function anchorIndex({ L, C, h }) {
  const last = STEPS.length - 1;
  const mid = C < 1e-4 ? 0.5 : cuspLightness(h);
  const midL = REF_MID_BASE + REF_MID_CUSP * mid;
  let best = 0;
  let bestDist = Infinity;
  for (let i = 0; i <= last; i++) {
    let refL;
    let taper;
    if (i <= REF_MID_STEP) {
      const s = (REF_MID_STEP - i) / REF_MID_STEP;
      refL = midL + (L_MAX - midL) * s;
      taper = lightTaper(s);
    } else {
      const s = (i - REF_MID_STEP) / (last - REF_MID_STEP);
      refL = midL + (L_MIN - midL) * s;
      taper = darkTaper(s);
    }
    const refC = Math.min(C, maxChroma(refL, h)) * taper;
    const d = Math.hypot(refL - L, ANCHOR_CHROMA_WEIGHT * (refC - C));
    if (d < bestDist) {
      bestDist = d;
      best = i;
    }
  }
  return best;
}

// 0..1: how much of the yellow hue correction applies to this hue.
function yellowWeight(h) {
  const [a0, a1] = YELLOW_HUE_FADE_IN;
  const [b0, b1] = YELLOW_HUE_FADE_OUT;
  if (h <= a0 || h >= b1) return 0;
  if (h < a1) return (h - a0) / (a1 - a0);
  if (h > b0) return (b1 - h) / (b1 - b0);
  return 1;
}

export function nearestStep(hex) {
  return STEPS[anchorIndex(hexToOklch(requireHex(hex)))];
}

export function generateScale(hex) {
  const brand = requireHex(hex);
  const lch = hexToOklch(brand);
  const { L, C, h } = lch;
  const k = anchorIndex(lch);
  const last = STEPS.length - 1;
  const yw = C < 1e-4 ? 0 : yellowWeight(h);
  // Keep a visible lightness gap even when the anchor is next to an edge (e.g. #FFFF00).
  const topL = Math.max(L_MAX, Math.min(L_TOP, L + MIN_EDGE_GAP * k));
  const bottomL = Math.min(L_MIN, Math.max(L_BOTTOM, L - MIN_EDGE_GAP * (last - k)));
  const out = {};

  for (let i = 0; i <= last; i++) {
    if (i === k) {
      out[STEPS[i]] = brand;
      continue;
    }
    let stepL;
    let factor;
    let stepH;
    if (i < k) {
      const s = (k - i) / k; // 0 at anchor, 1 at step 50
      stepL = L + (topL - L) * s;
      factor = lightTaper(s);
      stepH = h + YELLOW_SHIFT_LIGHT * yw * s;
    } else {
      const s = (i - k) / (last - k); // 0 at anchor, 1 at step 950
      stepL = L + (bottomL - L) * s;
      factor = darkTaper(s);
      stepH = h + YELLOW_SHIFT_DARK * yw * s;
    }
    out[STEPS[i]] = oklchToHex(stepL, C * factor, (stepH + 360) % 360);
  }
  return out;
}

export function generateNeutral(hex) {
  const { C, h } = hexToOklch(requireHex(hex));
  const tinted = C >= 0.004; // greys, black and white have no usable hue
  const out = {};
  const last = STEPS.length - 1;
  for (let i = 0; i <= last; i++) {
    const t = i / last;
    const L = NEUTRAL_L_MAX - (NEUTRAL_L_MAX - NEUTRAL_L_MIN) * t;
    const chroma = tinted ? NEUTRAL_C_EDGE + (NEUTRAL_C_MID - NEUTRAL_C_EDGE) * Math.sin(Math.PI * t) : 0;
    out[STEPS[i]] = oklchToHex(L, chroma, h);
  }
  return out;
}

/* ---------- WCAG ---------- */

function relativeLuminance(hex) {
  const [r, g, b] = hexToRgb(hex).map((v) => toLinear(v / 255));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(fgHex, bgHex) {
  const a = relativeLuminance(requireHex(fgHex));
  const b = relativeLuminance(requireHex(bgHex));
  const ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
  return Math.round(ratio * 1e6) / 1e6;
}

export function wcagLevel(ratio, { large = false } = {}) {
  if (large) {
    if (ratio >= 4.5) return 'AAA';
    if (ratio >= 3) return 'AA';
    return 'Fail';
  }
  if (ratio >= 7) return 'AAA';
  if (ratio >= 4.5) return 'AA';
  if (ratio >= 3) return 'AA Large';
  return 'Fail';
}

export function pickOnColor(bgHex) {
  const bg = requireHex(bgHex);
  return contrastRatio('#FFFFFF', bg) >= contrastRatio('#111111', bg) ? '#FFFFFF' : '#111111';
}
