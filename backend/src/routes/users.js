import { Router } from "express";
import * as app from "../services/appService.js";
import { requireAdmin, requireAuth, requireRoleTransfer, requireSuperAdmin } from "../middleware/auth.js";
import { rateLimit } from "../middleware/rateLimit.js";
import { noStore } from "../middleware/noStore.js";
import { clientIp, logSecurityEvent } from "../services/audit.js";
import { badRequest } from "../errors.js";

const router = Router();

/** Assignees dropdown — active users visible to the caller (shared org/project). */
router.get("/", requireAuth, async (req, res, next) => {
  try {
    const projectId =
      typeof req.query.projectId === "string" && req.query.projectId.trim()
        ? req.query.projectId.trim()
        : undefined;
    const users = await app.listUsers(req.user, { projectId });
    res.json(users.filter((u) => u.active !== false));
  } catch (err) {
    next(err);
  }
});

/** Full directory including inactive — SuperAdmin / Manager. */
router.get("/admin", requireRoleTransfer, async (req, res, next) => {
  try {
    const projectId =
      typeof req.query.projectId === "string" && req.query.projectId.trim()
        ? req.query.projectId.trim()
        : undefined;
    res.json(await app.listUsers(req.user, { projectId, directory: true }));
  } catch (err) {
    next(err);
  }
});

router.get("/:id", requireRoleTransfer, async (req, res, next) => {
  try {
    res.json(await app.getUser(req.params.id));
  } catch (err) {
    next(err);
  }
});

router.get("/:id/memberships", requireRoleTransfer, async (req, res, next) => {
  try {
    res.json(await app.getUserMemberships(req.user, req.params.id));
  } catch (err) {
    next(err);
  }
});

// noStore: the response body carries a plaintext temporary password.
router.post("/", requireAdmin, noStore, async (req, res, next) => {
  try {
    const { name, email, role, organizationId, projectIds } = req.body || {};
    if (!name || !email || !role) {
      throw badRequest("name, email, and role are required");
    }
    const user = await app.adminCreateUser(req.user, {
      name,
      email,
      role,
      organizationId,
      projectIds,
    });
    logSecurityEvent("user.created", {
      actorId: req.user.id,
      targetId: user.id,
      targetRole: user.role,
      ip: clientIp(req),
    });
    res.status(201).json(user);
  } catch (err) {
    next(err);
  }
});

router.post(
  "/:id/reset-password",
  requireRoleTransfer,
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 30,
    keyFn: (req) => `reset-password:${req.user?.id || req.ip}`,
  }),
  noStore,
  async (req, res, next) => {
    try {
      const result = await app.adminResetPassword(req.user, req.params.id);
      logSecurityEvent("password.admin_reset", {
        actorId: req.user.id,
        targetId: result.id,
        targetRole: result.role,
        ip: clientIp(req),
      });
      res.json(result);
    } catch (err) {
      next(err);
    }
  },
);

router.put("/:id", requireRoleTransfer, async (req, res, next) => {
  try {
    const body = req.body || {};
    const result = await app.adminUpdateUser(req.user, req.params.id, body);
    if (typeof body.active === "boolean") {
      logSecurityEvent(body.active ? "user.activated" : "user.deactivated", {
        actorId: req.user.id,
        targetId: result.id,
        targetRole: result.role,
        ip: clientIp(req),
      });
    }
    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.delete("/:id/permanent", requireSuperAdmin, async (req, res, next) => {
  try {
    await app.adminHardDeleteUser(req.user, req.params.id);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

router.delete("/:id", requireAdmin, async (req, res, next) => {
  try {
    const result = await app.adminDeleteUser(req.user, req.params.id);
    logSecurityEvent("user.deactivated", {
      actorId: req.user.id,
      targetId: result.id,
      targetRole: result.role,
      ip: clientIp(req),
    });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

export default router;
