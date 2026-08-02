import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { useMemo, useRef, useState } from "react";
import {
  deleteBug,
  exportBugsJson,
  fetchBugs,
  fetchCycles,
  fetchProjects,
  fetchUsers,
  importBugs,
} from "../api";
import type { Bug, BugFilters, BugPriority, BugSeverity, BugStatus } from "../types";
import { Shell } from "../components/Shell";

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
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [filters, setFilters] = useState<BugFilters>({
    projectId: "",
    priority: "",
    severity: "",
    assigneeId: "",
    cycleId: "",
    status: "",
  });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const usersQuery = useQuery({ queryKey: ["users"], queryFn: fetchUsers });
  const projectsQuery = useQuery({ queryKey: ["projects"], queryFn: fetchProjects });
  const projectId = filters.projectId || undefined;
  const cyclesQuery = useQuery({
    queryKey: ["cycles", projectId],
    queryFn: () => fetchCycles(projectId!),
    enabled: !!projectId,
  });
  const allCyclesQuery = useQuery({
    queryKey: ["cycles-all", projectsQuery.data?.map((p) => p.id).join(",")],
    queryFn: async () => {
      const projects = projectsQuery.data ?? [];
      const batches = await Promise.all(projects.map((p) => fetchCycles(p.id)));
      return batches.flat();
    },
    enabled: !projectId && !!projectsQuery.data?.length,
  });
  const bugsQuery = useQuery({
    queryKey: ["bugs", filters],
    queryFn: () => fetchBugs(filters),
  });

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
    const cycles = projectId ? cyclesQuery.data : allCyclesQuery.data;
    const map = new Map(cycles?.map((c) => [c.id, c.name]));
    return (id: string) => map.get(id) ?? id.slice(0, 8);
  }, [projectId, cyclesQuery.data, allCyclesQuery.data]);

  async function onExport() {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const data = await exportBugsJson(filters);
      downloadJson(
        `testbuddy-bugs-${new Date().toISOString().slice(0, 10)}.json`,
        data,
      );
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

  return (
    <Shell title="Bugs">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-[var(--muted)]">
          Filter, export, or import bugs as JSON.
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => void onExport()}
            className="tb-btn-ghost text-sm disabled:opacity-60"
          >
            Export JSON
          </button>
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
        </div>
      </div>

      {error && <p className="tb-alert-error mb-4">{error}</p>}
      {message && <p className="tb-alert-success mb-4">{message}</p>}

      <div className="mb-6 grid gap-3 md:grid-cols-3 lg:grid-cols-6">
        <label className="tb-label">
          Project
          <select
            className="tb-select"
            value={filters.projectId ?? ""}
            onChange={(e) =>
              setFilters((f) => ({ ...f, projectId: e.target.value, cycleId: "" }))
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
      </div>

      {bugsQuery.isLoading && <p className="text-sm text-[var(--muted)]">Loading bugs…</p>}
      {bugsQuery.error && (
        <div className="tb-alert-error mb-4 flex flex-wrap items-center justify-between gap-3">
          <span>{(bugsQuery.error as Error).message}</span>
          <button
            type="button"
            className="tb-btn-ghost bg-white px-3 py-1 text-xs"
            onClick={() => void bugsQuery.refetch()}
          >
            Retry
          </button>
        </div>
      )}

      <div className="tb-table-wrap">
        <table className="tb-table">
          <thead>
            <tr>
              <th className="px-4 py-3">Title</th>
              <th className="px-4 py-3">Priority</th>
              <th className="px-4 py-3">Severity</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Assignee</th>
              <th className="px-4 py-3">Cycle</th>
              <th className="px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {bugsQuery.data?.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-[var(--muted)]">
                  No bugs yet. File one from the extension popup.
                </td>
              </tr>
            )}
            {bugsQuery.data?.map((bug) => (
              <tr key={bug.id}>
                <td className="px-4 py-3">
                  <Link className="tb-link font-medium" to={`/bugs/${bug.id}`}>
                    {bug.title}
                  </Link>
                </td>
                <td className="px-4 py-3">{bug.priority}</td>
                <td className="px-4 py-3">{bug.severity}</td>
                <td className="px-4 py-3">{bug.status}</td>
                <td className="px-4 py-3">{userName(bug.assigneeId)}</td>
                <td className="px-4 py-3">{cycleName(bug.cycleId)}</td>
                <td className="px-4 py-3">
                  <button
                    type="button"
                    className="rounded-lg border border-red-900/50 px-2.5 py-1 text-xs text-[var(--danger)] hover:bg-[var(--danger-soft)]"
                    disabled={deleteMutation.isPending}
                    onClick={() => {
                      if (window.confirm(`Delete bug "${bug.title}"?`)) {
                        deleteMutation.mutate(bug.id);
                      }
                    }}
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
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
      <select
        className="tb-select"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {options.map((opt) => (
          <option key={opt || "all"} value={opt}>
            {opt || "All"}
          </option>
        ))}
      </select>
    </label>
  );
}
