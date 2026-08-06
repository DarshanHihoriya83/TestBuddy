import type { CSSProperties, ReactNode } from "react";

export interface CommandPulse {
  /** 0-100, or null when there is nothing to measure yet. */
  value: number | null;
  label: string;
  hint?: string;
}

function pulseTone(value: number | null) {
  if (value === null) return "is-empty";
  if (value >= 70) return "is-good";
  if (value >= 40) return "is-warn";
  return "is-risk";
}

export function CommandChip({ children }: { children: ReactNode }) {
  return <span className="tb-mod-chip tb-mod-chip-muted">{children}</span>;
}

export function countLabel(count: number, singular: string, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`;
}

/** Shared page hero used by Projects, Project workspace and Module workspace. */
export function CommandHeader({
  icon,
  context,
  title,
  subtitle,
  meta,
  pulse,
  actions,
  className,
}: {
  icon: ReactNode;
  context?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  meta?: ReactNode;
  pulse?: CommandPulse;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <header className={`tb-mod-command shrink-0 ${className ?? ""}`.trimEnd()}>
      <div className="tb-mod-command-main">
        <div className="tb-mod-command-icon" aria-hidden>
          {icon}
        </div>
        <div className="min-w-0 flex-1">
          {context ? <p className="tb-mod-command-context">{context}</p> : null}
          <h1 className="tb-mod-command-title">{title}</h1>
          {subtitle ? <p className="tb-mod-command-sub">{subtitle}</p> : null}
          {meta ? <div className="tb-mod-command-meta">{meta}</div> : null}
        </div>
      </div>

      {pulse ? (
        <div className="tb-mod-command-pulse" aria-label={pulse.label}>
          <div
            className={`tb-pulse-ring ${pulseTone(pulse.value)}`}
            style={
              pulse.value !== null
                ? ({ "--pulse-pct": `${pulse.value}%` } as CSSProperties)
                : undefined
            }
          >
            <span className="tb-pulse-value">
              {pulse.value === null ? "\u2014" : `${pulse.value}%`}
            </span>
          </div>
          <p className="tb-pulse-label">{pulse.label}</p>
          {pulse.hint ? <p className="tb-pulse-hint">{pulse.hint}</p> : null}
        </div>
      ) : null}

      {actions ? <div className="tb-mod-command-actions">{actions}</div> : null}
    </header>
  );
}
