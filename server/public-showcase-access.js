// The deployed gallery only serves exported recordings. No browser-facing API
// may create races, query the database, authenticate admins or spend JEV credits.
export function publicShowcaseAccess(request) {
  const path = new URL(request.url).pathname;
  if (path === '/api/maintenance' && request.method === 'GET') return null;
  return Response.json(
    { error: 'Not found.' },
    { status: 404, headers: { 'Cache-Control': 'no-store' } },
  );
}
