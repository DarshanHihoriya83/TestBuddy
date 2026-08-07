import { useEffect, useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchMe, updateProfile } from "../../api";
import { FlashAlert } from "../FlashAlert";
import { QueryStatus } from "../QueryStatus";
import { FieldWithIcon, IconMail, IconShield, IconUser } from "../users/UserPasswordUi";
import type { User } from "../../types";
import { roleLabel } from "../../utils/roles";
import { validateName } from "../../utils/validation";
import { initialsOf, ROLE_CHIP_CLASS } from "./settingsTypes";

export function ProfileSettingsSection({
  token,
  user,
  updateUser,
}: {
  token: boolean;
  user: User | null;
  updateUser: (u: User) => void;
}) {
  const meQuery = useQuery({
    queryKey: ["me"],
    queryFn: fetchMe,
    enabled: token,
  });
  const [name, setName] = useState(user?.name ?? "");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!meQuery.data) return;
    setName(meQuery.data.name);
    updateUser(meQuery.data);
  }, [meQuery.data]); // eslint-disable-line react-hooks/exhaustive-deps -- sync once from server

  const profile = meQuery.data ?? user;
  const initials = initialsOf(profile?.name);
  const dirty = name.trim() !== (profile?.name ?? "").trim();
  const nameErr = name.trim() ? validateName(name) : null;

  async function onSave(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const err = validateName(name);
      if (err) throw new Error(err);
      const updated = await updateProfile({ name: name.trim() });
      updateUser(updated);
      setMessage("Profile saved");
      await meQuery.refetch();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <QueryStatus
        isLoading={meQuery.isLoading}
        error={meQuery.error}
        onRetry={() => void meQuery.refetch()}
        loadingText="Loading profile…"
      />

      <section className="tb-card overflow-hidden">
        <div className="tb-settings-hero">
          <div className="tb-settings-hero-avatar" aria-hidden>
            {initials}
          </div>
          <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--accent)]">
              Your account
            </p>
            <h2 className="truncate text-xl font-extrabold tracking-tight text-[var(--ink)]">
              {profile?.name ?? "…"}
            </h2>
            <p className="mt-0.5 truncate text-sm text-[var(--muted)]">{profile?.email}</p>
          </div>
          {profile?.role ? (
            <span className={`tb-role-chip ml-auto ${ROLE_CHIP_CLASS[profile.role]}`}>
              {roleLabel(profile.role)}
            </span>
          ) : null}
        </div>

        <form onSubmit={onSave} className="space-y-4 p-5">
          <FieldWithIcon
            label="Display name"
            required
            icon={<IconUser />}
            hint="Shown across the dashboard"
            error={nameErr}
          >
            <input
              className={`tb-input ${nameErr ? "tb-input-invalid" : ""}`}
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              minLength={2}
              autoComplete="name"
            />
          </FieldWithIcon>

          <div className="grid gap-4 sm:grid-cols-2">
            <FieldWithIcon label="Email" icon={<IconMail />} hint="Cannot be changed here">
              <input
                className="tb-input bg-[var(--bg0)] text-[var(--muted)]"
                value={profile?.email ?? ""}
                disabled
                readOnly
              />
            </FieldWithIcon>
            <FieldWithIcon
              label="Designation"
              icon={<IconShield />}
              hint="Assigned by an administrator"
            >
              <input
                className="tb-input bg-[var(--bg0)] text-[var(--muted)]"
                value={profile?.role ? roleLabel(profile.role) : ""}
                disabled
                readOnly
              />
            </FieldWithIcon>
          </div>

          <FlashAlert error={error} message={message} className="" />

          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-[var(--line)] pt-4">
            <button
              type="button"
              className="tb-btn-ghost text-sm"
              disabled={busy || !dirty}
              onClick={() => {
                setName(profile?.name ?? "");
                setError(null);
                setMessage(null);
              }}
            >
              Reset
            </button>
            <button
              type="submit"
              disabled={busy || !dirty || !!nameErr || !name.trim()}
              className="tb-btn-primary text-sm"
            >
              {busy ? "Saving…" : "Save changes"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
