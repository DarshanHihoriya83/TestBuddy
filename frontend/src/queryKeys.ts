import type { BugFilters } from "./types";

/** Central TanStack Query keys — invalidate by family prefix. */
export const queryKeys = {
  me: ["me"] as const,
  users: (projectId?: string) =>
    projectId ? (["users", projectId] as const) : (["users"] as const),
  usersAdmin: (projectId?: string) =>
    ["users-admin", projectId || "all"] as const,
  organizations: ["organizations"] as const,
  organization: (id: string) => ["organization", id] as const,
  organizationMembers: (id: string) => ["organization-members", id] as const,
  projects: (organizationId?: string) =>
    organizationId
      ? (["projects", { organizationId }] as const)
      : (["projects"] as const),
  project: (id: string) => ["project", id] as const,
  projectMembers: (id: string) => ["project-members", id] as const,
  modules: (projectId: string) => ["modules", projectId] as const,
  cycles: (projectId: string) => ["cycles", projectId] as const,
  bugs: (filters?: BugFilters | { projectId?: string }) =>
    filters ? (["bugs", filters] as const) : (["bugs"] as const),
  bug: (id: string) => ["bug", id] as const,
  bugComments: (id: string) => ["bug-comments", id] as const,
};
