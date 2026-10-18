// app.js - UI Token Lab: стан -> рендер, події через делегування.
// Уся математика кольору - у color.js і tokens.js.

import {
  normalizeHex,
  generateScale,
  generateNeutral,
  nearestStep,
} from '/color.js';
import {
  buildTokens,
  toCSS,
  toTailwind,
  toTokensJson,
  previewChecks,
} from '/tokens.js';

const DEFAULT_HEX = '#4F46E5';
const STEPS = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950];
const PRESETS = [
  { name: 'Індиго', hex: '#4F46E5' },
  { name: 'Жовтий', hex: '#FACC15' },
  { name: 'Бірюза', hex: '#0D9488' },
  { name: 'Теракот', hex: '#C2410C' },
];
const TABS = ['css', 'tailwind', 'json'];
const TOKEN_NAMES_ORDER = [
  'bg', 'surface', 'text', 'text-muted', 'border',
  'accent', 'accent-hover', 'on-accent', 'danger', 'success',
];
const CHECK_NAMES = { button: 'Кнопка', card: 'Картка', input: 'Інпут' };
const THEMES = [
  { id: 'light', title: 'Світла тема' },
  { id: 'dark', title: 'Темна тема' },
];
const INPUT_DEBOUNCE_MS = 250;
const TOAST_MS = 2200;

const $ = (sel) => document.querySelector(sel);

const els = {
  field: $('#hex-field'),
  input: $('#hex-input'),
  picker: $('#hex-picker'),
  pickerChip: $('#picker-chip'),
  hint: $('#hex-hint'),
  error: $('#hex-error'),
  presets: $('#presets'),
  sumTile: $('#sum-tile'),
  sumHex: $('#sum-hex'),
  sumOn: $('#sum-on'),
  scaleOut: $('#scale-out'),
  tokensBody: $('#tokens-body'),
  pvOut: $('#pv-out'),
  tabs: $('#export-tabs'),
  toast: $('#toast'),
  shareBtn: $('#share-btn'),
  shareBar: $('#share-bar'),
  shareLink: $('#share-link'),
};

const state = {
  hex: DEFAULT_HEX,
  data: null,
  tab: 'css',
  exports: { css: '', tailwind: '', json: '' },
  sharing: false,
};

// ---------- Утиліти ----------

function esc(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function debounce(fn, ms) {
  let timer = 0;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}

let toastTimer = 0;
function showToast(message) {
  clearTimeout(toastTimer);
  els.toast.classList.remove('is-visible');
  els.toast.textContent = '';
  // Скидання тексту перед новим повідомленням, щоб повтор теж озвучувався.
  setTimeout(() => {
    els.toast.textContent = message;
    els.toast.classList.add('is-visible');
    toastTimer = setTimeout(() => {
      els.toast.classList.remove('is-visible');
    }, TOAST_MS);
  }, 30);
}

async function copyText(text) {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // переходимо до запасного варіанту
  }
  try {
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.top = '0';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    area.setSelectionRange(0, text.length);
    const ok = document.execCommand('copy');
    area.remove();
    return ok;
  } catch {
    return false;
  }
}

async function copyWithToast(text, okMessage = 'Скопійовано') {
  const ok = await copyText(text);
  showToast(ok ? okMessage : 'Не вдалося скопіювати');
  return ok;
}

// ---------- Дані ----------

function compute(hex) {
  const tokens = buildTokens(hex);
  return {
    hex,
    tokens,
    scale: generateScale(hex),
    neutral: generateNeutral(hex),
    step: nearestStep(hex),
  };
}

// Застосовує валідний hex. Повертає true, якщо вдалося.
function applyHex(rawHex, { syncInput = true } = {}) {
  const hex = normalizeHex(rawHex);
  if (!hex) return false;
  let data;
  try {
    data = compute(hex);
  } catch (err) {
    console.error('Не вдалося порахувати палітру', err);
    return false;
  }
  state.hex = hex;
  state.data = data;
  setError('');
  if (syncInput) els.input.value = hex.slice(1);
  render();
  return true;
}

// ---------- Помилка поля ----------

function setError(message) {
  const invalid = Boolean(message);
  els.field.classList.toggle('is-invalid', invalid);
  els.input.setAttribute('aria-invalid', invalid ? 'true' : 'false');
  els.input.setAttribute('aria-describedby', invalid ? 'hex-error' : 'hex-hint');
  els.error.hidden = !invalid;
  els.error.textContent = message;
}

