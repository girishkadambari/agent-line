import { createInviteToken, hashInviteToken } from './invite-token.utils';

describe('invite token utils', () => {
  it('creates raw invite tokens and hashes them for storage', () => {
    const token = createInviteToken();
    const hash = hashInviteToken(token);

    expect(token).toMatch(/^inv_/);
    expect(hash).not.toBe(token);
    expect(hash).toHaveLength(64);
  });
});
