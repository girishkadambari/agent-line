import { forwardRef, Module } from '@nestjs/common';

import { AuditModule } from '../audit/audit.module';
import { BillingModule } from '../billing/billing.module';
import { ApiKeyGuard } from './api-key.guard';
import { ApiKeysController } from './api-keys.controller';
import { ApiKeysService } from './api-keys.service';
import { AuthContextGuard } from './auth-context.guard';
import { AuthController } from './auth.controller';
import { CsrfGuard } from './csrf.guard';
import { GoogleOAuthService } from './google-oauth.service';
import { SessionAuthService } from './session-auth.service';
import { SessionGuard } from './session.guard';
import { WorkspaceRoleGuard } from './workspace-role.guard';

@Module({
  imports: [forwardRef(() => AuditModule), forwardRef(() => BillingModule)],
  controllers: [ApiKeysController, AuthController],
  providers: [
    ApiKeysService,
    ApiKeyGuard,
    GoogleOAuthService,
    SessionAuthService,
    SessionGuard,
    AuthContextGuard,
    CsrfGuard,
    WorkspaceRoleGuard,
  ],
  exports: [
    ApiKeysService,
    ApiKeyGuard,
    SessionAuthService,
    SessionGuard,
    AuthContextGuard,
    CsrfGuard,
    WorkspaceRoleGuard,
  ],
})
export class AuthModule {}
