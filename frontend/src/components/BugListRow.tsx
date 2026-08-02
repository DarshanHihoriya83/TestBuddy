import { Link } from "react-router-dom";
import type { Bug } from "../types";

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
  cycleName,
  projectName,
}: {
  bug: Bug;
  assigneeName: string;
  cycleName?: string;
  projectName?: string;
}) {
  const stepCount = bug.steps?.length ?? 0;
  const shotCount = bug.screenshots?.length ?? 0;

  return (
    <Link
      to={`/bugs/${bug.id}`}
      state={{ fromProjectId: bug.projectId }}
      className="group flex flex-wrap items-center gap-3 border-b border-[var(--line)] bg-[#eef6fb] px-3 py-2.5 transition-colors last:border-b-0 hover:bg-[#e3f0f8] sm:flex-nowrap sm:gap-4 sm:px-4"
    >
      <span
        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#0078d4] text-[10px] font-bold text-white"
        aria-hidden
      >
        ✓
      </span>

      <span className="w-14 shrink-0 font-mono text-xs font-semibold text-slate-600">
        {shortId(bug.id)}
      </span>

      <span className="hidden h-5 w-5 shrink-0 text-[#0078d4] sm:inline" aria-hidden>
        <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
          <path d="M12 2c-.6 0-1.2.2-1.7.5L8.5 4.1c-.3-1-.9-1.6-1.7-1.9-.4-.1-.8.2-.8.6v2.2c-1.1.4-1.9 1.4-2 2.6H2.5c-.4 0-.7.4-.6.8.3 1.3 1.2 2.1 2.4 2.4v.4c0 1.5.8 2.8 2.1 3.5l-.8 2.3c-.1.4.2.8.6.8h.1c.3 0 .6-.2.7-.5l.9-2.5c.7.3 1.4.4 2.1.4h1.6c.7 0 1.4-.1 2.1-.4l.9 2.5c.1.3.4.5.7.5h.1c.4 0 .7-.4.6-.8l-.8-2.3c1.3-.7 2.1-2 2.1-3.5v-.4c1.2-.3 2.1-1.1 2.4-2.4.1-.4-.2-.8-.6-.8h-1.5c-.1-1.2-.9-2.2-2-2.6V2.8c0-.4-.4-.7-.8-.6-.8.3-1.4.9-1.7 1.9l-1.8-1.6C13.2 2.2 12.6 2 12 2zm-3.2 6.2c.4 0 .8.3.8.8s-.4.8-.8.8-.8-.4-.8-.8.4-.8.8-.8zm6.4 0c.4 0 .8.3.8.8s-.4.8-.8.8-.8-.4-.8-.8.3-.8.8-.8z" />
        </svg>
      </span>

      <span className="min-w-0 flex-1 basis-[12rem]">
        <span className="block truncate text-sm font-semibold text-[#0078d4] group-hover:underline">
          {bug.title}
        </span>
        <span className="mt-0.5 block text-[11px] text-[var(--muted)] sm:hidden">
          {assigneeName} · {bug.status}
        </span>
      </span>

      <span className="hidden shrink-0 items-center gap-2 sm:flex">
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#0078d4]/15 text-[10px] font-bold text-[#0078d4]">
          {initials(assigneeName)}
        </span>
        <span className="max-w-[9rem] truncate text-sm text-slate-700">{assigneeName}</span>
      </span>

      <span className="hidden items-center gap-1.5 text-sm text-slate-600 md:flex">
        <span className="h-1.5 w-1.5 rounded-full bg-slate-400" />
        {bug.status.replaceAll("_", " ")}
      </span>

      <span className="hidden text-xs font-medium text-slate-500 lg:inline">
        {bug.priority}
      </span>

      <span className="hidden text-xs text-slate-500 xl:inline">
        {stepCount} step{stepCount === 1 ? "" : "s"}
        {shotCount ? ` · ${shotCount} shot${shotCount === 1 ? "" : "s"}` : ""}
      </span>

      <span className="ml-auto max-w-[10rem] truncate text-right text-xs text-slate-500 sm:ml-0">
        {cycleName || projectName || "—"}
      </span>
    </Link>
  );
}
