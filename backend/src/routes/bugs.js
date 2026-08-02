import { Router } from "express";
import * as app from "../services/appService.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

router.use(requireAuth);

function filtersFromQuery(query) {
  return {
    projectId: query.projectId || undefined,
    priority: query.priority || undefined,
    severity: query.severity || undefined,
    assigneeId: query.assigneeId || undefined,
    cycleId: query.cycleId || undefined,
    status: query.status || undefined,
  };
}

router.get("/", async (req, res, next) => {
  try {
    res.json(await app.listBugs(filtersFromQuery(req.query)));
  } catch (err) {
    next(err);
  }
});

router.get("/export/json", async (req, res, next) => {
  try {
    const payload = await app.exportBugs(filtersFromQuery(req.query));
    res.setHeader("Content-Disposition", 'attachment; filename="testbuddy-bugs-export.json"');
    res.json(payload);
  } catch (err) {
    next(err);
  }
});

router.get("/:id/export/json", async (req, res, next) => {
  try {
    const payload = await app.exportBug(req.params.id);
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="testbuddy-bug-${req.params.id}.json"`,
    );
    res.json(payload);
  } catch (err) {
    next(err);
  }
});

router.post("/import", async (req, res, next) => {
  try {
    res.json(await app.importBugs(req.body, req.user));
  } catch (err) {
    next(err);
  }
});

router.get("/:id", async (req, res, next) => {
  try {
    res.json(await app.getBug(req.params.id));
  } catch (err) {
    next(err);
  }
});

router.post("/", async (req, res, next) => {
  try {
    res.status(201).json(await app.createBug(req.body, req.user));
  } catch (err) {
    next(err);
  }
});

router.put("/:id", async (req, res, next) => {
  try {
    res.json(await app.updateBug(req.params.id, req.body));
  } catch (err) {
    next(err);
  }
});

router.delete("/:id", async (req, res, next) => {
  try {
    await app.deleteBug(req.params.id);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

export default router;
