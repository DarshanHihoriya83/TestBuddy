import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams } from "react-router-dom";
import {
  createModule,
  deleteModule,
  fetchModules,
  fetchProject,
  updateModule,
} from "../api";
import { useAuth } from "../auth";
import { ProjectModulesPanel } from "../components/project/ProjectModulesPanel";
import { QueryStatus } from "../components/QueryStatus";
import { Shell } from "../components/Shell";
import { queryKeys } from "../queryKeys";
import { canManageModules } from "../utils/roles";

export function ProjectDetailPage() {
  const { id = "" } = useParams();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const canModules = canManageModules(user);
  const [moduleName, setModuleName] = useState("");
  const [moduleDescription, setModuleDescription] = useState("");
  const [moduleError, setModuleError] = useState<string | null>(null);

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

  const project = projectQuery.data;

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
    <Shell title={project?.name ?? "Project"}>
      <div className="flex h-full min-h-0 flex-col overflow-hidden">
        <QueryStatus
          isLoading={projectQuery.isLoading}
          error={projectQuery.error}
          onRetry={() => void projectQuery.refetch()}
          loadingText="Loading\u2026"
        />

        {project && !projectQuery.isLoading && !projectQuery.error && (
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <ProjectModulesPanel
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
