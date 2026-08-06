import { useEffect, useState } from "react";
import {
  BUG_COLUMNS,
  BUG_SORT_OPTIONS,
  TC_COLUMNS,
  TC_SORT_OPTIONS,
  defaultBugPrefs,
  defaultTcPrefs,
  type ModuleDensity,
  type ModuleRowSize,
  type ModuleSortDir,
  type ModuleViewPrefs,
  type ModuleViewTab,
} from "../../utils/moduleViewPrefs";

function CloseIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M18 6 6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function DensityIcon({ kind }: { kind: ModuleDensity }) {
  if (kind === "compact") {
    return (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
        <path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
      </svg>
    );
  }
  if (kind === "spacious") {
    return (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
        <path d="M4 5h16M4 12h16M4 19h16" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
      </svg>
    );
  }
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M4 6h16M4 12h16M4 18h16" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    </svg>
  );
}

export function ModuleCustomizeViewModal({
  open,
  tab,
  value,
  onClose,
  onApply,
}: {
  open: boolean;
  tab: ModuleViewTab;
  value: ModuleViewPrefs;
  onClose: () => void;
  onApply: (prefs: ModuleViewPrefs) => void;
}) {
  const [draft, setDraft] = useState<ModuleViewPrefs>(value);
  const columns = tab === "bugs" ? BUG_COLUMNS : TC_COLUMNS;
  const sortOptions = tab === "bugs" ? BUG_SORT_OPTIONS : TC_SORT_OPTIONS;

  useEffect(() => {
    if (open) setDraft(value);
  }, [open, value]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  function toggleColumn(key: string) {
    setDraft((prev) => ({
      ...prev,
      columns: { ...prev.columns, [key]: !prev.columns[key] },
    }));
  }

  function resetDefaults() {
    setDraft(tab === "bugs" ? defaultBugPrefs() : defaultTcPrefs());
  }

  const visibleCount = columns.filter((c) => draft.columns[c.key] !== false).length;

  return (
    <div
      className="tb-modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="customize-view-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="tb-card tb-modal-panel w-full max-w-3xl p-0 overflow-hidden">
        <div className="flex items-start justify-between gap-3 border-b border-[var(--line)] px-5 py-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--accent)]">
              Table preferences
            </p>
            <h2 id="customize-view-title" className="mt-1 text-lg font-bold text-[var(--ink)]">
              Customize View
            </h2>
            <p className="mt-0.5 text-sm text-[var(--muted)]">
              {tab === "bugs" ? "Bugs" : "Test Cases"} · {visibleCount} columns visible
            </p>
          </div>
          <button type="button" className="tb-btn-icon h-9 w-9" aria-label="Close" onClick={onClose}>
            <CloseIcon />
          </button>
        </div>

        <div className="grid gap-6 p-5 md:grid-cols-2">
          <div className="space-y-5">
            <section>
              <h3 className="text-sm font-semibold text-[var(--ink)]">Column Visibility</h3>
              <p className="mt-0.5 text-xs text-[var(--muted)]">Choose which columns appear in the table.</p>
              <ul className="mt-3 space-y-2">
                {columns.map((col) => (
                  <li key={col.key}>
                    <label className="flex cursor-pointer items-center gap-2.5 text-sm text-[var(--ink)]">
                      <input
                        type="checkbox"
                        className="h-4 w-4 accent-[var(--accent)]"
                        checked={draft.columns[col.key] !== false}
                        onChange={() => toggleColumn(col.key)}
                      />
                      {col.label}
                    </label>
                  </li>
                ))}
              </ul>
            </section>

            <section>
              <h3 className="text-sm font-semibold text-[var(--ink)]">Default Sorting</h3>
              <div className="mt-3 flex flex-wrap gap-2">
                <select
                  className="tb-filter-select min-w-[10rem] flex-1"
                  value={draft.sortBy}
                  onChange={(e) => setDraft((p) => ({ ...p, sortBy: e.target.value }))}
                >
                  {sortOptions.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
                <select
                  className="tb-filter-select min-w-[8rem]"
                  value={draft.sortDir}
                  onChange={(e) => setDraft((p) => ({ ...p, sortDir: e.target.value as ModuleSortDir }))}
                >
                  <option value="asc">Ascending</option>
                  <option value="desc">Descending</option>
                </select>
              </div>
            </section>
          </div>

          <div className="space-y-5">
            <section>
              <h3 className="text-sm font-semibold text-[var(--ink)]">Density</h3>
              <div className="mt-3 grid grid-cols-3 gap-2">
                {(
                  [
                    ["comfortable", "Comfortable"],
                    ["compact", "Compact"],
                    ["spacious", "Spacious"],
                  ] as const
                ).map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    className={`tb-customize-choice ${draft.density === id ? "is-active" : ""}`}
                    onClick={() => setDraft((p) => ({ ...p, density: id }))}
                  >
                    <DensityIcon kind={id} />
                    <span>{label}</span>
                  </button>
                ))}
              </div>
            </section>

            <section>
              <h3 className="text-sm font-semibold text-[var(--ink)]">Row Size</h3>
              <div className="mt-3 grid grid-cols-3 gap-2">
                {(
                  [
                    ["small", "Small"],
                    ["medium", "Medium"],
                    ["large", "Large"],
                  ] as const
                ).map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    className={`tb-customize-choice ${draft.rowSize === id ? "is-active" : ""}`}
                    onClick={() => setDraft((p) => ({ ...p, rowSize: id as ModuleRowSize }))}
                  >
                    <span className="text-sm font-semibold">{label}</span>
                  </button>
                ))}
              </div>
            </section>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--line)] bg-[var(--panel-elevated)] px-5 py-3.5">
          <button type="button" className="tb-btn-ghost text-sm" onClick={resetDefaults}>
            Reset to Default
          </button>
          <div className="flex gap-2">
            <button type="button" className="tb-btn-ghost text-sm" onClick={onClose}>
              Cancel
            </button>
            <button
              type="button"
              className="tb-btn-primary text-sm"
              onClick={() => {
                if (visibleCount === 0) return;
                onApply(draft);
              }}
              disabled={visibleCount === 0}
            >
              Apply
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
