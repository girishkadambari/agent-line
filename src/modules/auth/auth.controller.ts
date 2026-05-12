import { Controller, Get, Post, Query, Req, Res, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import { randomBytes } from 'crypto';

import { success } from '../../common/api/api-response';
import { CurrentContext } from '../../common/context/current-context.decorator';
import type { RequestContext } from '../../common/context/request-context';
import { ApiException } from '../../common/errors/api.exception';
import { CurrentUser } from './current-user.decorator';
import { GoogleOAuthService } from './google-oauth.service';
import { SessionAuthService } from './session-auth.service';
import { SessionGuard, type SessionUser } from './session.guard';

const oauthStateCookie = 'agentline_oauth_state';

@Controller()
export class AuthController {
  constructor(
    private readonly config: ConfigService,
    private readonly google: GoogleOAuthService,
    private readonly sessions: SessionAuthService,
  ) {}

  @Get('auth/google/start')
  startGoogle(@Res() response: Response) {
    const state = randomBytes(24).toString('base64url');
    response.setHeader(
      'Set-Cookie',
      `${oauthStateCookie}=${encodeURIComponent(state)}; Path=/v1/auth/google; HttpOnly; SameSite=Lax; Max-Age=600`,
    );
    return response.redirect(this.google.buildAuthorizationUrl(state));
  }

  @Get('auth/google/callback')
  async googleCallback(
    @Query('code') code: string | undefined,
    @Query('state') state: string | undefined,
    @Req() request: Request,
    @Res() response: Response,
  ) {
    if (!code || !state) {
      throw new ApiException('invalid_request', 'Missing Google OAuth callback parameters.', 400);
    }

    const stateCookie = this.readCookie(request.headers.cookie, oauthStateCookie);
    if (!stateCookie || stateCookie !== state) {
      throw new ApiException('invalid_request', 'Invalid Google OAuth state.', 400);
    }

    const profile = await this.google.exchangeCodeForUser(code);
    await this.sessions.createSessionForGoogleUser(profile, response);
    response.append('Set-Cookie', `${oauthStateCookie}=; Path=/v1/auth/google; HttpOnly; SameSite=Lax; Max-Age=0`);

    return response.redirect(this.config.get<string>('DASHBOARD_URL', 'http://localhost:5173'));
  }

  @UseGuards(SessionGuard)
  @Post('auth/logout')
  async logout(
    @CurrentContext() context: RequestContext,
    @Res({ passthrough: true }) response: Response,
  ) {
    return success(await this.sessions.logout(context.sessionId, response));
  }

  @UseGuards(SessionGuard)
  @Get('users/me')
  async getMe(@CurrentUser() user: SessionUser, @CurrentContext() context: RequestContext) {
    return success(await this.sessions.getCurrentUser(user.id, context.sessionId ?? ''));
  }

  private readCookie(header: string | undefined, name: string) {
    if (!header) {
      return null;
    }

    for (const part of header.split(';')) {
      const [rawName, ...rawValue] = part.trim().split('=');
      if (rawName === name) {
        return decodeURIComponent(rawValue.join('='));
      }
    }

    return null;
  }
}
