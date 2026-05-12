import type { Project, User, UserSession, Workspace, WorkspaceMember } from '@prisma/client';

type MembershipWithWorkspace = WorkspaceMember & {
  workspace: Workspace & { projects: Project[] };
};

type SessionWithContext = UserSession & {
  activeWorkspace: Workspace;
  activeProject: Project;
};

export function serializeCurrentUser(input: {
  user: User;
  memberships: MembershipWithWorkspace[];
  session: SessionWithContext;
}) {
  return {
    id: input.user.id,
    email: input.user.email,
    name: input.user.name,
    avatarUrl: input.user.avatarUrl,
    activeWorkspaceId: input.session.activeWorkspaceId,
    activeProjectId: input.session.activeProjectId,
    activeWorkspace: {
      id: input.session.activeWorkspace.id,
      name: input.session.activeWorkspace.name,
    },
    activeProject: {
      id: input.session.activeProject.id,
      name: input.session.activeProject.name,
      environment: input.session.activeProject.environment,
    },
    workspaces: input.memberships.map((membership) => ({
      id: membership.workspace.id,
      name: membership.workspace.name,
      role: membership.role,
      status: membership.status,
      projects: membership.workspace.projects.map((project) => ({
        id: project.id,
        name: project.name,
        environment: project.environment,
      })),
    })),
  };
}
