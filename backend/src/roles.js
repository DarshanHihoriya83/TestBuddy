/** Role hierarchy helpers for TestBuddy RBAC. */

export const ROLES = Object.freeze([
  "SUPERADMIN",
  "MANAGER",
  "DEVELOPER",
  "TESTER",
]);

/** Roles assignable via public self-registration — always TESTER only. */
export const PUBLIC_REGISTER_ROLES = Object.freeze(["TESTER"]);

const RANK = {
  SUPERADMIN: 100,
  MANAGER: 80,
  DEVELOPER: 40,
  TESTER: 20,
};

export function normalizeRole(role) {
  const r = String(role || "").trim().toUpperCase();
  return ROLES.includes(r) ? r : null;
}

export function roleRank(role) {
  return RANK[normalizeRole(role)] ?? 0;
}

export function isSuperAdmin(user) {
  return normalizeRole(user?.role) === "SUPERADMIN";
}

/** Elevated staff: SuperAdmin or Manager (former Admin rights live on Manager). */
export function isAdmin(user) {
  const r = normalizeRole(user?.role);
  return r === "SUPERADMIN" || r === "MANAGER";
}

export function isManager(user) {
  return normalizeRole(user?.role) === "MANAGER";
}

/** SuperAdmin or Manager — may transfer / change user roles. */
export function canTransferRoles(user) {
  const r = normalizeRole(user?.role);
  return r === "SUPERADMIN" || r === "MANAGER";
}

/** Can `actor` manage (create/update/delete) a user with `targetRole`? */
export function canManageRole(actor, targetRole) {
  const a = normalizeRole(actor?.role);
  const t = normalizeRole(targetRole);
  if (!a || !t) return false;
  if (a === "SUPERADMIN") return true;
  if (a === "MANAGER") {
    // Managers manage staff roles (former Admin scope), not SUPERADMIN
    return t === "MANAGER" || t === "DEVELOPER" || t === "TESTER";
  }
  return false;
}

export function canAssignRole(actor, newRole) {
  return canManageRole(actor, newRole);
}

export function canCreateOrganization(user) {
  return isSuperAdmin(user);
}

export function canCreateProject(user) {
  const r = normalizeRole(user?.role);
  return r === "SUPERADMIN" || r === "MANAGER";
}

/** Project members add/remove — SuperAdmin or Manager only. */
export function canManageProjectMembers(user) {
  const r = normalizeRole(user?.role);
  return r === "SUPERADMIN" || r === "MANAGER";
}

export function canManageModules(user) {
  const r = normalizeRole(user?.role);
  return r === "SUPERADMIN" || r === "MANAGER" || r === "TESTER";
}

export function canCreateBug(user) {
  const r = normalizeRole(user?.role);
  return r === "SUPERADMIN" || r === "MANAGER" || r === "TESTER";
}

export function canFullEditBug(user) {
  const r = normalizeRole(user?.role);
  // Testers may edit bug content they can access; Developers stay status-only
  return r === "SUPERADMIN" || r === "MANAGER" || r === "TESTER";
}

export function canUpdateBugStatus(user) {
  const r = normalizeRole(user?.role);
  return (
    r === "SUPERADMIN" ||
    r === "MANAGER" ||
    r === "DEVELOPER" ||
    r === "TESTER"
  );
}

export function canCommentOnBug(user) {
  const r = normalizeRole(user?.role);
  return (
    r === "SUPERADMIN" ||
    r === "MANAGER" ||
    r === "DEVELOPER" ||
    r === "TESTER"
  );
}

export function canDeleteBug(user) {
  const r = normalizeRole(user?.role);
  return r === "SUPERADMIN" || r === "MANAGER";
}

export function canManageOrgMembers(user) {
  return isSuperAdmin(user) || normalizeRole(user?.role) === "MANAGER";
}
