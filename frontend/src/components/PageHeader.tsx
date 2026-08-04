import type { ReactNode } from "react";

export function PageHeader({
  description,
  actions,
}: {
  description?: ReactNode;
  actions?: ReactNode;
}) {
  if (!description && !actions) return null;
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
      {description ? (
        <div className="min-w-0 text-sm text-[var(--muted)]">{description}</div>
      ) : (
        <span />
      )}
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}
