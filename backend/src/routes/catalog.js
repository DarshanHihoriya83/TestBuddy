import { Router } from "express";
import * as app from "../services/appService.js";
import { requireAuth, requireProjectCreator } from "../middleware/auth.js";
import { badRequest, forbidden } from "../errors.js";
import { canManageModules, canManageProjectMembers, canManageEnvironments, canManageSprints } from "../roles.js";

const router = Router();

router.get("/projects", requireAuth, async (req, res, next) => {
  try {
    const organizationId =
      typeof req.query.organizationId === "string" && req.query.organizationId.trim()
        ? req.query.organizationId.trim()
        : undefined;
    res.json(await app.listProjects(req.user, { organizationId }));
  } catch (err) {
    next(err);
  }
});

router.get("/projects/quota", requireAuth, async (req, res, next) => {
  try {
    res.json(await app.getProjectCreationQuota(req.user));
  } catch (err) {
    next(err);
  }
});

router.get("/projects/:id/members", requireAuth, async (req, res, next) => {
  try {
    res.json(await app.listProjectMembers(req.user, req.params.id));
  } catch (err) {
    next(err);
  }
});

router.post("/projects/:id/members", requireAuth, async (req, res, next) => {
  try {
    if (!canManageProjectMembers(req.user)) {
      throw forbidden("You cannot manage project members");
    }
    const userId = req.body?.userId;
    if (!userId) throw badRequest("userId is required");
    res.status(201).json(await app.addProjectMember(req.user, req.params.id, userId));
  } catch (err) {
    next(err);
  }
});

router.delete("/projects/:id/members/:userId", requireAuth, async (req, res, next) => {
  try {
    if (!canManageProjectMembers(req.user)) {
      throw forbidden("You cannot manage project members");
    }
    await app.removeProjectMember(req.user, req.params.id, req.params.userId);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

router.get("/projects/:id/modules", requireAuth, async (req, res, next) => {
  try {
    res.json(await app.listModules(req.user, req.params.id));
  } catch (err) {
    next(err);
  }
});

router.post("/projects/:id/modules", requireAuth, async (req, res, next) => {
  try {
    if (!canManageModules(req.user)) throw forbidden("You cannot manage modules");
    res.status(201).json(await app.createModule(req.user, req.params.id, req.body || {}));
  } catch (err) {
    next(err);
  }
});

router.put("/modules/:id", requireAuth, async (req, res, next) => {
  try {
    if (!canManageModules(req.user)) throw forbidden("You cannot manage modules");
    res.json(await app.updateModule(req.user, req.params.id, req.body || {}));
  } catch (err) {
    next(err);
  }
});

router.delete("/modules/:id", requireAuth, async (req, res, next) => {
  try {
    if (!canManageModules(req.user)) throw forbidden("You cannot manage modules");
    await app.deleteModule(req.user, req.params.id);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

router.get("/projects/:id", requireAuth, async (req, res, next) => {
  try {
    res.json(await app.getProject(req.user, req.params.id));
  } catch (err) {
    next(err);
  }
});

router.post("/projects", requireProjectCreator, async (req, res, next) => {
  try {
    res.status(201).json(await app.createProject(req.user, req.body || {}));
  } catch (err) {
    next(err);
  }
});

router.put("/projects/:id", requireProjectCreator, async (req, res, next) => {
  try {
    res.json(await app.updateProject(req.user, req.params.id, req.body || {}));
  } catch (err) {
    next(err);
  }
});

router.delete("/projects/:id", requireProjectCreator, async (req, res, next) => {
  try {
    await app.deleteProject(req.user, req.params.id);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

router.get("/cycles", requireAuth, async (req, res, next) => {
  try {
    if (!req.query.projectId) {
      throw badRequest("projectId is required");
    }
    res.json(await app.listSprints(req.user, req.query.projectId));
  } catch (err) {
    next(err);
  }
});

router.get("/sprints", requireAuth, async (req, res, next) => {
  try {
    if (!req.query.projectId) {
      throw badRequest("projectId is required");
    }
    res.json(await app.listSprints(req.user, req.query.projectId));
  } catch (err) {
    next(err);
  }
});

router.post("/projects/:id/sprints", requireAuth, async (req, res, next) => {
  try {
    if (!canManageSprints(req.user)) throw forbidden("You cannot manage sprints");
    res.status(201).json(await app.createSprint(req.user, req.params.id, req.body || {}));
  } catch (err) {
    next(err);
  }
});

router.put("/sprints/:id", requireAuth, async (req, res, next) => {
  try {
    if (!canManageSprints(req.user)) throw forbidden("You cannot manage sprints");
    res.json(await app.updateSprint(req.user, req.params.id, req.body || {}));
  } catch (err) {
    next(err);
  }
});

router.delete("/sprints/:id", requireAuth, async (req, res, next) => {
  try {
    if (!canManageSprints(req.user)) throw forbidden("You cannot manage sprints");
    await app.deleteSprint(req.user, req.params.id);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

router.post("/projects/:id/ado/test", requireAuth, async (req, res, next) => {
  try {
    if (!canManageSprints(req.user)) throw forbidden("You cannot manage Azure DevOps settings");
    res.json(await app.testProjectAdoConnection(req.user, req.params.id));
  } catch (err) {
    next(err);
  }
});

router.get("/projects/:id/ado/iterations", requireAuth, async (req, res, next) => {
  try {
    if (!canManageSprints(req.user)) throw forbidden("You cannot manage Azure DevOps settings");
    res.json(await app.listProjectAdoIterations(req.user, req.params.id));
  } catch (err) {
    next(err);
  }
});

router.post("/projects/:id/sprints/import-ado", requireAuth, async (req, res, next) => {
  try {
    if (!canManageSprints(req.user)) throw forbidden("You cannot manage sprints");
    res.status(201).json(await app.importAdoSprints(req.user, req.params.id, req.body || {}));
  } catch (err) {
    next(err);
  }
});

router.get("/projects/:id/environments", requireAuth, async (req, res, next) => {
  try {
    res.json(await app.listEnvironments(req.user, req.params.id));
  } catch (err) {
    next(err);
  }
});

router.post("/projects/:id/environments", requireAuth, async (req, res, next) => {
  try {
    if (!canManageEnvironments(req.user)) {
      throw forbidden("You cannot manage environments");
    }
    res.status(201).json(await app.createEnvironment(req.user, req.params.id, req.body || {}));
  } catch (err) {
    next(err);
  }
});

router.put("/environments/:id", requireAuth, async (req, res, next) => {
  try {
    if (!canManageEnvironments(req.user)) {
      throw forbidden("You cannot manage environments");
    }
    res.json(await app.updateEnvironment(req.user, req.params.id, req.body || {}));
  } catch (err) {
    next(err);
  }
});

router.delete("/environments/:id", requireAuth, async (req, res, next) => {
  try {
    if (!canManageEnvironments(req.user)) {
      throw forbidden("You cannot manage environments");
    }
    await app.deleteEnvironment(req.user, req.params.id);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

export default router;
