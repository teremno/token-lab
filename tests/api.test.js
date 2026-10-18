import { test } from 'node:test';
import assert from 'node:assert/strict';

import { onRequestPost, onRequest as postFallback } from '../functions/api/palettes.js';
import { onRequestGet, onRequest as idFallback } from '../functions/api/palettes/[id].js';
import { onRequestGet as shellGet } from '../functions/p/[id].js';

// Фейк D1: таблиця palettes у Map. Підтримує лише SQL, який використовує API.
function createFakeDb({ collisions = 0, fail = false } = {}) {
  const rows = new Map();
  const log = { queries: 0 };
  let pendingCollisions = collisions;

  return {
    rows,
    log,
    prepare(sql) {
      let args = [];
      const stmt = {
        bind(...values) {
          args = values;
          return stmt;
        },
        async run() {
          log.queries++;
          if (fail) throw new Error('D1_ERROR: database is unavailable');
          if (/^INSERT INTO palettes/i.test(sql)) {
            const [id, hex, created_at] = args;
            if (pendingCollisions > 0) {
              pendingCollisions--;
              throw new Error('D1_ERROR: UNIQUE constraint failed: palettes.id: SQLITE_CONSTRAINT');
            }
            if (rows.has(id)) {
              throw new Error('D1_ERROR: UNIQUE constraint failed: palettes.id: SQLITE_CONSTRAINT');
            }
            rows.set(id, { id, hex, created_at });
            return { success: true, meta: { changes: 1 } };
          }
          throw new Error(`fake D1: unsupported run() SQL: ${sql}`);
        },
        async first() {
          log.queries++;
          if (fail) throw new Error('D1_ERROR: database is unavailable');
          if (/^SELECT .* FROM palettes WHERE id = \?/i.test(sql)) {
            const row = rows.get(args[0]);
            return row ? { ...row } : null;
          }
          throw new Error(`fake D1: unsupported first() SQL: ${sql}`);
        },
      };
      return stmt;
    },
  };
}

function postRequest(body, { raw = false } = {}) {
  return new Request('https://token-lab.test/api/palettes', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: raw ? body : JSON.stringify(body),
  });
}

function getRequest(id) {
  return new Request(`https://token-lab.test/api/palettes/${id}`);
}

test('POST valid hex -> 201 with 6-char base62 id and url', async () => {
  const env = { DB: createFakeDb() };
  const res = await onRequestPost({ request: postRequest({ hex: '#4F46E5' }), env });

  assert.equal(res.status, 201);
  assert.match(res.headers.get('content-type'), /^application\/json/);
  const data = await res.json();
  assert.match(data.id, /^[0-9A-Za-z]{6}$/);
  assert.equal(data.url, `/p/${data.id}`);
  assert.equal(env.DB.rows.get(data.id).hex, '#4F46E5');
});

test('POST hex without # is normalised to uppercase #RRGGBB', async () => {
  const env = { DB: createFakeDb() };
  const res = await onRequestPost({ request: postRequest({ hex: '4f46e5' }), env });

  assert.equal(res.status, 201);
  const { id } = await res.json();
  assert.equal(env.DB.rows.get(id).hex, '#4F46E5');
});

test('POST 3-digit hex is expanded and normalised', async () => {
  const env = { DB: createFakeDb() };
  const res = await onRequestPost({ request: postRequest({ hex: '#4f4' }), env });

  assert.equal(res.status, 201);
  const { id } = await res.json();
  assert.equal(env.DB.rows.get(id).hex, '#44FF44');
});

test('POST invalid hex "ZZ12" -> 400 with error text', async () => {
  const env = { DB: createFakeDb() };
  const res = await onRequestPost({ request: postRequest({ hex: 'ZZ12' }), env });

  assert.equal(res.status, 400);
  assert.deepEqual(await res.json(), { error: 'Невалідний hex' });
  assert.equal(env.DB.rows.size, 0);
});

test('POST bad JSON -> 400', async () => {
  const env = { DB: createFakeDb() };
  const res = await onRequestPost({ request: postRequest('{not json', { raw: true }), env });

  assert.equal(res.status, 400);
  assert.deepEqual(await res.json(), { error: 'Невалідний hex' });
});

