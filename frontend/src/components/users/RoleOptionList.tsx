import type { ReactNode } from "react";
import type { UserRole } from "../../types";
import { roleLabel } from "../../utils/roles";

type RoleMeta = {
  /** One short line — rows stay a single line tall so the list never reflows. */
  blurb: string;
  /** Tailwind classes for the role's icon tile. */
  tone: string;
  icon: ReactNode;
};

const IconCrown = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
    <path d="M3 8l4 3 5-6 5 6 4-3-2 11H5L3 8z" strokeLinejoin="round" />
  </svg>
);

const IconBriefcase = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
    <rect x="3" y="7" width="18" height="13" rx="2" />
    <path d="M9 7V5a2 2 0 012-2h2a2 2 0 012 2v2M3 12h18" strokeLinecap="round" />
  </svg>
);

const IconCode = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
    <path d="M8 17l-5-5 5-5M16 7l5 5-5 5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const IconBug = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
    <rect x="7" y="7" width="10" height="13" rx="5" />
    <path
      d="M9 6a3 3 0 016 0M3 11h4M17 11h4M3 18h4M17 18h4"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const ROLE_META: Record<UserRole, RoleMeta> = {
  SUPERADMIN: {
    blurb: "Reserved system role",
    tone: "bg-violet-50 text-violet-600",
    icon: IconCrown,
  },
  MANAGER: {
    blurb: "Creates projects and manages members",
    tone: "bg-sky-50 text-sky-600",
    icon: IconBriefcase,
  },
  DEVELOPER: {
    blurb: "Comments and moves bug status",
    tone: "bg-amber-50 text-amber-600",
    icon: IconCode,
  },
  TESTER: {
    blurb: "Records sessions and files bugs",
    tone: "bg-emerald-50 text-emerald-600",
    icon: IconBug,
  },
};

export function RoleOptionList({
  name,
  options,
  value,
  currentRole,
  lockedRoles,
  autoFocusSelected,
  onChange,
}: {
  /** Radio group name — must be unique per rendered list. */
  name: string;
  options: UserRole[];
  value: UserRole;
  /** Marked "Current" and never selectable as a change. */
  currentRole?: UserRole;
  /** Shown but not selectable, e.g. a role the actor cannot assign. */
  lockedRoles?: UserRole[];
  autoFocusSelected?: boolean;
  onChange: (role: UserRole) => void;
}) {
  return (
    <div className="space-y-2">
      {options.map((role) => {
        const meta = ROLE_META[role];
        const selected = role === value;
        const isCurrent = role === currentRole;
        const locked = lockedRoles?.includes(role) ?? false;
        return (
          <label
            key={role}
            className="tb-option-row"
            data-selected={selected}
            aria-disabled={locked || undefined}
          >
            <input
              type="radio"
              name={name}
              className="sr-only"
              data-autofocus={autoFocusSelected && selected ? true : undefined}
              value={role}
              checked={selected}
              disabled={locked}
              onChange={() => onChange(role)}
            />
            <span
              className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ${meta.tone}`}
              aria-hidden
            >
              <span className="h-[18px] w-[18px] [&>svg]:h-full [&>svg]:w-full">{meta.icon}</span>
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-2">
                <span className="truncate text-sm font-semibold text-[var(--ink)]">
                  {roleLabel(role)}
                </span>
                {isCurrent && (
                  <span className="shrink-0 text-[11px] font-semibold text-[var(--muted)]">
                    Current
                  </span>
                )}
              </span>
              <span className="mt-0.5 block truncate text-xs text-[var(--muted)]">
                {meta.blurb}
              </span>
            </span>
            <span className="tb-option-dot" aria-hidden />
          </label>
        );
      })}
    </div>
  );
}
