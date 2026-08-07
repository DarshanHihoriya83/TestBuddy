import type { User, UserRole } from "../types";

export function isSuperAdmin(user: User | null | undefined) {
  return user?.role === "SUPERADMIN";
}

/** Elevated staff: SuperAdmin or Manager (former Admin rights). */
export function isAdmin(user: User | null | undefined) {
  return user?.role === "SUPERADMIN" || user?.role === "MANAGER";
}

export function isManager(user: User | null | undefined) {
  return user?.role === "MANAGER";
}

/** SuperAdmin or Manager — may transfer / change user roles. */
export function canTransferRoles(user: User | null | undefined) {
  const r = user?.role;
  return r === "SUPERADMIN" || r === "MANAGER";
}

export function canCreateProject(user: User | null | undefined) {
  const r = user?.role;
  return r === "SUPERADMIN" || r === "MANAGER";
}

/** Project members add/remove — SuperAdmin or Manager only. */
export function canManageProjectMembers(user: User | null | undefined) {
  const r = user?.role;
  return r === "SUPERADMIN" || r === "MANAGER";
}

export function canManageModules(user: User | null | undefined) {
  const r = user?.role;
  return r === "MANAGER" || r === "TESTER";
}

/** Project environments — SuperAdmin or Manager only. */
export function canManageEnvironments(user: User | null | undefined) {
  const r = user?.role;
  return r === "SUPERADMIN" || r === "MANAGER";
}

export function canManageSprints(user: User | null | undefined) {
  const r = user?.role;
  return r === "SUPERADMIN" || r === "MANAGER";
}

export function canCreateBug(user: User | null | undefined) {
  const r = user?.role;
  return r === "SUPERADMIN" || r === "MANAGER" || r === "TESTER";
}

export function canFullEditBug(user: User | null | undefined) {
  const r = user?.role;
  // Testers may edit bug content; Developers stay status-only
  return r === "SUPERADMIN" || r === "MANAGER" || r === "TESTER";
}

export function canUpdateBugStatus(user: User | null | undefined) {
  const r = user?.role;
  return r === "SUPERADMIN" || r === "MANAGER" || r === "DEVELOPER" || r === "TESTER";
}

export function canCommentOnBug(user: User | null | undefined) {
  const r = user?.role;
  return r === "SUPERADMIN" || r === "MANAGER" || r === "DEVELOPER" || r === "TESTER";
}

export function canDeleteBug(user: User | null | undefined) {
  const r = user?.role;
  return r === "SUPERADMIN" || r === "MANAGER";
}

export function canCreateOrganization(user: User | null | undefined) {
  return isSuperAdmin(user);
}

export function canManageOrgMembers(user: User | null | undefined) {
  return isSuperAdmin(user) || user?.role === "MANAGER";
}

/** Roles the current actor may assign when creating/editing users. */
export function assignableRoles(actor: User | null | undefined): UserRole[] {
  if (!actor) return [];
  if (actor.role === "SUPERADMIN") {
    return ["MANAGER", "DEVELOPER", "TESTER"];
  }
  if (actor.role === "MANAGER") {
    return ["MANAGER", "DEVELOPER", "TESTER"];
  }
  return [];
}

/** Can actor manage (edit/deactivate/change-role) a user with this role? */
export function canManageRole(
  actor: User | null | undefined,
  targetRole: UserRole | string,
): boolean {
  if (!actor) return false;
  if (actor.role === "SUPERADMIN") return true;
  if (actor.role === "MANAGER") {
    return targetRole === "MANAGER" || targetRole === "DEVELOPER" || targetRole === "TESTER";
  }
  return false;
}

/** Can actor change this user's role (not self)? Only SuperAdmin / Manager. */
export function canChangeUserRole(
  actor: User | null | undefined,
  target: User | null | undefined,
): boolean {
  if (!actor || !target) return false;
  if (!canTransferRoles(actor)) return false;
  if (actor.id === target.id) return false;
  return canManageRole(actor, target.role);
}

/** Can actor assign work (bug/test case) to this user? SuperAdmin is never a work assignee. */
export function canAssignWorkTo(
  actor: User | null | undefined,
  target: User | null | undefined,
): boolean {
  if (!actor || !target) return false;
  if (target.active === false) return false;
  if (target.role === "SUPERADMIN") return false;
  return true;
}

/** Active users available in bug/test-case assignee dropdowns (never includes SuperAdmin). */
export function assignableUsers(
  _actor: User | null | undefined,
  users: User[],
): User[] {
  return users.filter((u) => u.active !== false && u.role !== "SUPERADMIN");
}

/** Users that may be added as org/project members. SuperAdmin is platform-scoped. */
export function addableMemberUsers(
  _actor: User | null | undefined,
  users: User[],
): User[] {
  return users.filter((u) => u.active !== false && u.role !== "SUPERADMIN");
}

export function roleLabel(role: string) {
  switch (role) {
    case "SUPERADMIN":
      return "Super Admin";
    case "MANAGER":
      return "Manager";
    case "DEVELOPER":
      return "Developer";
    case "TESTER":
      return "Tester";
    default:
      return role;
  }
}
