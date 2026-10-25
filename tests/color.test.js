import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeHex,
  isValidHex,
  generateScale,
  nearestStep,
  generateNeutral,
  contrastRatio,
  wcagLevel,
  pickOnColor,
} from '../public/color.js';

const KEYS = ['50', '100', '200', '300', '400', '500', '600', '700', '800', '900', '950'];
const HEX_RE = /^#[0-9A-F]{6}$/;
const SAMPLES = ['#4F46E5', '#FACC15', '#E11D48', '#0D9488', '#C2410C', '#7C3AED', '#2563EB', '#16A34A', '#808080', '#0B1020'];
const EDGES = ['#000000', '#FFFFFF', '#777777', '#FF0000', '#00FF00', '#0000FF', '#FFFF00'];
const YELLOWS = ['#FACC15', '#FFFF00', '#EAB308', '#FDE047', '#F59E0B'];

// Independent OKLab lightness and hue, used only to inspect results.
function oklab(hex) {
  const n = parseInt(hex.slice(1), 16);
  const lin = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const c = v / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  const [r, g, b] = lin;
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const a = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const bb = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  return { L, h: ((Math.atan2(bb, a) * 180) / Math.PI + 360) % 360 };
}
const oklabL = (hex) => oklab(hex).L;
const oklabHue = (hex) => oklab(hex).h;

test('normalizeHex handles 3-digit, no #, lowercase, whitespace', () => {
  assert.equal(normalizeHex('#4f46e5'), '#4F46E5');
  assert.equal(normalizeHex('4f46e5'), '#4F46E5');
  assert.equal(normalizeHex('#4F4'), '#44FF44');
  assert.equal(normalizeHex('abc'), '#AABBCC');
  assert.equal(normalizeHex('  #facc15 '), '#FACC15');
});

test('normalizeHex returns null for invalid input', () => {
  for (const bad of ['ZZ12', '#ZZ12', '', '#', '12345', '#1234567', '#12', null, undefined, 123, {}]) {
    assert.equal(normalizeHex(bad), null, String(bad));
  }
});

test('isValidHex mirrors normalizeHex', () => {
  assert.equal(isValidHex('#4F46E5'), true);
  assert.equal(isValidHex('fff'), true);
  assert.equal(isValidHex('ZZ12'), false);
  assert.equal(isValidHex(''), false);
});

test('contrastRatio reference values', () => {
  assert.equal(contrastRatio('#FFFFFF', '#000000'), 21);
  assert.equal(contrastRatio('#000000', '#FFFFFF'), 21);
  assert.equal(contrastRatio('#FFFFFF', '#FFFFFF'), 1);
  assert.equal(contrastRatio('#767676', '#FFFFFF').toFixed(2), '4.54');
  assert.equal(contrastRatio('#FFFFFF', '#767676').toFixed(2), '4.54');
});

test('wcagLevel thresholds for normal text', () => {
  assert.equal(wcagLevel(21), 'AAA');
  assert.equal(wcagLevel(7), 'AAA');
  assert.equal(wcagLevel(6.99), 'AA');
  assert.equal(wcagLevel(4.5), 'AA');
  assert.equal(wcagLevel(4.49), 'AA Large');
  assert.equal(wcagLevel(3), 'AA Large');
  assert.equal(wcagLevel(2.99), 'Fail');
  assert.equal(wcagLevel(1), 'Fail');
});

test('wcagLevel thresholds for large text', () => {
  assert.equal(wcagLevel(4.5, { large: true }), 'AAA');
  assert.equal(wcagLevel(7, { large: true }), 'AAA');
  assert.equal(wcagLevel(4.49, { large: true }), 'AA');
  assert.equal(wcagLevel(3, { large: true }), 'AA');
  assert.equal(wcagLevel(2.99, { large: true }), 'Fail');
  assert.equal(wcagLevel(4.5, { large: false }), 'AA');
});

