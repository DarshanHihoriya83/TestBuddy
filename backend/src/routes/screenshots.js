import { Router } from "express";
import * as app from "../services/appService.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

router.get("/:id", requireAuth, async (req, res, next) => {
  try {
    const { row, buffer } = await app.readScreenshotBytes(req.params.id);
    res.setHeader("Content-Type", row.content_type || "image/jpeg");
    res.setHeader("Cache-Control", "private, max-age=3600");
    res.send(buffer);
  } catch (err) {
    next(err);
  }
});

export default router;
