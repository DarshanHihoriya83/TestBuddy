import type { SettingsNavItem, SettingsSectionId } from "./settingsTypes";

function NavIcon({ name }: { name: SettingsSectionId }) {
  const cls = "h-[18px] w-[18px] shrink-0";
  switch (name) {
    case "profile":
      return (
        <svg className={cls} viewBox="0 0 24 24" fill="none" aria-hidden>
          <circle cx="12" cy="8" r="3.25" stroke="currentColor" strokeWidth="1.75" />
          <path
            d="M5 20c0-3 3.1-5.5 7-5.5s7 2.5 7 5.5"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
          />
        </svg>
      );
    case "password":
      return (
        <svg className={cls} viewBox="0 0 24 24" fill="none" aria-hidden>
          <rect
            x="5"
            y="11"
            width="14"
            height="10"
            rx="2"
            stroke="currentColor"
            strokeWidth="1.75"
          />
          <path
            d="M8 11V8a4 4 0 1 1 8 0v3"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
          />
        </svg>
      );
    case "members":
      return (
        <svg className={cls} viewBox="0 0 24 24" fill="none" aria-hidden>
          <circle cx="9" cy="8" r="3" stroke="currentColor" strokeWidth="1.75" />
          <path
            d="M3 19c0-2.8 2.7-5 6-5s6 2.2 6 5"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
          />
          <path
            d="M16 11h5M18.5 8.5v5"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
          />
        </svg>
      );
    default:
      return (
        <svg className={cls} viewBox="0 0 24 24" fill="none" aria-hidden>
          <path
            d="M4 12a8 8 0 0 1 13.7-5.7M20 12a8 8 0 0 1-13.7 5.7"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
          />
          <path
            d="M17 3v4h-4M7 21v-4h4"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
          />
        </svg>
      );
  }
}

export function SettingsNav({
  items,
  active,
  onChange,
}: {
  items: SettingsNavItem[];
  active: SettingsSectionId;
  onChange: (id: SettingsSectionId) => void;
}) {
  return (
    <nav className="tb-settings-nav" aria-label="Settings sections">
      <p className="tb-settings-nav-title">Account</p>
      {items.map((s) => (
        <button
          key={s.id}
          type="button"
          onClick={() => onChange(s.id)}
          aria-current={active === s.id ? "page" : undefined}
          className={`tb-settings-nav-btn ${active === s.id ? "is-active" : ""}`}
        >
          <span className="tb-settings-nav-icon">
            <NavIcon name={s.id} />
          </span>
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold leading-tight">{s.label}</span>
            <span className="mt-0.5 block truncate text-[11px] font-medium text-[var(--muted)]">
              {s.hint}
            </span>
          </span>
        </button>
      ))}
    </nav>
  );
}
