import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  fetchBugs,
  fetchCycles,
  fetchModules,
  fetchProject,
  fetchTestCases,
  fetchUsers,
} from "../api";
import { useAuth } from "../auth";
import { ExportFormatModal } from "../components/ExportFormatModal";
import { FlashAlert } from "../components/FlashAlert";
import { ModuleBugCard } from "../components/ModuleBugCard";
import { ModuleBugsPanel } from "../components/project/ModuleBugsPanel";
import { ModuleTestCasesPanel } from "../components/project/ModuleTestCasesPanel";
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

type ModuleTab = "bugs" | "testcases";

function BugTabIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="3.5" stroke="currentColor" strokeWidth="1.75" />
      <path d="M12 3v3M12 21v-3M3 12h3M21 12h-3" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    </svg>
  );
}

function TestCaseTabIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M8 4h9a2 2 0 0 1 2 2v14l-4-2-4 2V6a2 2 0 0 0-2-2H7a2 2 0 0 0-2 2v3" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
      <path d="m5 12 1.5 1.5L9.5 10" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function ModuleDetailPage() {
  const { id: projectId = "", moduleId = "" } = useParams();
  const { user } = useAuth();
  const canEdit = canFullEditBug(user);
  const canStatus = canUpdateBugStatus(user);
  const canComment = canCommentOnBug(user);
  const canDelete = canDeleteBug(user);

  const [tab, setTab] = useState<ModuleTab>("bugs");
  const [openBugId, setOpenBugId] = useState<string | null>(null);
  const [selectedBugIds, setSelectedBugIds] = useState<Set<string>>(() => new Set());
  const [selectedTcIds, setSelectedTcIds] = useState<Set<string>>(() => new Set());
  const [bugSearch, setBugSearch] = useState("");
  const [tcSearch, setTcSearch] = useState("");
  const [exportOpen, setExportOpen] = useState(false);
  const [exportBusy, setExportBusy] = useState(false);
  const [exportMsg, setExportMsg] = useState<string | null>(null);
  const [exportError, setExportError] = useState(false);
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

  const tcFilters = useMemo(() => ({ projectId, moduleId }), [projectId, moduleId]);
  const testCasesQuery = useQuery({
    queryKey: queryKeys.testCases(tcFilters),
    queryFn: () => fetchTestCases(tcFilters),
    enabled: !!projectId && !!moduleId,
  });

  const mod = modulesQuery.data?.find((m) => m.id === moduleId);
  const bugs = bugsQuery.data ?? [];
  const testCases = testCasesQuery.data ?? [];
  const users = usersQuery.data ?? [];
  const cycles = cyclesQuery.data ?? [];
  const modules = modulesQuery.data ?? [];
  const projectName = projectQuery.data?.name ?? "…";
  const nameOf = (uid: string) => users.find((u) => u.id === uid)?.name ?? uid.slice(0, 8);
  const cycleLabel = (cycleId: string) =>
    cycles.find((c) => c.id === cycleId)?.name ?? cycleId.slice(0, 8);

  const openBug = openBugId ? bugs.find((b) => b.id === openBugId) : undefined;
  const someBugsSelected = selectedBugIds.size > 0;
  const someTcSelected = selectedTcIds.size > 0;

  useEffect(() => {
    if (openBugId && bugsQuery.isSuccess && !bugs.some((b) => b.id === openBugId)) {
      setOpenBugId(null);
    }
  }, [openBugId, bugs, bugsQuery.isSuccess]);

  useEffect(() => {
    setSelectedBugIds((prev) => {
      if (prev.size === 0) return prev;
      const next = new Set([...prev].filter((id) => bugs.some((b) => b.id === id)));
      return next.size === prev.size ? prev : next;
    });
  }, [bugs]);

  useEffect(() => {
    setSelectedTcIds((prev) => {
      if (prev.size === 0) return prev;
      const next = new Set([...prev].filter((id) => testCases.some((t) => t.id === id)));
      return next.size === prev.size ? prev : next;
    });
  }, [testCases]);

  const loading = projectQuery.isLoading || modulesQuery.isLoading;
  const notFound = !modulesQuery.isLoading && !!modulesQuery.data && !mod;

  function refreshBugs() {
    void bugsQuery.refetch();
  }

  function toggleBug(bugId: string, selected: boolean) {
    setSelectedBugIds((prev) => {
      const next = new Set(prev);
      if (selected) next.add(bugId);
      else next.delete(bugId);
      return next;
    });
  }

  function toggleAllBugs(selected: boolean, ids?: string[]) {
    if (!selected) {
      setSelectedBugIds(new Set());
      return;
    }
    const target = ids?.length ? ids : bugs.map((b) => b.id);
    setSelectedBugIds((prev) => {
      const next = new Set(prev);
      for (const id of target) next.add(id);
      return next;
    });
  }

  function toggleTc(id: string, selected: boolean) {
    setSelectedTcIds((prev) => {
      const next = new Set(prev);
      if (selected) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function toggleAllTc(selected: boolean) {
    setSelectedTcIds(selected ? new Set(testCases.map((t) => t.id)) : new Set());
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
    const ids = exportTargetIds ?? [...selectedBugIds];
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

  function exportTestCasesJson(ids?: string[]) {
    const idList = ids?.length
      ? ids
      : selectedTcIds.size
        ? [...selectedTcIds]
        : testCases.map((t) => t.id);
    const list = testCases.filter((t) => idList.includes(t.id));
    if (!list.length) {
      setExportError(true);
      setExportMsg("No test cases to export");
      return;
    }
    const blob = new Blob([JSON.stringify({ count: list.length, testCases: list }, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `testbuddy-testcases-${moduleId.slice(0, 8)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setExportMsg(`JSON downloaded — ${list.length} test case${list.length === 1 ? "" : "s"}`);
    setExportError(false);
  }

  const exportModalTitle =
    (exportTargetIds?.length ?? selectedBugIds.size) === 1
      ? bugsToExport(exportTargetIds ?? [...selectedBugIds])[0]?.title ?? "Bug"
      : `${exportTargetIds?.length ?? selectedBugIds.size} selected bugs`;

  return (
    <Shell
      title={mod?.name ?? "Module"}
      crumbs={[{ label: projectName, to: `/projects/${projectId}` }]}
    >
      <QueryStatus
        isLoading={loading}
        error={projectQuery.error || modulesQuery.error}
        onRetry={() => {
          void projectQuery.refetch();
          void modulesQuery.refetch();
        }}
        loadingText="Loading module…"
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
        <div className="flex h-full min-h-0 flex-col overflow-hidden">
          <div className="mb-3 flex shrink-0 flex-wrap items-start justify-between gap-3 px-1 sm:px-0">
            <div className="min-w-0">
              <h1 className="text-xl font-bold tracking-tight text-[var(--ink)] sm:text-2xl">
                {mod.name}
              </h1>
              <p className="mt-0.5 text-sm text-[var(--muted)]">Viewing bug details for this module.</p>
            </div>
            <button
              type="button"
              className="tb-btn-ghost inline-flex shrink-0 items-center gap-1.5 text-sm shadow-sm"
              onClick={() => setOpenBugId(null)}
            >
              {"\u2190"} Back to module bugs
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-auto">
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
        </div>
      )}

      {mod && !openBug && (
        <div className="tb-mod-workspace flex h-full min-h-0 flex-col overflow-hidden">
          <header className="tb-mod-hero mb-4 shrink-0">
            <div className="min-w-0 flex-1">
              <div className="tb-mod-hero-meta">
                <span className="tb-mod-chip">Module</span>
                <span className="tb-mod-chip tb-mod-chip-muted">{bugs.length} bugs</span>
                <span className="tb-mod-chip tb-mod-chip-muted">{testCases.length} test cases</span>
              </div>
              <h1 className="tb-mod-hero-title">{mod.name}</h1>
              <p className="tb-mod-hero-sub">
                Capture defects, run checks, and keep this feature area ship-ready.
              </p>
            </div>
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              <Link
                to={`/projects/${projectId}`}
                className="tb-btn-ghost inline-flex items-center gap-1.5 text-sm"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
                  <path d="M15 18 9 12l6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                Back to project
              </Link>
              {tab === "bugs" ? (
                <>
                  <button
                    type="button"
                    className="tb-btn-primary inline-flex items-center gap-1.5 text-sm"
                    disabled={!someBugsSelected || exportBusy}
                    onClick={() => openExport([...selectedBugIds])}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
                      <path d="M12 3v12M8 11l4 4 4-4M4 19h16" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    Export selected ({selectedBugIds.size})
                  </button>
                  <button
                    type="button"
                    className="tb-btn-ghost text-sm"
                    disabled={bugs.length === 0 || exportBusy}
                    onClick={() => openExport(bugs.map((b) => b.id))}
                  >
                    Export all
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    className="tb-btn-primary inline-flex items-center gap-1.5 text-sm"
                    disabled={!someTcSelected && testCases.length === 0}
                    onClick={() => exportTestCasesJson()}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
                      <path d="M12 3v12M8 11l4 4 4-4M4 19h16" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    Export selected ({selectedTcIds.size})
                  </button>
                  <button
                    type="button"
                    className="tb-btn-ghost text-sm"
                    disabled={testCases.length === 0}
                    onClick={() => exportTestCasesJson(testCases.map((t) => t.id))}
                  >
                    Export all
                  </button>
                </>
              )}
            </div>
          </header>

          <FlashAlert
            error={exportError ? exportMsg : null}
            message={!exportError ? exportMsg : null}
            className="mb-3 shrink-0"
          />

          <div className="tb-mod-stage flex min-h-0 flex-1 flex-col overflow-hidden">
            <div className="tb-mod-stage-top shrink-0">
              <div className="tb-mod-tabs" role="tablist" aria-label="Module content">
                <button
                  type="button"
                  role="tab"
                  aria-selected={tab === "bugs"}
                  className={`tb-mod-tab ${tab === "bugs" ? "is-active" : ""}`}
                  onClick={() => setTab("bugs")}
                >
                  <BugTabIcon />
                  Bugs
                  <span className="tb-mod-tab-count">{bugs.length}</span>
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={tab === "testcases"}
                  className={`tb-mod-tab ${tab === "testcases" ? "is-active" : ""}`}
                  onClick={() => setTab("testcases")}
                >
                  <TestCaseTabIcon />
                  Test Cases
                  <span className="tb-mod-tab-count">{testCases.length}</span>
                </button>
              </div>
            </div>

            <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
              {tab === "bugs" ? (
                <ModuleBugsPanel
                  projectId={projectId}
                  moduleId={moduleId}
                  bugs={bugs}
                  loading={bugsQuery.isLoading}
                  users={users}
                  selectedIds={selectedBugIds}
                  onToggleOne={toggleBug}
                  onToggleAll={toggleAllBugs}
                  onOpenBug={setOpenBugId}
                  onExportOne={(id) => openExport([id])}
                  exportBusy={exportBusy}
                  search={bugSearch}
                  onSearchChange={setBugSearch}
                />
              ) : (
                <ModuleTestCasesPanel
                  projectId={projectId}
                  moduleId={moduleId}
                  testCases={testCases}
                  loading={testCasesQuery.isLoading}
                  users={users}
                  cycles={cycles}
                  currentUser={user}
                  selectedIds={selectedTcIds}
                  onToggleOne={toggleTc}
                  onToggleAll={toggleAllTc}
                  search={tcSearch}
                  onSearchChange={setTcSearch}
                />
              )}
            </div>
          </div>
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
