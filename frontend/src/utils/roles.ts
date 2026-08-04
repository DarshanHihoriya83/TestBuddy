import type { User, UserRole } from "../types";

export function isSuperAdmin(user: User | null | undefined) {
  return user?.role === "SUPERADMIN";
}

export function isAdmin(user: User | null | undefined) {
  return user?.role === "SUPERADMIN" || user?.role === "ADMIN";
}

export function isManager(user: User | null | undefined) {
  return user?.role === "MANAGER";
}

/** SuperAdmin, Admin, or Manager — may transfer / change user roles. */
export function canTransferRoles(user: User | null | undefined) {
  const r = user?.role;
  return r === "SUPERADMIN" || r === "ADMIN" || r === "MANAGER";
}

export function canCreateProject(user: User | null | undefined) {
  const r = user?.role;
  return r === "SUPERADMIN" || r === "ADMIN" || r === "MANAGER";
}

/** Project members add/remove — SuperAdmin or Manager only. */
export function canManageProjectMembers(user: User | null | undefined) {
  const r = user?.role;
  return r === "SUPERADMIN" || r === "MANAGER";
}

export function canManageModules(user: User | null | undefined) {
  const r = user?.role;
  return r === "SUPERADMIN" || r === "ADMIN" || r === "MANAGER" || r === "TESTER";
}

export function canCreateBug(user: User | null | undefined) {
  const r = user?.role;
  return r === "SUPERADMIN" || r === "ADMIN" || r === "MANAGER" || r === "TESTER";
}

export function canFullEditBug(user: User | null | undefined) {
  const r = user?.role;
  // Testers may edit bug content; Developers stay status-only
  return r === "SUPERADMIN" || r === "ADMIN" || r === "MANAGER" || r === "TESTER";
}

export function canUpdateBugStatus(user: User | null | undefined) {
  const r = user?.role;
  return (
    r === "SUPERADMIN" ||
    r === "ADMIN" ||
    r === "MANAGER" ||
    r === "DEVELOPER" ||
    r === "TESTER"
  );
}

export function canCommentOnBug(user: User | null | undefined) {
  const r = user?.role;
  return (
    r === "SUPERADMIN" ||
    r === "ADMIN" ||
    r === "MANAGER" ||
    r === "DEVELOPER" ||
    r === "TESTER"
  );
}

export function canDeleteBug(user: User | null | undefined) {
  const r = user?.role;
  return r === "SUPERADMIN" || r === "ADMIN" || r === "MANAGER";
}

export function canCreateOrganization(user: User | null | undefined) {
  return isSuperAdmin(user);
}

export function canManageOrgMembers(user: User | null | undefined) {
  return isSuperAdmin(user) || user?.role === "ADMIN";
}

/** Roles the current actor may assign when creating/editing users. */
export function assignableRoles(actor: User | null | undefined): UserRole[] {
  if (!actor) return [];
  if (actor.role === "SUPERADMIN") {
    return ["SUPERADMIN", "ADMIN", "MANAGER", "DEVELOPER", "TESTER"];
  }
  if (actor.role === "ADMIN") {
    return ["MANAGER", "DEVELOPER", "TESTER"];
  }
  if (actor.role === "MANAGER") {
    return ["DEVELOPER", "TESTER"];
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
  if (actor.role === "ADMIN") {
    return targetRole === "MANAGER" || targetRole === "DEVELOPER" || targetRole === "TESTER";
  }
  if (actor.role === "MANAGER") {
    return targetRole === "DEVELOPER" || targetRole === "TESTER";
  }
  return false;
}

/** Can actor change this user's role (not self)? Only SuperAdmin / Admin / Manager. */
export function canChangeUserRole(
  actor: User | null | undefined,
  target: User | null | undefined,
): boolean {
  if (!actor || !target) return false;
  if (!canTransferRoles(actor)) return false;
  if (actor.id === target.id) return false;
  return canManageRole(actor, target.role);
}

export function roleLabel(role: string) {
  switch (role) {
    case "SUPERADMIN":
      return "Super Admin";
    case "ADMIN":
      return "Admin";
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
