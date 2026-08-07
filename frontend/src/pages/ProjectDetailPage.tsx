import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import {
  createEnvironment,
  createModule,
  createSprint,
  deleteEnvironment,
  deleteModule,
  deleteSprint,
  fetchAdoIterations,
  fetchBugs,
  fetchEnvironments,
  fetchModules,
  fetchProject,
  fetchSprints,
  importAdoSprints,
  testProjectAdo,
  updateEnvironment,
  updateModule,
  updateProject,
  updateSprint,
} from "../api";
import { useAuth } from "../auth";
import { CommandChip, CommandHeader, countLabel } from "../components/CommandHeader";
import { ProjectEnvironmentsPanel } from "../components/project/ProjectEnvironmentsPanel";
import { ProjectModulesPanel } from "../components/project/ProjectModulesPanel";
import { ProjectSprintsPanel } from "../components/project/ProjectSprintsPanel";
import { QueryStatus } from "../components/QueryStatus";
import { Shell } from "../components/Shell";
import { queryKeys } from "../queryKeys";
import type { Environment, Sprint } from "../types";
import { canManageEnvironments, canManageModules, canManageSprints } from "../utils/roles";

function ProjectIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M3 7.5A1.5 1.5 0 0 1 4.5 6H9l2 2h8.5A1.5 1.5 0 0 1 21 9.5v8A1.5 1.5 0 0 1 19.5 19h-15A1.5 1.5 0 0 1 3 17.5v-10Z"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinejoin="round"
      />
      <path d="M3 11.5h18" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

type ProjectTab = "modules" | "environments" | "sprints";

