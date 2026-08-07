import { Link } from "react-router-dom";
import type { Bug } from "../../types";
import { BugFullCard } from "../BugFullCard";
import { FlashAlert } from "../FlashAlert";
import { QueryStatus } from "../QueryStatus";

export function ProjectBugsPanel({
  bugs,
  nameOf,
  sprintName,
  moduleName,
  selectedIds,
  loading,
  error,
  flashError,
  flashMessage,
  exportBusy,
  onToggleOne,
  onToggleAllVisible,
  onExportClick,
  onRetry,
  emptyHint,
  moduleFilterActive,
}: {
  bugs: Bug[];
  projectName: string;
  nameOf: (id: string) => string;
  sprintName: (id: string) => string;
  moduleName?: (id: string | null | undefined) => string;
  selectedIds: Set<string>;
  loading?: boolean;
  error?: unknown;
  flashError?: string | null;
  flashMessage?: string | null;
  exportBusy?: boolean;
  onToggleOne: (bugId: string, selected: boolean) => void;
  onToggleAllVisible: (selected: boolean) => void;
  onExportClick: () => void;
  onRetry?: () => void;
  emptyHint?: string;
  /** When a module chip is selected, expand cards by default */
  moduleFilterActive?: boolean;
}) {
  const allVisibleSelected = bugs.length > 0 && bugs.every((b) => selectedIds.has(b.id));
  const someSelected = selectedIds.size > 0;

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 className="text-lg font-bold text-[var(--ink)]">
            Bugs
            <span className="ml-2 text-base font-semibold text-[var(--muted)]">({bugs.length})</span>
          </h3>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Expand a bug for full details (description, steps, screenshots). Select to export.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className="tb-btn-primary text-xs"
            disabled={!someSelected || exportBusy}
            onClick={onExportClick}
          >
            Export selected ({selectedIds.size})
          </button>
          <Link to="/bugs" className="tb-link text-sm">
            All bugs →
          </Link>
        </div>
      </div>

      <FlashAlert error={flashError} message={flashMessage} className="" />

      <QueryStatus
        isLoading={loading}
        error={error}
        onRetry={onRetry}
        loadingText="Loading bugs…"
        className=""
      />

      {!loading && bugs.length === 0 && (
        <div className="tb-card border-dashed p-8 text-center">
          <p className="font-medium text-[var(--ink)]">No bugs in this view</p>
          <p className="mt-2 text-sm text-[var(--muted)]">
            {emptyHint ?? "File a bug from the extension to see it here."}
          </p>
        </div>
      )}

      {bugs.length > 0 && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-3 px-1">
            <label className="flex items-center gap-2 text-xs font-semibold text-[var(--muted)]">
              <input
                type="checkbox"
                className="h-4 w-4 accent-[var(--accent)]"
                checked={allVisibleSelected}
                ref={(el) => {
                  if (el) el.indeterminate = someSelected && !allVisibleSelected;
                }}
                onChange={(e) => onToggleAllVisible(e.target.checked)}
              />
              {allVisibleSelected ? "Clear all" : "Select all"}
            </label>
            {someSelected && (
              <span className="text-xs text-[var(--ink)]">{selectedIds.size} selected</span>
            )}
          </div>

          {bugs.map((bug) => (
            <BugFullCard
              key={bug.id}
              bug={bug}
              assigneeName={nameOf(bug.assigneeId)}
              reporterName={nameOf(bug.reporterId)}
              sprintName={sprintName(bug.sprintId)}
              moduleName={moduleName?.(bug.moduleId) || undefined}
              collapsible
              defaultOpen={!!moduleFilterActive && bugs.length <= 5}
              selected={selectedIds.has(bug.id)}
              onSelectedChange={onToggleOne}
            />
          ))}
        </div>
      )}
    </section>
  );
}
