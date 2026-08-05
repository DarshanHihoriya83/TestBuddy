import jwt from "jsonwebtoken";
import { config } from "../config.js";

/**
 * `issuedAtSeconds` pins `iat` to the moment the password was set, so the token
 * a password change hands back is never mistaken for a pre-change token.
 */
export function generateToken(userId, email, issuedAtSeconds) {
  const payload = { email };
  if (Number.isFinite(issuedAtSeconds)) {
    payload.iat = Math.floor(issuedAtSeconds);
  }
  return jwt.sign(payload, config.jwtSecret, {
    subject: String(userId),
    expiresIn: Math.floor(config.jwtExpirationMs / 1000),
  });
}

export function verifyToken(token) {
  const payload = jwt.verify(token, config.jwtSecret);
  const sub = payload.sub ?? payload.userId;
  if (!sub) throw new Error("Token missing subject");
  return { userId: String(sub), issuedAt: payload.iat ?? null };
}

export function userIdFromToken(token) {
  return verifyToken(token).userId;
}
