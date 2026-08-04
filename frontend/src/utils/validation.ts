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

export function validatePasswordChange(
  current: string,
  next: string,
  confirm: string,
): string | null {
  const anyFilled = current || next || confirm;
  if (!anyFilled) return null;
  if (!current) return "Enter your current password";
  if (!next) return "Enter a new password";
  if (next.length < 8) return "New password must be at least 8 characters";
  if (next !== confirm) return "New passwords do not match";
  return null;
}

/** Change-password form — all fields required. */
export function validateRequiredPasswordChange(
  current: string,
  next: string,
  confirm: string,
): string | null {
  if (!current) return "Enter your current password";
  if (!next) return "Enter a new password";
  if (next.length < 8) return "New password must be at least 8 characters";
  if (next !== confirm) return "New passwords do not match";
  return null;
}

export function validateNewPassword(next: string, confirm: string): string | null {
  if (!next) return "Enter a new password";
  if (next.length < 8) return "New password must be at least 8 characters";
  if (next !== confirm) return "New passwords do not match";
  return null;
}
