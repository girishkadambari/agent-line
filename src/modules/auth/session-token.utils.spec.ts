import {
  buildExpiredSessionCookie,
  buildSessionCookie,
  createSessionToken,
  hashSessionToken,
  parseCookieHeader,
  sessionCookieName,
} from './session-token.utils';

describe('session token utils', () => {
  it('creates opaque tokens and hashes without storing raw values', () => {
    const token = createSessionToken();

    expect(token).toMatch(/^sess_/);
    expect(hashSessionToken(token)).toHaveLength(64);
    expect(hashSessionToken(token)).not.toBe(token);
  });

  it('parses cookies and builds secure session cookies', () => {
    const cookie = buildSessionCookie('sess_123', 3600, true);

    expect(cookie).toContain(`${sessionCookieName}=sess_123`);
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('Secure');
    expect(parseCookieHeader(`${cookie}; theme=dark`).get(sessionCookieName)).toBe('sess_123');
    expect(buildExpiredSessionCookie()).toContain('Max-Age=0');
  });
});
