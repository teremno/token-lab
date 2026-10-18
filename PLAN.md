# PLAN.md - Token Lab

## Мета
Побудувати Token Lab за воркбуком UX Hero (ефір #3): hex -> шкала 50-950 -> семантичні токени (світла/темна) -> контраст WCAG -> експорт (CSS, Tailwind v4, tokens.json DTCG) -> «Поділитися» (/p/abc123, Cloudflare Pages Functions + D1). Джерела: PDF-воркбук, сторінка uxhero.design/webinar/token-lab. Відео - транскрипт недоступний, воркбук його повністю відтворює.

## 5 кроків (з воркбука)
1. Каркас: структура, .gitignore, конфіги.
2. color.js + тести.
3. Екран (index.html/styles.css/app.js) + tokens.js.
4. Бекенд «Поділитися» на D1.
5. Деплой на Cloudflare Pages + D1 (потребує акаунтів користувача - НЕ виконується агентами без «ок»).

## Ролі та володіння файлами (жоден файл не має двох власників)
| Роль | Модель | Файли |
|---|---|---|
| Color Engineer | sonnet | `public/color.js`, `tests/color.test.js` |
| Tokens Engineer | sonnet | `public/tokens.js`, `tests/tokens.test.js` |
| Backend Engineer | haiku | `functions/**`, `schema.sql`, `wrangler.toml`, `tests/api.test.js`, `package.json` |
| Frontend Engineer | sonnet | `public/index.html`, `public/styles.css`, `public/app.js` |
| QA/Review | sonnet | read-only + звіт; без правок без «ок» оркестратора |
| Orchestrator (я) | - | CLAUDE.md, PLAN.md, інтеграція, git, фінальна перевірка |

Хвилі: [Color | Tokens | Backend] паралельно -> [Frontend] -> [QA] -> виправлення -> фініш.

## Контракти модулів (ES modules, тільки hex назовні, hex = `#RRGGBB` верхній регістр)

### public/color.js
- `normalizeHex(input) -> '#RRGGBB' | null` (приймає `4f46e5`, `#4f46e5`, `#4F4`; trim; інакше null)
- `isValidHex(input) -> boolean`
- `generateScale(hex) -> { 50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950 }` (значення hex). Колір користувача лишається БЕЗ змін на найближчому кроці, сусідні кроки рівномірні по світлості, усе в sRGB.
- `nearestStep(hex) -> number` (ключ шкали, де стоїть колір користувача)
- `generateNeutral(hex) -> { 50..950 }` нейтральна шкала з легким відтінком бренду
- `contrastRatio(fgHex, bgHex) -> number` (WCAG 2.x)
- `wcagLevel(ratio, { large = false } = {}) -> 'AAA' | 'AA' | 'AA Large' | 'Fail'` (звичайний: ≥7 AAA, ≥4.5 AA, ≥3 AA Large, інакше Fail; large: ≥4.5 AAA, ≥3 AA)
- `pickOnColor(bgHex) -> '#FFFFFF' | '#111111'` (що контрастніше)
- Еталони тестів: білий на чорному = 21, #767676 на білому ≈ 4.54, для #FACC15 `pickOnColor` = темний.

### public/tokens.js (імпортує color.js)
- `buildTokens(brandHex) -> { primitives: { brand, neutral, danger, success }, light: {token: {ref, hex}}, dark: {...} }`; токени: bg, surface, text, text-muted, border, accent, accent-hover, on-accent, danger, success. `ref` на кшталт `neutral-50`, `brand-700`; `on-accent` - `{ref:'white'|'neutral-950', hex}` за `pickOnColor`.
- `accent` у світлій темі = крок шкали, найближчий до кольору користувача (щоб його колір стояв без змін); в темній - світліший крок.
- `toCSS(tokens) -> string` (`:root{--brand-50..}` + `[data-theme="light"]`/`[data-theme="dark"]` змінні семантики)
- `toTailwind(tokens) -> string` (Tailwind v4: блок `@theme { --color-brand-50: ...; }`)
- `toTokensJson(tokens) -> string` (JSON, DTCG: `$type: "color"`, `$value`; primitives з hex, light/dark посилаються `{primitives.brand.700}`)
- `previewChecks(tokens, theme) -> [{ id:'button'|'card'|'input', label, fg, bg, ratio, level }]`

### API (functions/)
- `POST /api/palettes` body `{ "hex": "#4F46E5" }` -> `201 { id, url: "/p/<id>" }`; 400 `{ error }` при невалідному hex. id - 6 символів base62.
- `GET /api/palettes/:id` -> `200 { id, hex, createdAt }` або 404 `{ error }`.
- `GET /p/:id` -> віддає `index.html` (через `env.ASSETS`).
- `schema.sql`: `CREATE TABLE IF NOT EXISTS palettes (id TEXT PRIMARY KEY, hex TEXT NOT NULL, created_at INTEGER NOT NULL);`
- Валідацію hex на сервері робить сама функція (власний regex), НЕ імпортує з public/.

### Frontend
Екран за скріншотом воркбука: ліва панель (01 / БРЕНД-КОЛІР: поле hex, пікер, пресети: Індиго #4F46E5, Жовтий #FACC15, Бірюза, Теракот; внизу сводка: тайл колір / HEX / текст на кнопці), права частина (02 / ШКАЛА: brand і neutral по 11 свотчів, клік копіює hex; 03 / ТОКЕНИ: таблиця токен | світла | темна; 04 / ПРЕВ'Ю: картка, інпут, кнопка в обох темах з бейджами; 05 / ЕКСПОРТ: вкладки CSS / Tailwind / tokens.json + «Копіювати»), у шапці «Поділитися». Темна тема для самого застосунку: нейтральна, на CSS-змінних. Мова UK. Адаптив від 360, на мобільному 6 свотчів у ряд.

## Критерії приймання
- `node --test` зелений.
- #4F46E5 і #FACC15 (on-accent темний) працюють на всіх блоках; невалідний hex (ZZ12) - помилка під полем.
- Поділитися працює локально через `wrangler pages dev` (без `--d1`).
- Чекліст: 375/1440 без горизонтального скролу, WCAG AA в обох темах, без секретів у репо.

## Що потребує користувача (не виконується без «ок»)
GitHub-репо `token-lab` (конектор потребує авторизації), Cloudflare-акаунт, D1 `create`, деплой, push/merge.
