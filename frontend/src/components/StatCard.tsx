import type { ReactNode } from "react";

export function StatCard({
  label,
  value,
  icon,
  accent = "teal",
}: {
  label: string;
  value: string | number;
  icon: ReactNode;
  accent?: "teal" | "blue" | "purple" | "amber";
}) {
  const iconBg =
    accent === "blue"
      ? "bg-blue-50 text-blue-600"
      : accent === "purple"
        ? "bg-violet-50 text-violet-600"
        : accent === "amber"
          ? "bg-amber-50 text-amber-600"
          : "bg-[var(--accent-soft)] text-[var(--accent)]";

  return (
    <div className="tb-stat-card">
      <div className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${iconBg}`}>{icon}</div>
      <div className="min-w-0">
        <p className="text-2xl font-bold tracking-tight text-[var(--ink)]">{value}</p>
        <p className="mt-0.5 truncate text-xs font-medium text-[var(--muted)]">{label}</p>
      </div>
    </div>
  );
}
