import type {
  Bug,
  BugComment,
  BugFilters,
  Cycle,
  Module,
  Organization,
  Project,
  ProjectCreationQuota,
  Step,
  User,
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
    const isAuthAttempt =
      path.includes("/api/auth/login") || path.includes("/api/auth/register");
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

export function updateProfile(body: {
  name: string;
  currentPassword?: string;
  newPassword?: string;
}) {
  return api<User>("/api/auth/profile", {
    method: "PUT",
    body: JSON.stringify(body),
  });
}

export const fetchUsers = (projectId?: string) =>
  api<User[]>(
    projectId
      ? `/api/users?projectId=${encodeURIComponent(projectId)}`
      : "/api/users",
  );

export const fetchAdminUsers = (projectId?: string) =>
  api<User[]>(
    projectId
      ? `/api/users/admin?projectId=${encodeURIComponent(projectId)}`
      : "/api/users/admin",
  );

export function adminCreateUser(body: {
  name: string;
  email: string;
  password: string;
  role: string;
  projectIds?: string[];
}) {
  return api<User>("/api/users", {
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
    newPassword?: string;
  },
) {
  return api<User>(`/api/users/${id}`, {
    method: "PUT",
    body: JSON.stringify(body),
  });
}

export function adminResetPassword(id: string, newPassword: string) {
  return api<User>(`/api/users/${id}/reset-password`, {
    method: "POST",
    body: JSON.stringify({ newPassword }),
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
  cycleCount: number;
  bugCount: number;
  memberCount?: number;
  moduleCount?: number;
}

export const fetchProject = (id: string) => api<ProjectDetail>(`/api/projects/${id}`);

export type ProjectPayload = {
  name: string;
  organizationId: string;
  jiraProjectKey?: string;
  adoOrgUrl?: string;
  adoProject?: string;
};

export const createProject = (body: ProjectPayload) =>
  api<Project>("/api/projects", { method: "POST", body: JSON.stringify(body) });

export const updateProject = (
  id: string,
  body: Omit<ProjectPayload, "organizationId"> & { organizationId?: string },
) => api<Project>(`/api/projects/${id}`, { method: "PUT", body: JSON.stringify(body) });

export const deleteProject = (id: string) =>
  api<void>(`/api/projects/${id}`, { method: "DELETE" });

export const fetchOrganizations = () => api<Organization[]>("/api/organizations");

export const fetchOrganization = (id: string) =>
  api<Organization>(`/api/organizations/${id}`);

export function createOrganization(body: { name: string }) {
  return api<Organization>("/api/organizations", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function updateOrganization(id: string, body: { name: string }) {
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

export function createModule(projectId: string, body: { name: string }) {
  return api<Module>(`/api/projects/${projectId}/modules`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function updateModule(id: string, body: { name: string }) {
  return api<Module>(`/api/modules/${id}`, {
    method: "PUT",
    body: JSON.stringify(body),
  });
}

export function deleteModule(id: string) {
  return api<void>(`/api/modules/${id}`, { method: "DELETE" });
}

export const fetchBugComments = (bugId: string) =>
  api<BugComment[]>(`/api/bugs/${bugId}/comments`);

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
    cycleId: string;
    projectId: string;
    moduleId?: string | null;
    status: string;
    steps?: Step[];
  },
) {
  return api<Bug>(`/api/bugs/${id}`, {
    method: "PUT",
    body: JSON.stringify(body),
  });
}

export const deleteBug = (id: string) =>
  api<void>(`/api/bugs/${id}`, { method: "DELETE" });

export const fetchCycles = (projectId: string) =>
  api<Cycle[]>(`/api/cycles?projectId=${encodeURIComponent(projectId)}`);

export function fetchBugs(filters: BugFilters = {}) {
  return api<Bug[]>(`/api/bugs${buildBugQuery(filters)}`);
}

export const fetchBug = (id: string) => api<Bug>(`/api/bugs/${id}`);

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
  if (filters.cycleId) params.set("cycleId", filters.cycleId);
  if (filters.status) params.set("status", filters.status);
  if (filters.moduleId) params.set("moduleId", filters.moduleId);
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
