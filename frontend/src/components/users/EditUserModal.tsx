import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchUserMemberships } from "../../api";
import { queryKeys } from "../../queryKeys";
import type { Organization, Project, User, UserRole } from "../../types";
import { roleLabel } from "../../utils/roles";
import { validateEmail, validateName } from "../../utils/validation";
import { FlashAlert } from "../FlashAlert";
import { ModalShell } from "../ModalShell";
import { RoleOptionList } from "./RoleOptionList";
import { FieldWithIcon, IconClose, IconMail, IconShield, IconUser } from "./UserPasswordUi";

const ROLE_CHIP_CLASS: Partial<Record<UserRole, string>> = {
  SUPERADMIN: "is-superadmin",
  MANAGER: "is-manager",
  DEVELOPER: "is-developer",
  TESTER: "is-tester",
};

const FORM_ID = "edit-user-form";

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}

function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section>
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-3">
        <h3 className="text-[11px] font-bold uppercase tracking-wide text-[var(--muted)]">
          {title}
        </h3>
        {hint ? <p className="text-[11px] text-[var(--muted)]">{hint}</p> : null}
      </div>
      {children}
    </section>
  );
}

const STATUS_OPTIONS = [
  {
    value: true,
    label: "Active",
    blurb: "Can sign in to the dashboard and extension",
    tone: "bg-emerald-50 text-emerald-600",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
        <path d="M20 7 10 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    value: false,
    label: "Inactive",
    blurb: "Sign-in blocked and open sessions end at once",
    tone: "bg-rose-50 text-rose-600",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
        <circle cx="12" cy="12" r="8" />
        <path d="m7 7 10 10" strokeLinecap="round" />
      </svg>
    ),
  },
] as const;

