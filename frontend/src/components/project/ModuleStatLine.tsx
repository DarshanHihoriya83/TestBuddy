export type StatTone = "blue" | "green" | "red" | "violet" | "amber" | "slate";

export type StatItem = {
  key: string;
  label: string;
  value: number;
  tone: StatTone;
  active?: boolean;
  onSelect?: () => void;
};

/** Slim summary strip — replaces the tall metric cards and doubles as a quick status filter. */
export function ModuleStatLine({ items, label }: { items: StatItem[]; label: string }) {
  return (
    <div className="tb-mod-statline" role="group" aria-label={label}>
      {items.map((item) => {
        const content = (
          <>
            <span className="tb-mod-stat-dot" aria-hidden />
            <span className="tb-mod-stat-label">{item.label}</span>
            <span className="tb-mod-stat-value">{item.value}</span>
          </>
        );
        const className = `tb-mod-stat tb-mod-stat-${item.tone} ${item.active ? "is-active" : ""} ${
          item.value === 0 ? "is-zero" : ""
        }`.trim();
        return item.onSelect ? (
          <button
            key={item.key}
            type="button"
            className={className}
            aria-pressed={!!item.active}
            onClick={item.onSelect}
          >
            {content}
          </button>
        ) : (
          <span key={item.key} className={className}>
            {content}
          </span>
        );
      })}
    </div>
  );
}