test('POST without hex field or with non-string hex -> 400', async () => {
  const env = { DB: createFakeDb() };
  const missing = await onRequestPost({ request: postRequest({}), env });
  const numeric = await onRequestPost({ request: postRequest({ hex: 123456 }), env });

  assert.equal(missing.status, 400);
  assert.equal(numeric.status, 400);
});

test('POST retries on id collision and succeeds on the next attempt', async () => {
  const env = { DB: createFakeDb({ collisions: 2 }) };
  const res = await onRequestPost({ request: postRequest({ hex: '#4F46E5' }), env });

  assert.equal(res.status, 201);
  assert.equal(env.DB.rows.size, 1);
});

test('POST gives up with 500 after 3 id collisions', async () => {
  const env = { DB: createFakeDb({ collisions: 3 }) };
  const res = await onRequestPost({ request: postRequest({ hex: '#4F46E5' }), env });

  assert.equal(res.status, 500);
  assert.deepEqual(await res.json(), { error: 'Не вдалося зберегти' });
});

test('POST DB failure -> 500', async () => {
  const env = { DB: createFakeDb({ fail: true }) };
  const res = await onRequestPost({ request: postRequest({ hex: '#4F46E5' }), env });

  assert.equal(res.status, 500);
  assert.deepEqual(await res.json(), { error: 'Не вдалося зберегти' });
});

test('POST saved palette can be read back through GET', async () => {
  const env = { DB: createFakeDb() };
  const created = await onRequestPost({ request: postRequest({ hex: '#FACC15' }), env });
  const { id } = await created.json();

  const res = await onRequestGet({ request: getRequest(id), env, params: { id } });
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.id, id);
  assert.equal(data.hex, '#FACC15');
});

test('GET existing palette -> 200 with { id, hex, createdAt } and cache header', async () => {
  const env = { DB: createFakeDb() };
  env.DB.rows.set('AbC123', { id: 'AbC123', hex: '#4F46E5', created_at: 1700000000000 });

  const res = await onRequestGet({
    request: getRequest('AbC123'),
    env,
    params: { id: 'AbC123' },
  });

  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), {
    id: 'AbC123',
    hex: '#4F46E5',
    createdAt: 1700000000000,
  });
  assert.equal(res.headers.get('cache-control'), 'public, max-age=60');
});

test('GET missing palette -> 404 without cache header', async () => {
  const env = { DB: createFakeDb() };
  const res = await onRequestGet({
    request: getRequest('zzzzzz'),
    env,
    params: { id: 'zzzzzz' },
  });

  assert.equal(res.status, 404);
  assert.deepEqual(await res.json(), { error: 'Не знайдено' });
  assert.equal(res.headers.get('cache-control'), null);
});

test('GET malformed id -> 404 and no DB query', async () => {
  const env = { DB: createFakeDb() };
  for (const id of ['abc12', 'abc1234', 'abc-12', 'abc 12', '']) {
    const res = await onRequestGet({ request: getRequest(id), env, params: { id } });
    assert.equal(res.status, 404, `id "${id}" should be 404`);
  }
  assert.equal(env.DB.log.queries, 0);
});

test('GET DB failure -> 500', async () => {
  const env = { DB: createFakeDb({ fail: true }) };
  const res = await onRequestGet({
    request: getRequest('abc123'),
    env,
    params: { id: 'abc123' },
  });

  assert.equal(res.status, 500);
});

test('non-POST on /api/palettes -> 405', async () => {
  const res = await postFallback({
    request: new Request('https://token-lab.test/api/palettes', { method: 'PUT' }),
    env: {},
  });
  assert.equal(res.status, 405);
});

test('non-GET on /api/palettes/:id -> 405', async () => {
  const res = await idFallback({
    request: new Request('https://token-lab.test/api/palettes/abc123', { method: 'DELETE' }),
    env: {},
    params: { id: 'abc123' },
  });
  assert.equal(res.status, 405);
});

test('GET /p/:id delegates to env.ASSETS.fetch with the root URL', async () => {
  const calls = [];
  const env = {
    ASSETS: {
      fetch(input) {
        calls.push(input);
        return new Response('<!doctype html>', { status: 200 });
      },
    },
  };
  const request = new Request('https://token-lab.test/p/abc123');

  const res = await shellGet({ request, env, params: { id: 'abc123' } });

  assert.equal(res.status, 200);
  assert.equal(calls.length, 1);
  assert.ok(calls[0] instanceof URL);
  assert.equal(calls[0].href, 'https://token-lab.test/');
});
