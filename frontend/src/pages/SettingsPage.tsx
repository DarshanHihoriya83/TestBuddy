import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../auth";
import { PageHeader } from "../components/PageHeader";
import {
  MembersSettingsSection,
  PasswordSettingsSection,
  ProfileSettingsSection,
  ResetPasswordSettingsSection,
  SettingsNav,
  type SettingsNavItem,
  type SettingsSectionId,
} from "../components/settings";
import { Shell } from "../components/Shell";
import { canManageProjectMembers, canTransferRoles, isSuperAdmin } from "../utils/roles";

/**
 * Settings shell — picks which account tabs to show, then mounts one section.
 * SuperAdmin: Profile + Password only (members/reset live on project/Users pages).
 */
export function SettingsPage() {
  const { user, updateUser, token } = useAuth();
  const superAdmin = isSuperAdmin(user);
  // Managers keep Settings members + reset; SuperAdmin uses project pages / Manage Users.
  const showMembersTab = !superAdmin;
  const showResetTab = canTransferRoles(user) && !superAdmin;
  const canMembers = canManageProjectMembers(user);

  const [section, setSection] = useState<SettingsSectionId>("profile");

  const sections = useMemo((): SettingsNavItem[] => {
    const items: SettingsNavItem[] = [
      { id: "profile", label: "Profile", hint: "Name & account" },
      { id: "password", label: "Password", hint: "Update credentials" },
    ];
    if (showMembersTab) {
      items.push({ id: "members", label: "Members", hint: "Project access" });
    }
    if (showResetTab) {
      items.push({ id: "reset", label: "Reset password", hint: "Temporary passwords" });
    }
    return items;
  }, [showMembersTab, showResetTab]);

  useEffect(() => {
    if ((section === "reset" && !showResetTab) || (section === "members" && !showMembersTab)) {
      setSection("profile");
    }
  }, [section, showMembersTab, showResetTab]);

  const description = superAdmin
    ? "Manage your profile and password."
    : showResetTab
      ? "Manage your account, project members, and team passwords."
      : "Manage your account and project members.";

  return (
    <Shell title="Settings">
      <div className="space-y-4 pb-4">
        <PageHeader description={description} />

        <div className="tb-settings-layout">
          <SettingsNav items={sections} active={section} onChange={setSection} />

          <div className="min-w-0 flex-1">
            {section === "profile" && (
              <ProfileSettingsSection token={!!token} updateUser={updateUser} user={user} />
            )}
            {section === "password" && (
              <PasswordSettingsSection updateUser={updateUser} user={user} />
            )}
            {section === "members" && showMembersTab && (
              <MembersSettingsSection canManage={canMembers} currentUserId={user?.id} />
            )}
            {section === "reset" && showResetTab && <ResetPasswordSettingsSection me={user} />}
          </div>
        </div>
      </div>
    </Shell>
  );
}
