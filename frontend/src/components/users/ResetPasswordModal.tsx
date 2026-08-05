import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { adminResetPassword } from "../../api";
import { FlashAlert } from "../FlashAlert";
import { ModalShell } from "../ModalShell";
import type { User } from "../../types";
import { roleLabel } from "../../utils/roles";
import { IconClose, IconKey, TemporaryPasswordPanel } from "./UserPasswordUi";

const CONSEQUENCES = [
  "A new temporary password is generated and shown once.",
  "The user must set their own password at next login before using the app or extension.",
  "Every existing session for this user is signed out immediately.",
];

export function ResetPasswordModal({
  user,
  onClose,
  onReset,
}: {
  user: User | null;
  onClose: () => void;
  onReset?: (user: User) => void;
}) {
  const [temporaryPassword, setTemporaryPassword] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setTemporaryPassword(null);
    setError(null);
  }, [user?.id]);

  const mutation = useMutation({
    mutationFn: adminResetPassword,
    onSuccess: (result) => {
      setTemporaryPassword(result.temporaryPassword);
      setError(null);
      onReset?.(result);
    },
    onError: (err: Error) => {
      setError(err.message);
      setTemporaryPassword(null);
    },
  });

  if (!user) return null;

  function close() {
    if (mutation.isPending) return;
    onClose();
  }

  return (
    <ModalShell
      open
      onClose={close}
      labelledBy="reset-password-title"
      dismissible={!mutation.isPending}
    >
      <div className="tb-dialog-header">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-amber-100 text-amber-700 ring-1 ring-amber-200">
              <IconKey />
            </span>
            <div className="min-w-0">
              <h2 id="reset-password-title" className="text-lg font-bold text-[var(--ink)]">
                Reset password
              </h2>
              <p className="mt-0.5 truncate text-sm text-[var(--muted)]">
                {user.name} · {user.email} · {roleLabel(user.role)}
              </p>
            </div>
          </div>
          <button
            type="button"
            className="tb-btn-icon h-9 w-9 shrink-0"
            aria-label="Close"
            onClick={close}
          >
            <IconClose />
          </button>
        </div>
      </div>

      <div className="space-y-4 px-6 py-5">
        {temporaryPassword ? (
          <TemporaryPasswordPanel
            password={temporaryPassword}
            userLabel={`${user.name} · share once`}
            copyLabel="Temporary password copied"
          />
        ) : (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
            <p className="text-sm font-bold text-amber-900">What happens next</p>
            <ul className="mt-2 space-y-1.5">
              {CONSEQUENCES.map((line) => (
                <li key={line} className="flex gap-2 text-sm leading-relaxed text-amber-900/90">
                  <span aria-hidden>•</span>
                  <span>{line}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <FlashAlert error={error} message={null} className="" />
      </div>

      <div className="tb-dialog-footer">
        {temporaryPassword ? (
          <button type="button" className="tb-btn-primary text-sm" onClick={close}>
            Done
          </button>
        ) : (
          <>
            <button
              type="button"
              className="tb-btn-ghost text-sm"
              onClick={close}
              disabled={mutation.isPending}
            >
              Cancel
            </button>
            <button
              type="button"
              className="tb-btn-primary text-sm"
              disabled={mutation.isPending}
              onClick={() => mutation.mutate(user.id)}
            >
              {mutation.isPending ? "Generating…" : "Generate temporary password"}
            </button>
          </>
        )}
      </div>
    </ModalShell>
  );
}
