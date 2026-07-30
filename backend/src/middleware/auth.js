import { query } from "../db.js";
import { userIdFromToken } from "../services/jwt.js";

export async function optionalAuth(req, _res, next) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    return next();
  }
  try {
    const userId = userIdFromToken(header.slice(7));
    const { rows } = await query(
      `SELECT id, name, email, password_hash AS "passwordHash", role
       FROM users WHERE id = $1`,
      [userId],
    );
    if (rows[0]) {
      req.user = rows[0];
    }
  } catch {
    // invalid token — leave unauthenticated
  }
  next();
}

export async function requireAuth(req, res, next) {
  await optionalAuth(req, res, () => {
    if (!req.user) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    next();
  });
}
