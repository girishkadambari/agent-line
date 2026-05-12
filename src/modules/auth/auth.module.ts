import { forwardRef, Module } from '@nestjs/common';

import { AuditModule } from '../audit/audit.module';
import { ApiKeyGuard } from './api-key.guard';
import { ApiKeysController } from './api-keys.controller';
import { ApiKeysService } from './api-keys.service';
import { AuthController } from './auth.controller';
import { GoogleOAuthService } from './google-oauth.service';
import { SessionAuthService } from './session-auth.service';
import { SessionGuard } from './session.guard';

@Module({
  imports: [forwardRef(() => AuditModule)],
  controllers: [ApiKeysController, AuthController],
  providers: [ApiKeysService, ApiKeyGuard, GoogleOAuthService, SessionAuthService, SessionGuard],
  exports: [ApiKeysService, ApiKeyGuard, SessionAuthService, SessionGuard],
})
export class AuthModule {}
