import { createHash, randomBytes } from 'crypto';

export const sessionCookieName = 'agentline_session';
export const csrfCookieName = 'agentline_csrf';

export function createSessionToken() {
  return `sess_${randomBytes(32).toString('base64url')}`;
}

export function hashSessionToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

export function parseCookieHeader(header: string | undefined) {
  const cookies = new Map<string, string>();
  if (!header) {
    return cookies;
  }

  for (const part of header.split(';')) {
    const [rawName, ...rawValue] = part.trim().split('=');
    if (!rawName || rawValue.length === 0) {
      continue;
    }
    cookies.set(rawName, decodeURIComponent(rawValue.join('=')));
  }

  return cookies;
}

export function buildSessionCookie(token: string, maxAgeSeconds: number, secure: boolean) {
  const parts = [
    `${sessionCookieName}=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${maxAgeSeconds}`,
  ];

  if (secure) {
    parts.push('Secure');
  }

  return parts.join('; ');
}

export function createCsrfToken() {
  return randomBytes(32).toString('base64url');
}

export function buildCsrfCookie(token: string, maxAgeSeconds: number, secure: boolean) {
  const parts = [
    `${csrfCookieName}=${encodeURIComponent(token)}`,
    'Path=/',
    'SameSite=Lax',
    `Max-Age=${maxAgeSeconds}`,
  ];

  if (secure) {
    parts.push('Secure');
  }

  return parts.join('; ');
}

export function buildExpiredSessionCookie() {
  return `${sessionCookieName}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}

export function buildExpiredCsrfCookie() {
  return `${csrfCookieName}=; Path=/; SameSite=Lax; Max-Age=0`;
}
