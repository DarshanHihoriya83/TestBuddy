import type {
  Bug,
  BugComment,
  BugFilters,
  Sprint,
  Environment,
  Module,
  Organization,
  Project,
  ProjectCreationQuota,
  Step,
  TestCase,
  TestCaseFilters,
  User,
  UserWithTemporaryPassword,
} from "./types";
import { forceLogout } from "./authEvents";

const API_BASE = import.meta.env.VITE_API_BASE ?? "";

function authHeaders(): HeadersInit {
  const token = localStorage.getItem("testbuddy_token");
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: { ...authHeaders(), ...init?.headers },
  });

  if (res.status === 401) {
    // Don't logout on failed login/register attempts
    const isAuthAttempt = path.includes("/api/auth/login") || path.includes("/api/auth/register");
    if (!isAuthAttempt) {
      forceLogout();
    }
    const text = await res.text();
    let message = "Unauthorized — please sign in again";
    try {
      const body = JSON.parse(text) as { message?: string };
      if (body.message) message = body.message;
    } catch {
      /* keep default */
    }
    throw new Error(message);
  }

  if (!res.ok) {
    const text = await res.text();
    let message = text || `${res.status} ${res.statusText}`;
    try {
      const body = JSON.parse(text) as { message?: string };
      if (body.message) message = body.message;
    } catch {
      /* keep raw text */
    }
    throw new Error(message);
  }
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  if (!text) return undefined as T;
  return JSON.parse(text) as T;
}

export async function login(email: string, password: string) {
  return api<{ token: string; user: User }>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email: email.trim(), password }),
  });
}

