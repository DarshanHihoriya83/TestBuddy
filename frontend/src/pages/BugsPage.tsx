import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { useMemo, useRef, useState } from "react";
import {
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
  const projectId = filters.projectId || projectsQuery.data?.[0]?.id;
  const cyclesQuery = useQuery({
    queryKey: ["cycles", projectId],
    queryFn: () => fetchCycles(projectId!),
    enabled: !!projectId,
  });
  const bugsQuery = useQuery({
    queryKey: ["bugs", filters],
    queryFn: () => fetchBugs(filters),
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
            className="rounded-xl border border-[var(--line)] bg-white px-3 py-2 text-sm font-semibold hover:bg-slate-50 disabled:opacity-60"
          >
            Export JSON
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => fileRef.current?.click()}
            className="rounded-xl bg-[var(--accent)] px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
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

      {error && (
        <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      )}
      {message && (
        <p className="mb-4 rounded-lg bg-[var(--accent-soft)] px-3 py-2 text-sm text-[var(--accent)]">
          {message}
        </p>
      )}

      <div className="mb-6 grid gap-3 md:grid-cols-3 lg:grid-cols-6">
        <label className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
          Project
          <select
            className="mt-2 w-full rounded-lg border border-[var(--line)] bg-white px-3 py-2 text-sm"
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
        <label className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
          Assignee
          <select
            className="mt-2 w-full rounded-lg border border-[var(--line)] bg-white px-3 py-2 text-sm"
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
        <label className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
          Cycle
          <select
            className="mt-2 w-full rounded-lg border border-[var(--line)] bg-white px-3 py-2 text-sm"
            value={filters.cycleId ?? ""}
            onChange={(e) => setFilters((f) => ({ ...f, cycleId: e.target.value }))}
          >
            <option value="">All</option>
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
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {(bugsQuery.error as Error).message}
        </p>
      )}

      <div className="overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--panel)]">
        <table className="w-full text-left text-sm">
          <thead className="bg-[var(--accent-soft)] text-xs uppercase tracking-wide text-[var(--muted)]">
            <tr>
              <th className="px-4 py-3">Title</th>
              <th className="px-4 py-3">Priority</th>
              <th className="px-4 py-3">Severity</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Assignee</th>
              <th className="px-4 py-3">Cycle</th>
            </tr>
          </thead>
          <tbody>
            {bugsQuery.data?.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-[var(--muted)]">
                  No bugs yet. File one from the extension popup.
                </td>
              </tr>
            )}
            {bugsQuery.data?.map((bug) => (
              <tr key={bug.id} className="border-t border-[var(--line)] hover:bg-slate-50/70">
                <td className="px-4 py-3">
                  <Link
                    className="font-medium text-[var(--accent)] hover:underline"
                    to={`/bugs/${bug.id}`}
                  >
                    {bug.title}
                  </Link>
                </td>
                <td className="px-4 py-3">{bug.priority}</td>
                <td className="px-4 py-3">{bug.severity}</td>
                <td className="px-4 py-3">{bug.status}</td>
                <td className="px-4 py-3">{userName(bug.assigneeId)}</td>
                <td className="px-4 py-3">{cycleName(bug.cycleId)}</td>
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
    <label className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
      {label}
      <select
        className="mt-2 w-full rounded-lg border border-[var(--line)] bg-white px-3 py-2 text-sm"
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
