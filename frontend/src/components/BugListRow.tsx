import { Link } from "react-router-dom";
import type { ReactNode } from "react";
import type { Bug } from "../types";
import { priorityTone, statusLabel, statusTone } from "../utils/bugUi";

/** Shared column track — keep in sync with list headers. */
export const BUG_TABLE_GRID =
  "grid grid-cols-[1.75rem_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 px-3 py-2.5 md:grid-cols-[1.75rem_3.5rem_1.25rem_minmax(0,1.4fr)_10rem_5.5rem_4.5rem_7rem_7rem] md:gap-x-4 md:px-4";

function shortId(id: string) {
  return id.replace(/-/g, "").slice(0, 5).toUpperCase();
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]![0] ?? ""}${parts[1]![0] ?? ""}`.toUpperCase();
}

export function BugListRow({
  bug,
  assigneeName,
  sprintName,
  projectName,
  selected = false,
  onSelectedChange,
  onOpen,
  linkState,
  actions,
}: {
  bug: Bug;
  assigneeName: string;
  sprintName?: string;
  projectName?: string;
  selected?: boolean;
  onSelectedChange?: (bugId: string, selected: boolean) => void;
  /** When set, title opens inline instead of navigating to bug detail. */
  onOpen?: () => void;
  linkState?: { fromProjectId?: string; fromModuleId?: string };
  actions?: ReactNode;
}) {
  const stepCount = bug.steps?.length ?? 0;
  const shotCount = bug.screenshots?.length ?? 0;
  const selectable = typeof onSelectedChange === "function";
  const titleClass =
    "block truncate text-sm font-semibold text-[#0078d4] hover:underline text-left";

  return (
    <div
      className={`${BUG_TABLE_GRID} border-b border-[var(--line)] transition-colors last:border-b-0 ${
        selected ? "bg-[var(--accent-soft)]/50" : "bg-[#eef6fb] hover:bg-[#e3f0f8]"
      }`}
    >
      <div className="flex h-6 w-6 items-center justify-center justify-self-center">
        {selectable ? (
          <label
            className="flex h-6 w-6 cursor-pointer items-center justify-center"
            onClick={(e) => e.stopPropagation()}
          >
            <input
              type="checkbox"
              className="h-4 w-4 cursor-pointer accent-[var(--accent)]"
              checked={selected}
              aria-label={`Select bug ${bug.title}`}
              onChange={(e) => onSelectedChange(bug.id, e.target.checked)}
            />
          </label>
        ) : (
          <span className="h-4 w-4" aria-hidden />
        )}
      </div>

      <span className="hidden font-mono text-xs font-semibold text-slate-600 md:block">
        {shortId(bug.id)}
      </span>

      <span className="hidden text-[#0078d4] md:flex md:items-center md:justify-center" aria-hidden>
        <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
          <path d="M12 2c-.6 0-1.2.2-1.7.5L8.5 4.1c-.3-1-.9-1.6-1.7-1.9-.4-.1-.8.2-.8.6v2.2c-1.1.4-1.9 1.4-2 2.6H2.5c-.4 0-.7.4-.6.8.3 1.3 1.2 2.1 2.4 2.4v.4c0 1.5.8 2.8 2.1 3.5l-.8 2.3c-.1.4.2.8.6.8h.1c.3 0 .6-.2.7-.5l.9-2.5c.7.3 1.4.4 2.1.4h1.6c.7 0 1.4-.1 2.1-.4l.9 2.5c.1.3.4.5.7.5h.1c.4 0 .7-.4.6-.8l-.8-2.3c1.3-.7 2.1-2 2.1-3.5v-.4c1.2-.3 2.1-1.1 2.4-2.4.1-.4-.2-.8-.6-.8h-1.5c-.1-1.2-.9-2.2-2-2.6V2.8c0-.4-.4-.7-.8-.6-.8.3-1.4.9-1.7 1.9l-1.8-1.6C13.2 2.2 12.6 2 12 2zm-3.2 6.2c.4 0 .8.3.8.8s-.4.8-.8.8-.8-.4-.8-.8.4-.8.8-.8zm6.4 0c.4 0 .8.3.8.8s-.4.8-.8.8-.8-.4-.8-.8.3-.8.8-.8z" />
        </svg>
      </span>

      <div className="min-w-0">
        <div className="mb-0.5 font-mono text-[10px] font-semibold text-slate-500 md:hidden">
          {shortId(bug.id)}
        </div>
        {onOpen ? (
          <button type="button" className={titleClass} onClick={onOpen}>
            {bug.title}
          </button>
        ) : (
          <Link
            to={`/bugs/${bug.id}`}
            state={linkState ?? { fromProjectId: bug.projectId }}
            className={titleClass}
          >
            {bug.title}
          </Link>
        )}
        <span className="mt-0.5 block truncate text-[11px] text-[var(--muted)] md:hidden">
          {assigneeName} · {statusLabel(bug.status)} · {bug.priority}
        </span>
        {actions ? (
          <div className="mt-1.5 flex flex-wrap gap-2">{actions}</div>
        ) : null}
      </div>

      <span className="hidden min-w-0 items-center gap-2 md:flex">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#0078d4]/15 text-[10px] font-bold text-[#0078d4]">
          {initials(assigneeName)}
        </span>
        <span className="truncate text-sm text-slate-700">{assigneeName}</span>
      </span>

      <span className="hidden md:flex">
        <span
          className={`rounded-md px-2 py-0.5 text-[11px] font-semibold capitalize ${statusTone(bug.status)}`}
        >
          {statusLabel(bug.status).toLowerCase()}
        </span>
      </span>

      <span className="hidden md:flex">
        <span
          className={`rounded-md px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${priorityTone(bug.priority)}`}
        >
          {bug.priority}
        </span>
      </span>

      <span className="hidden truncate text-xs text-slate-500 md:block">
        {stepCount} step{stepCount === 1 ? "" : "s"}
        {shotCount ? ` · ${shotCount} shot${shotCount === 1 ? "" : "s"}` : ""}
      </span>

      <span className="truncate text-right text-xs text-slate-500">
        {sprintName || projectName || "—"}
      </span>
    </div>
  );
}
