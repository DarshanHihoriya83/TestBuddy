import { Router } from "express";
import * as app from "../services/appService.js";
import { optionalAuth, requireAuth } from "../middleware/auth.js";
import { rateLimit } from "../middleware/rateLimit.js";

const router = Router();

router.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "testbuddy-backend" });
});

router.post(
  "/auth/login",
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 30,
    keyFn: (req) => `login:${req.ip}:${String(req.body?.email || "").toLowerCase()}`,
  }),
  async (req, res, next) => {
    try {
      res.json(await app.login(req.body));
    } catch (err) {
      next(err);
    }
  },
);

router.post(
  "/auth/register",
  rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 20,
    keyFn: (req) => `register:${req.ip}`,
  }),
  async (req, res, next) => {
    try {
      res.json(await app.register(req.body));
    } catch (err) {
      next(err);
    }
  },
);

router.get("/auth/me", optionalAuth, async (req, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    res.json(app.currentUser(req.user));
  } catch (err) {
    next(err);
  }
});

router.put("/auth/profile", requireAuth, async (req, res, next) => {
  try {
    res.json(await app.updateProfile(req.user, req.body));
  } catch (err) {
    next(err);
  }
});

export default router;
