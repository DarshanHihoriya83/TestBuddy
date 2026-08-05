import { useEffect, useLayoutEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  createTestCase,
  deleteTestCase,
  updateTestCase,
} from "../../api";
import type {
  Cycle,
  TestCase,
  TestCaseExecutionStatus,
  TestCasePriority,
  TestCaseType,
  User,
} from "../../types";
import { notifyError, notifySuccess } from "../../utils/notify";
import { canCreateBug, canDeleteBug } from "../../utils/roles";
import type { User as AuthUser } from "../../types";

type MenuPos = { top: number; left: number };

function shortId(id: string) {
  return `TC-${id.replace(/-/g, "").slice(0, 3).toUpperCase()}`;
}

function formatDate(value?: string) {
  if (!value) return "\u2014";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "\u2014";
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

function execTone(status: TestCaseExecutionStatus) {
  switch (status) {
    case "PASSED":
      return "tb-exec-passed";
    case "FAILED":
      return "tb-exec-failed";
    case "BLOCKED":
      return "tb-exec-blocked";
    default:
      return "tb-exec-pending";
  }
}

function execLabel(status: TestCaseExecutionStatus) {
  return status.replaceAll("_", " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function SearchIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.75" />
      <path d="m16.5 16.5 4 4" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M18 6 6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function MenuViewIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M2.5 12s3.5-6.5 9.5-6.5S21.5 12 21.5 12s-3.5 6.5-9.5 6.5S2.5 12 2.5 12Z"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="12" r="2.75" stroke="currentColor" strokeWidth="1.75" />
    </svg>
  );
}

function MenuEditIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M4 20h4l10.5-10.5a2.12 2.12 0 0 0-3-3L5 17v3Z"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinejoin="round"
      />
      <path d="m13.5 6.5 3 3" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    </svg>
  );
}

function MenuDeleteIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function TcKebab({
  canManage,
  canDelete,
  deleting,
  onEdit,
  onDelete,
}: {
  canManage: boolean;
  canDelete: boolean;
  deleting?: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<MenuPos | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (!open || !btnRef.current) {
      setPos(null);
      return;
    }
    const rect = btnRef.current.getBoundingClientRect();
    const menuW = 160;
    const menuH = canDelete ? 144 : 88;
    const gap = 4;
    const openUp = rect.bottom + gap + menuH > window.innerHeight - 8;
    const left = Math.min(Math.max(8, rect.right - menuW), window.innerWidth - menuW - 8);
    setPos({ top: openUp ? rect.top - gap - menuH : rect.bottom + gap, left });
  }, [open, canDelete]);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      const t = e.target as Node;
      if (btnRef.current?.contains(t) || menuRef.current?.contains(t)) return;
      setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const menu =
    open && pos
      ? createPortal(
          <div
            ref={menuRef}
            role="menu"
            style={{ top: pos.top, left: pos.left }}
            className="fixed z-[80] w-40 overflow-hidden rounded-xl border border-[var(--line)] bg-white py-1 shadow-lg"
          >
            {canManage && (
              <button
                type="button"
                role="menuitem"
                className="tb-menu-item"
                onClick={() => {
                  setOpen(false);
                  onEdit();
                }}
              >
                <MenuEditIcon />
                Edit
              </button>
            )}
            {canManage && (
              <button
                type="button"
                role="menuitem"
                className="tb-menu-item"
                onClick={() => {
                  setOpen(false);
                  onEdit();
                }}
              >
                <MenuViewIcon />
                View
              </button>
            )}
            {canDelete && (
              <>
                <hr className="tb-menu-divider" />
                <button
                  type="button"
                  role="menuitem"
                  disabled={deleting}
                  className="tb-menu-item-danger"
                  onClick={() => {
                    setOpen(false);
                    onDelete();
                  }}
                >
                  <MenuDeleteIcon />
                  Delete
                </button>
              </>
            )}
          </div>,
          document.body,
        )
      : null;

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        aria-label="Test case actions"
        aria-expanded={open}
        className={`tb-kebab-btn ${open ? "is-open" : ""}`}
        onClick={() => setOpen((v) => !v)}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
          <circle cx="12" cy="5" r="1.75" />
          <circle cx="12" cy="12" r="1.75" />
          <circle cx="12" cy="19" r="1.75" />
        </svg>
      </button>
      {menu}
    </>
  );
}

