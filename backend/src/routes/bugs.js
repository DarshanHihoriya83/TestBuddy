import { Router } from "express";
import * as app from "../services/appService.js";
import { requireAuth } from "../middleware/auth.js";
import { badRequest, forbidden } from "../errors.js";
import { canCommentOnBug, canCreateBug, canDeleteBug } from "../roles.js";

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
    moduleId: query.moduleId || undefined,
  };
}

router.get("/", async (req, res, next) => {
  try {
    res.json(await app.listBugs(req.user, filtersFromQuery(req.query)));
  } catch (err) {
    next(err);
  }
});

router.get("/export/json", async (req, res, next) => {
  try {
    const payload = await app.exportBugs(req.user, filtersFromQuery(req.query));
    res.setHeader("Content-Disposition", 'attachment; filename="testbuddy-bugs-export.json"');
    res.json(payload);
  } catch (err) {
    next(err);
  }
});

router.get("/:id/export/json", async (req, res, next) => {
  try {
    const payload = await app.exportBug(req.user, req.params.id);
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
    if (!canCreateBug(req.user)) throw forbidden("You cannot import bugs");
    res.json(await app.importBugs(req.body, req.user));
  } catch (err) {
    next(err);
  }
});

router.get("/:id/comments", async (req, res, next) => {
  try {
    res.json(await app.listBugComments(req.user, req.params.id));
  } catch (err) {
    next(err);
  }
});

router.post("/:id/comments", async (req, res, next) => {
  try {
    if (!canCommentOnBug(req.user)) throw forbidden("You cannot comment on bugs");
    const body = req.body?.body;
    if (body == null) throw badRequest("body is required");
    res.status(201).json(await app.createBugComment(req.user, req.params.id, { body }));
  } catch (err) {
    next(err);
  }
});

router.delete("/comments/:commentId", async (req, res, next) => {
  try {
    await app.deleteBugComment(req.user, req.params.commentId);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

router.get("/:id", async (req, res, next) => {
  try {
    res.json(await app.getBug(req.user, req.params.id));
  } catch (err) {
    next(err);
  }
});

router.post("/", async (req, res, next) => {
  try {
    if (!canCreateBug(req.user)) throw forbidden("You cannot create bugs");
    res.status(201).json(await app.createBug(req.body, req.user));
  } catch (err) {
    next(err);
  }
});

router.put("/:id", async (req, res, next) => {
  try {
    res.json(await app.updateBug(req.params.id, req.body || {}, req.user));
  } catch (err) {
    next(err);
  }
});

router.delete("/:id", async (req, res, next) => {
  try {
    if (!canDeleteBug(req.user)) throw forbidden("You cannot delete bugs");
    await app.deleteBug(req.params.id, req.user);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

export default router;
