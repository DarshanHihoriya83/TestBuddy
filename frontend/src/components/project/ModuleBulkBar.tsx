/** Animated bulk-selection toolbar for module bugs / test cases. */
export function ModuleBulkBar({
  visible,
  selectedCount,
  pageCount,
  allSelected,
  exportLabel,
  exportBusy,
  showSelectAll = true,
  onToggleAllPage,
  onExport,
  onClear,
}: {
  visible: boolean;
  selectedCount: number;
  pageCount: number;
  allSelected: boolean;
  exportLabel: string;
  exportBusy?: boolean;
  showSelectAll?: boolean;
  onToggleAllPage: (checked: boolean) => void;
  onExport: () => void;
  onClear: () => void;
}) {
  if (!visible && selectedCount === 0) return null;

  return (
    <div
      className={`tb-mod-bulk-bar ${visible ? "is-visible" : ""}`}
      role="region"
      aria-label="Bulk actions"
      aria-hidden={!visible}
    >
      {showSelectAll ? (
        <label className="tb-mod-bulk-select">
          <input
            type="checkbox"
            className="h-4 w-4 accent-[var(--accent)]"
            checked={allSelected}
            onChange={(e) => onToggleAllPage(e.target.checked)}
          />
          Select all on this page
          <span className="tb-mod-bulk-page-count">({pageCount})</span>
        </label>
      ) : (
        <span className="tb-mod-bulk-count">{selectedCount} selected</span>
      )}
      <div className="tb-mod-bulk-actions">
        {showSelectAll && <span className="tb-mod-bulk-count">{selectedCount} selected</span>}
        <button
          type="button"
          className="tb-mod-bulk-btn tb-mod-bulk-btn-primary"
          disabled={selectedCount === 0 || exportBusy}
          onClick={onExport}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path
              d="M12 3v12M8 11l4 4 4-4M4 19h16"
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          {exportLabel}
        </button>
        <button type="button" className="tb-mod-bulk-btn" onClick={onClear}>
          Clear selection
        </button>
      </div>
    </div>
  );
}
