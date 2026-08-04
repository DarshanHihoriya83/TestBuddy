/** Tiny in-memory rate limiter (per-process). Good enough for local/single-node. */

const buckets = new Map();

export function rateLimit({ windowMs = 60_000, max = 20, keyFn } = {}) {
  return (req, res, next) => {
    const key = keyFn ? keyFn(req) : req.ip || req.socket?.remoteAddress || "unknown";
    const now = Date.now();
    let bucket = buckets.get(key);
    if (!bucket || now > bucket.resetAt) {
      bucket = { count: 0, resetAt: now + windowMs };
      buckets.set(key, bucket);
    }
    bucket.count += 1;
    res.setHeader("X-RateLimit-Limit", String(max));
    res.setHeader("X-RateLimit-Remaining", String(Math.max(0, max - bucket.count)));
    if (bucket.count > max) {
      const retry = Math.ceil((bucket.resetAt - now) / 1000);
      res.setHeader("Retry-After", String(retry));
      return res.status(429).json({ message: "Too many requests — try again shortly" });
    }
    next();
  };
}
