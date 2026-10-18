// GET /p/:id - віддає app shell (index.html); клієнт сам читає id з location.pathname
// і підтягує палітру через /api/palettes/:id.

export async function onRequestGet({ request, env }) {
  return env.ASSETS.fetch(new URL('/', request.url));
}
