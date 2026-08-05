import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router-dom";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import {
  createProject,
  deleteProject,
  fetchBugs,
  fetchCycles,
  fetchOrganizations,
  fetchProjectQuota,
  fetchProjects,
  updateProject,
} from "../api";
import { useAuth } from "../auth";
import { QueryStatus } from "../components/QueryStatus";
import { Shell } from "../components/Shell";
import { StatCard } from "../components/StatCard";
import { queryKeys } from "../queryKeys";
import type { Project } from "../types";
import { notifyError, notifySuccess } from "../utils/notify";
import { canCreateProject, isManager } from "../utils/roles";
import {
  normalizeProjectName,
  PROJECT_NAME_MAX_LENGTH,
  validateOptionalUrl,
  validateProjectName,
} from "../utils/validation";

type ViewMode = "list" | "grid";

type MenuPos = { top: number; left: number };

function FolderIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M3 7.5A1.5 1.5 0 0 1 4.5 6H9l2 2h8.5A1.5 1.5 0 0 1 21 9.5v8A1.5 1.5 0 0 1 19.5 19h-15A1.5 1.5 0 0 1 3 17.5v-10Z"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden className="text-[var(--muted)]">
      <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.75" />
      <path d="m16.5 16.5 4 4" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    </svg>
  );
}

function ListIcon({ active }: { active: boolean }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01"
        stroke={active ? "currentColor" : "currentColor"}
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

function CalendarIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden className="text-[var(--muted)]">
      <rect x="3" y="5" width="18" height="16" rx="2" stroke="currentColor" strokeWidth="1.75" />
      <path d="M3 10h18M8 3v4M16 3v4" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    </svg>
  );
}

function formatDate(value?: string) {
  if (!value) return "\u2014";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "\u2014";
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

function KebabMenu({
  project,
  canManage,
  deleting,
  onEdit,
  onDelete,
}: {
  project: Project;
  canManage: boolean;
  deleting: boolean;
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
    const menuH = canManage ? 144 : 44;
    const gap = 4;
    const openUp = rect.bottom + gap + menuH > window.innerHeight - 8;
    const left = Math.min(
      Math.max(8, rect.right - menuW),
      window.innerWidth - menuW - 8,
    );
    setPos({
      top: openUp ? rect.top - gap - menuH : rect.bottom + gap,
      left,
    });
  }, [open, canManage]);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      const t = e.target as Node;
      if (btnRef.current?.contains(t) || menuRef.current?.contains(t)) return;
      setOpen(false);
    }
    function onScrollOrResize() {
      setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    window.addEventListener("scroll", onScrollOrResize, true);
    window.addEventListener("resize", onScrollOrResize);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      window.removeEventListener("scroll", onScrollOrResize, true);
      window.removeEventListener("resize", onScrollOrResize);
    };
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
            <Link
              role="menuitem"
              to={`/projects/${project.id}`}
              className="tb-menu-item"
              onClick={() => setOpen(false)}
            >
              <MenuViewIcon />
              View
            </Link>
            {canManage && (
              <>
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
        aria-label={`Actions for ${project.name}`}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={`tb-kebab-btn ${open ? "is-open" : ""}`}
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
      <path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

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

const PAGE_SIZE_OPTIONS = [10, 25, 50] as const;

function PageSizeSelect({
  value,
  onChange,
}: {
  value: number;
  onChange: (size: number) => void;
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
    const menuW = Math.max(rect.width, 132);
    const menuH = PAGE_SIZE_OPTIONS.length * 40 + 8;
    const gap = 4;
    const openUp = rect.bottom + gap + menuH > window.innerHeight - 8;
    const left = Math.min(
      Math.max(8, rect.right - menuW),
      window.innerWidth - menuW - 8,
    );
    setPos({
      top: openUp ? rect.top - gap - menuH : rect.bottom + gap,
      left,
    });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      const t = e.target as Node;
      if (btnRef.current?.contains(t) || menuRef.current?.contains(t)) return;
      setOpen(false);
    }
    function onScrollOrResize() {
      setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    window.addEventListener("scroll", onScrollOrResize, true);
    window.addEventListener("resize", onScrollOrResize);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      window.removeEventListener("scroll", onScrollOrResize, true);
      window.removeEventListener("resize", onScrollOrResize);
    };
  }, [open]);

  const menu =
    open && pos
      ? createPortal(
          <div
            ref={menuRef}
            role="listbox"
            aria-label="Projects per page"
            style={{ top: pos.top, left: pos.left, minWidth: btnRef.current?.offsetWidth }}
            className="fixed z-[80] overflow-hidden rounded-xl border border-[var(--line)] bg-white py-1 shadow-lg"
          >
            {PAGE_SIZE_OPTIONS.map((size) => {
              const active = size === value;
              return (
                <button
                  key={size}
                  type="button"
                  role="option"
                  aria-selected={active}
                  className={`block w-full px-3 py-2.5 text-left text-sm transition ${
                    active
                      ? "bg-[var(--accent-soft)] font-semibold text-[var(--accent)]"
                      : "text-[var(--ink)] hover:bg-[var(--bg0)]"
                  }`}
                  onClick={() => {
                    onChange(size);
                    setOpen(false);
                  }}
                >
                  {size} per page
                </button>
              );
            })}
          </div>,
          document.body,
        )
      : null;

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--line)] bg-white px-2.5 py-1.5 text-sm text-[var(--ink)] transition hover:border-[#cbd5e1] hover:bg-[var(--bg0)]"
        onClick={() => setOpen((v) => !v)}
      >
        {value} per page
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden className="text-[var(--muted)]">
          <path d="m6 9 6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {menu}
    </>
  );
}

