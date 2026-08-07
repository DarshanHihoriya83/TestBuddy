import type { UserRole } from "../../types";

/** Settings tabs. `members` / `reset` are hidden for SuperAdmin (use project pages / Manage Users). */
export type SettingsSectionId = "profile" | "password" | "members" | "reset";

export type SettingsNavItem = {
  id: SettingsSectionId;
  label: string;
  hint: string;
};

export const ROLE_CHIP_CLASS: Record<UserRole, string> = {
  SUPERADMIN: "is-superadmin",
  MANAGER: "is-manager",
  DEVELOPER: "is-developer",
  TESTER: "is-tester",
};

export function initialsOf(name?: string | null) {
  return (
    name
      ?.split(/\s+/)
      .map((p) => p[0])
      .join("")
      .slice(0, 2)
      .toUpperCase() || "?"
  );
}
