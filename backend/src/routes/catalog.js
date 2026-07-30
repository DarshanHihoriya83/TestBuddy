import { Router } from "express";
import * as app from "../services/appService.js";
import { requireAuth } from "../middleware/auth.js";
import { badRequest } from "../errors.js";

const router = Router();

router.get("/users", requireAuth, async (_req, res, next) => {
  try {
    res.json(await app.listUsers());
  } catch (err) {
    next(err);
  }
});

router.get("/projects", requireAuth, async (_req, res, next) => {
  try {
    res.json(await app.listProjects());
  } catch (err) {
    next(err);
  }
});

router.get("/projects/:id", requireAuth, async (req, res, next) => {
  try {
    res.json(await app.getProject(req.params.id));
  } catch (err) {
    next(err);
  }
});

router.post("/projects", requireAuth, async (req, res, next) => {
  try {
    res.status(201).json(await app.createProject(req.body));
  } catch (err) {
    next(err);
  }
});

router.put("/projects/:id", requireAuth, async (req, res, next) => {
  try {
    res.json(await app.updateProject(req.params.id, req.body));
  } catch (err) {
    next(err);
  }
});

router.delete("/projects/:id", requireAuth, async (req, res, next) => {
  try {
    await app.deleteProject(req.params.id);
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
    res.json(await app.listCycles(req.query.projectId));
  } catch (err) {
    next(err);
  }
});

export default router;
