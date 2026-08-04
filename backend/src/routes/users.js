import { Router } from "express";
import * as app from "../services/appService.js";
import { requireAdmin, requireAuth, requireRoleTransfer, requireSuperAdmin } from "../middleware/auth.js";
import { badRequest, forbidden } from "../errors.js";
import { isManager } from "../roles.js";

const router = Router();

function definedKeys(body) {
  return Object.keys(body || {}).filter((k) => body[k] !== undefined);
}

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

/** Full directory including inactive — SuperAdmin / Admin / Manager. */
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

router.post("/", requireAdmin, async (req, res, next) => {
  try {
    const { name, email, password, role, projectIds } = req.body || {};
    if (!name || !email || !password || !role) {
      throw badRequest("name, email, password, and role are required");
    }
    const user = await app.adminCreateUser(req.user, { name, email, password, role });
    if (Array.isArray(projectIds)) {
      for (const projectId of projectIds) {
        if (!projectId) continue;
        await app.addProjectMember(req.user, projectId, user.id, { requireManage: true });
      }
    }
    res.status(201).json(user);
  } catch (err) {
    next(err);
  }
});

router.post("/:id/reset-password", requireRoleTransfer, async (req, res, next) => {
  try {
    const newPassword = req.body?.newPassword;
    if (!newPassword) throw badRequest("newPassword is required");
    res.json(await app.adminResetPassword(req.user, req.params.id, newPassword));
  } catch (err) {
    next(err);
  }
});

router.put("/:id", requireRoleTransfer, async (req, res, next) => {
  try {
    const body = req.body || {};
    // Managers may only transfer roles — not edit profile / password / active
    if (isManager(req.user)) {
      const keys = definedKeys(body);
      if (keys.some((k) => k !== "role")) {
        throw forbidden("Managers can only change user roles");
      }
      if (!body.role) throw badRequest("role is required");
    }
    res.json(await app.adminUpdateUser(req.user, req.params.id, body));
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
    await app.adminDeleteUser(req.user, req.params.id);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

export default router;
