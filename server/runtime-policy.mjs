// Curated executable projects are public assets, but must not inherit account origin privileges.
export function isRuntimePath(pathname) {
  let path;
  try { path = decodeURIComponent(pathname); } catch { return false; }
  return path.startsWith('/projects/') || path.startsWith('/vibe coding库/');
}
export function applyRuntimePolicy(request, response) {
  const path = new URL(request.url).pathname;
  if (!isRuntimePath(path)) return response;
  const headers = new Headers(response.headers);
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('Referrer-Policy', 'no-referrer');
  // Public runtime dependencies may be fetched by the sandbox's opaque origin.
  headers.set('Access-Control-Allow-Origin', '*');
  if ((headers.get('Content-Type') || '').includes('text/html')) {
    headers.set('Content-Security-Policy', "sandbox allow-scripts allow-downloads; default-src 'self' https: data: blob:; script-src 'self' https: 'unsafe-inline' 'unsafe-eval' blob:; style-src 'self' https: 'unsafe-inline'; connect-src https: http://127.0.0.1:* http://localhost:*; object-src 'none'; form-action 'none'; frame-src 'none'; base-uri 'self'");
  }
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}