function validateInput({ commit = false } = {}) {
  const value = els.input.value.trim();
  const hex = normalizeHex(value);
  if (!hex) {
    setError('Невалідний hex. Приклад: #4F46E5');
    return;
  }
  if (hex !== state.hex) {
    applyHex(hex, { syncInput: false });
  } else {
    setError('');
  }
  if (commit) els.input.value = hex.slice(1);
}

// ---------- Рендер ----------

function render() {
  const d = state.data;
  if (!d) return;
  renderControls(d);
  renderSummary(d);
  renderScale(d);
  renderTokens(d);
  renderPreview(d);
  renderExport(d);
}

function renderControls(d) {
  els.picker.value = d.hex.toLowerCase();
  els.pickerChip.style.setProperty('--c', d.hex);
  els.presets.querySelectorAll('[data-preset]').forEach((btn) => {
    btn.setAttribute('aria-pressed', String(btn.dataset.preset === d.hex));
  });
}

function chip(hex) {
  return `<span class="chip" style="--c:${esc(hex)}" aria-hidden="true"></span>`;
}

function renderSummary(d) {
  const tileHex = d.scale[d.step];
  els.sumTile.innerHTML = `${chip(tileHex)}<span>brand-${esc(d.step)}</span>`;
  els.sumHex.textContent = d.hex;
  const on = d.tokens.light['on-accent'];
  els.sumOn.innerHTML = `${chip(on.hex)}<span>${esc(on.ref)} ${esc(on.hex)}</span>`;
}

function swatchRow(title, scale, userStep) {
  const items = STEPS.map((step) => {
    const hex = scale[step];
    const mine = userStep === step;
    return `<li><button type="button" class="swatch${mine ? ' is-user' : ''}" data-action="copy-hex" data-hex="${esc(hex)}" aria-label="${esc(title)} ${step}, ${esc(hex)}${mine ? ', твій колір' : ''}. Копіювати hex">
      <span class="swatch__chip" style="--c:${esc(hex)}"></span>
      <span class="swatch__step">${step}</span>
      <span class="swatch__hex">${esc(hex)}</span>
      <span class="swatch__tag">${mine ? 'ТВІЙ' : ''}</span>
    </button></li>`;
  }).join('');
  return `<div class="scale-row">
    <h3 class="scale-row__title">${esc(title)}</h3>
    <ul class="scale-grid">${items}</ul>
  </div>`;
}

function renderScale(d) {
  els.scaleOut.innerHTML =
    swatchRow('Brand', d.scale, d.step) + swatchRow('Neutral', d.neutral, null);
}

function tokenCell(t) {
  return `<td><div class="tok-cell">
    <span class="tok-cell__ref">${chip(t.hex)}<span>${esc(t.ref)}</span></span>
    <span class="tok-cell__hex">${esc(t.hex)}</span>
  </div></td>`;
}

function renderTokens(d) {
  const { light, dark } = d.tokens;
  const names = TOKEN_NAMES_ORDER.filter((n) => light[n] && dark[n]);
  els.tokensBody.innerHTML = names
    .map((n) => `<tr><th scope="row">${esc(n)}</th>${tokenCell(light[n])}${tokenCell(dark[n])}</tr>`)
    .join('');
}

function levelClass(level) {
  if (level === 'AAA' || level === 'AA') return 'badge--ok';
  if (level === 'AA Large') return 'badge--warn';
  return 'badge--fail';
}

function previewCard(theme, tokens) {
  const t = tokens[theme.id];
  const vars = Object.keys(t)
    .map((name) => `--t-${name}:${esc(t[name].hex)}`)
    .join(';');
  const checks = previewChecks(tokens, theme.id)
    .map((c) => `<li class="checks__item">
      <span class="checks__name">${esc(CHECK_NAMES[c.id] || c.label)}</span>
      <span class="checks__ratio">${esc(c.ratio.toFixed(2))}:1</span>
      <span class="badge ${levelClass(c.level)}">${esc(c.level)}</span>
    </li>`)
    .join('');
  const uid = `pv-${theme.id}`;
  return `<article class="pv" aria-labelledby="${uid}-h">
    <h3 class="pv__head" id="${uid}-h">${esc(theme.title)}</h3>
    <div class="pv__stage" style="${vars}">
      <div class="pv__card">
        <p class="pv__title">Картка проєкту</p>
        <p class="pv__muted">Приглушений текст на поверхні картки.</p>
        <label class="pv__muted" for="${uid}-in">Електронна пошта</label>
        <input class="pv__input" id="${uid}-in" type="email" placeholder="name@example.com" autocomplete="off">
        <div class="pv__status">
          <span class="pv__status-danger">Помилка</span>
          <span class="pv__status-success">Успіх</span>
        </div>
        <button type="button" class="pv__btn">Підтвердити</button>
      </div>
    </div>
    <ul class="checks" aria-label="Контраст, ${esc(theme.title.toLowerCase())}">${checks}</ul>
  </article>`;
}

