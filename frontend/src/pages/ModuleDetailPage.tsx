import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  fetchBugs,
  fetchCycles,
  fetchModules,
  fetchProject,
  fetchUsers,
} from "../api";
import { useAuth } from "../auth";
import { BugListRow, BUG_TABLE_GRID } from "../components/BugListRow";
import { ExportFormatModal } from "../components/ExportFormatModal";
import { FlashAlert } from "../components/FlashAlert";
import { ModuleBugCard } from "../components/ModuleBugCard";
import { QueryStatus } from "../components/QueryStatus";
import { Shell } from "../components/Shell";
import { queryKeys } from "../queryKeys";
import type { Bug } from "../types";
import { exportBugs, type ExportFormat } from "../utils/bugExport";
import {
  canCommentOnBug,
  canDeleteBug,
  canFullEditBug,
  canUpdateBugStatus,
} from "../utils/roles";

export function ModuleDetailPage() {
  const { id: projectId = "", moduleId = "" } = useParams();
  const { user } = useAuth();
  const canEdit = canFullEditBug(user);
  const canStatus = canUpdateBugStatus(user);
  const canComment = canCommentOnBug(user);
  const canDelete = canDeleteBug(user);
  const [openBugId, setOpenBugId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [exportOpen, setExportOpen] = useState(false);
  const [exportBusy, setExportBusy] = useState(false);
  const [exportMsg, setExportMsg] = useState<string | null>(null);
  const [exportError, setExportError] = useState(false);
  /** When set, export only these ids; otherwise uses selectedIds / all */
  const [exportTargetIds, setExportTargetIds] = useState<string[] | null>(null);

  const projectQuery = useQuery({
    queryKey: queryKeys.project(projectId),
    queryFn: () => fetchProject(projectId),
    enabled: !!projectId,
  });
  const modulesQuery = useQuery({
    queryKey: queryKeys.modules(projectId),
    queryFn: () => fetchModules(projectId),
    enabled: !!projectId,
  });
  const cyclesQuery = useQuery({
    queryKey: queryKeys.cycles(projectId),
    queryFn: () => fetchCycles(projectId),
    enabled: !!projectId,
  });
  const usersQuery = useQuery({
    queryKey: queryKeys.users(),
    queryFn: () => fetchUsers(),
  });

  const bugFilters = useMemo(() => ({ projectId, moduleId }), [projectId, moduleId]);
  const bugsQuery = useQuery({
    queryKey: queryKeys.bugs(bugFilters),
    queryFn: () => fetchBugs(bugFilters),
    enabled: !!projectId && !!moduleId,
  });

  const mod = modulesQuery.data?.find((m) => m.id === moduleId);
  const bugs = bugsQuery.data ?? [];
  const users = usersQuery.data ?? [];
  const cycles = cyclesQuery.data ?? [];
  const modules = modulesQuery.data ?? [];
  const projectName = projectQuery.data?.name ?? "…";
  const nameOf = (uid: string) => users.find((u) => u.id === uid)?.name ?? uid.slice(0, 8);
  const cycleLabel = (cycleId: string) =>
    cycles.find((c) => c.id === cycleId)?.name ?? cycleId.slice(0, 8);

  const openBug = openBugId ? bugs.find((b) => b.id === openBugId) : undefined;
  const allSelected = bugs.length > 0 && bugs.every((b) => selectedIds.has(b.id));
  const someSelected = selectedIds.size > 0;

  // If opened bug left this module (moved/deleted), return to list
  useEffect(() => {
    if (openBugId && bugsQuery.isSuccess && !bugs.some((b) => b.id === openBugId)) {
      setOpenBugId(null);
    }
  }, [openBugId, bugs, bugsQuery.isSuccess]);

  // Drop selections for bugs no longer in list
  useEffect(() => {
    setSelectedIds((prev) => {
      if (prev.size === 0) return prev;
      const next = new Set([...prev].filter((id) => bugs.some((b) => b.id === id)));
      return next.size === prev.size ? prev : next;
    });
  }, [bugs]);

  const loading = projectQuery.isLoading || modulesQuery.isLoading;
  const notFound = !modulesQuery.isLoading && !!modulesQuery.data && !mod;

  function refreshBugs() {
    void bugsQuery.refetch();
  }

  function toggleOne(bugId: string, selected: boolean) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (selected) next.add(bugId);
      else next.delete(bugId);
      return next;
    });
  }

  function toggleAll(selected: boolean) {
    setSelectedIds(selected ? new Set(bugs.map((b) => b.id)) : new Set());
  }

  function bugsToExport(ids: string[]): Bug[] {
    const idSet = new Set(ids);
    return bugs.filter((b) => idSet.has(b.id));
  }

  function openExport(ids: string[]) {
    if (ids.length === 0) return;
    setExportTargetIds(ids);
    setExportMsg(null);
    setExportError(false);
    setExportOpen(true);
  }

  async function onExportFormat(format: ExportFormat) {
    const ids = exportTargetIds ?? [...selectedIds];
    const list = bugsToExport(ids);
    if (!list.length) {
      setExportError(true);
      setExportMsg("No bugs selected to export");
      return;
    }
    setExportBusy(true);
    setExportMsg(null);
    setExportError(false);
    try {
      await exportBugs(
        format,
        list.map((bug) => ({
          bug,
          projectName,
          cycleName: cycleLabel(bug.cycleId),
          assigneeName: nameOf(bug.assigneeId),
          reporterName: nameOf(bug.reporterId),
        })),
      );
      const label = format === "excel" ? "Excel" : "PDF";
      setExportMsg(
        `${label} downloaded — ${list.length} bug${list.length === 1 ? "" : "s"} + screenshots`,
      );
      setExportOpen(false);
      setExportTargetIds(null);
    } catch (err) {
      setExportError(true);
      setExportMsg(err instanceof Error ? err.message : "Export failed");
    } finally {
      setExportBusy(false);
    }
  }

  const exportModalTitle =
    (exportTargetIds?.length ?? selectedIds.size) === 1
      ? bugsToExport(exportTargetIds ?? [...selectedIds])[0]?.title ?? "Bug"
      : `${exportTargetIds?.length ?? selectedIds.size} selected bugs`;

  return (
    <Shell title={mod?.name ?? "Module"}>
      {openBug ? (
        <button type="button" className="tb-link text-sm" onClick={() => setOpenBugId(null)}>
          ← Back to module bugs
        </button>
      ) : (
        <Link to={`/projects/${projectId}`} className="tb-link text-sm">
          ← Back to project
        </Link>
      )}

      <QueryStatus
        isLoading={loading}
        error={projectQuery.error || modulesQuery.error}
        onRetry={() => {
          void projectQuery.refetch();
          void modulesQuery.refetch();
        }}
        loadingText="Loading module…"
        className="mt-4"
      />

      {notFound && (
        <div className="tb-card mt-4 border-dashed p-8 text-center">
          <p className="font-medium text-[var(--ink)]">Module not found</p>
          <Link to={`/projects/${projectId}`} className="tb-link mt-3 inline-block text-sm">
            Return to project
          </Link>
        </div>
      )}

      {mod && openBug && (
        <div className="mt-4">
          <ModuleBugCard
            key={`${openBug.id}-${openBug.updatedAt}`}
            bug={openBug}
            assigneeName={nameOf(openBug.assigneeId)}
            reporterName={nameOf(openBug.reporterId)}
            cycleName={cycleLabel(openBug.cycleId)}
            moduleName={mod.name}
            projectName={projectName}
            users={users}
            cycles={cycles}
            modules={modules}
            canEdit={canEdit}
            canStatus={canStatus}
            canComment={canComment}
            canDelete={canDelete}
            onSaved={refreshBugs}
            onDeleted={() => {
              setOpenBugId(null);
              refreshBugs();
            }}
          />
        </div>
      )}

      {mod && !openBug && (
        <div className="mt-4 space-y-5">
          <header className="tb-card tb-card-accent p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--accent)]">
              Module
            </p>
            <h2 className="mt-1 text-3xl font-bold tracking-tight text-[var(--ink)]">{mod.name}</h2>
            <p className="mt-2 text-sm text-[var(--muted)]">
              Project{" "}
              <Link to={`/projects/${projectId}`} className="tb-link font-medium">
                {projectName}
              </Link>
              {" · "}
              <span className="font-semibold text-[var(--ink)]">{bugs.length}</span> bug
              {bugs.length === 1 ? "" : "s"}
            </p>
          </header>

          <section className="space-y-3">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h3 className="text-lg font-bold text-[var(--ink)]">Bugs in this module</h3>
                <p className="mt-1 text-sm text-[var(--muted)]">
                  Open a bug to view/edit, or select bugs to export as PDF / Excel.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className="tb-btn-primary text-xs"
                  disabled={!someSelected || exportBusy}
                  onClick={() => openExport([...selectedIds])}
                >
                  Export selected ({selectedIds.size})
                </button>
                <button
                  type="button"
                  className="tb-btn-ghost text-xs"
                  disabled={bugs.length === 0 || exportBusy}
                  onClick={() => openExport(bugs.map((b) => b.id))}
                >
                  Export all
                </button>
              </div>
            </div>

            <FlashAlert
              error={exportError ? exportMsg : null}
              message={!exportError ? exportMsg : null}
              className=""
            />

            <QueryStatus
              isLoading={bugsQuery.isLoading}
              error={bugsQuery.error}
              onRetry={() => void bugsQuery.refetch()}
              loadingText="Loading bugs…"
            />

            {!bugsQuery.isLoading && bugs.length === 0 && (
              <div className="tb-card border-dashed p-8 text-center">
                <p className="font-medium text-[var(--ink)]">No bugs in this module</p>
                <p className="mt-2 text-sm text-[var(--muted)]">
                  File a bug from the extension with this module selected.
                </p>
              </div>
            )}

            {bugs.length > 0 && (
              <div className="tb-card overflow-hidden">
                <div className="flex flex-wrap items-center gap-3 border-b border-[var(--line)] bg-slate-50/80 px-4 py-2">
                  <label className="flex items-center gap-2 text-xs font-semibold text-[var(--muted)]">
                    <input
                      type="checkbox"
                      className="h-4 w-4 accent-[var(--accent)]"
                      checked={allSelected}
                      onChange={(e) => toggleAll(e.target.checked)}
                    />
                    Select all
                  </label>
                  {someSelected ? (
                    <span className="text-xs text-[var(--muted)]">
                      {selectedIds.size} selected
                    </span>
                  ) : null}
                </div>
                <div
                  className={`hidden border-b border-[var(--line)] bg-slate-50/80 text-[11px] font-semibold uppercase tracking-wide text-[var(--muted)] md:grid ${BUG_TABLE_GRID}`}
                >
                  <span aria-hidden />
                  <span>ID</span>
                  <span aria-hidden />
                  <span>Title</span>
                  <span>Assignee</span>
                  <span>Status</span>
                  <span>Priority</span>
                  <span>Activity</span>
                  <span className="text-right">Cycle</span>
                </div>
                {bugs.map((bug) => (
                  <BugListRow
                    key={bug.id}
                    bug={bug}
                    assigneeName={nameOf(bug.assigneeId)}
                    cycleName={cycleLabel(bug.cycleId)}
                    selected={selectedIds.has(bug.id)}
                    onSelectedChange={toggleOne}
                    onOpen={() => setOpenBugId(bug.id)}
                    actions={
                      <>
                        <button
                          type="button"
                          className="tb-link text-xs font-semibold"
                          onClick={() => setOpenBugId(bug.id)}
                        >
                          View
                        </button>
                        <button
                          type="button"
                          className="tb-link text-xs font-semibold"
                          disabled={exportBusy}
                          onClick={() => openExport([bug.id])}
                        >
                          Export
                        </button>
                      </>
                    }
                  />
                ))}
              </div>
            )}
          </section>
        </div>
      )}

      <ExportFormatModal
        open={exportOpen}
        busy={exportBusy}
        bugTitle={exportModalTitle}
        onClose={() => {
          if (!exportBusy) {
            setExportOpen(false);
            setExportTargetIds(null);
          }
        }}
        onSelect={(format) => void onExportFormat(format)}
      />
    </Shell>
  );
}
