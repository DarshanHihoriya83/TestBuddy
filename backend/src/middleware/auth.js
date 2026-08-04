import { query } from "../db.js";
import { userIdFromToken } from "../services/jwt.js";
import { forbidden } from "../errors.js";
import { isAdmin, isSuperAdmin, normalizeRole, canCreateProject, canTransferRoles } from "../roles.js";

export async function optionalAuth(req, _res, next) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    return next();
  }
  try {
    const userId = userIdFromToken(header.slice(7));
    const { rows } = await query(
      `SELECT id, name, email, password_hash AS "passwordHash", role, active
       FROM users WHERE id = $1`,
      [userId],
    );
    const user = rows[0];
    if (user && user.active !== false) {
      req.user = user;
    }
  } catch {
    // invalid token — leave unauthenticated
  }
  next();
}

export async function requireAuth(req, res, next) {
  await optionalAuth(req, res, () => {
    if (!req.user) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    next();
  });
}

/** Require one of the listed roles (exact match). */
export function requireRoles(...allowed) {
  const set = new Set(allowed.map((r) => normalizeRole(r)).filter(Boolean));
  return (req, res, next) => {
    requireAuth(req, res, () => {
      const role = normalizeRole(req.user?.role);
      if (!role || !set.has(role)) {
        return next(forbidden("You do not have permission for this action"));
      }
      next();
    });
  };
}

export function requireAdmin(req, res, next) {
  requireAuth(req, res, () => {
    if (!isAdmin(req.user)) {
      return next(forbidden("Admin access required"));
    }
    next();
  });
}

export function requireSuperAdmin(req, res, next) {
  requireAuth(req, res, () => {
    if (!isSuperAdmin(req.user)) {
      return next(forbidden("SuperAdmin access required"));
    }
    next();
  });
}

/** SuperAdmin, Admin, or Manager — user role transfer / directory. */
export function requireRoleTransfer(req, res, next) {
  requireAuth(req, res, () => {
    if (!canTransferRoles(req.user)) {
      return next(forbidden("Only SuperAdmin, Admin, or Manager can manage user roles"));
    }
    next();
  });
}

/** SuperAdmin, Admin, or Manager — create/edit projects. */
export function requireProjectCreator(req, res, next) {
  requireAuth(req, res, () => {
    if (!canCreateProject(req.user)) {
      return next(forbidden("Admin or Manager access required to manage projects"));
    }
    next();
  });
}
