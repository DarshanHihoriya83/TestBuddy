import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import {
  fetchBug,
  fetchEnvironments,
  fetchModules,
  fetchProjects,
  fetchSprints,
  fetchUsers,
} from "../api";
import { useAuth } from "../auth";
import type { BreadcrumbItem } from "../components/AppNavigation";
import { BugDetailCommandHeader } from "../components/BugDetailCommandHeader";
import { ModuleBugCard, type BugCardMode } from "../components/ModuleBugCard";
import { QueryStatus } from "../components/QueryStatus";
import { Shell } from "../components/Shell";
import { queryKeys } from "../queryKeys";
import {
  canCommentOnBug,
  canDeleteBug,
  canFullEditBug,
  canUpdateBugStatus,
} from "../utils/roles";

function breadcrumbLabel(text: string, max = 52) {
  const t = text.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

export function BugDetailPage() {
  const { id = "" } = useParams();
  const { user } = useAuth();
  const location = useLocation();
  const fromProjectId = (location.state as { fromProjectId?: string; fromModuleId?: string } | null)
    ?.fromProjectId;
  const fromModuleId = (location.state as { fromProjectId?: string; fromModuleId?: string } | null)
    ?.fromModuleId;

  const canEdit = canFullEditBug(user);
  const canStatus = canUpdateBugStatus(user);
  const canComment = canCommentOnBug(user);
  const canDelete = canDeleteBug(user);
  const [bugCardMode, setBugCardMode] = useState<BugCardMode>("view");

  const bugQuery = useQuery({
    queryKey: queryKeys.bug(id),
    queryFn: () => fetchBug(id),
    enabled: !!id,
  });
  const usersQuery = useQuery({ queryKey: queryKeys.users(), queryFn: () => fetchUsers() });
  const projectsQuery = useQuery({
    queryKey: queryKeys.projects(),
    queryFn: () => fetchProjects(),
  });

  const projectId = bugQuery.data?.projectId ?? projectsQuery.data?.[0]?.id;
  const sprintsQuery = useQuery({
    queryKey: queryKeys.sprints(projectId || "_"),
    queryFn: () => fetchSprints(projectId!),
    enabled: !!projectId,
  });
  const modulesQuery = useQuery({
    queryKey: queryKeys.modules(projectId || "_"),
    queryFn: () => fetchModules(projectId!),
    enabled: !!projectId,
  });
  const environmentsQuery = useQuery({
    queryKey: queryKeys.environments(projectId || "_"),
    queryFn: () => fetchEnvironments(projectId!),
    enabled: !!projectId,
  });

  const bug = bugQuery.data;
  const nameOf = (uid: string) => usersQuery.data?.find((u) => u.id === uid)?.name ?? uid.slice(0, 8);
  const sprintName = sprintsQuery.data?.find((c) => c.id === bug?.sprintId)?.name ?? "—";
  const moduleName =
    modulesQuery.data?.find((m) => m.id === bug?.moduleId)?.name ??
    (bug?.moduleId ? bug.moduleId.slice(0, 8) : "—");
  const projectName = projectsQuery.data?.find((p) => p.id === bug?.projectId)?.name ?? "—";
  const backToProject = fromProjectId || bug?.projectId;
  const backToModule =
    fromModuleId && backToProject
      ? `/projects/${backToProject}/modules/${fromModuleId}`
      : null;

  const editingBug = bugCardMode === "steps" || bugCardMode === "fields";
  const pageTitle = editingBug
    ? "Edit"
    : bug?.title
      ? breadcrumbLabel(bug.title, 40)
      : "Bug detail";

  const backTarget = backToModule ?? (backToProject ? `/projects/${backToProject}` : "/bugs");

  useEffect(() => {
    setBugCardMode("view");
  }, [id]);

  const crumbs: BreadcrumbItem[] = [];
  if (backToProject) {
    crumbs.push({ label: projectName, to: `/projects/${backToProject}` });
  }
  if (backToModule && fromModuleId) {
    crumbs.push({
      label: moduleName,
      to: backToModule,
    });
  }
  if (bug && editingBug) {
    crumbs.push({
      label: breadcrumbLabel(bug.title),
      to: `/bugs/${bug.id}`,
      onClick: () => setBugCardMode("view"),
    });
  }

  return (
    <Shell
      title={pageTitle}
      crumbRoot={
        backToProject
          ? { label: "Projects", to: "/projects" }
          : { label: "Bugs", to: "/bugs" }
      }
      crumbs={crumbs}
    >
      <QueryStatus
        isLoading={bugQuery.isLoading}
        error={bugQuery.error}
        onRetry={() => void bugQuery.refetch()}
        loadingText="Loading..."
      />

      {bug && (
        <div className="tb-mod-workspace mt-4 flex min-h-0 flex-col overflow-hidden">
          {bugCardMode === "view" ? (
            <BugDetailCommandHeader
              bug={bug}
              actions={
                <Link to={backTarget} className="tb-btn-ghost inline-flex items-center gap-1.5 text-sm">
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
              }
            />
          ) : null}
          <div className={`min-h-0 flex-1 overflow-auto pb-4 ${bugCardMode === "view" ? "pt-3" : "pt-1"}`}>
            <ModuleBugCard
              bug={bug}
              assigneeName={nameOf(bug.assigneeId)}
              reporterName={nameOf(bug.reporterId)}
              sprintName={sprintName}
              moduleName={moduleName}
              projectName={projectName}
              users={usersQuery.data ?? []}
              sprints={sprintsQuery.data ?? []}
              modules={modulesQuery.data ?? []}
              environments={environmentsQuery.data ?? []}
              canEdit={canEdit}
              canStatus={canStatus}
              canComment={canComment}
              canDelete={canDelete}
              compactHero
              requestedMode={bugCardMode}
              onModeChange={setBugCardMode}
            />
          </div>
        </div>
      )}
    </Shell>
  );
}
