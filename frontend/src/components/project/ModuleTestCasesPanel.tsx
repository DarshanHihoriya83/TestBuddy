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
import { assignableUsers, canCreateBug, canDeleteBug } from "../../utils/roles";
import {
  defaultTcPrefs,
  tableDensityClass,
  type ModuleViewPrefs,
} from "../../utils/moduleViewPrefs";
import type { User as AuthUser } from "../../types";
import { ModuleBulkBar } from "./ModuleBulkBar";
import { ModuleFilterChips, type FilterChip } from "./ModuleFilterChips";
import { ModuleStatLine, type StatItem } from "./ModuleStatLine";
import { SingleExportModal } from "../SingleExportModal";
import { exportRecord, type ExportRecordDoc } from "../../utils/recordExport";

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

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]![0] ?? ""}${parts[1]![0] ?? ""}`.toUpperCase();
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

function TestCaseIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M8 3h7l5 5v13a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinejoin="round"
      />
      <path d="M14 3v5h5M9 13h6M9 17h4" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
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

function MenuExportIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 3v12M8 11l4 4 4-4M4 19h16"
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
  onExport,
  onDelete,
}: {
  canManage: boolean;
  canDelete: boolean;
  deleting?: boolean;
  onEdit: () => void;
  onExport: () => void;
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
    let menuH = 48;
    if (canManage) menuH += 88;
    if (canDelete) menuH += 48;
    const gap = 4;
    const openUp = rect.bottom + gap + menuH > window.innerHeight - 8;
    const left = Math.min(Math.max(8, rect.right - menuW), window.innerWidth - menuW - 8);
    setPos({ top: openUp ? rect.top - gap - menuH : rect.bottom + gap, left });
  }, [open, canManage, canDelete]);

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
                <MenuViewIcon />
                View
              </button>
            )}
            <button
              type="button"
              role="menuitem"
              className="tb-menu-item"
              onClick={() => {
                setOpen(false);
                onExport();
              }}
            >
              <MenuExportIcon />
              Export
            </button>
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
  moduleName,
  testCases,
  loading,
  users,
  cycles,
  currentUser,
  selectedIds,
  onToggleOne,
  onToggleAll,
  onExportSelected,
  onClearSelection,
  createOpen,
  onCreateOpenChange,
  search,
  onSearchChange,
  viewPrefs = defaultTcPrefs(),
}: {
  projectId: string;
  moduleId: string;
  moduleName?: string;
  testCases: TestCase[];
  loading?: boolean;
  users: User[];
  cycles: Cycle[];
  currentUser: AuthUser | null;
  selectedIds: Set<string>;
  onToggleOne: (id: string, selected: boolean) => void;
  onToggleAll: (selected: boolean, ids?: string[]) => void;
  onExportSelected?: () => void;
  onClearSelection?: () => void;
  createOpen?: boolean;
  onCreateOpenChange?: (open: boolean) => void;
  search: string;
  onSearchChange: (v: string) => void;
  viewPrefs?: ModuleViewPrefs;
}) {
  const queryClient = useQueryClient();
  const canManage = canCreateBug(currentUser);
  const canDelete = canDeleteBug(currentUser);
  const defaultCycleId = cycles.find((c) => c.isDefault)?.id ?? cycles[0]?.id ?? "";
  const col = (key: string) => viewPrefs.columns[key] !== false;
  const isGrid = viewPrefs.viewMode === "grid";

  const [createOpenLocal, setCreateOpenLocal] = useState(false);
  const createOpenResolved = createOpen ?? createOpenLocal;
  const setCreateOpenResolved = onCreateOpenChange ?? setCreateOpenLocal;

  const [editTc, setEditTc] = useState<TestCase | null>(null);
  const [exportTc, setExportTc] = useState<TestCase | null>(null);
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
  const assigneeChoices = useMemo(() => assignableUsers(currentUser, users), [currentUser, users]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = testCases.filter((tc) => {
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

    const dir = viewPrefs.sortDir === "asc" ? 1 : -1;
    const priorityRank: Record<string, number> = { HIGH: 3, MEDIUM: 2, LOW: 1 };
    return [...list].sort((a, b) => {
      let cmp = 0;
      switch (viewPrefs.sortBy) {
        case "title":
          cmp = a.title.localeCompare(b.title);
          break;
        case "status":
          cmp = a.executionStatus.localeCompare(b.executionStatus);
          break;
        case "priority":
          cmp = (priorityRank[a.priority] ?? 0) - (priorityRank[b.priority] ?? 0);
          break;
        case "type":
          cmp = a.type.localeCompare(b.type);
          break;
        default: {
          const at = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
          const bt = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
          cmp = at - bt;
        }
      }
      return cmp * dir;
    });
  }, [testCases, search, filterExec, filterType, filterPriority, filterAssignee, users, viewPrefs.sortBy, viewPrefs.sortDir]);

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
    setAssigneeId(assigneeChoices[0]?.id ?? "");
    setPreconditions("");
    setFlowDescription("");
  }

  function openCreate() {
    resetForm();
    setCreateOpenResolved(true);
  }

  // The create modal can also be opened from the module header, so start from a clean form.
  useEffect(() => {
    if (!createOpenResolved) return;
    setTitle("");
    setType("POSITIVE");
    setPriority("MEDIUM");
    setExecutionStatus("NOT_EXECUTED");
    setPreconditions("");
    setFlowDescription("");
  }, [createOpenResolved]);

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
      setCreateOpenResolved(false);
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

  const filtersActive =
    search.trim().length > 0 || !!filterExec || !!filterType || !!filterPriority || !!filterAssignee;

  const filterChips: FilterChip[] = useMemo(() => {
    const chips: FilterChip[] = [];
    if (search.trim()) {
      chips.push({ key: "search", label: `Search: ${search.trim()}`, onRemove: () => onSearchChange("") });
    }
    if (filterExec) {
      chips.push({ key: "exec", label: `Status: ${execLabel(filterExec)}`, onRemove: () => setFilterExec("") });
    }
    if (filterType) {
      chips.push({ key: "type", label: `Type: ${filterType}`, onRemove: () => setFilterType("") });
    }
    if (filterPriority) {
      chips.push({ key: "priority", label: `Priority: ${filterPriority}`, onRemove: () => setFilterPriority("") });
    }
    if (filterAssignee) {
      const name = assigneeChoices.find((u) => u.id === filterAssignee)?.name ?? filterAssignee;
      chips.push({ key: "assignee", label: `Assignee: ${name}`, onRemove: () => setFilterAssignee("") });
    }
    return chips;
  }, [search, filterExec, filterType, filterPriority, filterAssignee, assigneeChoices, onSearchChange]);

  const bulkVisible = selectedIds.size > 0;

  const exportDoc: ExportRecordDoc | null = exportTc
    ? {
        entity: "Test Case",
        displayId: shortId(exportTc.id),
        title: exportTc.title,
        context: `Module: ${moduleName || "\u2014"}`,
        contents: [
          { label: "Steps", value: String(exportTc.steps?.length ?? 0) },
          {
            label: "Expected Results",
            value: String((exportTc.steps ?? []).filter((s) => s.expectedResult?.trim()).length),
          },
          { label: "Preconditions", value: exportTc.preconditions?.trim() ? "Yes" : "No" },
          { label: "Linked Bug", value: exportTc.linkedBugId ? "Yes" : "No" },
          { label: "Assigned", value: exportTc.assigneeId ? "Yes" : "No" },
          { label: "AI Draft", value: exportTc.generatedByAi ? "Yes" : "No" },
        ],
        summary: [
          { label: "Test Case ID", value: shortId(exportTc.id) },
          { label: "Title", value: exportTc.title },
          { label: "Type", value: exportTc.type },
          { label: "Priority", value: exportTc.priority },
          { label: "Execution Status", value: execLabel(exportTc.executionStatus) },
          { label: "Assignee", value: nameOf(exportTc.assigneeId) },
          { label: "Updated On", value: formatDate(exportTc.updatedAt) },
        ],
        details: [
          { label: "Module", value: moduleName || "\u2014" },
          { label: "Review Status", value: exportTc.status },
          { label: "Generated by AI", value: exportTc.generatedByAi ? "Yes" : "No" },
          { label: "Preconditions", value: exportTc.preconditions?.trim() || "\u2014" },
          { label: "Description", value: exportTc.flowDescription?.trim() || "\u2014" },
          { label: "Created On", value: formatDate(exportTc.createdAt) },
        ],
        sections: [
          {
            title: "Steps",
            columns: ["#", "Action", "Expected Result"],
            rows: (exportTc.steps ?? []).map((s, i) => [
              String(s.order ?? i + 1),
              s.action ?? "",
              s.expectedResult ?? "",
            ]),
          },
        ],
      }
    : null;

  function requestBulkExport() {
    if (selectedIds.size === 1) {
      const only = testCases.find((tc) => selectedIds.has(tc.id));
      if (only) {
        setExportTc(only);
        return;
      }
    }
    onExportSelected?.();
  }

  if (loading) {
    return (
      <div className="tb-mod-loading">
        <div className="tb-mod-loading-shimmer" aria-hidden />
        <p>Loading test cases…</p>
      </div>
    );
  }

  const statItems: StatItem[] = [
    {
      key: "total",
      label: "Total",
      value: stats.total,
      tone: "blue",
      active: filterExec === "",
      onSelect: () => setFilterExec(""),
    },
    ...([
      ["PASSED", "Passed", stats.passed, "green"],
      ["FAILED", "Failed", stats.failed, "red"],
      ["BLOCKED", "Blocked", stats.blocked, "violet"],
      ["NOT_EXECUTED", "Not Executed", stats.notExecuted, "slate"],
    ] as const).map(([status, label, value, tone]) => ({
      key: status,
      label,
      value,
      tone,
      active: filterExec === status,
      onSelect: () => setFilterExec(filterExec === status ? "" : status),
    })),
  ];

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
            {assigneeChoices.map((u) => (
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
    <div className={`tb-mod-panel flex min-h-0 flex-1 flex-col ${tableDensityClass(viewPrefs)}`}>
      <div className="tb-mod-toolbar tb-mod-command-toolbar shrink-0">
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
          {assigneeChoices.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </select>
        {filtersActive && (
          <button type="button" className="tb-link text-sm lg:hidden" onClick={clearFilters}>
            Clear
          </button>
        )}
      </div>

      <div className="tb-mod-subbar shrink-0">
        <ModuleFilterChips chips={filterChips} onClearAll={clearFilters} />
        <ModuleStatLine items={statItems} label="Test case summary" />
      </div>

      <ModuleBulkBar
        visible={bulkVisible}
        selectedCount={selectedIds.size}
        pageCount={pageItems.length}
        allSelected={allSelected}
        exportLabel="Export selected"
        showSelectAll={!isGrid}
        onToggleAllPage={(checked) => onToggleAll(checked, pageItems.map((t) => t.id))}
        onExport={requestBulkExport}
        onClear={() => onClearSelection?.()}
      />

      <SingleExportModal
        open={!!exportTc}
        doc={exportDoc}
        detailsLabel="Test Case Details"
        detailsHint="Includes steps, expected results, preconditions and more."
        onClose={() => setExportTc(null)}
        onExport={(format, includeDetails) =>
          exportDoc ? exportRecord(format, exportDoc, { includeDetails }) : undefined
        }
      />

        <div className={`tb-mod-content min-h-0 flex-1 overflow-auto ${isGrid ? "is-grid" : "is-list"}`}>
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
              {canManage && (
                <button type="button" className="tb-btn-primary mt-2 text-sm" onClick={openCreate}>
                  + New Test Case
                </button>
              )}
            </div>
          ) : isGrid ? (
            <div className="tb-mod-grid p-4">
              <div className="tb-mod-grid-head">
                <label className="tb-mod-grid-select-all">
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-[var(--accent)]"
                    checked={allSelected}
                    onChange={(e) => onToggleAll(e.target.checked, pageItems.map((t) => t.id))}
                    aria-label="Select all on this page"
                  />
                  Select all on this page
                </label>
                <span className="tb-mod-grid-head-count">{pageItems.length} shown</span>
              </div>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {pageItems.map((tc, i) => {
                const selected = selectedIds.has(tc.id);
                return (
                <div
                  key={tc.id}
                  className={`tb-qa-card ${selected ? "is-selected" : ""}`}
                  style={{ animationDelay: `${i * 35}ms` }}
                >
                  <div className={`tb-qa-card-ribbon ${execTone(tc.executionStatus)}`} aria-hidden />
                  <div className="tb-qa-card-top">
                    <input
                      type="checkbox"
                      className="h-4 w-4 shrink-0 accent-[var(--accent)]"
                      checked={selected}
                      onChange={(e) => onToggleOne(tc.id, e.target.checked)}
                      aria-label={`Select ${tc.title}`}
                    />
                    <TcKebab
                      canManage={canManage}
                      canDelete={canDelete}
                      deleting={deleteMutation.isPending}
                      onEdit={() => openEdit(tc)}
                      onExport={() => setExportTc(tc)}
                      onDelete={() => setDeleteTarget(tc)}
                    />
                  </div>
                  <div className="tb-qa-card-body">
                    {col("id") && (
                      <p className="tb-qa-card-id">{shortId(tc.id)}</p>
                    )}
                    {col("title") && (
                      <div className="tb-qa-card-title-row">
                        <span className="tb-folder-chip grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-[var(--accent-soft)] text-[var(--accent)]" aria-hidden>
                          <TestCaseIcon />
                        </span>
                        <button
                          type="button"
                          className="tb-qa-card-title"
                          title={tc.title}
                          onClick={() => canManage && openEdit(tc)}
                        >
                          {tc.title}
                        </button>
                      </div>
                    )}
                    <div className="tb-qa-card-tags">
                      {col("type") && (
                        <span className="tb-pill bg-[var(--accent-soft)] text-[var(--accent)]">{tc.type}</span>
                      )}
                      {col("status") && (
                        <span className={`tb-exec-pill ${execTone(tc.executionStatus)}`}>
                          {execLabel(tc.executionStatus)}
                        </span>
                      )}
                      {col("priority") && (
                        <span className="text-xs font-semibold text-[var(--ink)]">{tc.priority}</span>
                      )}
                    </div>
                  </div>
                  <div className="tb-qa-card-foot">
                    {col("assignee") && (
                      <span className="inline-flex max-w-[60%] items-center gap-2">
                        <span className="tb-avatar-sm shrink-0" aria-hidden>
                          {initials(nameOf(tc.assigneeId))}
                        </span>
                        <span className="truncate text-xs text-[var(--ink)]">
                          {nameOf(tc.assigneeId)}
                        </span>
                      </span>
                    )}
                    {col("updatedAt") && (
                      <span className="text-xs text-[var(--muted)]">{formatDate(tc.updatedAt)}</span>
                    )}
                  </div>
                </div>
              );
              })}
              </div>
            </div>
          ) : (
            <table className="tb-table tb-mod-table">
              <colgroup>
                <col className="tb-col-check" />
                {col("id") && <col className="tb-col-id" />}
                {col("title") && <col className="tb-col-title" />}
                {col("type") && <col className="tb-col-type" />}
                {col("priority") && <col className="tb-col-priority" />}
                {col("status") && <col className="tb-col-status" />}
                {col("assignee") && <col className="tb-col-assignee" />}
                {col("updatedAt") && <col className="tb-col-updated" />}
                <col className="tb-col-actions" />
              </colgroup>
              <thead>
                <tr>
                  <th className="w-10 px-3">
                    <input
                      type="checkbox"
                      className="h-4 w-4 accent-[var(--accent)]"
                      checked={allSelected}
                      onChange={(e) => onToggleAll(e.target.checked, pageItems.map((t) => t.id))}
                      aria-label="Select all"
                    />
                  </th>
                  {col("id") && <th>TC ID</th>}
                  {col("title") && <th>Title</th>}
                  {col("type") && <th>Type</th>}
                  {col("priority") && <th>Priority</th>}
                  {col("status") && <th>Status</th>}
                  {col("assignee") && <th>Assignee</th>}
                  {col("updatedAt") && <th>Updated On</th>}
                  <th className="tb-table-actions-col">Actions</th>
                </tr>
              </thead>
              <tbody>
                {pageItems.map((tc) => (
                  <tr key={tc.id} className={selectedIds.has(tc.id) ? "is-selected" : undefined}>
                    <td className="px-3">
                      <input
                        type="checkbox"
                        className="h-4 w-4 accent-[var(--accent)]"
                        checked={selectedIds.has(tc.id)}
                        onChange={(e) => onToggleOne(tc.id, e.target.checked)}
                      />
                    </td>
                    {col("id") && (
                      <td className="font-mono text-xs font-semibold text-[var(--accent)]">{shortId(tc.id)}</td>
                    )}
                    {col("title") && (
                      <td>
                        <div className="flex min-w-0 items-center gap-2.5">
                          <span className="tb-folder-chip grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-[var(--accent-soft)] text-[var(--accent)]" aria-hidden>
                            <TestCaseIcon />
                          </span>
                          <button
                            type="button"
                            title={tc.title}
                            className="block min-w-0 flex-1 truncate text-left font-medium text-[var(--ink)] hover:text-[var(--accent)]"
                            onClick={() => canManage && openEdit(tc)}
                          >
                            {tc.title}
                          </button>
                        </div>
                      </td>
                    )}
                    {col("type") && (
                      <td>
                        <span className="tb-pill bg-[var(--accent-soft)] text-[var(--accent)]">{tc.type}</span>
                      </td>
                    )}
                    {col("priority") && <td className="text-sm font-medium">{tc.priority}</td>}
                    {col("status") && (
                      <td>
                        <span className={`tb-exec-pill ${execTone(tc.executionStatus)}`}>
                          {execLabel(tc.executionStatus)}
                        </span>
                      </td>
                    )}
                    {col("assignee") && (
                      <td>
                        <span className="inline-flex items-center gap-2">
                          <span className="tb-avatar-sm" aria-hidden>
                            {initials(nameOf(tc.assigneeId))}
                          </span>
                          <span className="truncate text-sm text-[var(--ink)]">
                            {nameOf(tc.assigneeId)}
                          </span>
                        </span>
                      </td>
                    )}
                    {col("updatedAt") && (
                      <td className="text-sm text-[var(--muted)]">{formatDate(tc.updatedAt)}</td>
                    )}
                    <td className="tb-table-actions-col">
                      <div className="tb-table-actions-cell">
                        <TcKebab
                          canManage={canManage}
                          canDelete={canDelete}
                          deleting={deleteMutation.isPending}
                          onEdit={() => openEdit(tc)}
                          onExport={() => setExportTc(tc)}
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

      {createOpenResolved && canManage && (
        <div className="tb-modal-overlay" onClick={(e) => e.target === e.currentTarget && setCreateOpenResolved(false)}>
          <div className="tb-card tb-modal-panel max-w-lg p-5" role="dialog" aria-modal>
            <div className="flex items-start justify-between gap-3">
              <h2 className="text-lg font-semibold text-[var(--ink)]">New Test Case</h2>
              <button type="button" className="tb-btn-icon h-9 w-9" aria-label="Close" onClick={() => setCreateOpenResolved(false)}>
                <CloseIcon />
              </button>
            </div>
            <form className="mt-4" onSubmit={submitCreate}>
              {formFields}
              <div className="mt-5 flex justify-end gap-2">
                <button type="button" className="tb-btn-ghost" onClick={() => setCreateOpenResolved(false)}>
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
