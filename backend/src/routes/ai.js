import { Router } from "express";
import { config } from "../config.js";
import { requireAuth } from "../middleware/auth.js";
import { badRequest, forbidden } from "../errors.js";
import { canCreateBug } from "../roles.js";

const router = Router();

function requireBugAuthor(req, _res, next) {
  if (!canCreateBug(req.user)) {
    return next(forbidden("You cannot use AI bug-writing helpers"));
  }
  next();
}

async function proxyAi(path, body) {
  const url = `${config.aiServiceUrl.replace(/\/$/, "")}${path}`;
  const upstream = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body),
  });
  const text = await upstream.text();
  let payload;
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    payload = { detail: text };
  }
  return { upstream, payload };
}

router.post("/ai/bug/polish", requireAuth, requireBugAuthor, async (req, res, next) => {
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

    const { upstream, payload } = await proxyAi("/ai/bug/polish", {
      title,
      description,
      mode,
    });

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

router.post("/ai/steps/humanize", requireAuth, requireBugAuthor, async (req, res, next) => {
  try {
    const steps = Array.isArray(req.body?.steps) ? req.body.steps : null;
    if (!steps?.length) throw badRequest("steps array is required");
    const title = typeof req.body?.title === "string" ? req.body.title : "";
    const description =
      typeof req.body?.description === "string" ? req.body.description : "";

    const { upstream, payload } = await proxyAi("/ai/steps/humanize", {
      title,
      description,
      steps,
    });

    if (!upstream.ok) {
      const message =
        payload?.detail ||
        payload?.message ||
        `AI service error (${upstream.status})`;
      return res.status(502).json({ message: String(message) });
    }

    res.json({
      steps: Array.isArray(payload.steps) ? payload.steps : [],
      provider: payload.provider || "unknown",
      ai: Boolean(payload.ai),
      warning: payload.warning || null,
    });
  } catch (err) {
    next(err);
  }
});

export default router;
