import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import {
  createModule,
  deleteModule,
  fetchBugs,
  fetchModules,
  fetchProject,
  updateModule,
} from "../api";
import { useAuth } from "../auth";
import { CommandChip, CommandHeader, countLabel } from "../components/CommandHeader";
import { ProjectModulesPanel } from "../components/project/ProjectModulesPanel";
import { QueryStatus } from "../components/QueryStatus";
import { Shell } from "../components/Shell";
import { queryKeys } from "../queryKeys";
import { canManageModules } from "../utils/roles";

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

export function ProjectDetailPage() {
  const { id = "" } = useParams();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const canModules = canManageModules(user);
  const [moduleName, setModuleName] = useState("");
  const [moduleDescription, setModuleDescription] = useState("");
  const [moduleError, setModuleError] = useState<string | null>(null);
  const [createModuleOpen, setCreateModuleOpen] = useState(false);

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

  const bugsQuery = useQuery({
    queryKey: queryKeys.bugs({ projectId: id }),
    queryFn: () => fetchBugs({ projectId: id }),
    enabled: !!id,
  });

  const project = projectQuery.data;
  const modules = modulesQuery.data ?? [];
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
              subtitle={
                project.description ||
                (canModules
                  ? "Create and manage modules for this project."
                  : "Browse modules in this project.")
              }
              meta={
                <>
                  <CommandChip>{countLabel(modules.length, "module")}</CommandChip>
                  <CommandChip>{countLabel(bugs.length, "bug")}</CommandChip>
                  {project.jiraProjectKey ? (
                    <CommandChip>Jira: {project.jiraProjectKey}</CommandChip>
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
                  {canModules && (
                    <button
                      type="button"
                      className="tb-btn-primary inline-flex items-center gap-1.5 text-sm"
                      onClick={() => setCreateModuleOpen(true)}
                    >
                      <span aria-hidden>+</span> Create Module
                    </button>
                  )}
                </>
              }
            />
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
          </div>
        )}
      </div>
    </Shell>
  );
}
