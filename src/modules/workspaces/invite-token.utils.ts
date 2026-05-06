import { createHash, randomBytes } from 'node:crypto';

export function createInviteToken() {
  return `inv_${randomBytes(24).toString('base64url')}`;
}

export function hashInviteToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}
