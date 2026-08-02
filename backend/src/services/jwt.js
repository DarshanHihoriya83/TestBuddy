import jwt from "jsonwebtoken";
import { config } from "../config.js";

export function generateToken(userId, email) {
  return jwt.sign({ email }, config.jwtSecret, {
    subject: String(userId),
    expiresIn: Math.floor(config.jwtExpirationMs / 1000),
  });
}

export function userIdFromToken(token) {
  const payload = jwt.verify(token, config.jwtSecret);
  const sub = payload.sub ?? payload.userId;
  if (!sub) throw new Error("Token missing subject");
  return String(sub);
}
