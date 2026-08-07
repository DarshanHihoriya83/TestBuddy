import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  fetchBugs,
  fetchSprints,
  fetchEnvironments,
  fetchModules,
  fetchProject,
  fetchTestCases,
  fetchUsers,
} from "../api";
import { useAuth } from "../auth";
import { CommandChip, CommandHeader, countLabel } from "../components/CommandHeader";
import { ExportFormatModal } from "../components/ExportFormatModal";
import { FlashAlert } from "../components/FlashAlert";
import { ModuleBugCard } from "../components/ModuleBugCard";
import { ModuleBugsPanel } from "../components/project/ModuleBugsPanel";
import { ModuleCustomizeViewModal } from "../components/project/ModuleCustomizeViewModal";
import { ModuleTestCasesPanel } from "../components/project/ModuleTestCasesPanel";
import { QueryStatus } from "../components/QueryStatus";
import { Shell } from "../components/Shell";
import { queryKeys } from "../queryKeys";
import type { Bug } from "../types";
import { exportBugs, type ExportFormat } from "../utils/bugExport";
import {
  loadModuleViewPrefs,
  saveModuleViewPrefs,
  type ModuleViewMode,
  type ModuleViewPrefs,
} from "../utils/moduleViewPrefs";
import {
  canCommentOnBug,
  canCreateBug,
  canDeleteBug,
  canFullEditBug,
  canUpdateBugStatus,
} from "../utils/roles";

type ModuleTab = "bugs" | "testcases";

function CustomizeIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.75" />
      <path
        d="M12 3.5v2.2M12 18.3v2.2M3.5 12h2.2M18.3 12h2.2M6.1 6.1l1.6 1.6M16.3 16.3l1.6 1.6M6.1 17.9l1.6-1.6M16.3 7.7l1.6-1.6"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
    </svg>
  );
}

function ListIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
    </svg>
  );
}

function GridIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="3" y="3" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.75" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.75" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.75" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.75" />
    </svg>
  );
}

function BugTabIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="3.5" stroke="currentColor" strokeWidth="1.75" />
      <path d="M12 3v3M12 21v-3M3 12h3M21 12h-3" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    </svg>
  );
}

function ModuleIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="3" y="3" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.75" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.75" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.75" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.75" />
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
  const [customizeOpen, setCustomizeOpen] = useState(false);
  const [bugViewPrefs, setBugViewPrefs] = useState<ModuleViewPrefs>(() => loadModuleViewPrefs("bugs"));
  const [tcViewPrefs, setTcViewPrefs] = useState<ModuleViewPrefs>(() => loadModuleViewPrefs("testcases"));
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
  const sprintsQuery = useQuery({
    queryKey: queryKeys.sprints(projectId),
    queryFn: () => fetchSprints(projectId),
    enabled: !!projectId,
  });
  const environmentsQuery = useQuery({
    queryKey: queryKeys.environments(projectId),
    queryFn: () => fetchEnvironments(projectId),
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
  const sprints = sprintsQuery.data ?? [];
  const environments = environmentsQuery.data ?? [];
  const modules = modulesQuery.data ?? [];
  const projectName = projectQuery.data?.name ?? "…";
  const nameOf = (uid: string) => users.find((u) => u.id === uid)?.name ?? uid.slice(0, 8);
  const sprintLabel = (sprintId: string) =>
    sprints.find((c) => c.id === sprintId)?.name ?? sprintId.slice(0, 8);

  const openBug = openBugId ? bugs.find((b) => b.id === openBugId) : undefined;

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

  function toggleAllTc(selected: boolean, ids?: string[]) {
    if (!selected) {
      setSelectedTcIds(new Set());
      return;
    }
    const target = ids?.length ? ids : testCases.map((t) => t.id);
    setSelectedTcIds((prev) => {
      const next = new Set(prev);
      for (const id of target) next.add(id);
      return next;
    });
  }

  const [tcCreateOpen, setTcCreateOpen] = useState(false);

  const bugQualityPulse = useMemo(() => {
    if (bugs.length === 0) return null;
    let resolved = 0;
    for (const b of bugs) {
      const s = b.status;
      if (s === "FIXED" || s === "VERIFIED" || s === "CLOSED") resolved += 1;
    }
    return Math.round((resolved / bugs.length) * 100);
  }, [bugs]);

  const tcQualityPulse = useMemo(() => {
    if (testCases.length === 0) return null;
    const passed = testCases.filter((t) => t.executionStatus === "PASSED").length;
    return Math.round((passed / testCases.length) * 100);
  }, [testCases]);

  const qualityPulse = tab === "bugs" ? bugQualityPulse : tcQualityPulse;

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
          sprintName: sprintLabel(bug.sprintId),
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

  const activeViewPrefs = tab === "bugs" ? bugViewPrefs : tcViewPrefs;

  function applyViewPrefs(prefs: ModuleViewPrefs) {
    if (tab === "bugs") {
      setBugViewPrefs(prefs);
      saveModuleViewPrefs("bugs", prefs);
    } else {
      setTcViewPrefs(prefs);
      saveModuleViewPrefs("testcases", prefs);
    }
    setCustomizeOpen(false);
  }

  function setViewMode(mode: ModuleViewMode) {
    const next = { ...activeViewPrefs, viewMode: mode };
    if (tab === "bugs") {
      setBugViewPrefs(next);
      saveModuleViewPrefs("bugs", next);
    } else {
      setTcViewPrefs(next);
      saveModuleViewPrefs("testcases", next);
    }
  }

  return (
    <Shell
      title={mod?.name ?? "Module"}
      crumbRoot={{ label: "Projects", to: "/projects" }}
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
              sprintName={sprintLabel(openBug.sprintId)}
              moduleName={mod.name}
              projectName={projectName}
              users={users}
              sprints={sprints}
              modules={modules}
              environments={environments}
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
          <CommandHeader
            icon={<ModuleIcon />}
            title={mod.name}
            subtitle={
              tab === "bugs"
                ? "Track defects, triage priorities, and ship with confidence."
                : "Run coverage, monitor execution health, and keep quality visible."
            }
            meta={
              <>
                <CommandChip>{countLabel(bugs.length, "bug")}</CommandChip>
                <CommandChip>{countLabel(testCases.length, "test case")}</CommandChip>
              </>
            }
            pulse={{
              value: qualityPulse,
              label: "Quality Pulse",
              hint: tab === "bugs" ? "Resolved + closed" : "Passed cases",
            }}
            actions={
              <>
                <Link
                  to={`/projects/${projectId}`}
                  className="tb-btn-ghost inline-flex items-center gap-1.5 text-sm"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
                    <path d="M15 18 9 12l6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  Back
                </Link>
                {tab === "bugs" ? (
                  <Link
                    to={`/bugs?projectId=${encodeURIComponent(projectId)}&moduleId=${encodeURIComponent(moduleId)}`}
                    className="tb-btn-primary inline-flex items-center gap-1.5 text-sm"
                  >
                    + Report Bug
                  </Link>
                ) : (
                  canCreateBug(user) && (
                    <button
                      type="button"
                      className="tb-btn-primary inline-flex items-center gap-1.5 text-sm"
                      onClick={() => setTcCreateOpen(true)}
                    >
                      + New Test Case
                    </button>
                  )
                )}
              </>
            }
          />

          <FlashAlert
            error={exportError ? exportMsg : null}
            message={!exportError ? exportMsg : null}
            className="mb-3 shrink-0"
          />

          <div className="tb-mod-stage flex min-h-0 flex-1 flex-col overflow-hidden">
            <div className="tb-mod-stage-top tb-mod-command-deck shrink-0">
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
              <div className="tb-mod-stage-actions">
                <button
                  type="button"
                  className="tb-mod-customize-btn"
                  onClick={() => setCustomizeOpen(true)}
                >
                  <CustomizeIcon />
                  Customize
                </button>
                <div className="tb-view-toggle">
                  <button
                    type="button"
                    aria-label="List view"
                    aria-pressed={activeViewPrefs.viewMode === "list"}
                    className={`tb-view-toggle-btn ${
                      activeViewPrefs.viewMode === "list" ? "is-active" : "bg-white text-[var(--muted)]"
                    }`}
                    onClick={() => setViewMode("list")}
                  >
                    <ListIcon />
                  </button>
                  <button
                    type="button"
                    aria-label="Grid view"
                    aria-pressed={activeViewPrefs.viewMode === "grid"}
                    className={`tb-view-toggle-btn border-l border-[var(--line)] ${
                      activeViewPrefs.viewMode === "grid" ? "is-active" : "bg-white text-[var(--muted)]"
                    }`}
                    onClick={() => setViewMode("grid")}
                  >
                    <GridIcon />
                  </button>
                </div>
              </div>
            </div>

            <div
              key={tab}
              className="tb-mod-tab-panel flex min-h-0 flex-1 flex-col overflow-hidden"
            >
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
                  onExportSelected={() => openExport([...selectedBugIds])}
                  onClearSelection={() => setSelectedBugIds(new Set())}
                  exportBusy={exportBusy}
                  search={bugSearch}
                  onSearchChange={setBugSearch}
                  viewPrefs={bugViewPrefs}
                />
              ) : (
                <ModuleTestCasesPanel
                  projectId={projectId}
                  moduleId={moduleId}
                  moduleName={mod?.name}
                  testCases={testCases}
                  loading={testCasesQuery.isLoading}
                  users={users}
                  sprints={sprints}
                  currentUser={user}
                  selectedIds={selectedTcIds}
                  onToggleOne={toggleTc}
                  onToggleAll={toggleAllTc}
                  onExportSelected={() => exportTestCasesJson([...selectedTcIds])}
                  onClearSelection={() => setSelectedTcIds(new Set())}
                  createOpen={tcCreateOpen}
                  onCreateOpenChange={setTcCreateOpen}
                  search={tcSearch}
                  onSearchChange={setTcSearch}
                  viewPrefs={tcViewPrefs}
                />
              )}
            </div>
          </div>
        </div>
      )}

      <ModuleCustomizeViewModal
        open={customizeOpen}
        tab={tab}
        value={activeViewPrefs}
        onClose={() => setCustomizeOpen(false)}
        onApply={applyViewPrefs}
      />

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
