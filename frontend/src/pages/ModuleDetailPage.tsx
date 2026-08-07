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
import { CommandChip, CommandHeader, countLabel } from "../components/CommandHeader";
import { BulkExportModal } from "../components/BulkExportModal";
import { FlashAlert } from "../components/FlashAlert";
import { BugDetailCommandHeader } from "../components/BugDetailCommandHeader";
import { ModuleBugCard, type BugCardMode } from "../components/ModuleBugCard";
import { ModuleBugsPanel } from "../components/project/ModuleBugsPanel";
import { ModuleCustomizeViewModal } from "../components/project/ModuleCustomizeViewModal";
import { ModuleTestCasesPanel } from "../components/project/ModuleTestCasesPanel";
import { QueryStatus } from "../components/QueryStatus";
import { Shell } from "../components/Shell";
import type { BreadcrumbItem } from "../components/AppNavigation";
import { queryKeys } from "../queryKeys";
import type { Bug } from "../types";
import { exportBugs, type ExportFormat } from "../utils/bugExport";
import type { RecordExportFormat } from "../utils/recordExport";
import { notifyError, notifySuccess } from "../utils/notify";
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

function breadcrumbLabel(text: string, max = 52) {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

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
  const [bugCardMode, setBugCardMode] = useState<BugCardMode>("view");
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

  useEffect(() => {
    if (openBugId && bugsQuery.isSuccess && !bugs.some((b) => b.id === openBugId)) {
      setOpenBugId(null);
    }
  }, [openBugId, bugs, bugsQuery.isSuccess]);

  useEffect(() => {
    setBugCardMode("view");
  }, [openBugId]);

  const editingBug = Boolean(openBug && (bugCardMode === "steps" || bugCardMode === "fields"));
  const modulePath = `/projects/${projectId}/modules/${moduleId}`;

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

  async function onExportFormat(format: RecordExportFormat, includeDetails: boolean) {
    const ids = exportTargetIds ?? [...selectedBugIds];
    const list = bugsToExport(ids);
    if (!list.length) {
      setExportError(true);
      setExportMsg("No bugs selected to export");
      notifyError("No bugs selected to export");
      return;
    }
    setExportBusy(true);
    setExportMsg(null);
    setExportError(false);
    try {
      if (format === "json") {
        const payload = {
          exportedAt: new Date().toISOString(),
          count: list.length,
          bugs: list.map((bug) => {
            const base = {
              id: bug.id,
              title: bug.title,
              status: bug.status,
              priority: bug.priority,
              severity: bug.severity,
              cycle: cycleLabel(bug.cycleId),
              assignee: nameOf(bug.assigneeId),
              reporter: nameOf(bug.reporterId),
              project: projectName,
              moduleId: bug.moduleId,
              createdAt: bug.createdAt,
              updatedAt: bug.updatedAt,
            };
            if (!includeDetails) return base;
            return {
              ...base,
              description: bug.description,
              steps: bug.steps,
              screenshots: bug.screenshots,
              externalRefs: bug.externalRefs,
            };
          }),
        };
        const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `testbuddy-bugs-${list.length}-items.json`;
        a.click();
        URL.revokeObjectURL(url);
      } else {
        await exportBugs(
          format as ExportFormat,
          list.map((bug) => ({
            bug,
            projectName,
            cycleName: cycleLabel(bug.cycleId),
            assigneeName: nameOf(bug.assigneeId),
            reporterName: nameOf(bug.reporterId),
          })),
        );
      }
      const label = format.toUpperCase();
      setExportMsg(
        `${label} downloaded — ${list.length} bug${list.length === 1 ? "" : "s"}`,
      );
      notifySuccess(`Exported ${list.length} bug${list.length === 1 ? "" : "s"} as ${label}`);
      setExportOpen(false);
      setExportTargetIds(null);
    } catch (err) {
      setExportError(true);
      setExportMsg(err instanceof Error ? err.message : "Export failed");
      notifyError(err instanceof Error ? err.message : "Export failed");
    } finally {
      setExportBusy(false);
    }
  }

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
      title={
        editingBug
          ? "Edit"
          : openBug
            ? breadcrumbLabel(openBug.title)
            : (mod?.name ?? "Module")
      }
      crumbRoot={{ label: "Projects", to: "/projects" }}
      crumbs={
        [
          { label: projectName, to: `/projects/${projectId}` },
          ...(mod && openBug
            ? [
                {
                  label: mod.name,
                  to: modulePath,
                  onClick: () => {
                    setBugCardMode("view");
                    setOpenBugId(null);
                  },
                } satisfies BreadcrumbItem,
              ]
            : []),
          ...(mod && openBug && editingBug
            ? [
                {
                  label: breadcrumbLabel(openBug.title),
                  to: modulePath,
                  onClick: () => setBugCardMode("view"),
                } satisfies BreadcrumbItem,
              ]
            : []),
        ] satisfies BreadcrumbItem[]
      }
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
        <div className="tb-mod-workspace flex h-full min-h-0 flex-col overflow-hidden">
          {bugCardMode === "view" ? (
            <BugDetailCommandHeader
              bug={openBug}
              actions={
                <button
                  type="button"
                  className="tb-btn-ghost inline-flex items-center gap-1.5 text-sm"
                  onClick={() => setOpenBugId(null)}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
                    <path
                      d="M15 18 9 12l6-6"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                  Back
                </button>
              }
            />
          ) : null}
          <div className={`min-h-0 flex-1 overflow-auto pb-4 ${bugCardMode === "view" ? "pt-3" : "pt-1"}`}>
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
              compactHero
              requestedMode={bugCardMode}
              onModeChange={setBugCardMode}
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
                  cycles={cycles}
                  currentUser={user}
                  selectedIds={selectedTcIds}
                  onToggleOne={toggleTc}
                  onToggleAll={toggleAllTc}
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

      <BulkExportModal
        open={exportOpen}
        entityPlural="Bugs"
        entitySingular="Bug"
        selectedCount={exportTargetIds?.length ?? selectedBugIds.size}
        detailsLabel="Bug Details"
        detailsHint="Includes description, steps, attachments and identifiers."
        onClose={() => {
          if (!exportBusy) {
            setExportOpen(false);
            setExportTargetIds(null);
          }
        }}
        onExport={onExportFormat}
      />
    </Shell>
  );
}
