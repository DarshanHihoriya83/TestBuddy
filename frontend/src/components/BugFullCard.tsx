import { useId, useState } from "react";
import { Link } from "react-router-dom";
import type { Bug, BugScreenshot } from "../types";
import { AuthImage } from "./AuthImage";

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]![0] ?? ""}${parts[1]![0] ?? ""}`.toUpperCase();
}

function plainText(value?: string | null) {
  return (value ?? "").replace(/\*\*/g, "").trim();
}

function formatWhen(iso: string) {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function priorityTone(priority: string) {
  switch (priority) {
    case "CRITICAL":
      return "bg-[var(--danger-soft)] text-[var(--danger)]";
    case "HIGH":
      return "bg-orange-100 text-orange-800";
    case "MEDIUM":
      return "bg-amber-100 text-amber-800";
    default:
      return "bg-slate-100 text-slate-700";
  }
}

function statusTone(status: string) {
  switch (status) {
    case "FIXED":
    case "VERIFIED":
    case "CLOSED":
      return "bg-[var(--success-soft)] text-[var(--success)]";
    case "IN_PROGRESS":
    case "OPEN":
      return "bg-[var(--accent-soft)] text-[var(--accent)]";
    case "REOPENED":
      return "bg-[var(--danger-soft)] text-[var(--danger)]";
    default:
      return "bg-slate-100 text-slate-700";
  }
}

export function BugScreenshots({
  screenshots,
}: {
  screenshots?: BugScreenshot[];
}) {
  if (!screenshots?.length) {
    return <p className="mt-2 text-sm text-[var(--muted)]">No screenshots attached.</p>;
  }
  return (
    <div className="mt-3 grid gap-4 sm:grid-cols-2">
      {screenshots.map((shot) => (
        <figure
          key={shot.id}
          className="overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--input-bg)]"
        >
          <AuthImage
            src={shot.url}
            alt={shot.overview || "Bug screenshot"}
            className="max-h-[32rem] w-full object-contain bg-slate-900"
          />
          <figcaption className="space-y-1 border-t border-[var(--line)] p-3 text-sm">
            <p className="font-medium text-[var(--ink)]">
              {shot.overview || "Highlighted defect"}
            </p>
            {shot.pageUrl && (
              <p className="break-all text-xs text-[var(--muted)]">{shot.pageUrl}</p>
            )}
          </figcaption>
        </figure>
      ))}
    </div>
  );
}

export function BugStepsTable({ bug }: { bug: Bug }) {
  if (!bug.steps?.length) {
    return <p className="mt-2 text-sm text-[var(--muted)]">No steps recorded yet.</p>;
  }
  return (
    <div className="mt-3 overflow-x-auto rounded-xl border border-[var(--line)]">
      <table className="w-full min-w-[640px] text-left text-sm">
        <thead>
          <tr className="bg-[var(--panel-elevated)] text-xs uppercase tracking-wide text-[var(--muted)]">
            <th className="w-12 px-3 py-2.5">#</th>
            <th className="px-3 py-2.5">Step</th>
            <th className="px-3 py-2.5">Actual Result</th>
            <th className="px-3 py-2.5">Expected Result</th>
          </tr>
        </thead>
        <tbody>
          {bug.steps.map((step) => (
            <tr
              key={`${bug.id}-${step.order}-${step.description}`}
              className={`border-t border-[var(--line)] align-top ${
                step.expectedResult ? "bg-[var(--danger-soft)]/35" : "bg-white"
              }`}
            >
              <td className="px-3 py-3 font-semibold text-[var(--accent)]">{step.order}</td>
              <td className="px-3 py-3 font-medium text-[var(--ink)]">
                {plainText(step.description)}
                {step.screenshotId ? (
                  <span className="ml-2 rounded bg-[var(--danger-soft)] px-1.5 py-0.5 text-[10px] font-semibold uppercase text-[var(--danger)]">
                    shot
                  </span>
                ) : null}
              </td>
              <td className="px-3 py-3 text-[var(--ink)]">
                {plainText(step.actualResult) || "—"}
              </td>
              <td className="px-3 py-3 text-[var(--ink)]">
                {step.expectedResult ? (
                  <span className="text-[var(--danger)]">{plainText(step.expectedResult)}</span>
                ) : (
                  <span className="text-[var(--muted)]">—</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function BugFullCard({
  bug,
  assigneeName,
  reporterName,
  sprintName,
  moduleName,
  compactLink = true,
  collapsible = false,
  defaultOpen = false,
  open: openControlled,
  onOpenChange,
  selected,
  onSelectedChange,
}: {
  bug: Bug;
  assigneeName: string;
  reporterName: string;
  sprintName: string;
  moduleName?: string;
  compactLink?: boolean;
  /** Project detail: summary row + expandable inner details */
  collapsible?: boolean;
  defaultOpen?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  selected?: boolean;
  onSelectedChange?: (bugId: string, selected: boolean) => void;
}) {
  const panelId = useId();
  const [uncontrolledOpen, setUncontrolledOpen] = useState(defaultOpen || !collapsible);
  const isControlled = openControlled !== undefined;
  const open = isControlled ? openControlled : uncontrolledOpen;
  const selectable = typeof onSelectedChange === "function";

  function setOpen(next: boolean) {
    if (!isControlled) setUncontrolledOpen(next);
    onOpenChange?.(next);
  }
  const shotCount = bug.screenshots?.length ?? 0;
  const stepCount = bug.steps?.length ?? 0;
  const previewShot = bug.screenshots?.[0];
  const descPreview = plainText(bug.description);
  const shortDesc =
    descPreview.length > 140 ? `${descPreview.slice(0, 137)}…` : descPreview;

  const details = (
    <div className="space-y-5 border-t border-[var(--line)] bg-[var(--panel-elevated)]/60 px-5 py-5">
      <div>
        <h4 className="text-xs font-bold uppercase tracking-wide text-[var(--muted)]">
          Description
        </h4>
        <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-[var(--ink)]">
          {bug.description || "—"}
        </p>
      </div>

      <dl className="grid gap-3 rounded-xl border border-[var(--line)] bg-white p-4 text-sm sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        <div>
          <dt className="text-xs uppercase tracking-wide text-[var(--muted)]">Assignee</dt>
          <dd className="mt-1 flex items-center gap-2 font-medium">
            <span className="tb-avatar-sm" aria-hidden>
              {initials(assigneeName)}
            </span>
            <span className="truncate">{assigneeName}</span>
          </dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-[var(--muted)]">Reporter</dt>
          <dd className="mt-1 font-medium">{reporterName}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-[var(--muted)]">Module</dt>
          <dd className="mt-1 font-medium">{moduleName || "—"}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-[var(--muted)]">Sprint</dt>
          <dd className="mt-1 font-medium">{sprintName}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-[var(--muted)]">Environment</dt>
          <dd className="mt-1 font-medium">
            {bug.environmentName
              ? `${bug.environmentName}${bug.environmentSnapshot ? ` · ${bug.environmentSnapshot}` : ""}`
              : bug.environmentSnapshot || "—"}
          </dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-[var(--muted)]">Filed</dt>
          <dd className="mt-1 font-medium">{formatWhen(bug.createdAt)}</dd>
        </div>
      </dl>

      <section>
        <h4 className="text-xs font-bold uppercase tracking-wide text-[var(--muted)]">
          Reproduction steps ({stepCount})
        </h4>
        <BugStepsTable bug={bug} />
      </section>

      <section>
        <h4 className="text-xs font-bold uppercase tracking-wide text-[var(--muted)]">
          Screenshots ({shotCount})
        </h4>
        <BugScreenshots screenshots={bug.screenshots} />
      </section>

      {compactLink && (
        <div className="flex justify-end">
          <Link
            to={`/bugs/${bug.id}`}
            state={{ fromProjectId: bug.projectId }}
            className="tb-btn-ghost text-xs"
          >
            Open bug page →
          </Link>
        </div>
      )}
    </div>
  );

  if (!collapsible) {
    return (
      <article className="tb-card overflow-hidden">
        <header className="space-y-3 p-5">
          <div className="flex flex-wrap gap-2">
            <span className={`rounded-md px-2 py-0.5 text-xs font-semibold ${statusTone(bug.status)}`}>
              {bug.status}
            </span>
            <span
              className={`rounded-md px-2 py-0.5 text-xs font-semibold ${priorityTone(bug.priority)}`}
            >
              {bug.priority}
            </span>
            <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700">
              {bug.severity}
            </span>
          </div>
          <h3 className="text-xl font-bold tracking-tight text-[var(--ink)]">
            {compactLink ? (
              <Link className="tb-link" to={`/bugs/${bug.id}`}>
                {bug.title}
              </Link>
            ) : (
              bug.title
            )}
          </h3>
        </header>
        {details}
      </article>
    );
  }

  return (
    <article
      className={`tb-card overflow-hidden transition-shadow hover:shadow-md ${
        selected ? "ring-2 ring-[var(--accent)]/40" : ""
      }`}
    >
      <div className="flex items-stretch gap-2 sm:gap-3">
        {selectable ? (
          <label
            className="flex shrink-0 items-start px-3 pt-5 sm:px-4"
            onClick={(e) => e.stopPropagation()}
          >
            <input
              type="checkbox"
              className="mt-0.5 h-4 w-4 cursor-pointer accent-[var(--accent)]"
              checked={!!selected}
              aria-label={`Select bug ${bug.title}`}
              onChange={(e) => onSelectedChange(bug.id, e.target.checked)}
            />
          </label>
        ) : null}
        <button
          type="button"
          className="flex min-w-0 flex-1 items-stretch gap-4 py-4 pr-4 text-left sm:py-5 sm:pr-5"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen(!open)}
        >
          <div className="min-w-0 flex-1 space-y-2.5">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`rounded-md px-2 py-0.5 text-xs font-semibold ${statusTone(bug.status)}`}>
                {bug.status}
              </span>
              <span
                className={`rounded-md px-2 py-0.5 text-xs font-semibold ${priorityTone(bug.priority)}`}
              >
                {bug.priority}
              </span>
              <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700">
                {bug.severity}
              </span>
              {moduleName ? (
                <span className="rounded-md bg-[var(--accent-soft)] px-2 py-0.5 text-xs font-semibold text-[var(--accent)]">
                  {moduleName}
                </span>
              ) : null}
              <span className="text-xs text-[var(--muted)]">{sprintName}</span>
            </div>

            <h3 className="text-lg font-bold leading-snug tracking-tight text-[var(--ink)] sm:text-xl">
              {bug.title}
            </h3>

            {shortDesc && (
              <p className="line-clamp-2 text-sm text-[var(--muted)]">{shortDesc}</p>
            )}

            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--muted)]">
              <span>
                Assignee <strong className="font-semibold text-[var(--ink)]">{assigneeName}</strong>
              </span>
              <span>
                {stepCount} step{stepCount === 1 ? "" : "s"}
              </span>
              <span>
                {shotCount} screenshot{shotCount === 1 ? "" : "s"}
              </span>
              <span>{formatWhen(bug.createdAt)}</span>
            </div>
          </div>

          {previewShot && (
            <div className="hidden h-20 w-28 shrink-0 overflow-hidden rounded-lg border border-[var(--line)] sm:block">
              <AuthImage
                src={previewShot.url}
                alt=""
                className="h-full w-full object-cover"
              />
            </div>
          )}

          <span
            className={`mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[var(--line)] bg-white text-[var(--muted)] transition-transform ${
              open ? "rotate-180" : ""
            }`}
            aria-hidden
          >
            ▾
          </span>
        </button>
      </div>

      <div
        id={panelId}
        hidden={!open}
        className={open ? "animate-[tbFade_180ms_ease-out]" : undefined}
      >
        {open ? details : null}
      </div>
    </article>
  );
}