const PAGE_SIZE_OPTIONS = [5, 10, 25, 50] as const;

function pageNumbers(current: number, total: number): (number | "ellipsis")[] {
  if (total <= 5) return Array.from({ length: total }, (_, i) => i + 1);
  const pages: (number | "ellipsis")[] = [1];
  if (current > 3) pages.push("ellipsis");
  for (let p = Math.max(2, current - 1); p <= Math.min(total - 1, current + 1); p++) {
    pages.push(p);
  }
  if (current < total - 2) pages.push("ellipsis");
  pages.push(total);
  return pages;
}

export function ModuleTestCasesPanel({
  projectId,
  moduleId,
  testCases,
  loading,
  users,
  cycles,
  currentUser,
  selectedIds,
  onToggleOne,
  onToggleAll,
  search,
  onSearchChange,
}: {
  projectId: string;
  moduleId: string;
  testCases: TestCase[];
  loading?: boolean;
  users: User[];
  cycles: Cycle[];
  currentUser: AuthUser | null;
  selectedIds: Set<string>;
  onToggleOne: (id: string, selected: boolean) => void;
  onToggleAll: (selected: boolean) => void;
  search: string;
  onSearchChange: (v: string) => void;
}) {
  const queryClient = useQueryClient();
  const canManage = canCreateBug(currentUser);
  const canDelete = canDeleteBug(currentUser);
  const defaultCycleId = cycles.find((c) => c.isDefault)?.id ?? cycles[0]?.id ?? "";

  const [createOpen, setCreateOpen] = useState(false);
  const [editTc, setEditTc] = useState<TestCase | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<TestCase | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [filterExec, setFilterExec] = useState<TestCaseExecutionStatus | "">("");
  const [filterType, setFilterType] = useState<TestCaseType | "">("");
  const [filterPriority, setFilterPriority] = useState<TestCasePriority | "">("");
  const [filterAssignee, setFilterAssignee] = useState("");

  const [title, setTitle] = useState("");
  const [type, setType] = useState<TestCaseType>("POSITIVE");
  const [priority, setPriority] = useState<TestCasePriority>("MEDIUM");
  const [executionStatus, setExecutionStatus] = useState<TestCaseExecutionStatus>("NOT_EXECUTED");
  const [assigneeId, setAssigneeId] = useState("");
  const [preconditions, setPreconditions] = useState("");
  const [flowDescription, setFlowDescription] = useState("");

  const nameOf = (uid: string | null | undefined) =>
    uid ? users.find((u) => u.id === uid)?.name ?? uid.slice(0, 8) : "\u2014";

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return testCases.filter((tc) => {
      if (filterExec && tc.executionStatus !== filterExec) return false;
      if (filterType && tc.type !== filterType) return false;
      if (filterPriority && tc.priority !== filterPriority) return false;
      if (filterAssignee && tc.assigneeId !== filterAssignee) return false;
      if (!q) return true;
      return (
        tc.title.toLowerCase().includes(q) ||
        tc.type.toLowerCase().includes(q) ||
        tc.priority.toLowerCase().includes(q) ||
        nameOf(tc.assigneeId).toLowerCase().includes(q)
      );
    });
  }, [testCases, search, filterExec, filterType, filterPriority, filterAssignee, users]);

  const stats = useMemo(() => {
    const total = testCases.length;
    const passed = testCases.filter((t) => t.executionStatus === "PASSED").length;
    const failed = testCases.filter((t) => t.executionStatus === "FAILED").length;
    const blocked = testCases.filter((t) => t.executionStatus === "BLOCKED").length;
    const notExecuted = testCases.filter((t) => t.executionStatus === "NOT_EXECUTED").length;
    return { total, passed, failed, blocked, notExecuted };
  }, [testCases]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const startIdx = filtered.length === 0 ? 0 : (safePage - 1) * pageSize;
  const endIdx = Math.min(startIdx + pageSize, filtered.length);
  const pageItems = filtered.slice(startIdx, endIdx);
  const allSelected = pageItems.length > 0 && pageItems.every((t) => selectedIds.has(t.id));

  useEffect(() => {
    setPage(1);
  }, [search, filterExec, filterType, filterPriority, filterAssignee, pageSize]);

  function resetForm() {
    setTitle("");
    setType("POSITIVE");
    setPriority("MEDIUM");
    setExecutionStatus("NOT_EXECUTED");
    setAssigneeId(users[0]?.id ?? "");
    setPreconditions("");
    setFlowDescription("");
  }

  function openCreate() {
    resetForm();
    setCreateOpen(true);
  }

  function openEdit(tc: TestCase) {
    setEditTc(tc);
    setTitle(tc.title);
    setType(tc.type);
    setPriority(tc.priority);
    setExecutionStatus(tc.executionStatus);
    setAssigneeId(tc.assigneeId ?? "");
    setPreconditions(tc.preconditions ?? "");
    setFlowDescription(tc.flowDescription ?? "");
  }

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: ["testcases"] });
  };

  const createMutation = useMutation({
    mutationFn: () =>
      createTestCase({
        title: title.trim(),
        flowDescription: flowDescription.trim() || "Module test flow",
        type,
        priority,
        executionStatus,
        status: "AI_DRAFT",
        preconditions: preconditions.trim() || undefined,
        steps: [
          { order: 1, action: "Perform the described steps", expectedResult: "Expected outcome occurs" },
        ],
        projectId,
        moduleId,
        cycleId: defaultCycleId,
        assigneeId: assigneeId || null,
      }),
    onSuccess: async () => {
      notifySuccess("Test case created");
      setCreateOpen(false);
      resetForm();
      await invalidate();
    },
    onError: (err: Error) => notifyError(err.message),
  });

  const updateMutation = useMutation({
    mutationFn: () => {
      if (!editTc) throw new Error("No test case");
      return updateTestCase(editTc.id, {
        title: title.trim(),
        flowDescription: flowDescription.trim() || editTc.flowDescription,
        type,
        priority,
        executionStatus,
        preconditions: preconditions.trim() || null,
        cycleId: editTc.cycleId || defaultCycleId,
        moduleId,
        assigneeId: assigneeId || null,
      });
    },
    onSuccess: async () => {
      notifySuccess("Test case updated");
      setEditTc(null);
      resetForm();
      await invalidate();
    },
    onError: (err: Error) => notifyError(err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteTestCase(id),
    onSuccess: async () => {
      notifySuccess("Test case deleted");
      setDeleteTarget(null);
      await invalidate();
    },
    onError: (err: Error) => notifyError(err.message),
  });

  function submitCreate(e: FormEvent) {
    e.preventDefault();
    if (!title.trim() || !defaultCycleId) {
      notifyError("Title and a project cycle are required");
      return;
    }
    createMutation.mutate();
  }

  function submitEdit(e: FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    updateMutation.mutate();
  }

  function clearFilters() {
    setFilterExec("");
    setFilterType("");
    setFilterPriority("");
    setFilterAssignee("");
    onSearchChange("");
  }

  if (loading) {
    return <p className="px-1 text-sm text-[var(--muted)]">Loading test cases…</p>;
  }

  const formFields = (
    <div className="grid gap-3">
      <label className="tb-label">
        Title <span className="tb-req">*</span>
        <input className="tb-input" value={title} onChange={(e) => setTitle(e.target.value)} required />
      </label>
      <label className="tb-label">
        Description
        <textarea
          className="tb-textarea"
          rows={2}
          value={flowDescription}
          onChange={(e) => setFlowDescription(e.target.value)}
          placeholder="e.g, Describe the test flow"
        />
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="tb-label">
          Type
          <select className="tb-select" value={type} onChange={(e) => setType(e.target.value as TestCaseType)}>
            <option value="POSITIVE">POSITIVE</option>
            <option value="NEGATIVE">NEGATIVE</option>
          </select>
        </label>
        <label className="tb-label">
          Priority
          <select
            className="tb-select"
            value={priority}
            onChange={(e) => setPriority(e.target.value as TestCasePriority)}
          >
            <option value="LOW">LOW</option>
            <option value="MEDIUM">MEDIUM</option>
            <option value="HIGH">HIGH</option>
          </select>
        </label>
        <label className="tb-label">
          Execution status
          <select
            className="tb-select"
            value={executionStatus}
            onChange={(e) => setExecutionStatus(e.target.value as TestCaseExecutionStatus)}
          >
            <option value="NOT_EXECUTED">Not Executed</option>
            <option value="PASSED">Passed</option>
            <option value="FAILED">Failed</option>
            <option value="BLOCKED">Blocked</option>
          </select>
        </label>
        <label className="tb-label">
          Assignee
          <select className="tb-select" value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)}>
            <option value="">Unassigned</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="tb-label">
        Preconditions
        <textarea
          className="tb-textarea"
          rows={2}
          value={preconditions}
          onChange={(e) => setPreconditions(e.target.value)}
        />
      </label>
    </div>
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="grid shrink-0 gap-3 px-4 pb-4 pt-3 sm:grid-cols-2 xl:grid-cols-5">
        <div className="tb-bug-stat">
          <div className="tb-bug-stat-icon tb-bug-stat-icon-blue">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path d="M8 4h9a2 2 0 0 1 2 2v14l-4-2-4 2V6a2 2 0 0 0-2-2H7a2 2 0 0 0-2 2v3" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
            </svg>
          </div>
          <div>
            <p className="tb-mod-stat-label">Total Test Cases</p>
            <p className="tb-mod-stat-value">{stats.total}</p>
          </div>
        </div>
        <div className="tb-bug-stat">
          <div className="tb-bug-stat-icon tb-bug-stat-icon-green">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path d="m5 12 4.5 4.5L19 7" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <div>
            <p className="tb-mod-stat-label">Passed</p>
            <p className="tb-mod-stat-value">{stats.passed}</p>
          </div>
        </div>
        <div className="tb-bug-stat">
          <div className="tb-bug-stat-icon tb-bug-stat-icon-red">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path d="M7 7l10 10M17 7 7 17" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
            </svg>
          </div>
          <div>
            <p className="tb-mod-stat-label">Failed</p>
            <p className="tb-mod-stat-value">{stats.failed}</p>
          </div>
        </div>
        <div className="tb-bug-stat">
          <div className="tb-bug-stat-icon tb-bug-stat-icon-blue">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path d="M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </div>
          <div>
            <p className="tb-mod-stat-label">Blocked</p>
            <p className="tb-mod-stat-value">{stats.blocked}</p>
          </div>
        </div>
        <div className="tb-bug-stat">
          <div className="tb-bug-stat-icon tb-bug-stat-icon-slate">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
              <circle cx="5" cy="12" r="1.75" fill="currentColor" />
              <circle cx="12" cy="12" r="1.75" fill="currentColor" />
              <circle cx="19" cy="12" r="1.75" fill="currentColor" />
            </svg>
          </div>
          <div>
            <p className="tb-mod-stat-label">Not Executed</p>
            <p className="tb-mod-stat-value">{stats.notExecuted}</p>
          </div>
        </div>
      </div>

      <div className="tb-mod-toolbar">
        <div className="relative min-w-[10rem] flex-1 max-w-xs">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted)]">
            <SearchIcon />
          </span>
          <input
            type="search"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search test cases…"
            className="tb-search-input"
          />
        </div>
        <select
          className="tb-filter-select"
          value={filterExec}
          onChange={(e) => setFilterExec(e.target.value as TestCaseExecutionStatus | "")}
        >
          <option value="">Status</option>
          <option value="PASSED">Passed</option>
          <option value="FAILED">Failed</option>
          <option value="BLOCKED">Blocked</option>
          <option value="NOT_EXECUTED">Not Executed</option>
        </select>
        <select
          className="tb-filter-select"
          value={filterType}
          onChange={(e) => setFilterType(e.target.value as TestCaseType | "")}
        >
          <option value="">Type</option>
          <option value="POSITIVE">Positive</option>
          <option value="NEGATIVE">Negative</option>
        </select>
        <select
          className="tb-filter-select"
          value={filterPriority}
          onChange={(e) => setFilterPriority(e.target.value as TestCasePriority | "")}
        >
          <option value="">Priority</option>
          <option value="HIGH">High</option>
          <option value="MEDIUM">Medium</option>
          <option value="LOW">Low</option>
        </select>
        <select
          className="tb-filter-select"
          value={filterAssignee}
          onChange={(e) => setFilterAssignee(e.target.value)}
        >
          <option value="">Assignee</option>
          {users.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </select>
        <button type="button" className="tb-link text-sm" onClick={clearFilters}>
          Clear
        </button>
        {canManage && (
          <button type="button" className="tb-btn-primary ml-auto shrink-0 text-sm" onClick={openCreate}>
            + New Test Case
          </button>
        )}
      </div>

        <div className="min-h-0 flex-1 overflow-auto">
          {pageItems.length === 0 ? (
            <div className="tb-mod-empty">
              <div className="tb-mod-empty-icon" aria-hidden>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                  <path d="M8 4h9a2 2 0 0 1 2 2v14l-4-2-4 2V6a2 2 0 0 0-2-2H7a2 2 0 0 0-2 2v3" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
                </svg>
              </div>
              <p className="font-semibold text-[var(--ink)]">No test cases yet</p>
              <p className="max-w-sm text-sm text-[var(--muted)]">
                Add your first case to start tracking passes, fails, and coverage for this module.
              </p>
            </div>
          ) : (
            <table className="tb-table">
              <thead>
                <tr>
                  <th className="w-10 px-3">
                    <input
                      type="checkbox"
                      className="h-4 w-4 accent-[var(--accent)]"
                      checked={allSelected}
                      onChange={(e) => onToggleAll(e.target.checked)}
                      aria-label="Select all"
                    />
                  </th>
                  <th>TC ID</th>
                  <th>Title</th>
                  <th>Type</th>
                  <th>Priority</th>
                  <th>Status</th>
                  <th>Assignee</th>
                  <th>Updated On</th>
                  <th className="tb-table-actions-col">Actions</th>
                </tr>
              </thead>
              <tbody>
                {pageItems.map((tc) => (
                  <tr key={tc.id}>
                    <td className="px-3">
                      <input
                        type="checkbox"
                        className="h-4 w-4 accent-[var(--accent)]"
                        checked={selectedIds.has(tc.id)}
                        onChange={(e) => onToggleOne(tc.id, e.target.checked)}
                      />
                    </td>
                    <td className="font-mono text-xs font-semibold text-[var(--accent)]">{shortId(tc.id)}</td>
                    <td>
                      <button
                        type="button"
                        className="max-w-[16rem] truncate text-left font-medium text-[var(--ink)] hover:text-[var(--accent)]"
                        onClick={() => canManage && openEdit(tc)}
                      >
                        {tc.title}
                      </button>
                    </td>
                    <td>
                      <span className="tb-pill bg-[var(--accent-soft)] text-[var(--accent)]">{tc.type}</span>
                    </td>
                    <td className="text-sm font-medium">{tc.priority}</td>
                    <td>
                      <span className={`tb-exec-pill ${execTone(tc.executionStatus)}`}>
                        {execLabel(tc.executionStatus)}
                      </span>
                    </td>
                    <td className="text-sm">{nameOf(tc.assigneeId)}</td>
                    <td className="text-sm text-[var(--muted)]">{formatDate(tc.updatedAt)}</td>
                    <td className="tb-table-actions-col">
                      <div className="tb-table-actions-cell">
                        <TcKebab
                          canManage={canManage}
                          canDelete={canDelete}
                          deleting={deleteMutation.isPending}
                          onEdit={() => openEdit(tc)}
                          onDelete={() => setDeleteTarget(tc)}
                        />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="mt-auto flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-[var(--line)] px-4 py-2.5">
          <p className="text-sm text-[var(--muted)]">
            {filtered.length === 0
              ? "Showing 0 test cases"
              : `Showing ${startIdx + 1} to ${endIdx} of ${filtered.length} test cases`}
          </p>
          <div className="flex items-center gap-1">
            <button
              type="button"
              className="tb-page-btn"
              disabled={safePage <= 1}
              aria-label="Previous page"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              {"\u2039"}
            </button>
            {pageNumbers(safePage, totalPages).map((p, i) =>
              p === "ellipsis" ? (
                <span key={`e-${i}`} className="px-1 text-sm text-[var(--muted)]">
                  …
                </span>
              ) : (
                <button
                  key={p}
                  type="button"
                  className={`tb-page-btn ${p === safePage ? "tb-page-btn-active" : ""}`}
                  onClick={() => setPage(p)}
                >
                  {p}
                </button>
              ),
            )}
            <button
              type="button"
              className="tb-page-btn"
              disabled={safePage >= totalPages}
              aria-label="Next page"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            >
              {"\u203A"}
            </button>
          </div>
          <select
            className="tb-filter-select"
            value={pageSize}
            onChange={(e) => setPageSize(Number(e.target.value))}
            aria-label="Test cases per page"
          >
            {PAGE_SIZE_OPTIONS.map((n) => (
              <option key={n} value={n}>
                {n} per page
              </option>
            ))}
          </select>
        </div>

      {createOpen && canManage && (
        <div className="tb-modal-overlay" onClick={(e) => e.target === e.currentTarget && setCreateOpen(false)}>
          <div className="tb-card tb-modal-panel max-w-lg p-5" role="dialog" aria-modal>
            <div className="flex items-start justify-between gap-3">
              <h2 className="text-lg font-semibold text-[var(--ink)]">New Test Case</h2>
              <button type="button" className="tb-btn-icon h-9 w-9" aria-label="Close" onClick={() => setCreateOpen(false)}>
                <CloseIcon />
              </button>
            </div>
            <form className="mt-4" onSubmit={submitCreate}>
              {formFields}
              <div className="mt-5 flex justify-end gap-2">
                <button type="button" className="tb-btn-ghost" onClick={() => setCreateOpen(false)}>
                  Cancel
                </button>
                <button type="submit" className="tb-btn-primary" disabled={createMutation.isPending || !title.trim()}>
                  {createMutation.isPending ? "Creating…" : "Create"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {editTc && canManage && (
        <div className="tb-modal-overlay" onClick={(e) => e.target === e.currentTarget && setEditTc(null)}>
          <div className="tb-card tb-modal-panel max-w-lg p-5" role="dialog" aria-modal>
            <div className="flex items-start justify-between gap-3">
              <h2 className="text-lg font-semibold text-[var(--ink)]">Edit Test Case</h2>
              <button type="button" className="tb-btn-icon h-9 w-9" aria-label="Close" onClick={() => setEditTc(null)}>
                <CloseIcon />
              </button>
            </div>
            <form className="mt-4" onSubmit={submitEdit}>
              {formFields}
              <div className="mt-5 flex justify-end gap-2">
                <button type="button" className="tb-btn-ghost" onClick={() => setEditTc(null)}>
                  Cancel
                </button>
                <button type="submit" className="tb-btn-primary" disabled={updateMutation.isPending || !title.trim()}>
                  {updateMutation.isPending ? "Saving…" : "Save changes"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {deleteTarget && canDelete && (
        <div
          className="tb-modal-overlay"
          onClick={(e) => e.target === e.currentTarget && !deleteMutation.isPending && setDeleteTarget(null)}
        >
          <div className="tb-card tb-modal-panel max-w-md p-5" role="alertdialog" aria-modal>
            <h2 className="text-lg font-semibold text-[var(--ink)]">Delete test case?</h2>
            <p className="mt-2 text-sm text-[var(--muted)]">
              Delete <strong className="text-[var(--ink)]">{deleteTarget.title}</strong>? This cannot be undone.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" className="tb-btn-ghost" disabled={deleteMutation.isPending} onClick={() => setDeleteTarget(null)}>
                Cancel
              </button>
              <button
                type="button"
                className="inline-flex items-center justify-center rounded-xl border border-red-200 bg-[var(--danger)] px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-55"
                disabled={deleteMutation.isPending}
                onClick={() => deleteMutation.mutate(deleteTarget.id)}
              >
                {deleteMutation.isPending ? "Deleting…" : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
