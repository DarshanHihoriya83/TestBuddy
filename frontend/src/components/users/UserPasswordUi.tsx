import { useEffect, useMemo, useState, type ReactNode } from "react";
import { copyText } from "../../utils/clipboard";
import { passwordRules } from "../../utils/validation";

function IconUser({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="8" r="3.5" stroke="currentColor" strokeWidth="1.75" />
      <path
        d="M5 20c0-3.3 3.1-6 7-6s7 2.7 7 6"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
    </svg>
  );
}

function IconMail({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="3" y="5" width="18" height="14" rx="2" stroke="currentColor" strokeWidth="1.75" />
      <path d="m3 7 9 6 9-6" stroke="currentColor" strokeWidth="1.75" strokeLinejoin="round" />
    </svg>
  );
}

function IconShield({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 3 20 7v6c0 4.4-3.6 8-8 8s-8-3.6-8-8V7l8-4Z"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconLock({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="5" y="11" width="14" height="10" rx="2" stroke="currentColor" strokeWidth="1.75" />
      <path
        d="M8 11V8a4 4 0 1 1 8 0v3"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
    </svg>
  );
}

function IconClock({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="1.75" />
      <path d="M12 8v4l3 2" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    </svg>
  );
}

function IconRefresh({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M4 12a8 8 0 0 1 13.7-5.7M20 12a8 8 0 0 1-13.7 5.7"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
      <path d="M17 3v4h-4M7 21v-4h4" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    </svg>
  );
}

function IconCopy({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="9" y="9" width="11" height="11" rx="2" stroke="currentColor" strokeWidth="1.75" />
      <path
        d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"
        stroke="currentColor"
        strokeWidth="1.75"
      />
    </svg>
  );
}

function IconEye({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6Z"
        stroke="currentColor"
        strokeWidth="1.75"
      />
      <circle cx="12" cy="12" r="2.5" stroke="currentColor" strokeWidth="1.75" />
    </svg>
  );
}

function IconEyeOff({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M3 3l18 18" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
      <path
        d="M10.6 10.6a2 2 0 0 0 2.8 2.8M9.9 5.1A10.7 10.7 0 0 1 12 5c6.5 0 10 7 10 7a18.2 18.2 0 0 1-4.1 5.2M6.1 6.1A18 18 0 0 0 2 12s3.5 7 10 7a10.2 10.2 0 0 0 4.8-1.2"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
    </svg>
  );
}

function IconClose({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M6 6l12 12M18 6 6 18" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    </svg>
  );
}

function IconKey({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="8" cy="15" r="4" stroke="currentColor" strokeWidth="1.75" />
      <path d="m11 12 9-9M16 5l3 3" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    </svg>
  );
}

const FLOW_STEPS = [
  { n: 1, title: "User created", body: "SuperAdmin creates the user; password is auto-generated." },
  { n: 2, title: "First login", body: "User logs in with the temporary password and is redirected to change password." },
  { n: 3, title: "Change password", body: "User sets a new password; the temporary one becomes invalid." },
  { n: 4, title: "Access granted", body: "User gets full access to the application." },
];