function StatusOptionList({
  active,
  locked,
  onChange,
}: {
  active: boolean;
  locked: boolean;
  onChange: (active: boolean) => void;
}) {
  return (
    <div className="space-y-2">
      {STATUS_OPTIONS.map((option) => (
        <label
          key={option.label}
          className="tb-option-row"
          data-selected={active === option.value}
          aria-disabled={locked || undefined}
        >
          <input
            type="radio"
            name="edit-user-status"
            className="sr-only"
            checked={active === option.value}
            disabled={locked}
            onChange={() => onChange(option.value)}
          />
          <span
            className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ${option.tone}`}
            aria-hidden
          >
            <span className="h-[18px] w-[18px] [&>svg]:h-full [&>svg]:w-full">{option.icon}</span>
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold text-[var(--ink)]">
              {option.label}
            </span>
            <span className="mt-0.5 block truncate text-xs text-[var(--muted)]">
              {option.blurb}
            </span>
          </span>
          <span className="tb-option-dot" aria-hidden />
        </label>
      ))}
    </div>
  );
}

export type EditUserAccess = {
  organizationId: string;
  projectIds: string[];
};

export function EditUserModal(props: {
  editing: User | null;
  meId?: string;
  roles: UserRole[];
  projects?: Project[];
  organizations?: Organization[];
  /** SuperAdmin spans every org, so access is edited here like Create. */
  requireOrganization?: boolean;
  busy?: boolean;
  error?: string | null;
  onChange: (next: User) => void;
  onCancel: () => void;
  onSubmit: (e: FormEvent, access?: EditUserAccess) => void;
}) {
  if (!props.editing) return null;
  return <EditUserDialog {...props} editing={props.editing} />;
}

function sameIdSet(a: string[], b: string[]) {
  if (a.length !== b.length) return false;
  const left = [...a].sort();
  const right = [...b].sort();
  return left.every((id, i) => id === right[i]);
}

function EditUserDialog({
  editing,
  meId,
  roles,
  projects = [],
  organizations = [],
  requireOrganization,
  busy,
  error,
  onChange,
  onCancel,
  onSubmit,
}: {
  editing: User;
  meId?: string;
  roles: UserRole[];
  projects?: Project[];
  organizations?: Organization[];
  requireOrganization?: boolean;
  busy?: boolean;
  error?: string | null;
  onChange: (next: User) => void;
  onCancel: () => void;
  onSubmit: (e: FormEvent, access?: EditUserAccess) => void;
}) {
  const isSelf = editing.id === meId;
  const [touched, setTouched] = useState<{ name?: boolean; email?: boolean }>({});
  const [organizationId, setOrganizationId] = useState("");
  const [projectIds, setProjectIds] = useState<string[]>([]);
  const [projectPick, setProjectPick] = useState("");
  const [accessReady, setAccessReady] = useState(!requireOrganization);

  // Snapshot of the row as opened, so Save can stay disabled until something
  // actually changes and Reset has something to go back to.
  const originalRef = useRef<User>(editing);
  const originalAccessRef = useRef<{ organizationId: string; projectIds: string[] }>({
    organizationId: "",
    projectIds: [],
  });
  if (originalRef.current.id !== editing.id) {
    originalRef.current = editing;
  }
  const original = originalRef.current;

  const membershipsQuery = useQuery({
    queryKey: queryKeys.userMemberships(editing.id),
    queryFn: () => fetchUserMemberships(editing.id),
    enabled: Boolean(requireOrganization),
  });

  useEffect(() => {
    setTouched({});
    setProjectPick("");
    if (!requireOrganization) {
      setOrganizationId("");
      setProjectIds([]);
      setAccessReady(true);
      return;
    }
    setAccessReady(false);
  }, [editing.id, requireOrganization]);

  useEffect(() => {
    if (!requireOrganization || !membershipsQuery.data) return;
    const membership = membershipsQuery.data;
    const byOrg = new Map<string, string[]>();
    for (const project of projects) {
      if (!project.organizationId || !membership.projectIds.includes(project.id)) continue;
      const list = byOrg.get(project.organizationId) ?? [];
      list.push(project.id);
      byOrg.set(project.organizationId, list);
    }
    // Prefer an org the user already belongs to that has assigned projects;
    // otherwise their first org membership; otherwise leave blank for pick.
    const preferredOrg =
      [...byOrg.keys()][0] ||
      membership.organizationIds.find((id) => organizations.some((o) => o.id === id)) ||
      membership.organizationIds[0] ||
      "";
    const scoped = preferredOrg ? (byOrg.get(preferredOrg) ?? []) : [];
    originalAccessRef.current = { organizationId: preferredOrg, projectIds: scoped };
    setOrganizationId(preferredOrg);
    setProjectIds(scoped);
    setAccessReady(true);
  }, [membershipsQuery.data, organizations, projects, requireOrganization, editing.id]);

  const nameChanged = editing.name.trim() !== original.name.trim();
  const emailChanged = editing.email.trim().toLowerCase() !== original.email.trim().toLowerCase();

  // Show the reason as soon as the field is edited — otherwise a disabled Save
  // button has no visible explanation until the field happens to lose focus.
  const nameError = touched.name || nameChanged ? validateName(editing.name) : null;
  const emailError = touched.email || emailChanged ? validateEmail(editing.email) : null;
  const invalid = Boolean(validateName(editing.name) || validateEmail(editing.email));

  const active = editing.active !== false;
  const originalActive = original.active !== false;
  const originalAccess = originalAccessRef.current;

  const accessDirty =
    requireOrganization &&
    (organizationId !== originalAccess.organizationId ||
      !sameIdSet(projectIds, originalAccess.projectIds));

  const changes = useMemo(() => {
    const list: string[] = [];
    if (editing.name.trim() !== original.name.trim()) list.push("name");
    if (editing.email.trim().toLowerCase() !== original.email.trim().toLowerCase()) {
      list.push("email");
    }
    if (editing.role !== original.role) list.push("designation");
    if (active !== originalActive) list.push("status");
    if (requireOrganization && organizationId !== originalAccess.organizationId) {
      list.push("organization");
    }
    if (
      requireOrganization &&
      organizationId &&
      !sameIdSet(projectIds, originalAccess.projectIds)
    ) {
      list.push("projects");
    }
    return list;
  }, [
    active,
    editing,
    organizationId,
    original,
    originalAccess.organizationId,
    originalAccess.projectIds,
    originalActive,
    projectIds,
    requireOrganization,
  ]);
  const dirty = changes.length > 0;

  const roleOptions = useMemo(
    () => Array.from(new Set<UserRole>([...roles, original.role])),
    [original.role, roles],
  );
  const lockedRoles = isSelf ? roleOptions : roleOptions.filter((r) => !roles.includes(r));

  const scopedProjects = useMemo(
    () =>
      requireOrganization
        ? projects.filter((p) => organizationId && p.organizationId === organizationId)
        : projects,
    [organizationId, projects, requireOrganization],
  );
  const availableProjects = useMemo(
    () => scopedProjects.filter((p) => !projectIds.includes(p.id)),
    [projectIds, scopedProjects],
  );

  const membershipLoading = Boolean(requireOrganization && !accessReady);

  function requestClose() {
    if (busy) return;
    if (dirty && !window.confirm("Discard your unsaved changes to this user?")) return;
    onCancel();
  }

  function addProject() {
    if (!projectPick || projectIds.includes(projectPick)) return;
    setProjectIds((prev) => [...prev, projectPick]);
    setProjectPick("");
  }

  function removeProject(id: string) {
    setProjectIds((prev) => prev.filter((x) => x !== id));
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (busy || membershipLoading) return;
    if (!requireOrganization) {
      onSubmit(e, undefined);
      return;
    }
    const syncingAccess =
      organizationId !== originalAccess.organizationId ||
      !sameIdSet(projectIds, originalAccess.projectIds);
    // Profile-only saves skip access sync — orphan users can be edited first,
    // then assigned to any organization from the dropdown.
    if (syncingAccess && organizationId) {
      onSubmit(e, { organizationId, projectIds });
      return;
    }
    if (syncingAccess && !organizationId) {
      onSubmit(e, { organizationId: "", projectIds });
      return;
    }
    onSubmit(e, undefined);
  }

  function resetAll() {
    onChange(original);
    setTouched({});
    setOrganizationId(originalAccess.organizationId);
    setProjectIds([...originalAccess.projectIds]);
    setProjectPick("");
  }

  return (
    <ModalShell
      open
      onClose={requestClose}
      labelledBy="edit-user-title"
      size="lg"
      dismissible={!busy}
    >
      <div className="tb-dialog-header flex items-start gap-3">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-[var(--accent-soft)] text-sm font-bold text-[var(--accent)]">
          {initials(original.name)}
        </span>
        <div className="min-w-0 flex-1">
          <h2 id="edit-user-title" className="truncate text-base font-bold text-[var(--ink)]">
            {original.name}
            {isSelf ? (
              <span className="ml-2 text-xs font-medium text-[var(--accent)]">(you)</span>
            ) : null}
          </h2>
          <p className="truncate text-sm text-[var(--muted)]">{original.email}</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className={`tb-role-chip ${ROLE_CHIP_CLASS[original.role] ?? ""}`}>
              {roleLabel(original.role)}
            </span>
            <span className={`tb-status-pill ${originalActive ? "is-active" : "is-inactive"}`}>
              <span className="tb-status-dot" aria-hidden />
              {originalActive ? "Active" : "Inactive"}
            </span>
          </div>
        </div>
        <button
          type="button"
          className="tb-btn-icon h-9 w-9 shrink-0"
          aria-label="Close"
          onClick={requestClose}
        >
          <IconClose />
        </button>
      </div>

      <form
        id={FORM_ID}
        className="tb-scroll-y max-h-[min(62vh,32rem)] space-y-5 px-6 py-5"
        onSubmit={handleSubmit}
        noValidate
      >
        <Section title="Profile">
          <div className="grid gap-4 sm:grid-cols-2">
            <FieldWithIcon label="Full name" required icon={<IconUser />} error={nameError}>
              <input
                data-autofocus
                className={`tb-input ${nameError ? "tb-input-invalid" : ""}`}
                value={editing.name}
                onChange={(e) => onChange({ ...editing, name: e.target.value })}
                onBlur={() => setTouched((t) => ({ ...t, name: true }))}
                maxLength={100}
                disabled={busy}
                autoComplete="off"
                aria-invalid={nameError ? true : undefined}
              />
            </FieldWithIcon>

            <FieldWithIcon
              label="Email"
              required
              icon={<IconMail />}
              error={emailError}
              hint="Used as the sign-in ID"
            >
              <input
                className={`tb-input ${emailError ? "tb-input-invalid" : ""}`}
                type="email"
                value={editing.email}
                onChange={(e) => onChange({ ...editing, email: e.target.value })}
                onBlur={() => setTouched((t) => ({ ...t, email: true }))}
                maxLength={254}
                disabled={busy}
                autoComplete="off"
                aria-invalid={emailError ? true : undefined}
              />
            </FieldWithIcon>
          </div>
        </Section>

        {requireOrganization && (
          <Section
            title="Organization"
            hint={
              !originalAccess.organizationId
                ? "This user is not in any organization yet — pick one to assign access"
                : "Scopes the projects available below"
            }
          >
            <FieldWithIcon label="Organization" required icon={<IconShield />}>
              <select
                className="tb-select"
                value={organizationId}
                disabled={busy || membershipLoading}
                onChange={(e) => {
                  const nextOrg = e.target.value;
                  setOrganizationId(nextOrg);
                  setProjectPick("");
                  // Keep projects that already belong to the newly selected org.
                  setProjectIds((prev) =>
                    prev.filter(
                      (id) => projects.find((p) => p.id === id)?.organizationId === nextOrg,
                    ),
                  );
                }}
              >
                <option value="">Select an organization…</option>
                {organizations.map((org) => (
                  <option key={org.id} value={org.id}>
                    {org.name}
                  </option>
                ))}
              </select>
            </FieldWithIcon>
          </Section>
        )}

        <Section title="Designation" hint={isSelf ? "You cannot change your own role" : undefined}>
          <fieldset disabled={busy}>
            <RoleOptionList
              name="edit-user-role"
              options={roleOptions}
              value={editing.role}
              currentRole={original.role}
              lockedRoles={lockedRoles}
              onChange={(role) => onChange({ ...editing, role })}
            />
          </fieldset>
        </Section>

        {(requireOrganization ? organizationId !== "" : false) && (
          <Section title="Projects">
            <div className="rounded-xl border border-[var(--line)] bg-[var(--bg0)] p-3.5">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-bold text-[var(--ink)]">Assign to projects</p>
                <span className="text-xs font-semibold text-[var(--muted)]">
                  {projectIds.length} selected
                </span>
              </div>
              <p className="mt-1 text-xs leading-relaxed text-[var(--muted)]">
                Developers and Testers only see projects they are added to. Changing the list only
                updates projects in this organization.
              </p>

              {projectIds.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {projectIds.map((id) => {
                    const p = projects.find((x) => x.id === id);
                    if (!p) return null;
                    return (
                      <span
                        key={id}
                        className="inline-flex items-center gap-1 rounded-full border border-[var(--accent)] bg-white px-2.5 py-1 text-xs font-semibold text-[var(--accent)]"
                      >
                        {p.name}
                        {!busy && (
                          <button
                            type="button"
                            className="tb-chip-remove"
                            aria-label={`Remove ${p.name}`}
                            onClick={() => removeProject(id)}
                          >
                            ×
                          </button>
                        )}
                      </span>
                    );
                  })}
                </div>
              )}

              {scopedProjects.length === 0 && (
                <p className="mt-3 text-xs font-medium text-[var(--muted)]">
                  This organization has no projects yet.
                </p>
              )}

              {!busy && availableProjects.length > 0 && (
                <div className="mt-3 flex gap-2">
                  <select
                    className="tb-select tb-select-inline min-w-0 flex-1"
                    value={projectPick}
                    onChange={(e) => setProjectPick(e.target.value)}
                    aria-label="Project to add"
                  >
                    <option value="">Select a project…</option>
                    {availableProjects.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    className="tb-btn-ghost shrink-0 text-sm"
                    disabled={!projectPick}
                    onClick={addProject}
                  >
                    Add
                  </button>
                </div>
              )}
            </div>
          </Section>
        )}

        <Section
          title="Account status"
          hint={isSelf ? "You cannot change your own status" : undefined}
        >
          <fieldset disabled={busy}>
            <StatusOptionList
              active={active}
              locked={isSelf || Boolean(busy)}
              onChange={(next) => onChange({ ...editing, active: next })}
            />
          </fieldset>
        </Section>

        <p className="rounded-xl bg-[var(--bg0)] px-3 py-2.5 text-xs leading-relaxed text-[var(--muted)]">
          Passwords cannot be set here. Use <strong>Reset password</strong> from the row menu to
          generate a temporary one.
        </p>

        <FlashAlert error={error ?? null} message={null} className="" />
      </form>

      <div className="tb-dialog-footer items-center">
        <p className="mr-auto text-xs text-[var(--muted)]" aria-live="polite">
          {membershipLoading
            ? "Loading access…"
            : dirty
              ? `Unsaved changes: ${changes.join(", ")}`
              : "No changes yet"}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          {dirty && (
            <button
              type="button"
              className="tb-btn-ghost text-sm"
              disabled={busy}
              onClick={resetAll}
            >
              Reset
            </button>
          )}
          <button
            type="button"
            className="tb-btn-ghost text-sm"
            onClick={requestClose}
            disabled={busy}
          >
            Cancel
          </button>
          <button
            type="submit"
            form={FORM_ID}
            className="tb-btn-primary text-sm"
            disabled={
              busy || membershipLoading || !dirty || invalid || (accessDirty && !organizationId)
            }
          >
            {busy ? "Saving…" : "Save changes"}
          </button>
        </div>
      </div>
    </ModalShell>
  );
}