function renderPreview(d) {
  els.pvOut.innerHTML = THEMES.map((th) => previewCard(th, d.tokens)).join('');
}

function renderExport(d) {
  state.exports = {
    css: toCSS(d.tokens),
    tailwind: toTailwind(d.tokens),
    json: toTokensJson(d.tokens),
  };
  for (const tab of TABS) {
    $(`#code-${tab}`).textContent = state.exports[tab];
  }
}

function renderPresets() {
  els.presets.innerHTML = PRESETS.map((p) => `<button type="button" class="preset" data-action="preset" data-preset="${esc(p.hex)}" aria-pressed="false">
    <span class="preset__dot" style="--c:${esc(p.hex)}" aria-hidden="true"></span>
    <span class="preset__text"><span class="preset__name">${esc(p.name)}</span><span class="preset__hex">${esc(p.hex)}</span></span>
  </button>`).join('');
}

// ---------- Вкладки експорту ----------

function selectTab(tab, { focus = false } = {}) {
  if (!TABS.includes(tab)) return;
  state.tab = tab;
  for (const id of TABS) {
    const btn = $(`#tab-${id}`);
    const panel = $(`#panel-${id}`);
    const active = id === tab;
    btn.setAttribute('aria-selected', String(active));
    btn.tabIndex = active ? 0 : -1;
    panel.hidden = !active;
    if (active && focus) btn.focus();
  }
}

function onTabKeydown(event) {
  const current = TABS.indexOf(state.tab);
  let next = -1;
  switch (event.key) {
    case 'ArrowRight': next = (current + 1) % TABS.length; break;
    case 'ArrowLeft': next = (current - 1 + TABS.length) % TABS.length; break;
    case 'Home': next = 0; break;
    case 'End': next = TABS.length - 1; break;
    default: return;
  }
  event.preventDefault();
  selectTab(TABS[next], { focus: true });
}

// ---------- Поділитися ----------

async function share() {
  if (state.sharing) return;
  state.sharing = true;
  els.shareBtn.disabled = true;
  try {
    const res = await fetch('/api/palettes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hex: state.hex }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (!data || typeof data.url !== 'string' || !data.url.startsWith('/p/')) {
      throw new Error('Неочікувана відповідь');
    }
    const link = location.origin + data.url;
    els.shareLink.href = link;
    els.shareLink.textContent = link;
    els.shareBar.hidden = false;
    const copied = await copyText(link);
    showToast(copied ? 'Посилання скопійовано' : 'Посилання створено');
  } catch (err) {
    console.error('Не вдалося зберегти палітру', err);
    showToast('Не вдалося зберегти');
  } finally {
    state.sharing = false;
    els.shareBtn.disabled = false;
  }
}

async function loadShared(id) {
  try {
    const res = await fetch(`/api/palettes/${encodeURIComponent(id)}`);
    if (res.status === 404) {
      showToast('Палітру не знайдено');
      return;
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (!applyHex(data && data.hex)) throw new Error('Невалідний hex у відповіді');
  } catch (err) {
    console.error('Не вдалося завантажити палітру', err);
    showToast('Не вдалося завантажити палітру');
  }
}

// ---------- Події ----------

document.addEventListener('click', (event) => {
  const target = event.target.closest('[data-action], [data-tab]');
  if (!target) return;
  if (target.dataset.tab) {
    selectTab(target.dataset.tab);
    return;
  }
  switch (target.dataset.action) {
    case 'copy-hex':
      copyWithToast(target.dataset.hex);
      break;
    case 'preset':
      applyHex(target.dataset.preset);
      break;
    case 'copy-export':
      copyWithToast(state.exports[state.tab]);
      break;
    case 'share':
      share();
      break;
    default:
      break;
  }
});

els.tabs.addEventListener('keydown', onTabKeydown);

const debouncedValidate = debounce(() => validateInput(), INPUT_DEBOUNCE_MS);
els.input.addEventListener('input', debouncedValidate);
els.input.addEventListener('blur', () => validateInput({ commit: true }));
els.input.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') validateInput({ commit: true });
});

els.picker.addEventListener('input', () => {
  applyHex(els.picker.value);
});

// ---------- Старт ----------

renderPresets();
selectTab(state.tab);
applyHex(DEFAULT_HEX);

const match = location.pathname.match(/^\/p\/([0-9A-Za-z]{6})$/);
if (match) loadShared(match[1]);