export async function register(body: {
  name: string;
  email: string;
  password: string;
  role?: string;
}) {
  return api<{ token: string; user: User }>("/api/auth/register", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export const fetchMe = () => api<User>("/api/auth/me");

/** Changing the password revokes older tokens, so the response carries a fresh one. */
export function updateProfile(body: {
  name: string;
  currentPassword?: string;
  newPassword?: string;
}) {
  return api<User & { token?: string }>("/api/auth/profile", {
    method: "PUT",
    body: JSON.stringify(body),
  });
}

export const fetchUsers = (projectId?: string) =>
  api<User[]>(projectId ? `/api/users?projectId=${encodeURIComponent(projectId)}` : "/api/users");

export const fetchAdminUsers = (projectId?: string) =>
  api<User[]>(
    projectId ? `/api/users/admin?projectId=${encodeURIComponent(projectId)}` : "/api/users/admin",
  );

export function adminCreateUser(body: {
  name: string;
  email: string;
  role: string;
  organizationId?: string;
  projectIds?: string[];
}) {
  return api<UserWithTemporaryPassword>("/api/users", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function adminUpdateUser(
  id: string,
  body: {
    name?: string;
    email?: string;
    role?: string;
    active?: boolean;
    organizationId?: string;
    projectIds?: string[];
  },
) {
  return api<User>(`/api/users/${id}`, {
    method: "PUT",
    body: JSON.stringify(body),
  });
}

export function fetchUserMemberships(id: string) {
  return api<{ organizationIds: string[]; projectIds: string[] }>(`/api/users/${id}/memberships`);
}

export function adminResetPassword(id: string) {
  return api<UserWithTemporaryPassword>(`/api/users/${id}/reset-password`, {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export function adminDeleteUser(id: string) {
  return api<void>(`/api/users/${id}`, { method: "DELETE" });
}

/** SuperAdmin only — permanently removes an already-deactivated user. */
export function adminHardDeleteUser(id: string) {
  return api<void>(`/api/users/${id}/permanent`, { method: "DELETE" });
}

export const fetchProjectMembers = (projectId: string) =>
  api<User[]>(`/api/projects/${projectId}/members`);

export function addProjectMember(projectId: string, userId: string) {
  return api<User>(`/api/projects/${projectId}/members`, {
    method: "POST",
    body: JSON.stringify({ userId }),
  });
}

export function removeProjectMember(projectId: string, userId: string) {
  return api<void>(`/api/projects/${projectId}/members/${userId}`, {
    method: "DELETE",
  });
}

export const fetchProjects = (organizationId?: string) =>
  api<Project[]>(
    organizationId
      ? `/api/projects?organizationId=${encodeURIComponent(organizationId)}`
      : "/api/projects",
  );

export const fetchProjectQuota = () => api<ProjectCreationQuota>("/api/projects/quota");

export interface ProjectDetail extends Project {
  sprintCount: number;
  bugCount: number;
  memberCount?: number;
  moduleCount?: number;
  environmentCount?: number;
}

export const fetchProject = (id: string) => api<ProjectDetail>(`/api/projects/${id}`);

export type ProjectPayload = {
  name: string;
  organizationId: string;
  description?: string;
  jiraProjectKey?: string;
  adoOrgUrl?: string;
  adoProject?: string;
  adoTeam?: string;
  adoPat?: string;
  clearAdoPat?: boolean;
};

export const createProject = (body: ProjectPayload) =>
  api<Project>("/api/projects", { method: "POST", body: JSON.stringify(body) });

export const updateProject = (
  id: string,
  body: Omit<ProjectPayload, "organizationId"> & { organizationId?: string },
) => api<Project>(`/api/projects/${id}`, { method: "PUT", body: JSON.stringify(body) });

export const deleteProject = (id: string) => api<void>(`/api/projects/${id}`, { method: "DELETE" });

export const fetchOrganizations = () => api<Organization[]>("/api/organizations");

export const fetchOrganization = (id: string) => api<Organization>(`/api/organizations/${id}`);

export function createOrganization(body: { name: string; maxProjects?: number }) {
  return api<Organization>("/api/organizations", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function updateOrganization(id: string, body: { name?: string; maxProjects?: number }) {
  return api<Organization>(`/api/organizations/${id}`, {
    method: "PUT",
    body: JSON.stringify(body),
  });
}

export function deleteOrganization(id: string) {
  return api<void>(`/api/organizations/${id}`, { method: "DELETE" });
}

export const fetchOrganizationMembers = (organizationId: string) =>
  api<User[]>(`/api/organizations/${organizationId}/members`);

export function addOrganizationMember(organizationId: string, userId: string) {
  return api<User>(`/api/organizations/${organizationId}/members`, {
    method: "POST",
    body: JSON.stringify({ userId }),
  });
}

export function removeOrganizationMember(organizationId: string, userId: string) {
  return api<void>(`/api/organizations/${organizationId}/members/${userId}`, {
    method: "DELETE",
  });
}

export const fetchModules = (projectId: string) =>
  api<Module[]>(`/api/projects/${projectId}/modules`);

export function createModule(projectId: string, body: { name: string; description?: string }) {
  return api<Module>(`/api/projects/${projectId}/modules`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function updateModule(id: string, body: { name: string; description?: string }) {
  return api<Module>(`/api/modules/${id}`, {
    method: "PUT",
    body: JSON.stringify(body),
  });
}

export function deleteModule(id: string) {
  return api<void>(`/api/modules/${id}`, { method: "DELETE" });
}

export const fetchBugComments = (bugId: string) => api<BugComment[]>(`/api/bugs/${bugId}/comments`);

export function createBugComment(bugId: string, body: string) {
  return api<BugComment>(`/api/bugs/${bugId}/comments`, {
    method: "POST",
    body: JSON.stringify({ body }),
  });
}

export function deleteBugComment(commentId: string) {
  return api<void>(`/api/bugs/comments/${commentId}`, { method: "DELETE" });
}

export function updateBugStatus(id: string, status: string) {
  return api<Bug>(`/api/bugs/${id}`, {
    method: "PUT",
    body: JSON.stringify({ status }),
  });
}

export function updateBug(
  id: string,
  body: {
    title: string;
    description: string;
    priority: string;
    severity: string;
    assigneeId: string;
    sprintId: string;
    projectId: string;
    moduleId?: string | null;
    environmentId?: string | null;
    environmentSnapshot?: string | null;
    status: string;
    steps?: Step[];
  },
) {
  return api<Bug>(`/api/bugs/${id}`, {
    method: "PUT",
    body: JSON.stringify(body),
  });
}

export const deleteBug = (id: string) => api<void>(`/api/bugs/${id}`, { method: "DELETE" });

export const fetchCycles = (projectId: string) => fetchSprints(projectId);

export const fetchSprints = (projectId: string) =>
  api<Sprint[]>(`/api/sprints?projectId=${encodeURIComponent(projectId)}`);

export function createSprint(
  projectId: string,
  body: { name: string; isDefault?: boolean; startDate?: string; endDate?: string },
) {
  return api<Sprint>(`/api/projects/${encodeURIComponent(projectId)}/sprints`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function updateSprint(
  id: string,
  body: {
    name?: string;
    isDefault?: boolean;
    active?: boolean;
    startDate?: string | null;
    endDate?: string | null;
  },
) {
  return api<Sprint>(`/api/sprints/${id}`, {
    method: "PUT",
    body: JSON.stringify(body),
  });
}

export const deleteSprint = (id: string) =>
  api<void>(`/api/sprints/${id}`, { method: "DELETE" });

export function testProjectAdo(projectId: string) {
  return api<{ ok: boolean; iterationCount: number; team: string | null }>(
    `/api/projects/${encodeURIComponent(projectId)}/ado/test`,
    { method: "POST", body: "{}" },
  );
}

export function fetchAdoIterations(projectId: string) {
  return api<
    Array<{
      id: string;
      name: string;
      path: string;
      startDate?: string | null;
      finishDate?: string | null;
      timeFrame?: string | null;
      team?: string;
    }>
  >(`/api/projects/${encodeURIComponent(projectId)}/ado/iterations`);
}

export function importAdoSprints(projectId: string, body?: { iterationIds?: string[] }) {
  return api<{ imported: number; sprints: Sprint[] }>(
    `/api/projects/${encodeURIComponent(projectId)}/sprints/import-ado`,
    { method: "POST", body: JSON.stringify(body || {}) },
  );
}

export const fetchEnvironments = (projectId: string) =>
  api<Environment[]>(`/api/projects/${encodeURIComponent(projectId)}/environments`);

export function createEnvironment(
  projectId: string,
  body: { name: string; isDefault?: boolean },
) {
  return api<Environment>(`/api/projects/${encodeURIComponent(projectId)}/environments`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function updateEnvironment(
  id: string,
  body: {
    name?: string;
    isDefault?: boolean;
    active?: boolean;
    sortOrder?: number;
  },
) {
  return api<Environment>(`/api/environments/${id}`, {
    method: "PUT",
    body: JSON.stringify(body),
  });
}

export const deleteEnvironment = (id: string) =>
  api<void>(`/api/environments/${id}`, { method: "DELETE" });

export function fetchBugs(filters: BugFilters = {}) {
  return api<Bug[]>(`/api/bugs${buildBugQuery(filters)}`);
}

export const fetchBug = (id: string, opts?: { syncAdo?: boolean }) =>
  api<Bug>(
    `/api/bugs/${id}${opts?.syncAdo ? "?syncAdo=1" : ""}`,
  );

export function pushBugToAdo(id: string) {
  return api<{
    created: boolean;
    adoWorkItemId: string;
    adoWorkItemUrl: string | null;
    screenshotsAttached: number;
    commentsPushed: number;
    bug: Bug;
  }>(`/api/bugs/${id}/push/ado`, { method: "POST", body: "{}" });
}

export function syncBugFromAdo(id: string) {
  return api<{
    adoWorkItemId: string;
    adoWorkItemUrl: string | null;
    adoState: string | null;
    commentsImported: number;
    bug: Bug;
  }>(`/api/bugs/${id}/sync/ado`, { method: "POST", body: "{}" });
}

export interface BugExportFile {
  exportedAt: string;
  count: number;
  bugs: Bug[];
}

export interface BugImportResult {
  imported: number;
  bugs: Bug[];
}

export function buildBugQuery(filters: BugFilters = {}) {
  const params = new URLSearchParams();
  if (filters.projectId) params.set("projectId", filters.projectId);
  if (filters.priority) params.set("priority", filters.priority);
  if (filters.severity) params.set("severity", filters.severity);
  if (filters.assigneeId) params.set("assigneeId", filters.assigneeId);
  if (filters.sprintId) params.set("sprintId", filters.sprintId);
  if (filters.status) params.set("status", filters.status);
  if (filters.moduleId) params.set("moduleId", filters.moduleId);
  if (filters.environmentId) params.set("environmentId", filters.environmentId);
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

export async function exportBugsJson(filters: BugFilters = {}): Promise<BugExportFile> {
  return api<BugExportFile>(`/api/bugs/export/json${buildBugQuery(filters)}`);
}

export async function exportBugJson(id: string): Promise<BugExportFile> {
  return api<BugExportFile>(`/api/bugs/${id}/export/json`);
}

export function importBugs(bugs: unknown[]) {
  return api<BugImportResult>("/api/bugs/import", {
    method: "POST",
    body: JSON.stringify({ bugs }),
  });
}

export function buildTestCaseQuery(filters: TestCaseFilters = {}) {
  const params = new URLSearchParams();
  if (filters.projectId) params.set("projectId", filters.projectId);
  if (filters.moduleId) params.set("moduleId", filters.moduleId);
  if (filters.status) params.set("status", filters.status);
  if (filters.type) params.set("type", filters.type);
  if (filters.priority) params.set("priority", filters.priority);
  if (filters.assigneeId) params.set("assigneeId", filters.assigneeId);
  if (filters.executionStatus) params.set("executionStatus", filters.executionStatus);
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

export function fetchTestCases(filters: TestCaseFilters = {}) {
  return api<TestCase[]>(`/api/testcases${buildTestCaseQuery(filters)}`);
}

export const fetchTestCase = (id: string) => api<TestCase>(`/api/testcases/${id}`);

export function createTestCase(body: {
  title: string;
  flowDescription?: string;
  type: string;
  preconditions?: string;
  steps?: { order?: number; action: string; expectedResult?: string }[];
  priority: string;
  status?: string;
  executionStatus?: string;
  projectId: string;
  moduleId?: string | null;
  sprintId: string;
  assigneeId?: string | null;
  linkedBugId?: string | null;
  generatedByAi?: boolean;
}) {
  return api<TestCase>("/api/testcases", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function updateTestCase(
  id: string,
  body: Partial<{
    title: string;
    flowDescription: string;
    type: string;
    preconditions: string | null;
    steps: { order?: number; action: string; expectedResult?: string }[];
    priority: string;
    status: string;
    executionStatus: string;
    moduleId: string | null;
    sprintId: string;
    assigneeId: string | null;
    linkedBugId: string | null;
  }>,
) {
  return api<TestCase>(`/api/testcases/${id}`, {
    method: "PUT",
    body: JSON.stringify(body),
  });
}

export const deleteTestCase = (id: string) =>
  api<void>(`/api/testcases/${id}`, { method: "DELETE" });
