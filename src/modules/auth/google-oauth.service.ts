import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { ApiException } from '../../common/errors/api.exception';

interface GoogleTokenResponse {
  access_token?: string;
  id_token?: string;
  token_type?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
}

interface GoogleUserInfo {
  sub: string;
  email: string;
  email_verified?: boolean;
  name?: string;
  picture?: string;
}

@Injectable()
export class GoogleOAuthService {
  constructor(private readonly config: ConfigService) {}

  buildAuthorizationUrl(state: string) {
    const clientId = this.requireConfig('GOOGLE_CLIENT_ID');
    const redirectUri = this.requireConfig('GOOGLE_REDIRECT_URI');
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: 'openid email profile',
      access_type: 'offline',
      prompt: 'select_account',
      state,
    });

    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  }

  async exchangeCodeForUser(code: string) {
    const redirectUri = this.requireConfig('GOOGLE_REDIRECT_URI');
    const token = await this.exchangeCode(code, redirectUri);
    if (!token.access_token) {
      throw new ApiException('invalid_request', 'Google OAuth did not return an access token.', 400);
    }

    const user = await this.fetchUserInfo(token.access_token);
    if (!user.email_verified) {
      throw new ApiException('forbidden', 'Google email must be verified.', 403, { email: user.email });
    }

    return user;
  }

  private async exchangeCode(code: string, redirectUri: string) {
    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: this.requireConfig('GOOGLE_CLIENT_ID'),
        client_secret: this.requireConfig('GOOGLE_CLIENT_SECRET'),
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    });
    const payload = (await response.json()) as GoogleTokenResponse;

    if (!response.ok) {
      throw new ApiException('provider_error', 'Google OAuth token exchange failed.', 502, {
        status: response.status,
        error: payload.error,
        message: payload.error_description,
      });
    }

    return payload;
  }

  private async fetchUserInfo(accessToken: string) {
    const response = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const payload = (await response.json()) as Partial<GoogleUserInfo>;

    if (!response.ok || !payload.sub || !payload.email) {
      throw new ApiException('provider_error', 'Google user profile lookup failed.', 502, {
        status: response.status,
      });
    }

    return payload as GoogleUserInfo;
  }

  private requireConfig(name: string) {
    const value = this.config.get<string>(name);
    if (!value) {
      throw new ApiException('invalid_request', `${name} is not configured.`, 500);
    }
    return value;
  }
}
