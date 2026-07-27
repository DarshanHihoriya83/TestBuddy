import { useEffect, useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchMe, updateProfile } from "../api";
import { useAuth } from "../auth";
import { Shell } from "../components/Shell";

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
      if (newPassword || confirmPassword || currentPassword) {
        if (!currentPassword) throw new Error("Enter your current password to change it");
        if (newPassword.length < 8) throw new Error("New password must be at least 8 characters");
        if (newPassword !== confirmPassword) throw new Error("New passwords do not match");
      }

      const updated = await updateProfile({
        name: name.trim(),
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
            className="grid h-16 w-16 place-items-center rounded-2xl text-xl font-semibold text-white"
            style={{
              background: "linear-gradient(145deg, #0f6e56, #1a5f7a)",
            }}
            aria-hidden
          >
            {initials}
          </div>
          <div>
            <h2 className="text-2xl font-semibold tracking-tight">{profile?.name ?? "…"}</h2>
            <p className="text-sm text-[var(--muted)]">{profile?.email}</p>
          </div>
        </header>

        {meQuery.isLoading && (
          <p className="mb-4 text-sm text-[var(--muted)]">Loading profile…</p>
        )}
        {meQuery.error && (
          <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            {(meQuery.error as Error).message}
          </p>
        )}

        <form
          onSubmit={onSave}
          className="space-y-5 rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-6"
        >
          <label className="block text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
            Display name
            <input
              className="mt-2 w-full rounded-lg border border-[var(--line)] px-3 py-2 text-sm"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              minLength={2}
            />
          </label>

          <label className="block text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
            Email
            <input
              className="mt-2 w-full rounded-lg border border-[var(--line)] bg-slate-50 px-3 py-2 text-sm text-[var(--muted)]"
              value={profile?.email ?? ""}
              disabled
              readOnly
            />
          </label>

          <label className="block text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
            Role
            <input
              className="mt-2 w-full rounded-lg border border-[var(--line)] bg-slate-50 px-3 py-2 text-sm text-[var(--muted)]"
              value={profile?.role ?? ""}
              disabled
              readOnly
            />
          </label>

          <div className="border-t border-[var(--line)] pt-5">
            <h3 className="text-sm font-semibold">Change password</h3>
            <p className="mt-1 text-xs text-[var(--muted)]">
              Leave blank to keep your current password.
            </p>
            <div className="mt-4 space-y-4">
              <label className="block text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
                Current password
                <input
                  type="password"
                  className="mt-2 w-full rounded-lg border border-[var(--line)] px-3 py-2 text-sm"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  autoComplete="current-password"
                />
              </label>
              <label className="block text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
                New password
                <input
                  type="password"
                  className="mt-2 w-full rounded-lg border border-[var(--line)] px-3 py-2 text-sm"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  autoComplete="new-password"
                  minLength={8}
                />
              </label>
              <label className="block text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
                Confirm new password
                <input
                  type="password"
                  className="mt-2 w-full rounded-lg border border-[var(--line)] px-3 py-2 text-sm"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  autoComplete="new-password"
                  minLength={8}
                />
              </label>
            </div>
          </div>

          {error && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
          )}
          {message && (
            <p className="rounded-lg bg-[var(--accent-soft)] px-3 py-2 text-sm text-[var(--accent)]">
              {message}
            </p>
          )}

          <button
            type="submit"
            disabled={busy || !name.trim()}
            className="rounded-xl bg-[var(--accent)] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
          >
            {busy ? "Saving…" : "Save profile"}
          </button>
        </form>
      </div>
    </Shell>
  );
}
