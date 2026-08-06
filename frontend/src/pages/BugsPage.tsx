import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router-dom";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  deleteBug,
  exportBugsJson,
  fetchBugs,
  fetchCycles,
  fetchModules,
  fetchProjects,
  fetchUsers,
  importBugs,
} from "../api";
import { useAuth } from "../auth";
import { BugListRow, BUG_TABLE_GRID } from "../components/BugListRow";
import { FlashAlert } from "../components/FlashAlert";
import { PageHeader } from "../components/PageHeader";
import { QueryStatus } from "../components/QueryStatus";
import { Shell } from "../components/Shell";
import { queryKeys } from "../queryKeys";
import type { Bug, BugFilters, BugPriority, BugSeverity, BugStatus } from "../types";
import { canCreateBug, canDeleteBug, assignableUsers } from "../utils/roles";

function downloadJson(filename: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function toImportPayload(bugs: Bug[]) {
  return bugs.map((bug) => ({
    title: bug.title,
    description: bug.description,
    priority: bug.priority,
    severity: bug.severity,
    assigneeId: bug.assigneeId,
    cycleId: bug.cycleId,
    projectId: bug.projectId,
    status: bug.status,
    steps: bug.steps ?? [],
  }));
}

export function BugsPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const fileRef = useRef<HTMLInputElement>(null);
  const canImport = canCreateBug(user);
  const canDelete = canDeleteBug(user);
  const showCycleFilter = user?.role !== "TESTER";
  const [filters, setFilters] = useState<BugFilters>({
    projectId: searchParams.get("projectId") ?? "",
    priority: "",
    severity: "",
    assigneeId: "",
    cycleId: "",
    status: "",
    moduleId: "",
  });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fromUrl = searchParams.get("projectId") ?? "";
    setFilters((f) =>
      f.projectId === fromUrl ? f : { ...f, projectId: fromUrl, cycleId: "", moduleId: "" },
    );
  }, [searchParams]);

  const usersQuery = useQuery({ queryKey: queryKeys.users(), queryFn: () => fetchUsers() });
  const projectsQuery = useQuery({
    queryKey: queryKeys.projects(),
    queryFn: () => fetchProjects(),
  });
  const projectId = filters.projectId || undefined;
  const cyclesQuery = useQuery({
    queryKey: queryKeys.cycles(projectId || "_"),
    queryFn: () => fetchCycles(projectId!),
    enabled: !!projectId,
  });
  const modulesQuery = useQuery({
    queryKey: queryKeys.modules(projectId || "_"),
    queryFn: () => fetchModules(projectId!),
    enabled: !!projectId,
  });
  const bugsQuery = useQuery({
    queryKey: queryKeys.bugs(filters),
    queryFn: () => fetchBugs(filters),
  });

  const projectNameById = useMemo(() => {
    const map = new Map(projectsQuery.data?.map((p) => [p.id, p.name]));
    return (id: string) => map.get(id) ?? id.slice(0, 8);
  }, [projectsQuery.data]);

  const deleteMutation = useMutation({
    mutationFn: deleteBug,
    onSuccess: async () => {
      setMessage("Bug deleted");
      setError(null);
      await queryClient.invalidateQueries({ queryKey: ["bugs"] });
    },
    onError: (err: Error) => {
      setError(err.message);
      setMessage(null);
    },
  });

  const userName = useMemo(() => {
    const map = new Map(usersQuery.data?.map((u) => [u.id, u.name]));
    return (id: string) => map.get(id) ?? id.slice(0, 8);
  }, [usersQuery.data]);

  const cycleName = useMemo(() => {
    const map = new Map(cyclesQuery.data?.map((c) => [c.id, c.name]));
    return (id: string) => map.get(id) ?? id.slice(0, 8);
  }, [cyclesQuery.data]);

  async function onExport() {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const data = await exportBugsJson(filters);
      downloadJson(`testbuddy-bugs-${new Date().toISOString().slice(0, 10)}.json`, data);
      setMessage(`Exported ${data.count} bug(s)`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Export failed");
    } finally {
      setBusy(false);
    }
  }

  async function onImportFile(file: File) {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as { bugs?: Bug[] } | Bug[];
      const bugs = Array.isArray(parsed) ? parsed : parsed.bugs;
      if (!Array.isArray(bugs) || bugs.length === 0) {
        throw new Error("JSON must contain a non-empty bugs array");
      }
      const result = await importBugs(toImportPayload(bugs));
      setMessage(`Imported ${result.imported} bug(s)`);
      await queryClient.invalidateQueries({ queryKey: ["bugs"] });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed");
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  const bugs = bugsQuery.data ?? [];
  const hasFilters = Object.values(filters).some((v) => !!v);

  return (
    <Shell title="Bugs">
      {/* Direct children of the Shell scroller must not shrink, otherwise they
          are squeezed to the viewport and their overflow is clipped instead of
          scrolled. */}
      <div className="flex min-h-0 flex-col pb-4">
        <PageHeader
          description="Filter, export, or import bugs as JSON."
          actions={
            <>
              <button
                type="button"
                disabled={busy}
                onClick={() => void onExport()}
                className="tb-btn-ghost text-sm disabled:opacity-60"
              >
                Export JSON
              </button>
              {canImport ? (
                <>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => fileRef.current?.click()}
                    className="tb-btn-primary text-sm disabled:opacity-60"
                  >
                    Import JSON
                  </button>
                  <input
                    ref={fileRef}
                    type="file"
                    accept="application/json,.json"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) void onImportFile(file);
                    }}
                  />
                </>
              ) : null}
            </>
          }
        />

        <FlashAlert error={error} message={message} />

        <div
          className={`mb-6 grid shrink-0 gap-3 md:grid-cols-3 ${
            showCycleFilter ? "lg:grid-cols-7" : "lg:grid-cols-6"
          }`}
        >          <label className="tb-label">
            Project
            <select
              className="tb-select"
              value={filters.projectId ?? ""}
              onChange={(e) =>
                setFilters((f) => ({
                  ...f,
                  projectId: e.target.value,
                  cycleId: "",
                  moduleId: "",
                }))
              }
            >
              <option value="">All</option>
              {projectsQuery.data?.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <FilterSelect
            label="Priority"
            value={filters.priority ?? ""}
            onChange={(v) => setFilters((f) => ({ ...f, priority: v as BugPriority | "" }))}
            options={["", "LOW", "MEDIUM", "HIGH", "CRITICAL"]}
          />
          <FilterSelect
            label="Severity"
            value={filters.severity ?? ""}
            onChange={(v) => setFilters((f) => ({ ...f, severity: v as BugSeverity | "" }))}
            options={["", "MINOR", "MAJOR", "CRITICAL", "BLOCKER"]}
          />
          <FilterSelect
            label="Status"
            value={filters.status ?? ""}
            onChange={(v) => setFilters((f) => ({ ...f, status: v as BugStatus | "" }))}
            options={["", "NEW", "OPEN", "IN_PROGRESS", "FIXED", "VERIFIED", "CLOSED", "REOPENED"]}
          />
          <label className="tb-label">
            Assignee
            <select
              className="tb-select"
              value={filters.assigneeId ?? ""}
              onChange={(e) => setFilters((f) => ({ ...f, assigneeId: e.target.value }))}
            >
              <option value="">All</option>
              {usersQuery.data?.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
          </label>
          {showCycleFilter ? (
            <label className="tb-label">
              Cycle
              <select
                className="tb-select disabled:cursor-not-allowed disabled:opacity-60"
                value={filters.cycleId ?? ""}
                disabled={!filters.projectId}
                onChange={(e) => setFilters((f) => ({ ...f, cycleId: e.target.value }))}
              >
                <option value="">{filters.projectId ? "All" : "Select a project first"}</option>
                {cyclesQuery.data?.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <label className="tb-label">
            Module
            <select
              className="tb-select disabled:cursor-not-allowed disabled:opacity-60"
              value={filters.moduleId ?? ""}
              disabled={!filters.projectId}
              onChange={(e) => setFilters((f) => ({ ...f, moduleId: e.target.value }))}
            >
              <option value="">{filters.projectId ? "All" : "Select a project first"}</option>
              {modulesQuery.data?.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        <QueryStatus
          isLoading={bugsQuery.isLoading}
          error={bugsQuery.error}
          onRetry={() => void bugsQuery.refetch()}
          loadingText="Loading bugs…"
        />

        {!bugsQuery.isLoading && !bugsQuery.error && bugs.length === 0 && (
          <div className="tb-card shrink-0 border-dashed p-8 text-center">
            <p className="font-medium text-[var(--ink)]">
              {hasFilters ? "No bugs match these filters" : "No bugs yet"}
            </p>
            <p className="mt-2 text-sm text-[var(--muted)]">
              {hasFilters
                ? "Clear filters or pick another project."
                : "File one from the TestBuddy extension popup."}
            </p>
            {hasFilters ? (
              <button
                type="button"
                className="tb-btn-ghost mt-4 text-xs"
                onClick={() =>
                  setFilters({
                    projectId: "",
                    priority: "",
                    severity: "",
                    assigneeId: "",
                    cycleId: "",
                    status: "",
                    moduleId: "",
                  })
                }
              >
                Clear filters
              </button>
            ) : null}
          </div>
        )}

        {bugs.length > 0 && (
          <div className="tb-card shrink-0 overflow-hidden">
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
              <span className="text-right">Cycle / Project</span>
            </div>
            {bugs.map((bug) => (
              <BugListRow
                key={bug.id}
                bug={bug}
                assigneeName={userName(bug.assigneeId)}
                cycleName={projectId ? cycleName(bug.cycleId) : undefined}
                projectName={!projectId ? projectNameById(bug.projectId) : undefined}
                actions={
                  <>
                    <Link to={`/bugs/${bug.id}`} className="tb-link text-xs font-semibold">
                      View
                    </Link>
                    {canDelete ? (
                      <button
                        type="button"
                        className="text-xs font-semibold text-[var(--danger)] hover:underline"
                        disabled={deleteMutation.isPending}
                        onClick={() => {
                          if (window.confirm(`Delete bug "${bug.title}"?`)) {
                            deleteMutation.mutate(bug.id);
                          }
                        }}
                      >
                        Delete
                      </button>
                    ) : null}
                  </>
                }
              />
            ))}
          </div>
        )}
      </div>
    </Shell>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: string[];
}) {
  return (
    <label className="tb-label">
      {label}
      <select className="tb-select" value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((opt) => (
          <option key={opt || "all"} value={opt}>
            {opt || "All"}
          </option>
        ))}
      </select>
    </label>
  );
}
