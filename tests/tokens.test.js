import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildTokens,
  toCSS,
  toTailwind,
  toTokensJson,
  previewChecks,
} from '../public/tokens.js';
import { isValidHex, nearestStep, contrastRatio } from '../public/color.js';

const TOKEN_NAMES = [
  'bg',
  'surface',
  'text',
  'text-muted',
  'border',
  'accent',
  'accent-hover',
  'on-accent',
  'danger',
  'success',
];
const STEPS = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950];
const COLORS = ['#4F46E5', '#FACC15'];

for (const brand of COLORS) {
  test(`${brand}: усі 10 токенів у обох темах з валідним hex`, () => {
    const t = buildTokens(brand);
    for (const theme of ['light', 'dark']) {
      for (const name of TOKEN_NAMES) {
        const tk = t[theme][name];
        assert.ok(tk, `${theme}.${name} відсутній`);
        assert.equal(typeof tk.ref, 'string');
        assert.ok(isValidHex(tk.hex), `${theme}.${name} hex ${tk.hex}`);
        assert.match(tk.hex, /^#[0-9A-F]{6}$/);
      }
      assert.equal(Object.keys(t[theme]).length, 10);
    }
  });

  test(`${brand}: примітиви мають 4 шкали по 11 кроків`, () => {
    const t = buildTokens(brand);
    for (const group of ['brand', 'neutral', 'danger', 'success']) {
      for (const step of STEPS) {
        assert.ok(isValidHex(t.primitives[group][step]), `${group}-${step}`);
      }
    }
  });

  test(`${brand}: колір користувача стоїть без змін як light accent`, () => {
    const t = buildTokens(brand);
    const step = nearestStep(brand);
    assert.equal(t.light.accent.ref, `brand-${step}`);
    assert.equal(t.light.accent.hex, t.primitives.brand[step]);
    assert.equal(t.light.accent.hex, brand);
  });

  test(`${brand}: ref кожного токена збігається з hex примітива`, () => {
    const t = buildTokens(brand);
    for (const theme of ['light', 'dark']) {
      for (const name of TOKEN_NAMES) {
        const { ref, hex } = t[theme][name];
        if (ref === 'white') {
          assert.equal(hex, '#FFFFFF');
          continue;
        }
        const i = ref.lastIndexOf('-');
        const group = ref.slice(0, i);
        const step = ref.slice(i + 1);
        assert.equal(t.primitives[group][step], hex, `${theme}.${name} -> ${ref}`);
      }
    }
  });

  test(`${brand}: text-muted проходить 4.5:1, dark accent 3:1`, () => {
    const t = buildTokens(brand);
    assert.ok(contrastRatio(t.light['text-muted'].hex, t.light.bg.hex) >= 4.5);
    assert.ok(contrastRatio(t.dark['text-muted'].hex, t.dark.bg.hex) >= 4.5);
    assert.ok(contrastRatio(t.dark.accent.hex, t.dark.bg.hex) >= 3);
  });

  test(`${brand}: previewChecks дає 3 записи, текст на surface/bg не Fail`, () => {
    const t = buildTokens(brand);
    for (const theme of ['light', 'dark']) {
      const checks = previewChecks(t, theme);
      assert.equal(checks.length, 3);
      assert.deepEqual(
        checks.map((c) => c.id),
        ['button', 'card', 'input'],
      );
      assert.deepEqual(
        checks.map((c) => c.label),
        ['Кнопка', 'Картка', 'Інпут'],
      );
      for (const c of checks) {
        assert.ok(isValidHex(c.fg) && isValidHex(c.bg));
        assert.equal(typeof c.ratio, 'number');
        assert.equal(c.ratio, Math.round(c.ratio * 100) / 100);
        assert.ok(['AAA', 'AA', 'AA Large', 'Fail'].includes(c.level));
      }
      const card = checks.find((c) => c.id === 'card');
      const input = checks.find((c) => c.id === 'input');
      assert.notEqual(card.level, 'Fail', `${theme} card`);
      assert.notEqual(input.level, 'Fail', `${theme} input`);
    }
  });

  test(`${brand}: toCSS містить обидві теми, --accent і примітиви`, () => {
    const css = toCSS(buildTokens(brand));
    assert.ok(css.includes(':root'));
    assert.ok(css.includes('[data-theme="light"]'));
    assert.ok(css.includes('[data-theme="dark"]'));
    assert.ok(css.includes('--accent:'));
    assert.ok(css.includes('--brand-50:'));
    assert.ok(css.includes('--neutral-950:'));
    assert.ok(css.includes('--danger-600:'));
    assert.ok(css.includes('--success-600:'));
    assert.match(css, /--accent: var\(--brand-\d+\)/);
  });

  test(`${brand}: toTailwind містить @theme та --color-*`, () => {
    const tw = toTailwind(buildTokens(brand));
    assert.ok(tw.includes('@theme'));
    assert.ok(tw.includes('--color-brand-50:'));
    assert.ok(tw.includes('--color-bg:'));
    assert.ok(tw.includes('--color-accent:'));
    assert.ok(tw.includes('[data-theme="dark"]'));
  });

  test(`${brand}: toTokensJson валідний JSON, посилання резолвяться`, () => {
    const t = buildTokens(brand);
    const json = JSON.parse(toTokensJson(t));
    assert.deepEqual(Object.keys(json), ['primitives', 'light', 'dark']);
    for (const group of ['brand', 'neutral', 'danger', 'success']) {
      for (const step of STEPS) {
        const node = json.primitives[group][step];
        assert.equal(node.$type, 'color');
        assert.equal(node.$value, t.primitives[group][step]);
      }
    }
    assert.equal(json.primitives.white.$value, '#FFFFFF');

    for (const theme of ['light', 'dark']) {
      for (const name of TOKEN_NAMES) {
        const node = json[theme][name];
        assert.equal(node.$type, 'color');
        const m = /^\{(.+)\}$/.exec(node.$value);
        assert.ok(m, `${theme}.${name} не посилання: ${node.$value}`);
        const target = m[1].split('.').reduce((o, k) => o?.[k], json);
        assert.ok(target, `не резолвиться: ${node.$value}`);
        assert.ok(isValidHex(target.$value));
        assert.equal(target.$value, t[theme][name].hex);
      }
    }
  });
}

test('#FACC15: on-accent у світлій темі темний', () => {
  const t = buildTokens('#FACC15');
  const onAccent = t.light['on-accent'];
  assert.notEqual(onAccent.hex, '#FFFFFF');
  assert.notEqual(onAccent.ref, 'white');
  assert.ok(contrastRatio(onAccent.hex, t.light.accent.hex) >= 4.5);
});

test('#4F46E5: on-accent у світлій темі білий', () => {
  const t = buildTokens('#4F46E5');
  assert.equal(t.light['on-accent'].ref, 'white');
  assert.equal(t.light['on-accent'].hex, '#FFFFFF');
});

test('toTokensJson: білий посилається на primitives.white', () => {
  const json = JSON.parse(toTokensJson(buildTokens('#4F46E5')));
  assert.equal(json.light.surface.$value, '{primitives.white}');
});
