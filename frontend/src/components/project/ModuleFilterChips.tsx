export type FilterChip = {
  key: string;
  label: string;
  onRemove: () => void;
};

export function ModuleFilterChips({
  chips,
  onClearAll,
}: {
  chips: FilterChip[];
  onClearAll: () => void;
}) {
  if (chips.length === 0) return null;

  return (
    <div className="tb-mod-filter-chips" role="list" aria-label="Active filters">
      {chips.map((chip) => (
        <button
          key={chip.key}
          type="button"
          role="listitem"
          className="tb-mod-filter-chip"
          onClick={chip.onRemove}
          aria-label={`Remove filter: ${chip.label}`}
        >
          {chip.label}
          <span className="tb-mod-filter-chip-x" aria-hidden>
            ×
          </span>
        </button>
      ))}
      <button type="button" className="tb-mod-filter-clear" onClick={onClearAll}>
        Clear all
      </button>
    </div>
  );
}
