import { useEffect, useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchMe, updateProfile } from "../api";
import { useAuth } from "../auth";
import { Shell } from "../components/Shell";
import { validateName, validatePasswordChange } from "../utils/validation";
export function ProfilePage() {
  const { user, updateUser, token } = useAuth();
  const meQuery = useQuery({
    queryKey: ["me"],
    queryFn: fetchMe,
    enabled: !!token,
  });

  const [name, setName] = useState(user?.name ?? "");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!meQuery.data) return;
    setName(meQuery.data.name);
    updateUser(meQuery.data);
  }, [meQuery.data]); // sync once when server profile loads


  const profile = meQuery.data ?? user;

  async function onSave(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const nameErr = validateName(name);
      if (nameErr) throw new Error(nameErr);

      const passwordErr = validatePasswordChange(currentPassword, newPassword, confirmPassword);
      if (passwordErr) throw new Error(passwordErr);

      const updated = await updateProfile({        name: name.trim(),
        ...(newPassword
          ? { currentPassword, newPassword }
          : {}),
      });
      updateUser(updated);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setMessage("Profile saved");
      await meQuery.refetch();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  const initials =
    profile?.name
      ?.split(/\s+/)
      .map((p) => p[0])
      .join("")
      .slice(0, 2)
      .toUpperCase() || "?";

  return (
    <Shell title="Profile">
      <div className="mx-auto max-w-2xl">
        <header className="mb-6 flex items-center gap-4">
          <div
            className="grid h-16 w-16 place-items-center rounded-2xl bg-[var(--accent)] text-xl font-semibold text-white"
            aria-hidden
          >
            {initials}
          </div>
          <div>
            <h2 className="text-2xl font-bold tracking-tight text-[var(--ink)]">{profile?.name ?? "…"}</h2>
            <p className="text-sm text-[var(--muted)]">{profile?.email}</p>
          </div>
        </header>

        {meQuery.isLoading && (
          <p className="mb-4 text-sm text-[var(--muted)]">Loading profile…</p>
        )}
        {meQuery.error && (
          <p className="tb-alert-error mb-4">{(meQuery.error as Error).message}</p>
        )}

        <form onSubmit={onSave} className="tb-card tb-card-accent space-y-5 p-6">
          <label className="tb-label">
            Display name
            <input className="tb-input" value={name} onChange={(e) => setName(e.target.value)} required minLength={2} />
          </label>

          <label className="tb-label">
            Email
            <input className="tb-input bg-[var(--bg0)] text-[var(--muted)]" value={profile?.email ?? ""} disabled readOnly />
          </label>

          <label className="tb-label">
            Role
            <input className="tb-input bg-[var(--bg0)] text-[var(--muted)]" value={profile?.role ?? ""} disabled readOnly />
          </label>

          <div className="border-t border-[var(--line)] pt-5">
            <h3 className="text-sm font-bold text-[var(--ink)]">Change password</h3>
            <p className="mt-1 text-xs text-[var(--muted)]">
              Leave blank to keep your current password.
            </p>
            <div className="mt-4 space-y-4">
              <label className="tb-label">
                Current password
                <input
                  type="password"
                  className="tb-input"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  autoComplete="current-password"
                />
              </label>
              <label className="tb-label">
                New password
                <input
                  type="password"
                  className="tb-input"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  autoComplete="new-password"
                  minLength={8}
                />
              </label>
              <label className="tb-label">
                Confirm new password
                <input
                  type="password"
                  className="tb-input"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  autoComplete="new-password"
                  minLength={8}
                />
              </label>
            </div>
          </div>

          {error && <p className="tb-alert-error">{error}</p>}
          {message && <p className="tb-alert-success">{message}</p>}

          <button type="submit" disabled={busy || !name.trim()} className="tb-btn-primary">
            {busy ? "Saving…" : "Save profile"}
          </button>
        </form>
      </div>
    </Shell>
  );
}
