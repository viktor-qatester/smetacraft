const DEFAULT_BIND = '127.0.0.1';
const PUBLIC_BIND = '0.0.0.0';

function parsePublicOrigins(raw) {
  if (typeof raw !== 'string' || !raw.trim()) return [];
  const origins = [];
  const seen = new Set();
  for (const part of raw.split(',')) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    let url;
    try {
      url = new URL(trimmed);
    } catch {
      continue;
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') continue;
    if (url.username || url.password) continue;
    if (url.search || url.hash) continue;
    if (url.pathname && url.pathname !== '/') continue;
    const origin = url.origin;
    if (seen.has(origin)) continue;
    seen.add(origin);
    origins.push(origin);
  }
  return origins;
}

function parseBind(raw) {
  if (raw === undefined || raw === null || raw === '') return DEFAULT_BIND;
  if (raw === DEFAULT_BIND || raw === PUBLIC_BIND) return raw;
  return null;
}

function loopbackAuthorities(port) {
  if (!Number.isSafeInteger(port) || port <= 0) return new Map();
  const suffix = port === 80 ? '' : `:${port}`;
  const authorities = new Map([
    [`127.0.0.1${suffix}`, `http://127.0.0.1${suffix}`],
    [`localhost${suffix}`, `http://localhost${suffix}`],
  ]);
  if (port === 80) {
    authorities.set('127.0.0.1:80', 'http://127.0.0.1');
    authorities.set('localhost:80', 'http://localhost');
  }
  return authorities;
}

function hostMatchesPublicOrigin(hostHeader, origin) {
  let url;
  try {
    url = new URL(origin);
  } catch {
    return false;
  }
  const hostname = url.hostname.toLowerCase();
  const defaultPort = url.protocol === 'https:' ? '443' : '80';
  const port = url.port || defaultPort;
  const host = String(hostHeader || '').toLowerCase();
  if (host === hostname) return port === defaultPort;
  return host === `${hostname}:${port}`;
}

function originHeaderMatches(originHeader, allowedOrigin) {
  if (originHeader === undefined) return true;
  if (typeof originHeader !== 'string' || originHeader.length === 0) return false;
  return originHeader.toLowerCase() === allowedOrigin.toLowerCase();
}

function createAuthorityChecker(publicOrigins) {
  const allowed = Array.isArray(publicOrigins) ? publicOrigins.slice() : [];
  return function validLocalAuthority(req) {
    const host = typeof req.headers.host === 'string' ? req.headers.host.toLowerCase() : '';
    const origin = req.headers.origin;
    const port = req.socket && req.socket.localPort;
    const loopback = loopbackAuthorities(port);
    const expectedOrigin = loopback.get(host);
    if (expectedOrigin) {
      return origin === undefined ||
        (typeof origin === 'string' && origin.toLowerCase() === expectedOrigin);
    }
    for (const allowedOrigin of allowed) {
      if (hostMatchesPublicOrigin(host, allowedOrigin) && originHeaderMatches(origin, allowedOrigin)) {
        return true;
      }
    }
    return false;
  };
}

module.exports = {
  DEFAULT_BIND,
  PUBLIC_BIND,
  parsePublicOrigins,
  parseBind,
  createAuthorityChecker,
};
