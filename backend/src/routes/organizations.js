import { Router } from "express";
import * as app from "../services/appService.js";
import { requireAuth, requireSuperAdmin } from "../middleware/auth.js";
import { badRequest, forbidden } from "../errors.js";
import { canManageOrgMembers } from "../roles.js";

const router = Router();

router.get("/", requireAuth, async (req, res, next) => {
  try {
    res.json(await app.listOrganizations(req.user));
  } catch (err) {
    next(err);
  }
});

router.post("/", requireSuperAdmin, async (req, res, next) => {
  try {
    res.status(201).json(await app.createOrganization(req.user, req.body || {}));
  } catch (err) {
    next(err);
  }
});

router.get("/:id/members", requireAuth, async (req, res, next) => {
  try {
    res.json(await app.listOrganizationMembers(req.user, req.params.id));
  } catch (err) {
    next(err);
  }
});

router.post("/:id/members", requireAuth, async (req, res, next) => {
  try {
    if (!canManageOrgMembers(req.user)) {
      throw forbidden("Only SuperAdmin or Admin can add organization members");
    }
    const userId = req.body?.userId;
    if (!userId) throw badRequest("userId is required");
    res.status(201).json(await app.addOrganizationMember(req.user, req.params.id, userId));
  } catch (err) {
    next(err);
  }
});

router.delete("/:id/members/:userId", requireAuth, async (req, res, next) => {
  try {
    if (!canManageOrgMembers(req.user)) {
      throw forbidden("Only SuperAdmin or Admin can remove organization members");
    }
    await app.removeOrganizationMember(req.user, req.params.id, req.params.userId);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

router.get("/:id", requireAuth, async (req, res, next) => {
  try {
    res.json(await app.getOrganization(req.user, req.params.id));
  } catch (err) {
    next(err);
  }
});

router.put("/:id", requireSuperAdmin, async (req, res, next) => {
  try {
    res.json(await app.updateOrganization(req.user, req.params.id, req.body || {}));
  } catch (err) {
    next(err);
  }
});

router.delete("/:id", requireSuperAdmin, async (req, res, next) => {
  try {
    await app.deleteOrganization(req.user, req.params.id);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

export default router;