test('pickOnColor chooses the more contrasting text color', () => {
  assert.equal(pickOnColor('#FACC15'), '#111111');
  assert.equal(pickOnColor('#4F46E5'), '#FFFFFF');
  assert.equal(pickOnColor('#FFFFFF'), '#111111');
  assert.equal(pickOnColor('#000000'), '#FFFFFF');
});

test('generateScale has exactly the keys 50..950', () => {
  for (const hex of SAMPLES) {
    assert.deepEqual(Object.keys(generateScale(hex)), KEYS, hex);
  }
});

test('generateScale keeps the user color unchanged at nearestStep', () => {
  for (const hex of [...SAMPLES, ...EDGES]) {
    const scale = generateScale(hex);
    const step = nearestStep(hex);
    assert.ok(KEYS.includes(String(step)), `${hex} step ${step}`);
    assert.equal(scale[step], hex, `${hex} at ${step}`);
  }
});

test('generateScale normalizes lowercase and short input', () => {
  const scale = generateScale('4f46e5');
  assert.equal(scale[nearestStep('#4f46e5')], '#4F46E5');
  assert.deepEqual(generateScale('#fff'), generateScale('#FFFFFF'));
});

test('generateScale values are valid hex', () => {
  for (const hex of [...SAMPLES, ...EDGES]) {
    for (const [k, v] of Object.entries(generateScale(hex))) {
      assert.match(v, HEX_RE, `${hex} ${k}`);
    }
  }
});

test('generateScale lightness decreases monotonically from 50 to 950', () => {
  for (const hex of [...SAMPLES, ...EDGES]) {
    const ls = KEYS.map((k) => oklabL(generateScale(hex)[k]));
    for (let i = 1; i < ls.length; i++) {
      assert.ok(ls[i] < ls[i - 1], `${hex}: step ${KEYS[i]} (${ls[i].toFixed(3)}) not darker than ${KEYS[i - 1]} (${ls[i - 1].toFixed(3)})`);
    }
  }
});

test('generateScale spacing is even on each side of the anchor', () => {
  for (const hex of [...SAMPLES, ...YELLOWS]) {
    const scale = generateScale(hex);
    const k = KEYS.indexOf(String(nearestStep(hex)));
    const ls = KEYS.map((key) => oklabL(scale[key]));
    const spread = (from, to) => {
      const gaps = [];
      for (let i = from; i < to; i++) gaps.push(ls[i] - ls[i + 1]);
      return gaps.length ? Math.max(...gaps) - Math.min(...gaps) : 0;
    };
    assert.ok(spread(0, k) < 0.01, `${hex} lighter side`);
    assert.ok(spread(k, 10) < 0.01, `${hex} darker side`);
  }
});

test('generateScale has light 50 and dark 950', () => {
  for (const hex of SAMPLES) {
    const s = generateScale(hex);
    assert.ok(oklabL(s[50]) > 0.9, `${hex} 50`);
    assert.ok(oklabL(s[950]) < 0.3, `${hex} 950`);
  }
});

test('generateScale tapers chroma at the extremes for a vivid color', () => {
  const s = generateScale('#4F46E5');
  const chroma = (hex) => {
    const n = parseInt(hex.slice(1), 16);
    const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    return Math.max(r, g, b) - Math.min(r, g, b);
  };
  assert.ok(chroma(s[50]) < chroma(s[600]));
  assert.ok(chroma(s[950]) < chroma(s[600]));
});

test('edge colors produce no NaN and valid output', () => {
  for (const hex of ['#000000', '#FFFFFF', '#808080', '#FACC15', '#4F46E5']) {
    for (const fn of [generateScale, generateNeutral]) {
      for (const [k, v] of Object.entries(fn(hex))) {
        assert.match(v, HEX_RE, `${fn.name}(${hex}) ${k}`);
      }
    }
  }
  assert.equal(nearestStep('#000000'), 950);
  assert.equal(nearestStep('#FFFFFF'), 50);
});

test('generateScale of a grey stays grey', () => {
  for (const v of Object.values(generateScale('#808080'))) {
    const n = parseInt(v.slice(1), 16);
    assert.equal((n >> 16) & 255, (n >> 8) & 255);
    assert.equal((n >> 8) & 255, n & 255);
  }
});

