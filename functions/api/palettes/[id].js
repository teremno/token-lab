// GET /api/palettes/:id - віддати палітру { id, hex, createdAt } або 404.

const ID_RE = /^[0-9A-Za-z]{6}$/;

const HEADERS_JSON = { 'content-type': 'application/json' };

function json(body, status, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...HEADERS_JSON, ...extraHeaders },
  });
}

export async function onRequestGet({ env, params }) {
  const id = String(params?.id ?? '');
  if (!ID_RE.test(id)) {
    return json({ error: 'Не знайдено' }, 404);
  }

  let row;
  try {
    row = await env.DB.prepare('SELECT id, hex, created_at FROM palettes WHERE id = ?')
      .bind(id)
      .first();
  } catch {
    return json({ error: 'Не вдалося завантажити' }, 500);
  }

  if (!row) {
    return json({ error: 'Не знайдено' }, 404);
  }

  return json(
    { id: row.id, hex: row.hex, createdAt: row.created_at },
    200,
    { 'Cache-Control': 'public, max-age=60' },
  );
}

export async function onRequest() {
  // Сюди потрапляють лише методи, відмінні від GET (onRequestGet має пріоритет).
  return json({ error: 'Метод не дозволено' }, 405);
}