export function ProjectsPage() {
  const { user } = useAuth();
  const canManage = canCreateProject(user);
  const [searchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const projectsQuery = useQuery({
    queryKey: queryKeys.projects(),
    queryFn: () => fetchProjects(),
  });
  const orgsQuery = useQuery({
    queryKey: queryKeys.organizations,
    queryFn: fetchOrganizations,
  });
  const quotaQuery = useQuery({
    queryKey: queryKeys.projectQuota,
    queryFn: fetchProjectQuota,
    enabled: canManage,
  });
  const bugsQuery = useQuery({
    queryKey: queryKeys.bugs(),
    queryFn: () => fetchBugs(),
  });

  const firstProjectId = projectsQuery.data?.[0]?.id;
  const cyclesQuery = useQuery({
    queryKey: queryKeys.cycles(firstProjectId ?? ""),
    queryFn: () => fetchCycles(firstProjectId!),
    enabled: !!firstProjectId,
  });

  const [name, setName] = useState("");
  const [nameHint, setNameHint] = useState<string | null>(null);
  const [description, setDescription] = useState("");
  const [organizationId, setOrganizationId] = useState("");
  const [jiraProjectKey, setJiraProjectKey] = useState("");
  const [adoOrgUrl, setAdoOrgUrl] = useState("");
  const [adoProject, setAdoProject] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [editProject, setEditProject] = useState<Project | null>(null);
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editJiraProjectKey, setEditJiraProjectKey] = useState("");
  const [editAdoOrgUrl, setEditAdoOrgUrl] = useState("");
  const [editAdoProject, setEditAdoProject] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<Project | null>(null);

  const [search, setSearch] = useState("");
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const orgs = orgsQuery.data ?? [];
  const orgNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const o of orgs) map.set(o.id, o.name);
    return map;
  }, [orgs]);

  const defaultOrgId = organizationId || orgs[0]?.id || "";
  const selectedOrg = orgs.find((o) => o.id === defaultOrgId) ?? orgs[0];
  const orgUsed = selectedOrg?.projectCount ?? 0;
  const orgCap = selectedOrg?.maxProjects;
  const orgAtLimit = typeof orgCap === "number" && orgUsed >= orgCap;
  const quota = quotaQuery.data;
  const personalAtLimit =
    isManager(user) &&
    quota?.limit != null &&
    typeof quota.remaining === "number" &&
    quota.remaining <= 0;
  const atLimit = personalAtLimit || (isManager(user) && orgAtLimit);

  useEffect(() => {
    const fromQuery = searchParams.get("organizationId")?.trim();
    if (fromQuery) setOrganizationId(fromQuery);
  }, [searchParams]);

  const stats = useMemo(() => {
    const projectCount = projectsQuery.data?.length ?? 0;
    const activeBugs = (bugsQuery.data ?? []).filter(
      (b) => b.status !== "CLOSED" && b.status !== "VERIFIED",
    ).length;
    const teamMembers = orgs.reduce((sum, o) => sum + (o.memberCount ?? 0), 0);
    const cycleName =
      cyclesQuery.data?.find((c) => c.isDefault)?.name ??
      cyclesQuery.data?.[0]?.name ??
      "\u2014";
    return { projectCount, activeBugs, teamMembers, cycleName };
  }, [projectsQuery.data, bugsQuery.data, orgs, cyclesQuery.data]);

  const createMutation = useMutation({
    mutationFn: createProject,
    onSuccess: async () => {
      setName("");
      setDescription("");
      setJiraProjectKey("");
      setAdoOrgUrl("");
      setAdoProject("");
      setNameHint(null);
      setCreateOpen(false);
      notifySuccess("Project created (Cycle 1 added as default)");
      await queryClient.invalidateQueries({ queryKey: ["projects"] });
      await queryClient.invalidateQueries({ queryKey: ["organizations"] });
      await queryClient.invalidateQueries({ queryKey: queryKeys.projectQuota });
    },
    onError: (err: Error) => {
      notifyError(err.message);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteProject,
    onSuccess: async () => {
      setDeleteTarget(null);
      notifySuccess("Project deleted");
      await queryClient.invalidateQueries({ queryKey: ["projects"] });
      await queryClient.invalidateQueries({ queryKey: ["organizations"] });
      await queryClient.invalidateQueries({ queryKey: queryKeys.projectQuota });
    },
    onError: (err: Error) => {
      notifyError(err.message);
    },
  });

  const updateMutation = useMutation({
    mutationFn: () =>
      updateProject(editProject!.id, {
        name: normalizeProjectName(editName),
        description: editDescription.trim() || undefined,
        jiraProjectKey: editJiraProjectKey.trim() || undefined,
        adoOrgUrl: editAdoOrgUrl.trim() || undefined,
        adoProject: editAdoProject.trim() || undefined,
      }),
    onSuccess: async () => {
      setEditProject(null);
      notifySuccess("Project updated");
      await queryClient.invalidateQueries({ queryKey: ["projects"] });
      if (editProject) {
        await queryClient.invalidateQueries({ queryKey: ["project", editProject.id] });
      }
    },
    onError: (err: Error) => notifyError(err.message),
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (projectsQuery.data ?? []).filter((p) => {
      if (!q) return true;
      const orgLabel = (p.organizationId && orgNameById.get(p.organizationId)) || "";
      return p.name.toLowerCase().includes(q) || orgLabel.toLowerCase().includes(q);
    });
  }, [projectsQuery.data, search, orgNameById]);

  const total = filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, totalPages);
  const startIdx = total === 0 ? 0 : (safePage - 1) * pageSize;
  const endIdx = Math.min(startIdx + pageSize, total);
  const pageItems = filtered.slice(startIdx, endIdx);

  useEffect(() => {
    setPage(1);
  }, [search, pageSize]);

  function submitCreate(e: FormEvent) {
    e.preventDefault();
    if (atLimit) {
      notifyError(
        orgAtLimit
          ? `Organization project limit reached: this organization allows at most ${orgCap} projects.`
          : `Project limit reached: Managers can create at most ${quota?.limit} projects.`,
      );
      return;
    }
    const normalized = normalizeProjectName(name);
    setName(normalized);
    const nameErr = validateProjectName(normalized);
    if (nameErr) {
      setNameHint(nameErr);
      notifyError(nameErr);
      return;
    }
    const orgId = defaultOrgId;
    if (!orgId) {
      notifyError("No organization available. Ask a SuperAdmin to create one first.");
      return;
    }
    const urlErr = validateOptionalUrl(adoOrgUrl, "Azure DevOps org URL");
    if (urlErr) {
      notifyError(urlErr);
      return;
    }
    createMutation.mutate({
      name: normalized,
      organizationId: orgId,
      description: description.trim() || undefined,
      jiraProjectKey: jiraProjectKey.trim() || undefined,
      adoOrgUrl: adoOrgUrl.trim() || undefined,
      adoProject: adoProject.trim() || undefined,
    });
  }

  function openEdit(project: Project) {
    setEditProject(project);
    setEditName(project.name);
    setEditDescription(project.description ?? "");
    setEditJiraProjectKey(project.jiraProjectKey ?? "");
    setEditAdoOrgUrl(project.adoOrgUrl ?? "");
    setEditAdoProject(project.adoProject ?? "");
  }

  function submitEdit(e: FormEvent) {
    e.preventDefault();
    if (!editProject) return;
    const normalized = normalizeProjectName(editName);
    setEditName(normalized);
    const nameErr = validateProjectName(normalized);
    if (nameErr) {
      notifyError(nameErr);
      return;
    }
    const urlErr = validateOptionalUrl(editAdoOrgUrl, "Azure DevOps org URL");
    if (urlErr) {
      notifyError(urlErr);
      return;
    }
    updateMutation.mutate();
  }

  function openDeleteConfirm(project: Project) {
    setDeleteTarget(project);
  }

  function submitDelete() {
    if (!deleteTarget) return;
    deleteMutation.mutate(deleteTarget.id);
  }

  return (
    <Shell title="Projects">
      <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <div className="mb-3 flex shrink-0 flex-wrap items-start justify-between gap-3 px-4 sm:px-5">
        <div className="min-w-0">
          <h1 className="text-xl font-bold tracking-tight text-[var(--ink)] sm:text-2xl">Projects</h1>
          <p className="mt-0.5 text-sm text-[var(--muted)]">
            {canManage
              ? "Create and manage projects under your organization."
              : "Browse projects in your organizations."}
          </p>
        </div>
        {canManage && (
          <button type="button" className="tb-btn-primary shrink-0" onClick={() => setCreateOpen(true)}>
            <span aria-hidden>+</span> Create Project
          </button>
        )}
      </div>

      <div className="mb-3 grid shrink-0 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Total Projects"
          value={stats.projectCount}
          accent="teal"
          icon={
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path d="M3 7.5A1.5 1.5 0 0 1 4.5 6H9l2 2h8.5A1.5 1.5 0 0 1 21 9.5v8A1.5 1.5 0 0 1 19.5 19h-15A1.5 1.5 0 0 1 3 17.5v-10Z" stroke="currentColor" strokeWidth="1.75" strokeLinejoin="round" />
            </svg>
          }
        />
        <StatCard
          label="Active Bugs"
          value={stats.activeBugs}
          accent="blue"
          icon={
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
              <circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="1.75" />
              <path d="M12 3v3M12 21v-3M6 12H3M21 12h-3" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
            </svg>
          }
        />
        <StatCard
          label="Team Members"
          value={stats.teamMembers || "\u2014"}
          accent="purple"
          icon={
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
              <circle cx="9" cy="8" r="3" stroke="currentColor" strokeWidth="1.75" />
              <path d="M3 19c0-2.8 2.7-5 6-5s6 2.2 6 5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
            </svg>
          }
        />
        <StatCard
          label="This Cycle"
          value={stats.cycleName}
          accent="amber"
          icon={
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
              <rect x="3" y="5" width="18" height="16" rx="2" stroke="currentColor" strokeWidth="1.75" />
              <path d="M3 10h18M8 3v4M16 3v4" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
            </svg>
          }
        />
      </div>

      {createOpen && canManage && (
        <div
          className="tb-modal-overlay"
          onClick={(e) => {
            if (e.target === e.currentTarget) setCreateOpen(false);
          }}
        >
          <div
            role="dialog"
            aria-modal
            aria-labelledby="create-project-title"
            className="tb-card tb-modal-panel max-w-lg p-5"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 id="create-project-title" className="text-lg font-semibold text-[var(--ink)]">
                  Create project
                </h2>
                <div className="mt-1 space-y-0.5 text-xs font-medium">
                  {selectedOrg && typeof orgCap === "number" && (
                    <p className={orgAtLimit ? "text-[var(--danger)]" : "text-[var(--muted)]"}>
                      Org quota: {orgUsed}/{orgCap} projects
                      {orgAtLimit ? " · full" : ` · ${Math.max(0, orgCap - orgUsed)} left`}
                    </p>
                  )}
                  {isManager(user) && quota?.limit != null && (
                    <p className={personalAtLimit ? "text-[var(--danger)]" : "text-[var(--muted)]"}>
                      Your quota: {quota.used}/{quota.limit} projects
                      {typeof quota.remaining === "number" ? ` · ${quota.remaining} left` : ""}
                    </p>
                  )}
                </div>              </div>
              <button
                type="button"
                className="tb-btn-icon h-9 w-9"
                aria-label="Close"
                onClick={() => setCreateOpen(false)}
              >
                <CloseIcon />
              </button>
            </div>
            {atLimit && (
              <p className="mt-2 text-sm text-[var(--danger)]">
                {orgAtLimit
                  ? "This organization has reached its project limit. Ask a SuperAdmin to raise the limit."
                  : "You have reached the maximum number of projects you can create. Delete an existing project or ask a SuperAdmin for help."}
              </p>
            )}
            <form className="mt-4" onSubmit={submitCreate}>
              <div className="grid gap-3">
                <label className="tb-label">
                  Organization *
                  <select
                    className="tb-select"
                    value={defaultOrgId}
                    onChange={(e) => setOrganizationId(e.target.value)}
                    required
                    disabled={personalAtLimit}
                  >
                    {orgs.length === 0 && <option value="">No organizations</option>}
                    {orgs.map((o) => {
                      const used = o.projectCount ?? 0;
                      const cap = o.maxProjects;
                      const full = typeof cap === "number" && used >= cap;
                      return (
                        <option key={o.id} value={o.id}>
                          {o.name}
                          {typeof cap === "number" ? ` (${used}/${cap}${full ? " full" : ""})` : ""}
                        </option>
                      );
                    })}
                  </select>
                </label>
                <label className="tb-label">
                  Name <span className="tb-req">*</span>
                  <input
                    className="tb-input"
                    value={name}
                    onChange={(e) => {
                      const raw = e.target.value;
                      const next =
                        raw.length > PROJECT_NAME_MAX_LENGTH
                          ? raw.slice(0, PROJECT_NAME_MAX_LENGTH)
                          : raw;
                      setName(next);
                      setNameHint(next.trim() ? validateProjectName(next) : null);
                    }}
                    onBlur={() => {
                      const normalized = normalizeProjectName(name);
                      setName(normalized);
                      setNameHint(normalized ? validateProjectName(normalized) : null);
                    }}
                    placeholder="Letters and spaces only"
                    required
                    minLength={2}
                    maxLength={PROJECT_NAME_MAX_LENGTH}
                    disabled={atLimit}
                    aria-invalid={!!nameHint}
                  />
                  <span className="mt-1 flex justify-between gap-2 text-[11px] font-normal normal-case tracking-normal">
                    <span className={nameHint ? "text-[var(--danger)]" : "text-[var(--muted)]"}>
                      {nameHint || "Alphabetical characters only \u2014 max 100 characters"}                    </span>
                    <span className="shrink-0 text-[var(--muted)]">
                      {normalizeProjectName(name).length}/{PROJECT_NAME_MAX_LENGTH}
                    </span>
                  </span>
                </label>
                <label className="tb-label">
                  Description
                  <textarea
                    className="tb-textarea"
                    rows={3}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="e.g, Describe the project details"
                    disabled={atLimit}
                  />
                </label>
                <label className="tb-label">
                  Jira project key
                  <input
                    className="tb-input"
                    value={jiraProjectKey}
                    onChange={(e) => setJiraProjectKey(e.target.value)}
                    placeholder="e.g. TB"
                    disabled={atLimit}
                  />
                </label>
                <label className="tb-label">
                  Azure DevOps org URL
                  <input
                    className="tb-input"
                    value={adoOrgUrl}
                    onChange={(e) => setAdoOrgUrl(e.target.value)}
                    placeholder="https://dev.azure.com/org"
                    disabled={atLimit}
                  />
                </label>
                <label className="tb-label">
                  Azure DevOps project
                  <input
                    className="tb-input"
                    value={adoProject}
                    onChange={(e) => setAdoProject(e.target.value)}
                    placeholder="e.g, Demo"
                    disabled={atLimit}
                  />
                </label>
              </div>
              <div className="mt-5 flex flex-wrap justify-end gap-2">
                <button type="button" className="tb-btn-ghost" onClick={() => setCreateOpen(false)}>
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={
                    createMutation.isPending ||
                    atLimit ||
                    !normalizeProjectName(name) ||
                    !!validateProjectName(name) ||
                    !orgs.length
                  }
                  className="tb-btn-primary"
                >
                  {createMutation.isPending ? "Creating..." : "Create project"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {editProject && canManage && (
        <div
          className="tb-modal-overlay"
          onClick={(e) => {
            if (e.target === e.currentTarget) setEditProject(null);
          }}
        >
          <div
            role="dialog"
            aria-modal
            aria-labelledby="edit-project-title"
            className="tb-card tb-modal-panel max-w-lg p-5"
          >
            <div className="flex items-start justify-between gap-3">
              <h2 id="edit-project-title" className="text-lg font-semibold text-[var(--ink)]">
                Edit project
              </h2>
              <button
                type="button"
                className="tb-btn-icon h-9 w-9"
                aria-label="Close"
                onClick={() => setEditProject(null)}
              >
                <CloseIcon />
              </button>
            </div>
            <form className="mt-4" onSubmit={submitEdit}>
              <div className="grid gap-3">
                <label className="tb-label">
                  Name <span className="tb-req">*</span>
                  <input
                    className="tb-input"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    placeholder="e.g, Chaudhari"
                    required
                    minLength={2}
                  />
                </label>
                <label className="tb-label">
                  Description
                  <textarea
                    className="tb-textarea"
                    rows={3}
                    value={editDescription}
                    onChange={(e) => setEditDescription(e.target.value)}
                    placeholder="e.g, Describe the project details"
                  />
                </label>
                <label className="tb-label">
                  Jira project key
                  <input
                    className="tb-input"
                    value={editJiraProjectKey}
                    onChange={(e) => setEditJiraProjectKey(e.target.value)}
                    placeholder="e.g. TB"
                  />
                </label>
                <label className="tb-label">
                  Azure DevOps org URL
                  <input
                    className="tb-input"
                    value={editAdoOrgUrl}
                    onChange={(e) => setEditAdoOrgUrl(e.target.value)}
                    placeholder="https://dev.azure.com/org"
                  />
                </label>
                <label className="tb-label">
                  Azure DevOps project
                  <input
                    className="tb-input"
                    value={editAdoProject}
                    onChange={(e) => setEditAdoProject(e.target.value)}
                    placeholder="e.g, Demo"
                  />
                </label>
              </div>
              <div className="mt-5 flex flex-wrap justify-end gap-2">
                <button type="button" className="tb-btn-ghost" onClick={() => setEditProject(null)}>
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={updateMutation.isPending || !editName.trim()}
                  className="tb-btn-primary"
                >
                  {updateMutation.isPending ? "Saving..." : "Save changes"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {deleteTarget && canManage && (
        <div
          className="tb-modal-overlay"
          onClick={(e) => {
            if (e.target === e.currentTarget && !deleteMutation.isPending) setDeleteTarget(null);
          }}
        >
          <div
            role="alertdialog"
            aria-modal
            aria-labelledby="delete-project-title"
            aria-describedby="delete-project-desc"
            className="tb-card tb-modal-panel max-w-md p-5"
          >
            <div className="flex items-start gap-3">
              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[var(--danger-soft)] text-[var(--danger)]">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
                  <path
                    d="M12 9v4m0 4h.01M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z"
                    stroke="currentColor"
                    strokeWidth="1.75"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </div>
              <div className="min-w-0 flex-1">
                <h2 id="delete-project-title" className="text-lg font-semibold text-[var(--ink)]">
                  Delete project?
                </h2>
                <p id="delete-project-desc" className="mt-2 text-sm text-[var(--muted)]">
                  Are you sure you want to delete{" "}
                  <span className="font-semibold text-[var(--ink)]">{deleteTarget.name}</span>? This
                  also deletes all bugs in the project. This action cannot be undone.
                </p>
              </div>
            </div>
            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                className="tb-btn-ghost"
                disabled={deleteMutation.isPending}
                onClick={() => setDeleteTarget(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={deleteMutation.isPending}
                className="inline-flex items-center justify-center rounded-xl border border-red-200 bg-[var(--danger)] px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-55"
                onClick={submitDelete}
              >
                {deleteMutation.isPending ? "Deleting..." : "Delete project"}
              </button>
            </div>
          </div>
        </div>
      )}

      <QueryStatus
        isLoading={projectsQuery.isLoading}
        error={projectsQuery.error}
        onRetry={() => void projectsQuery.refetch()}
        loadingText="Loading projects\u2026"      />

      {!projectsQuery.isLoading && !projectsQuery.error && (
        <div className="tb-card flex min-h-0 flex-1 flex-col overflow-hidden">
          <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-[var(--line)] px-4 py-3 sm:px-5">
            <div className="relative w-full max-w-[16rem] sm:max-w-[18rem]">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2">
                <SearchIcon />
              </span>
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search projects..."
                className="tb-search-input"
              />
            </div>
            <div className="tb-view-toggle">
              <button
                type="button"
                aria-label="List view"
                aria-pressed={viewMode === "list"}
                className={`tb-view-toggle-btn ${viewMode === "list" ? "is-active" : "bg-white text-[var(--muted)]"}`}
                onClick={() => setViewMode("list")}
              >
                <ListIcon active={viewMode === "list"} />
              </button>
              <button
                type="button"
                aria-label="Grid view"
                aria-pressed={viewMode === "grid"}
                className={`tb-view-toggle-btn border-l border-[var(--line)] ${
                  viewMode === "grid" ? "is-active" : "bg-white text-[var(--muted)]"
                }`}
                onClick={() => setViewMode("grid")}
              >
                <GridIcon />
              </button>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-auto">
          {viewMode === "list" ? (
              <table className="tb-table">
                <thead>
                  <tr>
                    <th className="tb-table-col tb-table-col-name">
                      <span className="tb-table-name-head">Name</span>
                    </th>
                    <th className="tb-table-col tb-table-col-jira">Jira key</th>
                    <th className="tb-table-col tb-table-col-ado">Azure DevOps project</th>
                    <th className="tb-table-col-date">Created on</th>
                    <th className="tb-table-actions-col">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {pageItems.length === 0 && (
                    <tr>
                      <td colSpan={5} className="py-8 text-center text-[var(--muted)]">
                        No projects yet.
                      </td>
                    </tr>
                  )}
                  {pageItems.map((project) => {
                    return (
                      <tr key={project.id}>
                        <td className="tb-table-col tb-table-col-name">
                          <div className="flex items-center gap-3">
                            <div className="tb-folder-chip grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-[var(--accent-soft)] text-[var(--accent)]">
                              <FolderIcon />
                            </div>
                            <div className="min-w-0">
                              <Link
                                className="block truncate font-semibold text-[var(--accent)] hover:underline"
                                to={`/projects/${project.id}`}
                              >
                                {project.name}
                              </Link>
                            </div>
                          </div>
                        </td>
                        <td className="tb-table-col tb-table-col-jira text-[var(--ink)]">
                          {project.jiraProjectKey || "\u2014"}
                        </td>
                        <td className="tb-table-col tb-table-col-ado text-[var(--ink)]">
                          {project.adoProject || "\u2014"}
                        </td>
                        <td className="tb-table-col-date">
                          <div className="tb-table-date-cell text-[var(--muted)]">
                            <CalendarIcon /> {formatDate(project.createdAt)}
                          </div>
                        </td>
                        <td className="tb-table-actions-col">
                          <div className="tb-table-actions-cell">
                            <KebabMenu
                              project={project}
                              canManage={canManage}
                              deleting={deleteMutation.isPending}
                              onEdit={() => openEdit(project)}
                              onDelete={() => openDeleteConfirm(project)}
                            />
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
          ) : (
            <div className="grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-3">
              {pageItems.length === 0 && (
                <p className="col-span-full py-8 text-center text-sm text-[var(--muted)]">
                  No projects yet.
                </p>
              )}
              {pageItems.map((project) => {
                return (
                  <div
                    key={project.id}
                    className="tb-project-card"
                  >
                    <div className="absolute right-2 top-2">
                      <KebabMenu
                        project={project}
                        canManage={canManage}
                        deleting={deleteMutation.isPending}
                        onEdit={() => openEdit(project)}
                        onDelete={() => openDeleteConfirm(project)}
                      />
                    </div>
                    <div className="tb-folder-chip mb-3 grid h-10 w-10 place-items-center rounded-lg bg-[var(--accent-soft)] text-[var(--accent)]">
                      <FolderIcon />
                    </div>
                    <Link
                      to={`/projects/${project.id}`}
                      className="block pr-8 font-semibold text-[var(--accent)] hover:underline"
                    >
                      {project.name}
                    </Link>
                    <dl className="mt-3 space-y-1 text-xs text-[var(--muted)]">
                      <div className="flex justify-between gap-2">
                        <dt>Jira</dt>
                        <dd className="text-[var(--ink)]">{project.jiraProjectKey || "\u2014"}</dd>
                      </div>
                      <div className="flex justify-between gap-2">
                        <dt>ADO</dt>
                        <dd className="truncate text-[var(--ink)]">{project.adoProject || "\u2014"}</dd>
                      </div>
                      <div className="flex justify-between gap-2">
                        <dt>Created</dt>
                        <dd className="text-[var(--ink)]">{formatDate(project.createdAt)}</dd>
                      </div>
                    </dl>
                  </div>
                );
              })}
            </div>
          )}
          </div>

          <div className="mt-auto flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-[var(--line)] bg-white px-4 py-2.5 sm:px-5">
            <p className="text-sm text-[var(--muted)]">
              {total === 0
                ? "Showing 0 projects"
                : `Showing ${startIdx + 1} to ${endIdx} of ${total} projects`}
            </p>
            <div className="flex items-center gap-1">
              <button
                type="button"
                className="tb-page-btn"
                disabled={safePage <= 1}
                aria-label="Previous page"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                {"\u2039"}              </button>
              {pageNumbers(safePage, totalPages).map((p, i) =>
                p === "ellipsis" ? (
                  <span key={`e-${i}`} className="px-1 text-sm text-[var(--muted)]">
                    {"\u2026"}                  </span>
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
                {"\u203A"}              </button>
            </div>
            <div className="inline-flex items-center gap-2 text-sm text-[var(--muted)]">
              <PageSizeSelect
                value={pageSize}
                onChange={(size) => setPageSize(size)}
              />
            </div>
          </div>
        </div>
      )}
      </div>
    </Shell>
  );
}
