import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  addProjectMember,
  fetchProjectMembers,
  fetchProjects,
  fetchUsers,
  removeProjectMember,
} from "../../api";
import { useAuth } from "../../auth";
import { ProjectMembersPanel } from "../project/ProjectMembersPanel";
import { QueryStatus } from "../QueryStatus";
import { queryKeys } from "../../queryKeys";
import { addableMemberUsers, canTransferRoles } from "../../utils/roles";

export function MembersSettingsSection({
  canManage,
  currentUserId,
}: {
  canManage: boolean;
  currentUserId?: string;
}) {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [addUserId, setAddUserId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const projectsQuery = useQuery({
    queryKey: queryKeys.projects(),
    queryFn: () => fetchProjects(),
  });

  const projects = useMemo(() => projectsQuery.data ?? [], [projectsQuery.data]);

  useEffect(() => {
    if (!selectedProjectId && projects[0]) setSelectedProjectId(projects[0].id);
  }, [projects, selectedProjectId]);

  const membersQuery = useQuery({
    queryKey: queryKeys.projectMembers(selectedProjectId || "_"),
    queryFn: () => fetchProjectMembers(selectedProjectId),
    enabled: !!selectedProjectId,
  });

  const usersQuery = useQuery({
    queryKey: queryKeys.users(),
    queryFn: () => fetchUsers(),
    enabled: canManage,
  });

  const members = membersQuery.data ?? [];
  const memberIds = new Set(members.map((m) => m.id));
  const addableUsers = addableMemberUsers(user, usersQuery.data ?? []).filter(
    (u) => !memberIds.has(u.id),
  );

  const addMutation = useMutation({
    mutationFn: (userId: string) => addProjectMember(selectedProjectId, userId),
    onSuccess: async () => {
      setAddUserId("");
      setMessage("Member added");
      setError(null);
      await queryClient.invalidateQueries({ queryKey: ["project-members"] });
      await queryClient.invalidateQueries({ queryKey: ["projects"] });
      await queryClient.invalidateQueries({ queryKey: ["users-admin"] });
    },
    onError: (err: Error) => {
      setError(err.message);
      setMessage(null);
    },
  });

  const removeMutation = useMutation({
    mutationFn: (userId: string) => removeProjectMember(selectedProjectId, userId),
    onSuccess: async () => {
      setMessage("Member removed");
      setError(null);
      await queryClient.invalidateQueries({ queryKey: ["project-members"] });
      await queryClient.invalidateQueries({ queryKey: ["projects"] });
      await queryClient.invalidateQueries({ queryKey: ["users-admin"] });
    },
    onError: (err: Error) => {
      setError(err.message);
      setMessage(null);
    },
  });

  const selectedProject = projects.find((p) => p.id === selectedProjectId);

  return (
    <div className="space-y-4">
      <QueryStatus
        isLoading={projectsQuery.isLoading}
        error={projectsQuery.error}
        onRetry={() => void projectsQuery.refetch()}
        loadingText="Loading projects…"
      />

      {!projectsQuery.isLoading && projects.length === 0 && (
        <div className="tb-card border-dashed p-10 text-center">
          <p className="text-lg font-semibold text-[var(--ink)]">No projects yet</p>
          <p className="mt-2 text-sm text-[var(--muted)]">
            Ask a Manager to assign you, or create one if your role allows.
          </p>
        </div>
      )}

      {projects.length > 0 && (
        <div className="tb-settings-members">
          <aside className="tb-card flex min-h-0 flex-col overflow-hidden">
            <div className="shrink-0 border-b border-[var(--line)] px-4 py-3">
              <h2 className="text-sm font-bold text-[var(--ink)]">Projects</h2>
              <p className="text-xs text-[var(--muted)]">
                Select a project to {canManage ? "manage" : "view"} its members
              </p>
            </div>
            <ul className="tb-settings-project-list min-h-0 flex-1 overflow-y-auto">
              {projects.map((p) => {
                const active = selectedProjectId === p.id;
                return (
                  <li key={p.id}>
                    <button
                      type="button"
                      className={`tb-settings-project-row ${active ? "is-active" : ""}`}
                      onClick={() => {
                        setSelectedProjectId(p.id);
                        setAddUserId("");
                        setError(null);
                        setMessage(null);
                      }}
                    >
                      <span className="min-w-0 flex-1 truncate font-semibold">{p.name}</span>
                      <Link
                        to={`/projects/${p.id}`}
                        className="shrink-0 text-xs font-semibold text-[var(--accent)] hover:underline"
                        onClick={(e) => e.stopPropagation()}
                      >
                        Open
                      </Link>
                    </button>
                  </li>
                );
              })}
            </ul>
          </aside>

          <div className="min-w-0">
            {selectedProjectId && selectedProject ? (
              <ProjectMembersPanel
                members={members}
                addableUsers={addableUsers}
                currentUserId={currentUserId}
                canManage={canManage}
                showUsersLink={canTransferRoles(user)}
                addUserId={addUserId}
                onAddUserIdChange={setAddUserId}
                onAdd={() => addMutation.mutate(addUserId)}
                adding={addMutation.isPending}
                onRemove={(userId) => removeMutation.mutate(userId)}
                removing={removeMutation.isPending}
                loading={membersQuery.isLoading}
                error={error}
                message={message}
                listError={membersQuery.error as Error | null}
              />
            ) : (
              <div className="tb-card grid place-items-center p-10 text-sm text-[var(--muted)]">
                Select a project to see its members.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
