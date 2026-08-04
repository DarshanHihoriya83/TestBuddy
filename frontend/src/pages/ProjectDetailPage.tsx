import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import {
  addProjectMember,
  createModule,
  deleteModule,
  fetchCycles,
  fetchModules,
  fetchProject,
  fetchProjectMembers,
  fetchUsers,
  removeProjectMember,
  updateModule,
} from "../api";
import { useAuth } from "../auth";
import { ProjectMembersPanel } from "../components/project/ProjectMembersPanel";
import { ProjectModulesPanel } from "../components/project/ProjectModulesPanel";
import { QueryStatus } from "../components/QueryStatus";
import { Shell } from "../components/Shell";
import { queryKeys } from "../queryKeys";
import {
  canCreateProject,
  canManageModules,
  canManageProjectMembers,
  canTransferRoles,
} from "../utils/roles";

export function ProjectDetailPage() {
  const { id = "" } = useParams();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const canManage = canCreateProject(user);
  const canMembers = canManageProjectMembers(user);
  const canModules = canManageModules(user);
  const isTester = user?.role === "TESTER";
  const showMembersSection = !isTester;
  const [addUserId, setAddUserId] = useState("");
  const [memberMessage, setMemberMessage] = useState<string | null>(null);
  const [memberError, setMemberError] = useState<string | null>(null);
  const [moduleName, setModuleName] = useState("");
  const [moduleError, setModuleError] = useState<string | null>(null);

  const projectQuery = useQuery({
    queryKey: queryKeys.project(id),
    queryFn: () => fetchProject(id),
    enabled: !!id,
  });
  const cyclesQuery = useQuery({
    queryKey: queryKeys.cycles(id),
    queryFn: () => fetchCycles(id),
    enabled: !!id,
  });
  const membersQuery = useQuery({
    queryKey: queryKeys.projectMembers(id),
    queryFn: () => fetchProjectMembers(id),
    enabled: !!id && showMembersSection,
  });
  const modulesQuery = useQuery({
    queryKey: queryKeys.modules(id),
    queryFn: () => fetchModules(id),
    enabled: !!id,
  });
  const usersQuery = useQuery({
    queryKey: queryKeys.users(),
    queryFn: () => fetchUsers(),
    enabled: showMembersSection,
  });

  const project = projectQuery.data;
  const members = membersQuery.data ?? [];
  const memberIds = useMemo(() => new Set(members.map((m) => m.id)), [members]);
  const addableUsers = useMemo(
    () => (usersQuery.data ?? []).filter((u) => u.active !== false && !memberIds.has(u.id)),
    [usersQuery.data, memberIds],
  );

  const addMemberMutation = useMutation({
    mutationFn: (userId: string) => addProjectMember(id, userId),
    onSuccess: async () => {
      setAddUserId("");
      setMemberMessage("Member added");
      setMemberError(null);
      await queryClient.invalidateQueries({ queryKey: ["project-members"] });
      await queryClient.invalidateQueries({ queryKey: ["project", id] });
      await queryClient.invalidateQueries({ queryKey: ["projects"] });
      await queryClient.invalidateQueries({ queryKey: ["users-admin"] });
    },
    onError: (err: Error) => {
      setMemberError(err.message);
      setMemberMessage(null);
    },
  });

  const removeMemberMutation = useMutation({
    mutationFn: (userId: string) => removeProjectMember(id, userId),
    onSuccess: async () => {
      setMemberMessage("Member removed");
      setMemberError(null);
      await queryClient.invalidateQueries({ queryKey: ["project-members"] });
      await queryClient.invalidateQueries({ queryKey: ["project", id] });
      await queryClient.invalidateQueries({ queryKey: ["projects"] });
      await queryClient.invalidateQueries({ queryKey: ["users-admin"] });
    },
    onError: (err: Error) => {
      setMemberError(err.message);
      setMemberMessage(null);
    },
  });

  const createModuleMutation = useMutation({
    mutationFn: (name: string) => createModule(id, { name }),
    onSuccess: async () => {
      setModuleName("");
      setModuleError(null);
      await queryClient.invalidateQueries({ queryKey: ["modules", id] });
      await queryClient.invalidateQueries({ queryKey: ["project", id] });
    },
    onError: (err: Error) => setModuleError(err.message),
  });

  const renameModuleMutation = useMutation({
    mutationFn: ({ moduleId, name }: { moduleId: string; name: string }) =>
      updateModule(moduleId, { name }),
    onSuccess: async () => {
      setModuleError(null);
      await queryClient.invalidateQueries({ queryKey: ["modules", id] });
    },
    onError: (err: Error) => setModuleError(err.message),
  });

  const deleteModuleMutation = useMutation({
    mutationFn: deleteModule,
    onSuccess: async () => {
      setModuleError(null);
      await queryClient.invalidateQueries({ queryKey: ["modules", id] });
      await queryClient.invalidateQueries({ queryKey: ["project", id] });
    },
    onError: (err: Error) => setModuleError(err.message),
  });

  return (
    <Shell title="Project detail">
      <Link to="/projects" className="tb-link text-sm">
        ← Back to projects
      </Link>

      <QueryStatus
        isLoading={projectQuery.isLoading}
        error={projectQuery.error}
        onRetry={() => void projectQuery.refetch()}
        loadingText="Loading…"
        className="mt-4"
      />

      {project && (
        <div className="mt-4 space-y-6">
          <header className="tb-card tb-card-accent overflow-hidden">
            <div className="flex flex-wrap items-start justify-between gap-4 p-6">
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--accent)]">
                  Project
                </p>
                <h2 className="mt-1 text-3xl font-bold tracking-tight text-[var(--ink)]">
                  {project.name}
                </h2>
                {!isTester && (
                  <p className="mt-2 font-mono text-xs text-[var(--muted)]">{project.id}</p>
                )}
                {isTester && (
                  <p className="mt-2 text-sm text-[var(--muted)]">
                    Open a module card to view and edit bugs in that module.
                  </p>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                {!isTester && (
                  <Link to={`/bugs?projectId=${project.id}`} className="tb-btn-ghost text-sm">
                    View bugs
                  </Link>
                )}
                {canManage && (
                  <Link to={`/projects/${project.id}/edit`} className="tb-btn-primary text-sm">
                    Edit project
                  </Link>
                )}
              </div>
            </div>

            {!isTester && (
              <>
                <div
                  className={`grid gap-px border-t border-[var(--line)] bg-[var(--line)] sm:grid-cols-2 lg:grid-cols-3 ${
                    showMembersSection ? "xl:grid-cols-5" : "xl:grid-cols-4"
                  }`}
                >
                  <Stat label="Bugs" value={String(project.bugCount ?? 0)} />
                  <Stat
                    label="Cycles"
                    value={String(cyclesQuery.data?.length ?? project.cycleCount ?? 0)}
                  />
                  <Stat
                    label="Modules"
                    value={String(modulesQuery.data?.length ?? project.moduleCount ?? 0)}
                  />
                  {showMembersSection ? (
                    <Stat
                      label="Members"
                      value={String(membersQuery.data?.length ?? project.memberCount ?? 0)}
                    />
                  ) : null}
                  <Stat
                    label="Integrations"
                    value={
                      [project.jiraProjectKey && "Jira", project.adoProject && "ADO"]
                        .filter(Boolean)
                        .join(" · ") || "None"
                    }
                  />
                </div>

                <dl className="grid gap-4 border-t border-[var(--line)] p-5 text-sm md:grid-cols-3">
                  <Meta label="Jira key" value={project.jiraProjectKey || "—"} />
                  <Meta label="ADO project" value={project.adoProject || "—"} />
                  <Meta label="ADO org URL" value={project.adoOrgUrl || "—"} breakAll />
                </dl>
              </>
            )}
          </header>

          <ProjectModulesPanel
            projectId={project.id}
            modules={modulesQuery.data ?? []}
            loading={modulesQuery.isLoading}
            canManage={canModules}
            moduleName={moduleName}
            onModuleNameChange={setModuleName}
            onCreate={() => createModuleMutation.mutate(moduleName.trim())}
            creating={createModuleMutation.isPending}
            onRename={(moduleId, name) => renameModuleMutation.mutate({ moduleId, name })}
            renaming={renameModuleMutation.isPending}
            onDelete={(modId) => deleteModuleMutation.mutate(modId)}
            deleting={deleteModuleMutation.isPending}
            error={moduleError}
          />

          {showMembersSection ? (
            <ProjectMembersPanel
              members={members}
              addableUsers={addableUsers}
              currentUserId={user?.id}
              canManage={canMembers}
              showUsersLink={canTransferRoles(user)}
              addUserId={addUserId}
              onAddUserIdChange={setAddUserId}
              onAdd={() => addMemberMutation.mutate(addUserId)}
              adding={addMemberMutation.isPending}
              onRemove={(userId) => removeMemberMutation.mutate(userId)}
              removing={removeMemberMutation.isPending}
              loading={membersQuery.isLoading}
              error={memberError}
              message={memberMessage}
              listError={membersQuery.error as Error | null}
            />
          ) : null}
        </div>
      )}
    </Shell>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-[var(--panel)] px-5 py-4">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--muted)]">
        {label}
      </p>
      <p className="mt-1 text-lg font-bold text-[var(--ink)]">{value}</p>
    </div>
  );
}

function Meta({
  label,
  value,
  breakAll,
}: {
  label: string;
  value: string;
  breakAll?: boolean;
}) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-[var(--muted)]">{label}</dt>
      <dd className={`mt-1 font-medium ${breakAll ? "break-all" : ""}`}>{value}</dd>
    </div>
  );
}
