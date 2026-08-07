import type { ReactNode } from "react";

/** Shared card chrome for Settings sections (password, reset, etc.). */
export function SettingsSectionCard({
  title,
  description,
  actions,
  children,
  className = "",
}: {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`tb-card overflow-hidden ${className}`}>
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--line)] px-5 py-4">
        <div className="min-w-0">
          <h2 className="text-base font-bold tracking-tight text-[var(--ink)]">{title}</h2>
          {description ? (
            <p className="mt-0.5 text-sm leading-relaxed text-[var(--muted)]">{description}</p>
          ) : null}
        </div>
        {actions ? <div className="flex shrink-0 flex-wrap gap-2">{actions}</div> : null}
      </div>
      <div className="p-5">{children}</div>
    </section>
  );
}
