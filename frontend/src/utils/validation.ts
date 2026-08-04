export function validateName(name: string): string | null {
  const trimmed = name.trim();
  if (trimmed.length < 2) return "Name must be at least 2 characters";
  return null;
}

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
