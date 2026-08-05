import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useMutation } from "@tanstack/react-query";
import { adminCreateUser } from "../../api";
import { FlashAlert } from "../FlashAlert";
import { ModalShell } from "../ModalShell";
import type { Organization, Project, UserRole, UserWithTemporaryPassword } from "../../types";
import { validateEmail, validateName } from "../../utils/validation";
import { RoleOptionList } from "./RoleOptionList";
import {
  FieldWithIcon,
  IconClose,
  IconMail,
  IconShield,
  IconUser,
  TemporaryPasswordPanel,
} from "./UserPasswordUi";

const FORM_ID = "create-user-form";

export function CreateUserModal({
  open,
  onClose,
  roles,
  projects,
  organizations,
  requireOrganization,
  initialProjectIds,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  roles: UserRole[];
  projects: Project[];
  organizations?: Organization[];
  /** SuperAdmin spans every org, so the target org has to be picked explicitly. */
  requireOrganization?: boolean;
  initialProjectIds?: string[];
  onCreated?: (user: UserWithTemporaryPassword) => void;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<UserRole>("TESTER");
  const [organizationId, setOrganizationId] = useState("");
  const [projectIds, setProjectIds] = useState<string[]>([]);
  const [projectPick, setProjectPick] = useState("");
  const [touched, setTouched] = useState<{ name?: boolean; email?: boolean }>({});
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<UserWithTemporaryPassword | null>(null);

  // Snapshot the defaults so re-renders of the parent (which pass fresh array
  // literals) cannot wipe what the admin has typed.
  const defaultsRef = useRef({ roles, initialProjectIds, projects });
  defaultsRef.current = { roles, initialProjectIds, projects };

  function resetForm() {
    const {
      roles: currentRoles,
      initialProjectIds: presetProjects,
      projects: allProjects,
    } = defaultsRef.current;
    const preset = presetProjects?.length ? [...presetProjects] : [];
    setName("");
    setEmail("");
    setRole(currentRoles.includes("TESTER") ? "TESTER" : currentRoles[0] || "TESTER");
    // A preselected project pins the org it belongs to.
    setOrganizationId(allProjects.find((p) => p.id === preset[0])?.organizationId ?? "");
    setProjectIds(preset);
    setProjectPick("");
    setTouched({});
    setError(null);
    setCreated(null);
  }

  useEffect(() => {
    if (!open) return;
    resetForm();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // SuperAdmin sees every project in the system, so the picker is narrowed to
  // the chosen org; other admins already only receive their own org's projects.
  const scopedProjects = useMemo(
    () =>
      requireOrganization
        ? projects.filter((p) => organizationId && p.organizationId === organizationId)
        : projects,
    [organizationId, projects, requireOrganization],
  );

  const availableProjects = useMemo(
    () => scopedProjects.filter((p) => !projectIds.includes(p.id)),
    [scopedProjects, projectIds],
  );

  const nameError = touched.name ? validateName(name) : null;
  const emailError = touched.email ? validateEmail(email) : null;

  const createMutation = useMutation({
    mutationFn: adminCreateUser,
    onSuccess: (result) => {
      setError(null);
      setCreated(result);
      onCreated?.(result);
    },
    onError: (err: Error) => setError(err.message),
  });

  if (!open) return null;

  function addProject() {
    if (!projectPick || projectIds.includes(projectPick)) return;
    setProjectIds((prev) => [...prev, projectPick]);
    setProjectPick("");
  }

  function removeProject(id: string) {
    setProjectIds((prev) => prev.filter((x) => x !== id));
  }

  function onSubmitCreate(e: FormEvent) {
    e.preventDefault();
    if (createMutation.isPending) return;
    setTouched({ name: true, email: true });
    const firstError = validateName(name) || validateEmail(email);
    if (firstError) {
      setError(firstError);
      return;
    }
    if (!roles.includes(role)) {
      setError("You cannot assign this role");
      return;
    }
    if (requireOrganization && !organizationId) {
      setError("Select an organization");
      return;
    }
    createMutation.mutate({
      name: name.trim().replace(/\s+/g, " "),
      email: email.trim().toLowerCase(),
      role,
      organizationId: organizationId || undefined,
      projectIds,
    });
  }

  function handleClose() {
    if (createMutation.isPending) return;
    onClose();
  }

  const locked = createMutation.isPending;

  function createAnother() {
    resetForm();
  }

  return (
    <ModalShell
      open={open}
      onClose={handleClose}
      labelledBy="create-user-modal-title"
      size="lg"
      // Once the one-time credential is visible, require an explicit Done/X
      // action so a stray backdrop click or Escape cannot discard it.
      dismissible={!locked && !created}
    >
      <div className="tb-dialog-header flex items-center gap-3">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-[var(--accent-soft)] text-[var(--accent)]">
          <IconUser className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 id="create-user-modal-title" className="text-base font-bold text-[var(--ink)]">
            {created ? "User created" : "Create user"}
          </h2>
          <p className="text-sm text-[var(--muted)]">
            {created
              ? "Copy and share this temporary password securely."
              : "A temporary password is generated for them automatically."}
          </p>
        </div>
        <button
          type="button"
          className="tb-btn-icon h-9 w-9 shrink-0"
          aria-label="Close"
          onClick={handleClose}
        >
          <IconClose />
        </button>
      </div>

      {created ? (
        <div className="px-6 py-5">
          <div
            role="status"
            className="mb-4 flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3"
          >
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-emerald-600 text-sm font-bold text-white">
              ✓
            </span>
            <div className="min-w-0">
              <p className="text-sm font-bold text-emerald-900">{created.name} was created</p>
              <p className="truncate text-xs text-emerald-800">{created.email}</p>
            </div>
          </div>

          <TemporaryPasswordPanel
            password={created.temporaryPassword}
            userLabel={`${created.name} · ${created.email}`}
            copyLabel="Temporary password copied"
          />
        </div>
      ) : (
        <form
          id={FORM_ID}
          className="tb-scroll-y max-h-[min(65vh,34rem)] space-y-5 px-6 py-5"
          onSubmit={onSubmitCreate}
          noValidate
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <FieldWithIcon
              label="Full name"
              required
              icon={<IconUser />}
              error={nameError}
              hint="Letters and spaces only"
            >
              <input
                data-autofocus
                className={`tb-input ${nameError ? "tb-input-invalid" : ""}`}
                value={name}
                onChange={(e) => setName(e.target.value)}
                onBlur={() => setTouched((t) => ({ ...t, name: true }))}
                placeholder="Alice Tester"
                maxLength={100}
                autoComplete="off"
                disabled={locked}
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
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onBlur={() => setTouched((t) => ({ ...t, email: true }))}
                placeholder="user@company.com"
                maxLength={254}
                autoComplete="off"
                disabled={locked}
                aria-invalid={emailError ? true : undefined}
              />
            </FieldWithIcon>
          </div>

          {requireOrganization && (
            <FieldWithIcon
              label="Organization"
              required
              icon={<IconShield />}
              hint="Scopes the projects available below"
            >
              <select
                className="tb-select"
                value={organizationId}
                onChange={(e) => {
                  setOrganizationId(e.target.value);
                  // Projects belong to the previous org — drop them.
                  setProjectIds([]);
                  setProjectPick("");
                  setError(null);
                }}
                disabled={locked}
              >
                <option value="">Select an organization…</option>
                {(organizations ?? []).map((org) => (
                  <option key={org.id} value={org.id}>
                    {org.name}
                  </option>
                ))}
              </select>
            </FieldWithIcon>
          )}

          <fieldset disabled={locked}>
            <legend className="tb-label">Role *</legend>
            <div className="mt-2">
              <RoleOptionList
                name="create-user-role"
                options={roles}
                value={role}
                onChange={setRole}
              />
            </div>
          </fieldset>

          {(requireOrganization ? organizationId !== "" : projects.length > 0) && (
            <div className="rounded-xl border border-[var(--line)] bg-[var(--bg0)] p-3.5">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-bold text-[var(--ink)]">Assign to projects</p>
                <span className="text-xs font-semibold text-[var(--muted)]">
                  {projectIds.length} selected
                </span>
              </div>
              <p className="mt-1 text-xs leading-relaxed text-[var(--muted)]">
                Developers and Testers only see projects they are added to. The user joins each
                project&apos;s organization automatically.
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
                        {!locked && (
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

              {!locked && availableProjects.length > 0 && (
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
          )}

          <FlashAlert error={error} message={null} className="" />
        </form>
      )}

      <div className="tb-dialog-footer">
        {created ? (
          <>
            <button type="button" className="tb-btn-ghost text-sm" onClick={createAnother}>
              Create another user
            </button>
            <button type="button" className="tb-btn-primary text-sm" onClick={handleClose}>
              Done
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              className="tb-btn-ghost text-sm"
              onClick={handleClose}
              disabled={locked}
            >
              Cancel
            </button>
            <button
              type="submit"
              form={FORM_ID}
              className="tb-btn-primary text-sm"
              disabled={locked}
            >
              {locked ? "Creating…" : "Create user"}
            </button>
          </>
        )}
      </div>
    </ModalShell>
  );
}
