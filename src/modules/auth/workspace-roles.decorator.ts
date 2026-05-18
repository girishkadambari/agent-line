import { SetMetadata } from '@nestjs/common';
import type { WorkspaceRole } from '@prisma/client';

export const workspaceRolesMetadataKey = 'vukho:workspace_roles';

export const WorkspaceRoles = (...roles: WorkspaceRole[]) => SetMetadata(workspaceRolesMetadataKey, roles);