test('generateNeutral: 11 keys, near-white to near-black, monotonic', () => {
  for (const hex of [...SAMPLES, ...EDGES]) {
    const n = generateNeutral(hex);
    assert.deepEqual(Object.keys(n), KEYS, hex);
    const ls = KEYS.map((k) => oklabL(n[k]));
    assert.ok(ls[0] > 0.96, `${hex} 50`);
    assert.ok(ls[10] < 0.2, `${hex} 950`);
    for (let i = 1; i < ls.length; i++) assert.ok(ls[i] < ls[i - 1], `${hex} step ${KEYS[i]}`);
    for (const v of Object.values(n)) assert.match(v, HEX_RE);
  }
});

test('generateNeutral is low chroma and carries the brand hue', () => {
  const n = generateNeutral('#4F46E5'); // blue-violet brand: blue channel dominates
  for (const k of ['100', '300', '500', '700', '900']) {
    const v = parseInt(n[k].slice(1), 16);
    const [r, g, b] = [(v >> 16) & 255, (v >> 8) & 255, v & 255];
    assert.ok(Math.max(r, g, b) - Math.min(r, g, b) < 24, `${k} too saturated`);
    assert.ok(b >= g, `${k} should lean to brand hue`);
  }
  const grey = generateNeutral('#000000');
  for (const v of Object.values(grey)) {
    const n2 = parseInt(v.slice(1), 16);
    assert.equal((n2 >> 16) & 255, n2 & 255);
  }
});

test('invalid hex passed to math functions throws instead of returning NaN', () => {
  assert.throws(() => generateScale('ZZ12'), TypeError);
  assert.throws(() => contrastRatio('#FFF', 'nope'), TypeError);
});

test('yellow brand colors land in the middle of the scale, not at 50/100', () => {
  assert.equal(nearestStep('#FACC15'), 400);
  assert.equal(nearestStep('#EAB308'), 500);
  assert.equal(nearestStep('#FDE047'), 300);
  assert.ok([200, 300].includes(nearestStep('#FFFF00')), `#FFFF00 at ${nearestStep('#FFFF00')}`);
  assert.equal(nearestStep('#F59E0B'), 500);
});

test('anchor of common non-yellow brands stays where it was', () => {
  for (const hex of ['#4F46E5', '#7C3AED', '#2563EB', '#E11D48', '#16A34A']) {
    assert.equal(nearestStep(hex), 600, hex);
  }
});

test('yellow scale keeps a visible gap between 50 and the anchor', () => {
  for (const hex of YELLOWS) {
    const s = generateScale(hex);
    const k = KEYS.indexOf(String(nearestStep(hex)));
    const gap = (oklabL(s[50]) - oklabL(hex)) / k;
    assert.ok(gap >= 0.01, `${hex}: ${gap.toFixed(4)} per step`);
  }
});

test('dark yellow steps shift towards amber, not olive', () => {
  for (const hex of ['#FACC15', '#EAB308', '#FFFF00']) {
    const s = generateScale(hex);
    const h = oklabHue(hex);
    for (const k of ['700', '800', '900']) {
      assert.ok(oklabHue(s[k]) < h - 10, `${hex} ${k}: hue ${oklabHue(s[k]).toFixed(1)} vs ${h.toFixed(1)}`);
      const n = parseInt(s[k].slice(1), 16);
      const [r, g] = [(n >> 16) & 255, (n >> 8) & 255];
      assert.ok(r >= g * 1.3, `${hex} ${k} ${s[k]} looks olive`);
    }
  }
});

test('non-yellow hues keep their hue on the dark side', () => {
  for (const hex of ['#4F46E5', '#E11D48', '#0D9488', '#16A34A']) {
    const s = generateScale(hex);
    const h = oklabHue(hex);
    for (const k of ['800', '900']) {
      const d = Math.abs(((oklabHue(s[k]) - h + 540) % 360) - 180);
      assert.ok(d < 3, `${hex} ${k}: hue drift ${d.toFixed(2)}`);
    }
  }
});