export function UserAccessFlowStepper({ activeStep = 1 }: { activeStep?: number }) {
  return (
    <div className="rounded-xl border border-[var(--line)] bg-white p-4">
      <p className="text-sm font-bold text-[var(--ink)]">User access flow</p>
      <ol className="mt-4 space-y-0">
        {FLOW_STEPS.map((step, idx) => {
          const done = step.n < activeStep;
          const current = step.n === activeStep;
          const last = idx === FLOW_STEPS.length - 1;
          return (
            <li key={step.n} className="relative flex gap-3 pb-5 last:pb-0">
              {!last && (
                <span
                  className={`absolute left-[13px] top-7 h-[calc(100%-12px)] w-0.5 ${
                    done ? "bg-[var(--accent)]" : "bg-[var(--line)]"
                  }`}
                  aria-hidden
                />
              )}
              <span
                className={`relative z-[1] grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-bold ${
                  done
                    ? "bg-[var(--accent)] text-white"
                    : current
                      ? "border-2 border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]"
                      : "border border-[var(--line)] bg-white text-[var(--muted)]"
                }`}
              >
                {done ? "✓" : step.n}
              </span>
              <div className="min-w-0 pt-0.5">
                <p
                  className={`text-sm font-semibold ${
                    current || done ? "text-[var(--ink)]" : "text-[var(--muted)]"
                  }`}
                >
                  {step.title}
                </p>
                <p className="mt-0.5 text-xs leading-relaxed text-[var(--muted)]">{step.body}</p>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

export function TemporaryPasswordPanel({
  password,
  userLabel,
  onCopy,
  copyLabel = "Copy password",
}: {
  password: string | null;
  userLabel?: string;
  onCopy?: () => void;
  copyLabel?: string;
}) {
  // Revealed by default: the admin explicitly asked for this value and has to
  // read it off the screen to pass it on. Hiding it only looked like a failure.
  const [visible, setVisible] = useState(true);
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");

  useEffect(() => {
    setVisible(true);
    setCopyState("idle");
  }, [password]);

  async function handleCopy() {
    if (!password) return;
    const ok = await copyText(password);
    setCopyState(ok ? "copied" : "failed");
    if (ok) {
      onCopy?.();
      window.setTimeout(() => setCopyState("idle"), 2000);
    }
  }

  return (
    <div className="rounded-xl border border-[var(--line)] bg-white p-4 shadow-sm">
      <div className="flex items-center gap-2">
        <span className="grid h-8 w-8 place-items-center rounded-lg bg-[var(--accent-soft)] text-[var(--accent)]">
          <IconKey />
        </span>
        <div>
          <p className="text-sm font-bold text-[var(--ink)]">Temporary password</p>
          {userLabel ? (
            <p className="text-xs text-[var(--muted)]">{userLabel}</p>
          ) : null}
        </div>
      </div>

      {password ? (
        <>
          <div className="mt-4 flex items-center gap-2 rounded-xl border border-[var(--line)] bg-[var(--bg0)] px-3 py-2.5">
            <code className="min-w-0 flex-1 select-all truncate font-mono text-sm font-semibold tracking-wide text-[var(--ink)]">
              {visible ? password : "•".repeat(Math.min(password.length, 16))}
            </code>
            <button
              type="button"
              className="tb-btn-icon h-8 w-8 shrink-0"
              aria-label={visible ? "Hide password" : "Show password"}
              onClick={() => setVisible((v) => !v)}
            >
              {visible ? <IconEyeOff /> : <IconEye />}
            </button>
            <button
              type="button"
              className="tb-btn-icon h-8 w-8 shrink-0"
              aria-label="Copy password"
              onClick={() => void handleCopy()}
            >
              <IconCopy />
            </button>
          </div>
          <p className="mt-2 text-xs font-medium text-amber-700">Expires after first login.</p>
          <div className="mt-3 rounded-lg border border-[var(--accent)]/25 bg-[var(--accent-soft)] px-3 py-2.5">
            <p className="text-xs leading-relaxed text-[var(--ink)]">
              <strong className="text-[var(--accent)]">Important:</strong> Share this password once.
              The user will be forced to change it on first login before accessing the app.
            </p>
          </div>
          {copyState === "copied" && (
            <p className="mt-2 text-xs font-semibold text-emerald-600">{copyLabel}</p>
          )}
          {copyState === "failed" && (
            <p className="mt-2 text-xs font-semibold text-[var(--danger)]">
              Copy blocked by the browser — select the password above and copy it manually.
            </p>
          )}
        </>
      ) : (
        <div className="mt-4 rounded-xl border border-dashed border-[var(--line)] bg-[var(--bg0)] px-4 py-8 text-center">
          <IconLock className="mx-auto h-8 w-8 text-[var(--muted)]" />
          <p className="mt-2 text-sm font-medium text-[var(--ink)]">Generated after create</p>
          <p className="mt-1 text-xs text-[var(--muted)]">
            A secure temporary password appears here once the user is created.
          </p>
        </div>
      )}
    </div>
  );
}

export function FieldWithIcon({
  label,
  required,
  icon,
  error,
  hint,
  action,
  children,
}: {
  label: string;
  required?: boolean;
  icon: ReactNode;
  error?: string | null;
  hint?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="tb-label block">
        {label}
        {required ? " *" : ""}
      </span>
      <div className="tb-field-icon">
        <span className="tb-field-icon-slot">{icon}</span>
        {children}
        {action}
      </div>
      {error ? (
        <span className="mt-1.5 block text-xs font-medium text-[var(--danger)]">{error}</span>
      ) : hint ? (
        <span className="mt-1.5 block text-xs text-[var(--muted)]">{hint}</span>
      ) : null}
    </label>
  );
}

/** Password input with a reveal toggle, wired into FieldWithIcon's layout. */
export function PasswordField({
  label,
  value,
  onChange,
  error,
  hint,
  autoComplete,
  required,
  disabled,
  icon,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string | null;
  hint?: ReactNode;
  autoComplete?: string;
  required?: boolean;
  disabled?: boolean;
  icon?: ReactNode;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <FieldWithIcon
      label={label}
      required={required}
      error={error}
      hint={hint}
      icon={icon ?? <IconLock />}
      action={
        <button
          type="button"
          className="tb-field-icon-action"
          aria-label={visible ? `Hide ${label}` : `Show ${label}`}
          onClick={() => setVisible((v) => !v)}
          tabIndex={-1}
        >
          {visible ? <IconEyeOff /> : <IconEye />}
        </button>
      }
    >
      <input
        className={`tb-input tb-input-trailing ${error ? "tb-input-invalid" : ""}`}
        type={visible ? "text" : "password"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete={autoComplete}
        required={required}
        disabled={disabled}
        aria-invalid={error ? true : undefined}
      />
    </FieldWithIcon>
  );
}

/** Live checklist + bar so users see exactly why a password is rejected. */
export function PasswordStrengthMeter({
  password,
  context,
}: {
  password: string;
  context?: { name?: string; email?: string };
}) {
  const rules = useMemo(() => passwordRules(password, context ?? {}), [password, context]);
  const passed = rules.filter((r) => r.passed).length;
  const ratio = rules.length ? passed / rules.length : 0;
  const label = !password
    ? "Enter a password"
    : ratio < 0.5
      ? "Weak"
      : ratio < 1
        ? "Almost there"
        : "Strong";
  const tone = !password
    ? "bg-[var(--line)]"
    : ratio < 0.5
      ? "bg-rose-500"
      : ratio < 1
        ? "bg-amber-500"
        : "bg-emerald-500";

  return (
    <div className="rounded-xl border border-[var(--line)] bg-[var(--bg0)] p-3.5">
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs font-bold uppercase tracking-wide text-[var(--muted)]">
          Password strength
        </span>
        <span
          className={`text-xs font-bold ${
            !password
              ? "text-[var(--muted)]"
              : ratio < 0.5
                ? "text-rose-600"
                : ratio < 1
                  ? "text-amber-600"
                  : "text-emerald-600"
          }`}
        >
          {label}
        </span>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[var(--line)]">
        <div
          className={`h-full rounded-full transition-all duration-300 ${tone}`}
          style={{ width: `${Math.round(ratio * 100)}%` }}
        />
      </div>
      <ul className="mt-3 grid gap-1.5 sm:grid-cols-2">
        {rules.map((rule) => (
          <li
            key={rule.id}
            className={`flex items-center gap-1.5 text-xs ${
              rule.passed ? "text-emerald-700" : "text-[var(--muted)]"
            }`}
          >
            <span
              className={`grid h-4 w-4 shrink-0 place-items-center rounded-full text-[10px] font-bold ${
                rule.passed ? "bg-emerald-100 text-emerald-700" : "bg-[var(--line)] text-white"
              }`}
              aria-hidden
            >
              {rule.passed ? "✓" : "•"}
            </span>
            {rule.label}
          </li>
        ))}
      </ul>
    </div>
  );
}

export {
  IconUser,
  IconMail,
  IconShield,
  IconLock,
  IconClock,
  IconRefresh,
  IconCopy,
  IconEye,
  IconEyeOff,
  IconClose,
  IconKey,
};
