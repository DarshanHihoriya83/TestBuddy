import { Router } from "express";
import * as app from "../services/appService.js";
import { requireAuth } from "../middleware/auth.js";
import { canCreateBug, canDeleteBug } from "../roles.js";
import { forbidden } from "../errors.js";

const router = Router();

router.use(requireAuth);

function filtersFromQuery(query) {
  return {
    projectId: query.projectId || undefined,
    moduleId: query.moduleId || undefined,
    status: query.status || undefined,
    type: query.type || undefined,
    priority: query.priority || undefined,
    assigneeId: query.assigneeId || undefined,
    executionStatus: query.executionStatus || undefined,
  };
}

router.get("/", async (req, res, next) => {
  try {
    res.json(await app.listTestCases(req.user, filtersFromQuery(req.query)));
  } catch (err) {
    next(err);
  }
});

router.get("/:id", async (req, res, next) => {
  try {
    res.json(await app.getTestCase(req.user, req.params.id));
  } catch (err) {
    next(err);
  }
});

router.post("/", async (req, res, next) => {
  try {
    if (!canCreateBug(req.user)) throw forbidden("You cannot create test cases");
    res.status(201).json(await app.createTestCase(req.user, req.body));
  } catch (err) {
    next(err);
  }
});

router.put("/:id", async (req, res, next) => {
  try {
    if (!canCreateBug(req.user)) throw forbidden("You cannot update test cases");
    res.json(await app.updateTestCase(req.user, req.params.id, req.body));
  } catch (err) {
    next(err);
  }
});

router.delete("/:id", async (req, res, next) => {
  try {
    if (!canDeleteBug(req.user)) throw forbidden("You cannot delete test cases");
    await app.deleteTestCase(req.user, req.params.id);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

export default router;
