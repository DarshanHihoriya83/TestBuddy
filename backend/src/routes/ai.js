import { Router } from "express";
import { config } from "../config.js";
import { requireAuth } from "../middleware/auth.js";
import { badRequest } from "../errors.js";

const router = Router();

router.post("/ai/bug/polish", requireAuth, async (req, res, next) => {
  try {
    const title = typeof req.body?.title === "string" ? req.body.title : "";
    const description =
      typeof req.body?.description === "string" ? req.body.description : "";
    const mode = req.body?.mode || "both";
    if (!["both", "title", "description"].includes(mode)) {
      throw badRequest("mode must be both, title, or description");
    }
    if (!title.trim() && !description.trim()) {
      throw badRequest("title or description is required");
    }

    const url = `${config.aiServiceUrl.replace(/\/$/, "")}/ai/bug/polish`;
    const upstream = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ title, description, mode }),
    });

    const text = await upstream.text();
    let payload;
    try {
      payload = text ? JSON.parse(text) : {};
    } catch {
      payload = { detail: text };
    }

    if (!upstream.ok) {
      const message =
        payload?.detail ||
        payload?.message ||
        `AI service error (${upstream.status})`;
      return res.status(502).json({ message: String(message) });
    }

    res.json({
      title: payload.title || title,
      description: payload.description || description,
      provider: payload.provider || "unknown",
      ai: Boolean(payload.ai),
      warning: payload.warning || null,
    });
  } catch (err) {
    next(err);
  }
});

export default router;
