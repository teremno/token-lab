// POST /api/palettes - зберегти палітру, повертає { id, url }.
// Валідація hex - власна (не імпортуємо з public/).

const HEX_RE = /^#?([0-9a-f]{6}|[0-9a-f]{3})$/i;
const BASE62 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
const ID_LENGTH = 6;
const MAX_ATTEMPTS = 3;
// Найбільше кратне 62 значення байта (248): байти >= 248 відкидаємо, щоб не було зсуву розподілу.
const BYTE_LIMIT = 248;

const HEADERS_JSON = { 'content-type': 'application/json' };

function json(body, status) {
  return new Response(JSON.stringify(body), { status, headers: HEADERS_JSON });
}

function normalizeHex(input) {
  if (typeof input !== 'string') return null;
  const match = HEX_RE.exec(input.trim());
  if (!match) return null;
  let digits = match[1].toUpperCase();
  if (digits.length === 3) {
    digits = digits
      .split('')
      .map((c) => c + c)
      .join('');
  }
  return `#${digits}`;
}

function generateId() {
  const out = [];
  const bytes = new Uint8Array(ID_LENGTH * 2);
  while (out.length < ID_LENGTH) {
    crypto.getRandomValues(bytes);
    for (const b of bytes) {
      if (b >= BYTE_LIMIT) continue;
      out.push(BASE62[b % 62]);
      if (out.length === ID_LENGTH) break;
    }
  }
  return out.join('');
}

function isUniqueViolation(error) {
  return /UNIQUE constraint|SQLITE_CONSTRAINT/i.test(String(error?.message ?? error));
}

export async function onRequestPost({ request, env }) {
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Невалідний hex' }, 400);
  }

  const hex = normalizeHex(body?.hex);
  if (!hex) {
    return json({ error: 'Невалідний hex' }, 400);
  }

  const createdAt = Date.now();

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const id = generateId();
    try {
      await env.DB.prepare('INSERT INTO palettes (id, hex, created_at) VALUES (?, ?, ?)')
        .bind(id, hex, createdAt)
        .run();
      return json({ id, url: `/p/${id}` }, 201);
    } catch (error) {
      if (isUniqueViolation(error) && attempt < MAX_ATTEMPTS) {
        continue; // колізія id - пробуємо інший
      }
      return json({ error: 'Не вдалося зберегти' }, 500);
    }
  }

  return json({ error: 'Не вдалося зберегти' }, 500);
}

export async function onRequest({ request }) {
  // Сюди потрапляють лише методи, відмінні від POST (onRequestPost має пріоритет).
  return json({ error: 'Метод не дозволено' }, 405);
}
