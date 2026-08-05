export function validateName(name: string): string | null {
  const trimmed = name.trim();
  if (trimmed.length < 2) return "Name must be at least 2 characters";
  return null;
}

const ALPHA_NAME_MAX = 100;
/** Letters and single spaces only (after trim). */
const ALPHA_NAME_PATTERN = /^[A-Za-z]+(?: [A-Za-z]+)*$/;

function validateAlphabeticalName(
  name: string,
  label: string,
): string | null {
  const trimmed = name.trim().replace(/\s+/g, " ");
  if (!trimmed) return `${label} is required`;
  if (trimmed.length < 2) return `${label} must be at least 2 characters`;
  if (trimmed.length > ALPHA_NAME_MAX) {
    return `${label} must be at most ${ALPHA_NAME_MAX} characters`;
  }
  if (/[^A-Za-z\s]/.test(trimmed) || !ALPHA_NAME_PATTERN.test(trimmed)) {
    return `${label} accepts only alphabetical characters (letters and spaces)`;
  }
  return null;
}

/** Normalize alphabetical names (trim + collapse inner spaces). */
export function normalizeAlphabeticalName(name: string): string {
  return name.trim().replace(/\s+/g, " ");
}

export const ALPHA_NAME_MAX_LENGTH = ALPHA_NAME_MAX;

/**
 * Organization name: trim, letters + spaces only, max 100.
 */
export function validateOrganizationName(name: string): string | null {
  return validateAlphabeticalName(name, "Organization name");
}

export function normalizeOrganizationName(name: string): string {
  return normalizeAlphabeticalName(name);
}

/** Org project create limit (SuperAdmin). */
export const ORG_MAX_PROJECTS_CEILING = 1000;
export const ORG_MAX_PROJECTS_DEFAULT = 10;

export function validateOrgMaxProjects(value: string | number): string | null {
  const raw = typeof value === "number" ? String(value) : value.trim();
  if (!raw) return "Project limit is required";
  if (!/^\d+$/.test(raw)) return "Project limit must be a whole number";
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1) return "Project limit must be at least 1";
  if (n > ORG_MAX_PROJECTS_CEILING) {
    return `Project limit cannot exceed ${ORG_MAX_PROJECTS_CEILING}`;
  }
  return null;
}

/**
 * Project name: trim, letters + spaces only, max 100.
 */
export function validateProjectName(name: string): string | null {
  return validateAlphabeticalName(name, "Project name");
}

export function normalizeProjectName(name: string): string {
  return normalizeAlphabeticalName(name);
}

/** @deprecated use ALPHA_NAME_MAX_LENGTH */
export const PROJECT_NAME_MAX_LENGTH = ALPHA_NAME_MAX;

export function validateEmail(email: string): string | null {
  const trimmed = email.trim();
  if (!trimmed) return "Email is required";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
    return "Enter a valid email address";
  }
  return null;
}

export function validateOptionalUrl(url: string, label = "URL"): string | null {
  const trimmed = url.trim();
  if (!trimmed) return null;
  try {
    const parsed = new URL(trimmed);
    if (!["http:", "https:"].includes(parsed.protocol)) {
      return `${label} must start with http:// or https://`;
    }
    return null;
  } catch {
    return `Enter a valid ${label}`;
  }
}

/** Mirrors backend/src/passwordPolicy.js — keep both in sync. */
export const PASSWORD_MIN_LENGTH = 10;
export const PASSWORD_MAX_LENGTH = 128;

const BANNED_PASSWORDS = [
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
];

export interface PasswordRule {
  id: string;
  label: string;
  passed: boolean;
}

export interface PasswordContext {
  name?: string;
  email?: string;
}

/** Per-rule checklist for the strength meter. */
export function passwordRules(password: string, context: PasswordContext = {}): PasswordRule[] {
  const lower = password.toLowerCase();
  const emailLocal = (context.email || "").split("@")[0];
  const identityParts = [emailLocal, ...(context.name || "").split(/\s+/)]
    .map((part) => part.trim().toLowerCase())
    .filter((part) => part.length >= 4);

  return [
    {
      id: "length",
      label: `At least ${PASSWORD_MIN_LENGTH} characters`,
      passed: password.length >= PASSWORD_MIN_LENGTH && password.length <= PASSWORD_MAX_LENGTH,
    },
    { id: "lower", label: "One lowercase letter", passed: /[a-z]/.test(password) },
    { id: "upper", label: "One uppercase letter", passed: /[A-Z]/.test(password) },
    { id: "digit", label: "One number", passed: /[0-9]/.test(password) },
    { id: "symbol", label: "One symbol", passed: /[^A-Za-z0-9]/.test(password) },
    {
      id: "notCommon",
      label: "Not a common or personal password",
      passed:
        password.length > 0 &&
        !/\s/.test(password) &&
        !/(.)\1{2,}/.test(password) &&
        !BANNED_PASSWORDS.some((banned) => lower === banned || lower.includes(banned)) &&
        !identityParts.some((part) => lower.includes(part)),
    },
  ];
}

/** Returns an error message, or null when the password satisfies the policy. */
export function validatePasswordStrength(
  password: string,
  context: PasswordContext = {},
): string | null {
  if (!password) return "Enter a new password";
  if (password.length < PASSWORD_MIN_LENGTH) {
    return `Password must be at least ${PASSWORD_MIN_LENGTH} characters`;
  }
  if (password.length > PASSWORD_MAX_LENGTH) {
    return `Password must be at most ${PASSWORD_MAX_LENGTH} characters`;
  }
  if (/\s/.test(password)) return "Password cannot contain spaces";
  if (!/[a-z]/.test(password)) return "Password must include a lowercase letter";
  if (!/[A-Z]/.test(password)) return "Password must include an uppercase letter";
  if (!/[0-9]/.test(password)) return "Password must include a number";
  if (!/[^A-Za-z0-9]/.test(password)) return "Password must include a symbol";
  if (/(.)\1{2,}/.test(password)) {
    return "Password cannot repeat the same character 3 times in a row";
  }

  const lower = password.toLowerCase();
  if (BANNED_PASSWORDS.some((banned) => lower === banned || lower.includes(banned))) {
    return "This password is too common — choose something harder to guess";
  }

  const emailLocal = (context.email || "").split("@")[0];
  const identityParts = [emailLocal, ...(context.name || "").split(/\s+/)]
    .map((part) => part.trim().toLowerCase())
    .filter((part) => part.length >= 4);
  if (identityParts.some((part) => lower.includes(part))) {
    return "Password cannot contain your name or email";
  }
  return null;
}

export function validatePasswordChange(
  current: string,
  next: string,
  confirm: string,
  context: PasswordContext = {},
): string | null {
  const anyFilled = current || next || confirm;
  if (!anyFilled) return null;
  return validateRequiredPasswordChange(current, next, confirm, context);
}

/** Change-password form — all fields required. */
export function validateRequiredPasswordChange(
  current: string,
  next: string,
  confirm: string,
  context: PasswordContext = {},
): string | null {
  if (!current) return "Enter your current password";
  const strengthErr = validateNewPassword(next, confirm, context);
  if (strengthErr) return strengthErr;
  if (next === current) return "New password must be different from your current password";
  return null;
}

export function validateNewPassword(
  next: string,
  confirm: string,
  context: PasswordContext = {},
): string | null {
  const strengthErr = validatePasswordStrength(next, context);
  if (strengthErr) return strengthErr;
  if (next !== confirm) return "New passwords do not match";
  return null;
}
