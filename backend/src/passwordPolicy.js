import { randomInt } from "node:crypto";

export const PASSWORD_MIN_LENGTH = 10;
export const PASSWORD_MAX_LENGTH = 128;

/** Passwords seen in every credential-stuffing list — refuse them outright. */
const BANNED = new Set([
  "password",
  "password1",
  "password123",
  "passw0rd",
  "welcome1",
  "welcome123",
  "qwerty123",
  "admin123",
  "letmein123",
  "changeme123",
  "testbuddy",
  "testbuddy1",
  "testbuddy123",
  "iloveyou1",
  "1234567890",
  "abcd123456",
]);

/**
 * Returns an error message, or null when the password is acceptable.
 * `context` values (name, email) are checked so users cannot reuse their identity.
 */
export function checkPasswordStrength(password, context = {}) {
  if (password == null || typeof password !== "string" || password === "") {
    return "Password is required";
  }
  if (password.length < PASSWORD_MIN_LENGTH) {
    return `Password must be at least ${PASSWORD_MIN_LENGTH} characters`;
  }
  if (password.length > PASSWORD_MAX_LENGTH) {
    return `Password must be at most ${PASSWORD_MAX_LENGTH} characters`;
  }
  if (/\s/.test(password)) {
    return "Password cannot contain spaces";
  }
  if (!/[a-z]/.test(password)) {
    return "Password must include a lowercase letter";
  }
  if (!/[A-Z]/.test(password)) {
    return "Password must include an uppercase letter";
  }
  if (!/[0-9]/.test(password)) {
    return "Password must include a number";
  }
  if (!/[^A-Za-z0-9]/.test(password)) {
    return "Password must include a symbol";
  }
  if (/(.)\1{2,}/.test(password)) {
    return "Password cannot repeat the same character 3 times in a row";
  }

  const lower = password.toLowerCase();
  if (BANNED.has(lower)) {
    return "This password is too common — choose something harder to guess";
  }
  for (const banned of BANNED) {
    if (banned.length >= 8 && lower.includes(banned)) {
      return "This password is too common — choose something harder to guess";
    }
  }

  const emailLocal = String(context.email || "").split("@")[0];
  const identityParts = [emailLocal, ...String(context.name || "").split(/\s+/)]
    .map((part) => part.trim().toLowerCase())
    .filter((part) => part.length >= 4);
  if (identityParts.some((part) => lower.includes(part))) {
    return "Password cannot contain your name or email";
  }

  return null;
}

const TEMP_LOWER = "abcdefghijkmnopqrstuvwxyz";
const TEMP_UPPER = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const TEMP_DIGIT = "23456789";
const TEMP_SYMBOL = "!@#$%^&*?";
const TEMP_ALPHABET = TEMP_LOWER + TEMP_UPPER + TEMP_DIGIT + TEMP_SYMBOL;

function pick(alphabet) {
  // randomInt is rejection-sampled, so no modulo bias across the alphabet.
  return alphabet[randomInt(alphabet.length)];
}

/**
 * Temporary password shown once to the admin. Guarantees one character from
 * every class so it always satisfies checkPasswordStrength.
 */
export function generateTemporaryPassword(length = 16) {
  const size = Math.max(PASSWORD_MIN_LENGTH + 2, length);
  const chars = [pick(TEMP_LOWER), pick(TEMP_UPPER), pick(TEMP_DIGIT), pick(TEMP_SYMBOL)];
  while (chars.length < size) {
    chars.push(pick(TEMP_ALPHABET));
  }
  // Fisher–Yates so the guaranteed classes are not always in the first slots.
  for (let i = chars.length - 1; i > 0; i -= 1) {
    const j = randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  const candidate = chars.join("");
  return checkPasswordStrength(candidate) ? generateTemporaryPassword(length) : candidate;
}
