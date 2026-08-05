import { query } from "../db.js";
import { verifyToken } from "../services/jwt.js";
import { forbidden } from "../errors.js";
import { isAdmin, isSuperAdmin, normalizeRole, canCreateProject, canTransferRoles } from "../roles.js";

/** A token is only good for the password it was minted under. */
function tokenPredatesPassword(issuedAt, passwordChangedAt) {
  if (!issuedAt || !passwordChangedAt) return false;
  const changedSec = Math.floor(new Date(passwordChangedAt).getTime() / 1000);
  return issuedAt < changedSec;
}

export async function optionalAuth(req, _res, next) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    return next();
  }
  try {
    const { userId, issuedAt } = verifyToken(header.slice(7));
    const { rows } = await query(
      `SELECT id, name, email, password_hash AS "passwordHash", role, active,
              must_change_password AS "mustChangePassword",
              password_changed_at AS "passwordChangedAt"
       FROM users WHERE id = $1`,
      [userId],
    );
    const user = rows[0];
    if (
      user &&
      user.active !== false &&
      !tokenPredatesPassword(issuedAt, user.passwordChangedAt)
    ) {
      req.user = user;
    }
  } catch {
    // invalid token — leave unauthenticated
  }
  next();
}

/**
 * Routes a user with a pending forced password change may still reach.
 * Explicit opt-in beats URL matching, which trailing slashes and casing defeat.
 */
export function allowPasswordChangePending(req, _res, next) {
  req.allowPasswordChangePending = true;
  next();
}

export async function requireAuth(req, res, next) {
  await optionalAuth(req, res, () => {
    if (!req.user) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    if (req.user.mustChangePassword && req.allowPasswordChangePending !== true) {
      return next(
        forbidden("You must change your temporary password before continuing"),
      );
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
      return next(forbidden("Manager or SuperAdmin access required"));
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

/** SuperAdmin or Manager — user role transfer / directory. */
export function requireRoleTransfer(req, res, next) {
  requireAuth(req, res, () => {
    if (!canTransferRoles(req.user)) {
      return next(forbidden("Only SuperAdmin or Manager can manage user roles"));
    }
    next();
  });
}

/** SuperAdmin or Manager — create/edit projects. */
export function requireProjectCreator(req, res, next) {
  requireAuth(req, res, () => {
    if (!canCreateProject(req.user)) {
      return next(forbidden("Manager or SuperAdmin access required to manage projects"));
    }
    next();
  });
}
