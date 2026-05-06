import { Injectable } from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';

@Injectable()
export class ApiKeysService {
  hash(apiKey: string) {
    return createHash('sha256').update(apiKey).digest('hex');
  }

  create(prefix = 'sk_test') {
    const token = randomBytes(24).toString('base64url');
    return `${prefix}_${token}`;
  }

  prefix(apiKey: string) {
    const parts = apiKey.split('_');
    if (parts.length < 3) {
      return apiKey.slice(0, 8);
    }

    return `${parts[0]}_${parts[1]}_${parts[2].slice(0, 6)}`;
  }
}
