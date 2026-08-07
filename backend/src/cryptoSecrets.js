import crypto from "crypto";
import { config } from "./config.js";

const ALGO = "aes-256-gcm";

function deriveKey() {
  return crypto.createHash("sha256").update(String(config.jwtSecret)).digest();
}

/** Encrypt a PAT for at-rest storage. Returns `iv:tag:cipher` hex. */
export function encryptSecret(plain) {
  if (!plain) return null;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, deriveKey(), iv);
  const enc = Buffer.concat([cipher.update(String(plain), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("hex")}:${tag.toString("hex")}:${enc.toString("hex")}`;
}

export function decryptSecret(payload) {
  if (!payload) return null;
  const [ivHex, tagHex, dataHex] = String(payload).split(":");
  if (!ivHex || !tagHex || !dataHex) throw new Error("Invalid encrypted secret");
  const decipher = crypto.createDecipheriv(ALGO, deriveKey(), Buffer.from(ivHex, "hex"));
  decipher.setAuthTag(Buffer.from(tagHex, "hex"));
  return Buffer.concat([
    decipher.update(Buffer.from(dataHex, "hex")),
    decipher.final(),
  ]).toString("utf8");
}