export function ProjectDetailPage() {
  const { id = "" } = useParams();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const canModules = canManageModules(user);
  const canEnvironments = canManageEnvironments(user);
  const canSprints = canManageSprints(user);
  const showAdminTabs = canEnvironments || canSprints;
  const [tab, setTab] = useState<ProjectTab>("modules");
  const [moduleName, setModuleName] = useState("");
  const [moduleDescription, setModuleDescription] = useState("");
  const [moduleError, setModuleError] = useState<string | null>(null);
  const [createModuleOpen, setCreateModuleOpen] = useState(false);
  const [envName, setEnvName] = useState("");
  const [envError, setEnvError] = useState<string | null>(null);
  const [envBusyId, setEnvBusyId] = useState<string | null>(null);
  const [sprintName, setSprintName] = useState("");
  const [sprintError, setSprintError] = useState<string | null>(null);
  const [sprintBusyId, setSprintBusyId] = useState<string | null>(null);
  const [adoOrgUrl, setAdoOrgUrl] = useState("");
  const [adoProject, setAdoProject] = useState("");
  const [adoTeam, setAdoTeam] = useState("");
  const [adoPat, setAdoPat] = useState("");
  const [iterations, setIterations] = useState<
    Array<{
      id: string;
      name: string;
      path: string;
      startDate?: string | null;
      finishDate?: string | null;
      timeFrame?: string | null;
      team?: string;
    }>
  >([]);
  const [selectedIterationIds, setSelectedIterationIds] = useState<Set<string>>(new Set());
  const [loadingIterations, setLoadingIterations] = useState(false);
  const [testingAdo, setTestingAdo] = useState(false);
  const [importingAdo, setImportingAdo] = useState(false);

  const projectQuery = useQuery({
    queryKey: queryKeys.project(id),
    queryFn: () => fetchProject(id),
    enabled: !!id,
  });
  const modulesQuery = useQuery({
    queryKey: queryKeys.modules(id),
    queryFn: () => fetchModules(id),
    enabled: !!id,
  });
  const environmentsQuery = useQuery({
    queryKey: queryKeys.environments(id),
    queryFn: () => fetchEnvironments(id),
    enabled: !!id && canEnvironments,
  });
  const sprintsQuery = useQuery({
    queryKey: queryKeys.sprints(id),
    queryFn: () => fetchSprints(id),
    enabled: !!id,
  });

  const bugsQuery = useQuery({
    queryKey: queryKeys.bugs({ projectId: id }),
    queryFn: () => fetchBugs({ projectId: id }),
    enabled: !!id,
  });

  const project = projectQuery.data;
  useEffect(() => {
    if (!project) return;
    setAdoOrgUrl(project.adoOrgUrl ?? "");
    setAdoProject(project.adoProject ?? "");
    setAdoTeam(project.adoTeam ?? "");
  }, [project?.id, project?.adoOrgUrl, project?.adoProject, project?.adoTeam]);

  const modules = modulesQuery.data ?? [];
  const environments = environmentsQuery.data ?? [];
  const sprints = sprintsQuery.data ?? [];
  const activeEnvironments = environments.filter((e) => e.active);
  const activeSprints = sprints.filter((s) => s.active !== false);
  const bugs = bugsQuery.data ?? [];
  const bugHealth = useMemo(() => {
    if (bugs.length === 0) return null;
    const done = bugs.filter((b) => b.status === "CLOSED" || b.status === "VERIFIED").length;
    return Math.round((done / bugs.length) * 100);
  }, [bugs]);

  const createModuleMutation = useMutation({
    mutationFn: () =>
      createModule(id, {
        name: moduleName.trim(),
        description: moduleDescription.trim() || undefined,
      }),
    onSuccess: async () => {
      setModuleName("");
      setModuleDescription("");
      setModuleError(null);
      await queryClient.invalidateQueries({ queryKey: ["modules", id] });
      await queryClient.invalidateQueries({ queryKey: ["project", id] });
    },
    onError: (err: Error) => setModuleError(err.message),
  });

  const renameModuleMutation = useMutation({
    mutationFn: ({
      moduleId,
      name,
      description,
    }: {
      moduleId: string;
      name: string;
      description: string;
    }) => updateModule(moduleId, { name, description: description || undefined }),
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

  const createEnvMutation = useMutation({
    mutationFn: () => createEnvironment(id, { name: envName.trim() }),
    onSuccess: async () => {
      setEnvName("");
      setEnvError(null);
      await queryClient.invalidateQueries({ queryKey: queryKeys.environments(id) });
      await queryClient.invalidateQueries({ queryKey: queryKeys.project(id) });
    },
    onError: (err: Error) => setEnvError(err.message),
  });

  const createSprintMutation = useMutation({
    mutationFn: () => createSprint(id, { name: sprintName.trim() }),
    onSuccess: async () => {
      setSprintName("");
      setSprintError(null);
      await queryClient.invalidateQueries({ queryKey: queryKeys.sprints(id) });
      await queryClient.invalidateQueries({ queryKey: queryKeys.project(id) });
    },
    onError: (err: Error) => setSprintError(err.message),
  });

  const saveAdoMutation = useMutation({
    mutationFn: () =>
      updateProject(id, {
        name: project!.name,
        description: project!.description || undefined,
        jiraProjectKey: project!.jiraProjectKey || undefined,
        adoOrgUrl: adoOrgUrl.trim() || undefined,
        adoProject: adoProject.trim() || undefined,
        adoTeam: adoTeam.trim() || undefined,
        ...(adoPat.trim() ? { adoPat: adoPat.trim() } : {}),
      }),
    onSuccess: async () => {
      setAdoPat("");
      setSprintError(null);
      await queryClient.invalidateQueries({ queryKey: queryKeys.project(id) });
    },
    onError: (err: Error) => setSprintError(err.message),
  });

  async function invalidateEnvironments() {
    await queryClient.invalidateQueries({ queryKey: queryKeys.environments(id) });
    await queryClient.invalidateQueries({ queryKey: queryKeys.project(id) });
  }

  async function invalidateSprints() {
    await queryClient.invalidateQueries({ queryKey: queryKeys.sprints(id) });
    await queryClient.invalidateQueries({ queryKey: queryKeys.project(id) });
  }

  async function runEnvAction(envId: string, fn: () => Promise<unknown>) {
    setEnvBusyId(envId);
    setEnvError(null);
    try {
      await fn();
      await invalidateEnvironments();
    } catch (err) {
      setEnvError(err instanceof Error ? err.message : "Environment update failed");
    } finally {
      setEnvBusyId(null);
    }
  }

  async function runSprintAction(sprintId: string, fn: () => Promise<unknown>) {
    setSprintBusyId(sprintId);
    setSprintError(null);
    try {
      await fn();
      await invalidateSprints();
    } catch (err) {
      setSprintError(err instanceof Error ? err.message : "Sprint update failed");
    } finally {
      setSprintBusyId(null);
    }
  }

  function handleSetDefault(env: Environment) {
    void runEnvAction(env.id, () => updateEnvironment(env.id, { isDefault: true }));
  }

  function handleToggleActive(env: Environment) {
    void runEnvAction(env.id, () => updateEnvironment(env.id, { active: !env.active }));
  }

  function handleRename(env: Environment, name: string) {
    void runEnvAction(env.id, () => updateEnvironment(env.id, { name }));
  }

  function handleDelete(envId: string) {
    if (!window.confirm("Delete this environment? Bugs keep their capture snapshot.")) return;
    void runEnvAction(envId, () => deleteEnvironment(envId));
  }

  function handleSprintSetDefault(sprint: Sprint) {
    void runSprintAction(sprint.id, () => updateSprint(sprint.id, { isDefault: true }));
  }

  function handleSprintToggleActive(sprint: Sprint) {
    void runSprintAction(sprint.id, () =>
      updateSprint(sprint.id, { active: sprint.active === false }),
    );
  }

  function handleSprintRename(sprint: Sprint, name: string) {
    void runSprintAction(sprint.id, () => updateSprint(sprint.id, { name }));
  }

  function handleSprintDelete(sprintId: string) {
    if (!window.confirm("Delete this sprint? Only allowed if no bugs/test cases use it.")) return;
    void runSprintAction(sprintId, () => deleteSprint(sprintId));
  }

  async function handleTestAdo() {
    setTestingAdo(true);
    setSprintError(null);
    try {
      const result = await testProjectAdo(id);
      setSprintError(null);
      window.alert(
        `Connected. Found ${result.iterationCount} iteration(s)` +
          (result.team ? ` (team: ${result.team})` : ""),
      );
    } catch (err) {
      setSprintError(err instanceof Error ? err.message : "ADO connection failed");
    } finally {
      setTestingAdo(false);
    }
  }

  async function handleLoadIterations() {
    setLoadingIterations(true);
    setSprintError(null);
    try {
      const list = await fetchAdoIterations(id);
      setIterations(list);
      setSelectedIterationIds(new Set(list.map((i) => i.id)));
    } catch (err) {
      setSprintError(err instanceof Error ? err.message : "Could not load iterations");
    } finally {
      setLoadingIterations(false);
    }
  }

  async function handleImportAdo() {
    setImportingAdo(true);
    setSprintError(null);
    try {
      const result = await importAdoSprints(id, {
        iterationIds: [...selectedIterationIds],
      });
      await invalidateSprints();
      window.alert(`Imported ${result.imported} sprint(s) from Azure DevOps`);
    } catch (err) {
      setSprintError(err instanceof Error ? err.message : "Import failed");
    } finally {
      setImportingAdo(false);
    }
  }

  const subtitle =
    tab === "sprints" && canSprints
      ? "Manage sprints and import Azure DevOps iterations."
      : tab === "environments" && canEnvironments
        ? "Configure Dev / Staging / Prod presets for bug capture."
        : project?.description ||
          (canModules
            ? "Create and manage modules for this project."
            : "Browse modules in this project.");

  return (
    <Shell
      title={project?.name ?? "Project"}
      crumbRoot={{ label: "Projects", to: "/projects" }}
    >
      <div className="flex h-full min-h-0 flex-col overflow-hidden">
        <QueryStatus
          isLoading={projectQuery.isLoading}
          error={projectQuery.error}
          onRetry={() => void projectQuery.refetch()}
          loadingText="Loading\u2026"
        />

        {project && !projectQuery.isLoading && !projectQuery.error && (
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <CommandHeader
              icon={<ProjectIcon />}
              title={project.name}
              subtitle={subtitle}
              meta={
                <>
                  <CommandChip>{countLabel(modules.length, "module")}</CommandChip>
                  {canSprints ? (
                    <CommandChip>{countLabel(activeSprints.length, "sprint")}</CommandChip>
                  ) : null}
                  {canEnvironments ? (
                    <CommandChip>{countLabel(activeEnvironments.length, "environment")}</CommandChip>
                  ) : null}
                  <CommandChip>{countLabel(bugs.length, "bug")}</CommandChip>
                  {project.adoProject ? (
                    <CommandChip>ADO: {project.adoProject}</CommandChip>
                  ) : null}
                </>
              }
              pulse={{ value: bugHealth, label: "Bug Health", hint: "Resolved + closed" }}
              actions={
                <>
                  <Link to="/projects" className="tb-btn-ghost inline-flex items-center gap-1.5 text-sm">
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
                  </Link>
                  {canModules && tab === "modules" && (
                    <button
                      type="button"
                      className="tb-btn-primary inline-flex items-center gap-1.5 text-sm"
                      onClick={() => setCreateModuleOpen(true)}
                    >
                      <span aria-hidden>+</span> Add Module
                    </button>
                  )}
                </>
              }
            />

            {showAdminTabs ? (
              <div className="mb-3 flex shrink-0 flex-wrap gap-2 px-1 sm:px-0">
                <button
                  type="button"
                  className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${
                    tab === "modules"
                      ? "bg-[var(--accent)] text-white"
                      : "bg-white text-[var(--muted)] ring-1 ring-[var(--line)]"
                  }`}
                  onClick={() => setTab("modules")}
                >
                  Modules
                </button>
                {canSprints ? (
                  <button
                    type="button"
                    className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${
                      tab === "sprints"
                        ? "bg-[var(--accent)] text-white"
                        : "bg-white text-[var(--muted)] ring-1 ring-[var(--line)]"
                    }`}
                    onClick={() => setTab("sprints")}
                  >
                    Sprints
                  </button>
                ) : null}
                {canEnvironments ? (
                  <button
                    type="button"
                    className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${
                      tab === "environments"
                        ? "bg-[var(--accent)] text-white"
                        : "bg-white text-[var(--muted)] ring-1 ring-[var(--line)]"
                    }`}
                    onClick={() => setTab("environments")}
                  >
                    Environments
                  </button>
                ) : null}
              </div>
            ) : null}

            {tab === "modules" || !showAdminTabs ? (
              <ProjectModulesPanel
                showHeader={false}
                createOpen={createModuleOpen}
                onCreateOpenChange={setCreateModuleOpen}
                projectId={project.id}
                modules={modulesQuery.data ?? []}
                loading={modulesQuery.isLoading}
                canManage={canModules}
                moduleName={moduleName}
                onModuleNameChange={setModuleName}
                moduleDescription={moduleDescription}
                onModuleDescriptionChange={setModuleDescription}
                onCreate={() => createModuleMutation.mutate()}
                creating={createModuleMutation.isPending}
                onRename={(moduleId, name, description) =>
                  renameModuleMutation.mutate({ moduleId, name, description })
                }
                renaming={renameModuleMutation.isPending}
                onDelete={(modId) => deleteModuleMutation.mutate(modId)}
                deleting={deleteModuleMutation.isPending}
                error={moduleError}
              />
            ) : tab === "sprints" && canSprints ? (
              <ProjectSprintsPanel
                project={project}
                sprints={sprints}
                loading={sprintsQuery.isLoading}
                error={sprintError}
                sprintName={sprintName}
                onSprintNameChange={setSprintName}
                onCreate={() => createSprintMutation.mutate()}
                creating={createSprintMutation.isPending}
                onSetDefault={handleSprintSetDefault}
                onToggleActive={handleSprintToggleActive}
                onRename={handleSprintRename}
                onDelete={handleSprintDelete}
                busyId={sprintBusyId}
                adoOrgUrl={adoOrgUrl}
                adoProject={adoProject}
                adoTeam={adoTeam}
                adoPat={adoPat}
                adoPatConfigured={!!project.adoPatConfigured}
                onAdoOrgUrlChange={setAdoOrgUrl}
                onAdoProjectChange={setAdoProject}
                onAdoTeamChange={setAdoTeam}
                onAdoPatChange={setAdoPat}
                onSaveAdo={() => saveAdoMutation.mutate()}
                savingAdo={saveAdoMutation.isPending}
                onTestAdo={() => void handleTestAdo()}
                testingAdo={testingAdo}
                onLoadIterations={() => void handleLoadIterations()}
                loadingIterations={loadingIterations}
                iterations={iterations}
                selectedIterationIds={selectedIterationIds}
                onToggleIteration={(iterId) => {
                  setSelectedIterationIds((prev) => {
                    const next = new Set(prev);
                    if (next.has(iterId)) next.delete(iterId);
                    else next.add(iterId);
                    return next;
                  });
                }}
                onImportAdo={() => void handleImportAdo()}
                importingAdo={importingAdo}
              />
            ) : (
              <ProjectEnvironmentsPanel
                projectId={project.id}
                environments={environments}
                loading={environmentsQuery.isLoading}
                error={envError}
                envName={envName}
                onEnvNameChange={setEnvName}
                onCreate={() => createEnvMutation.mutate()}
                creating={createEnvMutation.isPending}
                onSetDefault={handleSetDefault}
                onToggleActive={handleToggleActive}
                onRename={handleRename}
                onDelete={handleDelete}
                busyId={envBusyId}
              />
            )}
          </div>
        )}
      </div>
    </Shell>
  );
}
