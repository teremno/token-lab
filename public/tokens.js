// tokens.js - семантичні токени та експорт (CSS / Tailwind v4 / DTCG tokens.json).
// Імпортує математику кольору з color.js. Назовні тільки hex (#RRGGBB, верхній регістр).

import {
  generateScale,
  generateNeutral,
  nearestStep,
  contrastRatio,
  wcagLevel,
  pickOnColor,
} from './color.js';

export const STEPS = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950];
export const SEMANTIC_ORDER = [
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
export const GROUPS = ['brand', 'neutral', 'danger', 'success'];

// Фіксовані насінини для статусних шкал: 600 крок лишається близьким до цих кольорів.
const DANGER_SEED = '#DC2626';
const SUCCESS_SEED = '#16A34A';
const WHITE = '#FFFFFF';

const MIN_TEXT = 4.5; // мінімум для приглушеного тексту
const MIN_UI = 3; // мінімум для акценту в темній темі

function clampIndex(i) {
  return Math.max(0, Math.min(STEPS.length - 1, i));
}

function stepAt(step, delta) {
  return STEPS[clampIndex(STEPS.indexOf(step) + delta)];
}

function tok(group, step, scales) {
  return { ref: `${group}-${step}`, hex: scales[group][step] };
}

// Йдемо кроками від startStep у напрямку dir (+1 темніше, -1 світліше),
// поки контраст з усіма bgs не досягне min. Якщо не досягли - повертаємо останній крок.
function firstPassingStep(scale, startStep, dir, bgs, min) {
  let idx = STEPS.indexOf(startStep);
  while (true) {
    const hex = scale[STEPS[idx]];
    if (bgs.every((bg) => contrastRatio(hex, bg) >= min)) return STEPS[idx];
    const next = idx + dir;
    if (next < 0 || next > STEPS.length - 1) return STEPS[idx];
    idx = next;
  }
}

function onAccentToken(accentHex, neutral) {
  const pick = pickOnColor(accentHex);
  if (pick.toUpperCase() === WHITE) return { ref: 'white', hex: WHITE };
  return { ref: 'neutral-950', hex: neutral[950] };
}

export function buildTokens(brandHex) {
  const brand = generateScale(brandHex);
  const neutral = generateNeutral(brandHex);
  const danger = generateScale(DANGER_SEED);
  const success = generateScale(SUCCESS_SEED);
  const scales = { brand, neutral, danger, success };

  const userStep = nearestStep(brandHex);

  // ---- Світла тема ----
  const lightBg = neutral[50];
  const mutedStepLight = firstPassingStep(neutral, 600, +1, [lightBg, WHITE], MIN_TEXT);
  const lightAccentStep = userStep;
  const lightAccentHoverStep = stepAt(lightAccentStep, +1);
  const lightAccent = tok('brand', lightAccentStep, scales);

  const light = {
    bg: tok('neutral', 50, scales),
    surface: { ref: 'white', hex: WHITE },
    text: tok('neutral', 950, scales),
    'text-muted': tok('neutral', mutedStepLight, scales),
    border: tok('neutral', 200, scales),
    accent: lightAccent,
    'accent-hover': tok('brand', lightAccentHoverStep, scales),
    'on-accent': onAccentToken(lightAccent.hex, neutral),
    danger: tok('danger', 600, scales),
    success: tok('success', 600, scales),
  };

  // ---- Темна тема ----
  const darkBg = neutral[950];
  const darkSurface = neutral[900];
  const mutedStepDark = firstPassingStep(neutral, 400, -1, [darkBg, darkSurface], MIN_TEXT);
  // Світліший крок, ніж у світлій темі: щонайменше на один крок світліше і не темніше за 400.
  const darkStart = STEPS[clampIndex(Math.min(STEPS.indexOf(400), STEPS.indexOf(userStep) - 1))];
  const darkAccentStep = firstPassingStep(brand, darkStart, -1, [darkBg], MIN_UI);
  // Hover ще світліший; якщо світліше нікуди (крок 50) - на крок темніше.
  const darkAccentHoverStep = darkAccentStep === STEPS[0] ? stepAt(darkAccentStep, +1) : stepAt(darkAccentStep, -1);
  const darkAccent = tok('brand', darkAccentStep, scales);

  const dark = {
    bg: tok('neutral', 950, scales),
    surface: tok('neutral', 900, scales),
    text: tok('neutral', 50, scales),
    'text-muted': tok('neutral', mutedStepDark, scales),
    border: tok('neutral', 800, scales),
    accent: darkAccent,
    'accent-hover': tok('brand', darkAccentHoverStep, scales),
    'on-accent': onAccentToken(darkAccent.hex, neutral),
    danger: tok('danger', 400, scales),
    success: tok('success', 400, scales),
  };

  return {
    primitives: { brand, neutral, danger, success },
    light,
    dark,
  };
}

// ---------- Експорт ----------

function cssVarForRef(ref) {
  return `var(--${ref})`;
}

function primitiveLines(tokens, prefix, indent) {
  const lines = [];
  for (const group of GROUPS) {
    for (const step of STEPS) {
      lines.push(`${indent}--${prefix}${group}-${step}: ${tokens.primitives[group][step]};`);
    }
  }
  return lines;
}

function semanticBlock(selector, themeTokens) {
  const lines = [`${selector} {`];
  for (const name of SEMANTIC_ORDER) {
    const t = themeTokens[name];
    lines.push(`  --${name}: ${cssVarForRef(t.ref)}; /* ${t.hex} */`);
  }
  lines.push('}');
  return lines.join('\n');
}

export function toCSS(tokens) {
  const root = [':root {', ...primitiveLines(tokens, '', '  '), `  --white: ${WHITE};`, '}'].join('\n');
  return [
    root,
    semanticBlock('[data-theme="light"]', tokens.light),
    semanticBlock('[data-theme="dark"]', tokens.dark),
  ].join('\n\n') + '\n';
}

export function toTailwind(tokens) {
  const theme = ['@theme {', ...primitiveLines(tokens, 'color-', '  ')];
  theme.push('');
  theme.push('  /* Семантичні аліаси (світла тема) */');
  for (const name of SEMANTIC_ORDER) {
    theme.push(`  --color-${name}: ${tokens.light[name].hex};`);
  }
  theme.push('}');

  const darkLines = [
    '/* Темна тема: перевизначте семантичні аліаси в блоці .dark або [data-theme="dark"].',
    '   Утиліти Tailwind (bg-bg, text-text, bg-accent ...) читають ці змінні, тому',
    '   достатньо підмінити їх значення. */',
    '.dark,',
    '[data-theme="dark"] {',
  ];
  for (const name of SEMANTIC_ORDER) {
    darkLines.push(`  --color-${name}: ${tokens.dark[name].hex};`);
  }
  darkLines.push('}');

  return theme.join('\n') + '\n\n' + darkLines.join('\n') + '\n';
}

function refToDtcg(ref) {
  if (ref === 'white') return '{primitives.white}';
  const i = ref.lastIndexOf('-');
  return `{primitives.${ref.slice(0, i)}.${ref.slice(i + 1)}}`;
}

export function toTokensJson(tokens) {
  const primitives = {};
  for (const group of GROUPS) {
    primitives[group] = {};
    for (const step of STEPS) {
      primitives[group][step] = { $type: 'color', $value: tokens.primitives[group][step] };
    }
  }
  primitives.white = { $type: 'color', $value: WHITE };

  const theme = (themeTokens) => {
    const out = {};
    for (const name of SEMANTIC_ORDER) {
      out[name] = { $type: 'color', $value: refToDtcg(themeTokens[name].ref) };
    }
    return out;
  };

  return JSON.stringify(
    { primitives, light: theme(tokens.light), dark: theme(tokens.dark) },
    null,
    2,
  );
}

export function previewChecks(tokens, theme) {
  const t = tokens[theme];
  const make = (id, label, fgName, bgName) => {
    const fg = t[fgName].hex;
    const bg = t[bgName].hex;
    const ratio = Math.round(contrastRatio(fg, bg) * 100) / 100;
    return { id, label, fg, bg, ratio, level: wcagLevel(ratio) };
  };
  return [
    make('button', 'Кнопка', 'on-accent', 'accent'),
    make('card', 'Картка', 'text', 'surface'),
    make('input', 'Інпут', 'text', 'bg'),
  ];
}
