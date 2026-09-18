import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';

export const COOKIE_NAME = '__Host-jevrace';
export const SESSION_SECONDS = 90 * 24 * 60 * 60;
const signature = (value, secret) => createHmac('sha256', secret).update(value).digest('base64url');

// This is a browser archive identity, not a user account or a TypeSafe credential.
export function readSession(cookie, secret, now = Date.now()) {
  const token = cookie
    ?.split(';')
    .map((v) => v.trim())
    .find((v) => v.startsWith(COOKIE_NAME + '='))
    ?.slice(COOKIE_NAME.length + 1);
  if (!token || token.length > 200) return null;
  const [owner, expires, mac, extra] = token.split('.');
  if (
    extra ||
    !/^[a-f0-9-]{36}$/.test(owner) ||
    !/^\d{10}$/.test(expires) ||
    !/^[\w-]{43}$/.test(mac)
  )
    return null;
  const deadline = Number(expires);
  if (deadline <= now / 1000 || deadline > now / 1000 + SESSION_SECONDS + 60) return null;
  const expected = signature(`${owner}.${expires}`, secret);
  return timingSafeEqual(Buffer.from(mac), Buffer.from(expected)) ? owner : null;
}

export function issueSession(secret, now = Date.now()) {
  const owner = randomUUID();
  const payload = `${owner}.${Math.floor(now / 1000) + SESSION_SECONDS}`;
  return {
    owner,
    cookie: `${COOKIE_NAME}=${payload}.${signature(payload, secret)}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${SESSION_SECONDS}`,
  };
}

// Rate counters contain a keyed hash, never the raw address or visitor credential.
export function rateIdentity(value, secret) {
  return signature('rate:' + value, secret);
}
