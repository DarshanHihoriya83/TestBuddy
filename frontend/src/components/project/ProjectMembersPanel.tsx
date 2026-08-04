import { Link } from "react-router-dom";
import type { User } from "../../types";
import { MemberList, MemberPicker } from "../MemberPicker";
import { FlashAlert } from "../FlashAlert";

export function ProjectMembersPanel({
  members,
  addableUsers,
  currentUserId,
  canManage,
  showUsersLink,
  addUserId,
  onAddUserIdChange,
  onAdd,
  adding,
  onRemove,
  removing,
  loading,
  error,
  message,
  listError,
}: {
  members: User[];
  addableUsers: User[];
  currentUserId?: string;
  canManage: boolean;
  showUsersLink?: boolean;
  addUserId: string;
  onAddUserIdChange: (id: string) => void;
  onAdd: () => void;
  adding?: boolean;
  onRemove: (userId: string) => void;
  removing?: boolean;
  loading?: boolean;
  error?: string | null;
  message?: string | null;
  listError?: Error | null;
}) {
  return (
    <section className="tb-card p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-bold text-[var(--ink)]">
            Members
            <span className="ml-2 text-sm font-semibold text-[var(--muted)]">({members.length})</span>
          </h3>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Users assigned to this project.
          </p>
        </div>
        {showUsersLink ? (
          <Link to="/users" className="tb-link text-sm">
            Manage all users →
          </Link>
        ) : null}
      </div>

      <FlashAlert error={error} message={message} className="mt-3" />

      {canManage && (
        <div className="mt-4">
          <MemberPicker
            addableUsers={addableUsers}
            value={addUserId}
            onChange={onAddUserIdChange}
            onAdd={onAdd}
            busy={adding}
          />
        </div>
      )}

      {loading && <p className="mt-3 text-sm text-[var(--muted)]">Loading members…</p>}
      {listError && <p className="tb-alert-error mt-3">{listError.message}</p>}

      <MemberList
        members={members}
        currentUserId={currentUserId}
        canRemove={canManage}
        removing={removing}
        onRemove={(userId) => onRemove(userId)}
        emptyText={
          canManage ? "No members yet — add someone above." : "No members yet."
        }
      />
    </section>
  );
}
