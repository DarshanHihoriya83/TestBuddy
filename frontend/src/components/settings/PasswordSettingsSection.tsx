import { useMemo, useState, type FormEvent } from "react";
import { updateProfile } from "../../api";
import { useAuth } from "../../auth";
import { FlashAlert } from "../FlashAlert";
import {
  IconLock,
  IconRefresh,
  PasswordField,
  PasswordStrengthMeter,
} from "../users/UserPasswordUi";
import type { User } from "../../types";
import { validatePasswordStrength, validateRequiredPasswordChange } from "../../utils/validation";
import { SettingsSectionCard } from "./SettingsSectionCard";

export function PasswordSettingsSection({
  user,
  updateUser,
}: {
  user: User | null;
  updateUser: (u: User) => void;
}) {
  const { setSession } = useAuth();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const context = useMemo(
    () => ({ name: user?.name, email: user?.email }),
    [user?.name, user?.email],
  );
  const strengthError = newPassword ? validatePasswordStrength(newPassword, context) : null;
  const mismatch = confirmPassword.length > 0 && newPassword !== confirmPassword;

  async function onSave(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const passwordErr = validateRequiredPasswordChange(
        currentPassword,
        newPassword,
        confirmPassword,
        context,
      );
      if (passwordErr) throw new Error(passwordErr);
      const updated = await updateProfile({
        name: user?.name?.trim() || "User",
        currentPassword,
        newPassword,
      });
      // Old tokens are revoked on password change — adopt the reissued one.
      if (updated.token) setSession(updated.token, updated);
      else updateUser(updated);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setMessage("Password updated — other sessions have been signed out");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Update failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <SettingsSectionCard
      title="Change password"
      description="Enter your current password, then choose a new one that meets the policy below. Updating signs out every other session."
    >
      <form onSubmit={onSave} noValidate className="mx-auto max-w-xl space-y-4">
        <PasswordField
          label="Current password"
          required
          icon={<IconLock />}
          value={currentPassword}
          onChange={setCurrentPassword}
          autoComplete="current-password"
        />
        <PasswordField
          label="New password"
          required
          icon={<IconRefresh />}
          value={newPassword}
          onChange={setNewPassword}
          autoComplete="new-password"
          error={strengthError}
        />
        <PasswordField
          label="Confirm new password"
          required
          icon={<IconRefresh />}
          value={confirmPassword}
          onChange={setConfirmPassword}
          autoComplete="new-password"
          error={mismatch ? "New passwords do not match" : null}
        />
        <PasswordStrengthMeter password={newPassword} context={context} />
        <FlashAlert error={error} message={message} className="" />
        <div className="flex justify-end border-t border-[var(--line)] pt-4">
          <button
            type="submit"
            disabled={busy || !currentPassword || !!strengthError || mismatch || !confirmPassword}
            className="tb-btn-primary text-sm"
          >
            {busy ? "Updating…" : "Update password"}
          </button>
        </div>
      </form>
    </SettingsSectionCard>
  );
}
