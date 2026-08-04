import bcrypt from "bcryptjs";
import { randomUUID } from "crypto";
import { query, withTransaction } from "../db.js";
import {
  badRequest,
  conflict,
  forbidden,
  notFound,
  unauthorized,
} from "../errors.js";
import { generateToken } from "./jwt.js";
import { config } from "../config.js";
import {
  canAssignRole,
  canCommentOnBug,
  canCreateBug,
  canCreateOrganization,
  canCreateProject,
  canDeleteBug,
  canFullEditBug,
  canManageModules,
  canManageOrgMembers,
  canManageRole,
  canUpdateBugStatus,
  isManager,
  isSuperAdmin,
  normalizeRole,
} from "../roles.js";
import {
  deleteScreenshotFile,
  saveScreenshotFile,
  readScreenshotFile,
} from "./screenshotStorage.js";

const BCRYPT_ROUNDS = 12;
const MIN_PASSWORD_LEN = 8;

function blankToNull(value) {
  if (value == null || String(value).trim() === "") return null;
  return String(value).trim();
}

/** Letters + spaces only, 2–100 chars. Returns normalized name. */
function assertAlphabeticalName(raw, label) {
  if (raw == null || String(raw).trim().length < 2) {
    throw badRequest(`${label} must be at least 2 characters`);
  }
  const name = String(raw).trim().replace(/\s+/g, " ");
  if (name.length > 100) {
    throw badRequest(`${label} must be at most 100 characters`);
  }
  if (!/^[A-Za-z]+(?: [A-Za-z]+)*$/.test(name)) {
    throw badRequest(`${label} accepts only alphabetical characters (letters and spaces)`);
  }
  return name;
}

function assertPassword(password) {
  if (password == null || String(password).length < MIN_PASSWORD_LEN) {
    throw badRequest(`Password must be at least ${MIN_PASSWORD_LEN} characters`);
  }
}

function toUserDto(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    active: user.active !== false,
  };
}

function toProjectDto(project) {
  return {
    id: project.id,
    name: project.name,
    description: project.description ?? null,
    organizationId: project.organization_id ?? project.organizationId ?? null,
    jiraProjectKey: project.jira_project_key ?? project.jiraProjectKey ?? null,
    adoOrgUrl: project.ado_org_url ?? project.adoOrgUrl ?? null,
    adoProject: project.ado_project ?? project.adoProject ?? null,
    createdBy: project.created_by ?? project.createdBy ?? null,
  };
}

function toOrganizationDto(org) {
  return {
    id: org.id,
    name: org.name,
    createdAt: org.created_at ?? org.createdAt ?? null,
  };
}

function toModuleDto(mod) {
  return {
    id: mod.id,
    projectId: mod.project_id,
    name: mod.name,
    description: mod.description ?? null,
    createdAt: mod.created_at,
  };
}

function toCommentDto(row) {
  return {
    id: row.id,
    bugId: row.bug_id,
    authorId: row.author_id,
    authorName: row.author_name ?? null,
    body: row.body,
    createdAt: row.created_at,
  };
}

function toStepDto(step) {
  return {
    order: step.step_order,
    actionType: step.action_type,
    elementLabel: step.element_label,
    selector: step.selector,
    valueEntered: step.value_entered,
    pageUrl: step.page_url,
    description: step.description,
    actualResult: step.actual_result ?? null,
    expectedResult: step.expected_result ?? null,
    screenshotId: step.screenshot_id,
  };
}

function toBugDto(bug, steps, screenshots = []) {
  return {
    id: bug.id,
    title: bug.title,
    description: bug.description,
    priority: bug.priority,
    severity: bug.severity,
    assigneeId: bug.assignee_id,
    reporterId: bug.reporter_id,
    cycleId: bug.cycle_id,
    projectId: bug.project_id,
    moduleId: bug.module_id ?? null,
    status: bug.status,
    steps: steps.map(toStepDto),
    screenshots: screenshots.map(toScreenshotDto),
    externalRefs: {
      jiraIssueKey: bug.jira_issue_key,
      adoWorkItemId: bug.ado_work_item_id,
    },
    createdAt: bug.created_at,
    updatedAt: bug.updated_at,
  };
}

function toScreenshotDto(row) {
  return {
    id: row.id,
    overview: row.overview ?? "",
    pageUrl: row.page_url ?? "",
    url: `/api/screenshots/${row.id}`,
    contentType: row.content_type,
    annotations: row.annotations ?? [],
    createdAt: row.created_at,
  };
}

async function loadSteps(bugId, client = null) {
  const q = client ? client.query.bind(client) : query;
  const { rows } = await q(
    `SELECT * FROM bug_steps WHERE bug_id = $1 ORDER BY step_order ASC`,
    [bugId],
  );
  return rows;
}

async function loadScreenshots(bugId, client = null) {
  const q = client ? client.query.bind(client) : query;
  const { rows } = await q(
    `SELECT * FROM screenshots WHERE bug_id = $1 ORDER BY created_at ASC`,
    [bugId],
  );
  return rows;
}

async function hydrateBug(bug, client = null) {
  const [steps, screenshots] = await Promise.all([
    loadSteps(bug.id, client),
    loadScreenshots(bug.id, client),
  ]);
  return toBugDto(bug, steps, screenshots);
}

async function requireOrganization(id) {
  const { rows } = await query(`SELECT * FROM organizations WHERE id = $1`, [id]);
  if (!rows[0]) throw notFound("Organization not found");
  return rows[0];
}

async function isOrgMember(organizationId, userId) {
  const { rowCount } = await query(
    `SELECT 1 FROM organization_members WHERE organization_id = $1 AND user_id = $2`,
    [organizationId, userId],
  );
  return rowCount > 0;
}

async function isProjectMember(projectId, userId) {
  const { rowCount } = await query(
    `SELECT 1 FROM project_members WHERE project_id = $1 AND user_id = $2`,
    [projectId, userId],
  );
  return rowCount > 0;
}

async function assertCanViewOrg(actor, organizationId) {
  if (isSuperAdmin(actor)) return;
  if (!(await isOrgMember(organizationId, actor.id))) {
    throw forbidden("You are not a member of this organization");
  }
}

/** Manager: all projects in orgs they belong to. Developer/Tester: project_members only. */
async function canAccessProject(actor, project) {
  if (isSuperAdmin(actor)) return true;
  if (canCreateProject(actor)) {
    return isOrgMember(project.organization_id, actor.id);
  }
  return isProjectMember(project.id, actor.id);
}

const PROJECT_VISIBILITY_WHERE = `
  (
    EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = $1 AND u.role = 'MANAGER'
    )
    AND EXISTS (
      SELECT 1 FROM organization_members om
      WHERE om.organization_id = p.organization_id AND om.user_id = $1
    )
  )
  OR EXISTS (
    SELECT 1 FROM project_members pm
    WHERE pm.project_id = p.id AND pm.user_id = $1
  )`;

async function assertCanAccessProject(actor, projectId) {
  if (isSuperAdmin(actor)) return;
  const project = await requireProject(projectId);
  if (!(await canAccessProject(actor, project))) {
    throw forbidden("You do not have access to this project");
  }
}

/** Manager/SuperAdmin + org membership required to edit/delete a project. */
async function assertCanManageProject(actor, projectId) {
  if (!canCreateProject(actor)) {
    throw forbidden("Only Manager or SuperAdmin can manage projects");
  }
  if (isSuperAdmin(actor)) return;
  const project = await requireProject(projectId);
  if (!(await isOrgMember(project.organization_id, actor.id))) {
    throw forbidden("You must be a member of the organization to manage this project");
  }
}

async function listAccessibleProjectIds(actor) {
  if (isSuperAdmin(actor)) {
    const { rows } = await query(`SELECT id FROM projects`);
    return rows.map((r) => r.id);
  }
  const { rows } = await query(
    `SELECT DISTINCT p.id FROM projects p
     WHERE ${PROJECT_VISIBILITY_WHERE}`,
    [actor.id],
  );
  return rows.map((r) => r.id);
}

async function assertCanAccessBug(actor, bugId) {
  const bug = await requireBug(bugId);
  await assertCanAccessProject(actor, bug.project_id);
  return bug;
}

async function requireModule(id) {
  const { rows } = await query(`SELECT * FROM modules WHERE id = $1`, [id]);
  if (!rows[0]) throw notFound("Module not found");
  return rows[0];
}

async function validateModuleForProject(moduleId, projectId) {
  if (!moduleId) return null;
  const mod = await requireModule(moduleId);
  if (String(mod.project_id) !== String(projectId)) {
    throw badRequest("moduleId does not belong to projectId");
  }
  return mod;
}

async function requireProject(id) {
  const { rows } = await query(`SELECT * FROM projects WHERE id = $1`, [id]);
  if (!rows[0]) throw notFound("Project not found");
  return rows[0];
}

async function requireBug(id) {
  const { rows } = await query(`SELECT * FROM bugs WHERE id = $1`, [id]);
  if (!rows[0]) throw notFound("Bug not found");
  return rows[0];
}

async function validateRefs(projectId, cycleId, assigneeId) {
  const project = await query(`SELECT 1 FROM projects WHERE id = $1`, [projectId]);
  if (!project.rowCount) throw badRequest("Unknown projectId");

  const cycle = await query(`SELECT * FROM cycles WHERE id = $1`, [cycleId]);
  if (!cycle.rows[0]) throw badRequest("Unknown cycleId");
  if (String(cycle.rows[0].project_id) !== String(projectId)) {
    throw badRequest("cycleId does not belong to projectId");
  }

  const user = await query(
    `SELECT 1 FROM users WHERE id = $1 AND active = true`,
    [assigneeId],
  );
  if (!user.rowCount) throw badRequest("Unknown or inactive assigneeId");
}

async function replaceSteps(client, bugId, steps) {
  await client.query(`DELETE FROM bug_steps WHERE bug_id = $1`, [bugId]);
  if (!steps?.length) return;
  for (const step of steps) {
    await client.query(
      `INSERT INTO bug_steps (
        id, bug_id, step_order, action_type, element_label, selector,
        value_entered, page_url, description, actual_result, expected_result, screenshot_id
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
      [
        randomUUID(),
        bugId,
        step.order,
        step.actionType,
        step.elementLabel,
        step.selector ?? "",
        step.valueEntered ?? null,
        step.pageUrl ?? "",
        step.description,
        step.actualResult ?? null,
        // Expected only when provided (defect step); blank for other steps
        step.expectedResult?.trim() ? step.expectedResult.trim() : null,
        step.screenshotId ?? null,
      ],
    );
  }
}

export async function login({ email, password }) {
  const { rows } = await query(
    `SELECT id, name, email, password_hash AS "passwordHash", role, active
     FROM users WHERE LOWER(email) = LOWER($1)`,
    [email],
  );
  const user = rows[0];
  // Constant-ish failure message — don't reveal which part failed
  if (!user || !(await bcrypt.compare(password || "", user.passwordHash))) {
    throw unauthorized("Invalid credentials");
  }
  if (user.active === false) {
    throw forbidden("This account has been deactivated. Contact an administrator.");
  }
  return {
    token: generateToken(user.id, user.email),
    user: toUserDto(user),
  };
}

export async function register({ name, email, password, role: _ignoredRole }) {
  if (!name?.trim() || name.trim().length < 2) {
    throw badRequest("Name must be at least 2 characters");
  }
  assertPassword(password);
  const normalized = email.trim().toLowerCase();
  if (!normalized.includes("@")) throw badRequest("Valid email is required");

  // Public signup is always TESTER — ignore any role from the client
  const assigned = "TESTER";

  const existing = await query(
    `SELECT 1 FROM users WHERE LOWER(email) = LOWER($1)`,
    [normalized],
  );
  if (existing.rowCount) {
    throw conflict("An account with this email already exists");
  }
  const id = randomUUID();
  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
  const { rows } = await query(
    `INSERT INTO users (id, name, email, password_hash, role, active)
     VALUES ($1, $2, $3, $4, $5, true)
     RETURNING id, name, email, role, active`,
    [id, name.trim(), normalized, passwordHash, assigned],
  );
  const user = rows[0];

  // Auto-enroll only into Demo Organization (never fall back to another tenant)
  await enrollNewUserInDemo(id);

  return {
    token: generateToken(user.id, user.email),
    user: toUserDto(user),
  };
}

async function enrollNewUserInDemo(userId) {
  const named = await query(
    `SELECT id FROM organizations WHERE name = 'Demo Organization' ORDER BY created_at ASC LIMIT 1`,
  );
  const orgId = named.rows[0]?.id;
  if (!orgId) return;

  await query(
    `INSERT INTO organization_members (organization_id, user_id, created_at)
     VALUES ($1, $2, NOW()) ON CONFLICT DO NOTHING`,
    [orgId, userId],
  );

  const { rows: projects } = await query(
    `SELECT id FROM projects WHERE organization_id = $1 ORDER BY name ASC LIMIT 1`,
    [orgId],
  );
  if (!projects[0]) return;
  await query(
    `INSERT INTO project_members (project_id, user_id, created_at)
     VALUES ($1, $2, NOW()) ON CONFLICT DO NOTHING`,
    [projects[0].id, userId],
  );
}

export function currentUser(user) {
  return toUserDto(user);
}

export async function updateProfile(current, { name, currentPassword, newPassword }) {
  if (!name?.trim() || name.trim().length < 2) {
    throw badRequest("Name must be at least 2 characters");
  }
  let passwordHash = current.passwordHash;
  const changingPassword = newPassword != null && String(newPassword).trim() !== "";
  if (changingPassword) {
    if (currentPassword == null || String(currentPassword).trim() === "") {
      throw badRequest("Current password is required");
    }
    if (!(await bcrypt.compare(currentPassword, current.passwordHash))) {
      throw badRequest("Current password is incorrect");
    }
    assertPassword(newPassword);
    passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
  }
  const { rows } = await query(
    `UPDATE users SET name = $1, password_hash = $2 WHERE id = $3
     RETURNING id, name, email, role, active`,
    [name.trim(), passwordHash, current.id],
  );
  return toUserDto(rows[0]);
}

const USER_ROLE_ORDER = `
  CASE role
    WHEN 'SUPERADMIN' THEN 0
    WHEN 'MANAGER' THEN 1
    WHEN 'DEVELOPER' THEN 2
    WHEN 'TESTER' THEN 3
    ELSE 4
  END`;

export async function listUsers(actor, { projectId, directory = false } = {}) {
  if (projectId) {
    await assertCanAccessProject(actor, projectId);
    const { rows } = await query(
      `SELECT u.id, u.name, u.email, u.role, u.active
       FROM users u
       INNER JOIN project_members pm ON pm.user_id = u.id
       WHERE pm.project_id = $1
       ORDER BY
         CASE u.role
           WHEN 'SUPERADMIN' THEN 0
           WHEN 'MANAGER' THEN 1
           WHEN 'DEVELOPER' THEN 2
           WHEN 'TESTER' THEN 3
           ELSE 4
         END,
         u.name`,
      [projectId],
    );
    return rows.map(toUserDto);
  }

  // Full directory only for role-transfer callers (SuperAdmin/Manager)
  if (directory || isSuperAdmin(actor)) {
    const { rows } = await query(
      `SELECT id, name, email, role, active FROM users ORDER BY ${USER_ROLE_ORDER}, name`,
    );
    return rows.map(toUserDto);
  }

  // Assignees / pickers: only users sharing an org or project with the actor
  const { rows } = await query(
    `SELECT u.id, u.name, u.email, u.role, u.active
     FROM users u
     WHERE u.id = $1
        OR u.id IN (
          SELECT om2.user_id
          FROM organization_members om1
          JOIN organization_members om2 ON om2.organization_id = om1.organization_id
          WHERE om1.user_id = $1
        )
        OR u.id IN (
          SELECT pm2.user_id
          FROM project_members pm1
          JOIN project_members pm2 ON pm2.project_id = pm1.project_id
          WHERE pm1.user_id = $1
        )
     ORDER BY
       CASE u.role
         WHEN 'SUPERADMIN' THEN 0
         WHEN 'MANAGER' THEN 1
         WHEN 'DEVELOPER' THEN 2
         WHEN 'TESTER' THEN 3
         ELSE 4
       END,
       u.name`,
    [actor.id],
  );
  return rows.map(toUserDto);
}

export async function listProjectMembers(actor, projectId) {
  await assertCanAccessProject(actor, projectId);
  const { rows } = await query(
    `SELECT u.id, u.name, u.email, u.role, u.active, pm.created_at AS "joinedAt"
     FROM project_members pm
     JOIN users u ON u.id = pm.user_id
     WHERE pm.project_id = $1
     ORDER BY u.name`,
    [projectId],
  );
  return rows.map((r) => ({
    ...toUserDto(r),
    joinedAt: r.joinedAt,
  }));
}

export async function addProjectMember(actor, projectId, userId, { requireManage = false } = {}) {
  if (requireManage) {
    await assertCanManageProject(actor, projectId);
  } else {
    await assertCanAccessProject(actor, projectId);
  }
  const project = await requireProject(projectId);
  const user = await query(
    `SELECT id, name, email, role, active FROM users WHERE id = $1`,
    [userId],
  );
  if (!user.rows[0]) throw notFound("User not found");
  if (user.rows[0].active === false) throw badRequest("Cannot add an inactive user");
  if (!(await isOrgMember(project.organization_id, userId))) {
    throw badRequest("User must belong to the organization before being added to a project");
  }

  await query(
    `INSERT INTO project_members (project_id, user_id, created_at)
     VALUES ($1, $2, NOW())
     ON CONFLICT (project_id, user_id) DO NOTHING`,
    [projectId, userId],
  );
  return toUserDto(user.rows[0]);
}

export async function removeProjectMember(actor, projectId, userId) {
  await assertCanManageProject(actor, projectId);
  const result = await query(
    `DELETE FROM project_members WHERE project_id = $1 AND user_id = $2`,
    [projectId, userId],
  );
  if (!result.rowCount) throw notFound("User is not a member of this project");
  return { ok: true };
}

/** Projects a user belongs to (for admin user view). */
export async function listUserProjects(userId) {
  const { rows } = await query(
    `SELECT p.id, p.name, p.jira_project_key, p.ado_org_url, p.ado_project
     FROM projects p
     INNER JOIN project_members pm ON pm.project_id = p.id
     WHERE pm.user_id = $1
     ORDER BY p.name`,
    [userId],
  );
  return rows.map(toProjectDto);
}

export async function getUser(id) {
  const { rows } = await query(
    `SELECT id, name, email, role, active FROM users WHERE id = $1`,
    [id],
  );
  if (!rows[0]) throw notFound("User not found");
  return toUserDto(rows[0]);
}

export async function adminCreateUser(actor, { name, email, password, role }) {
  if (!name?.trim() || name.trim().length < 2) {
    throw badRequest("Name must be at least 2 characters");
  }
  assertPassword(password);
  const assigned = normalizeRole(role);
  if (!assigned) throw badRequest("Invalid role");
  if (!canAssignRole(actor, assigned)) {
    throw forbidden(`You cannot create a user with role ${assigned}`);
  }

  const normalized = String(email || "").trim().toLowerCase();
  if (!normalized.includes("@")) throw badRequest("Valid email is required");

  const existing = await query(
    `SELECT 1 FROM users WHERE LOWER(email) = LOWER($1)`,
    [normalized],
  );
  if (existing.rowCount) {
    throw conflict("An account with this email already exists");
  }

  const id = randomUUID();
  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
  const { rows } = await query(
    `INSERT INTO users (id, name, email, password_hash, role, active)
     VALUES ($1, $2, $3, $4, $5, true)
     RETURNING id, name, email, role, active`,
    [id, name.trim(), normalized, passwordHash, assigned],
  );
  return toUserDto(rows[0]);
}

export async function adminUpdateUser(actor, id, { name, email, role, active, newPassword }) {
  const { rows: existingRows } = await query(
    `SELECT id, name, email, role, active FROM users WHERE id = $1`,
    [id],
  );
  const target = existingRows[0];
  if (!target) throw notFound("User not found");

  if (!canManageRole(actor, target.role) && actor.id !== target.id) {
    throw forbidden("You cannot modify this user");
  }
  // Even self-edit of role through admin API must follow assign rules
  const nextRole = role != null ? normalizeRole(role) : target.role;
  if (!nextRole) throw badRequest("Invalid role");
  if (nextRole !== target.role && actor.id === id) {
    throw badRequest("You cannot change your own role");
  }
  if (nextRole !== target.role && !canAssignRole(actor, nextRole)) {
    throw forbidden(`You cannot assign role ${nextRole}`);
  }
  if (target.role === "SUPERADMIN" && nextRole !== "SUPERADMIN" && !isSuperAdmin(actor)) {
    throw forbidden("Only SuperAdmin can change a SuperAdmin’s role");
  }
  if (target.role === "SUPERADMIN" && nextRole !== "SUPERADMIN") {
    const { rows: cnt } = await query(
      `SELECT COUNT(*)::int AS c FROM users WHERE role = 'SUPERADMIN' AND active = true`,
    );
    if (cnt[0].c <= 1) {
      throw badRequest("Cannot demote the last active SuperAdmin");
    }
  }

  let nextName = name != null ? String(name).trim() : target.name;
  if (nextName.length < 2) throw badRequest("Name must be at least 2 characters");

  let nextEmail = email != null ? String(email).trim().toLowerCase() : target.email;
  if (!nextEmail.includes("@")) throw badRequest("Valid email is required");
  if (nextEmail !== target.email) {
    const clash = await query(
      `SELECT 1 FROM users WHERE LOWER(email) = LOWER($1) AND id <> $2`,
      [nextEmail, id],
    );
    if (clash.rowCount) throw conflict("An account with this email already exists");
  }

  let nextActive = target.active !== false;
  if (typeof active === "boolean") {
    if (actor.id === id && active === false) {
      throw badRequest("You cannot deactivate your own account");
    }
    if (target.role === "SUPERADMIN" && active === false) {
      const { rows: cnt } = await query(
        `SELECT COUNT(*)::int AS c FROM users WHERE role = 'SUPERADMIN' AND active = true AND id <> $1`,
        [id],
      );
      if (cnt[0].c < 1) {
        throw badRequest("Cannot deactivate the last active SuperAdmin");
      }
    }
    nextActive = active;
  }

  if (newPassword != null && String(newPassword).trim() !== "") {
    if (!canManageRole(actor, target.role) && !isSuperAdmin(actor)) {
      throw forbidden("You cannot reset this user’s password");
    }
    assertPassword(newPassword);
    const passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
    await query(`UPDATE users SET password_hash = $1 WHERE id = $2`, [passwordHash, id]);
  }

  const { rows } = await query(
    `UPDATE users SET name = $1, email = $2, role = $3, active = $4 WHERE id = $5
     RETURNING id, name, email, role, active`,
    [nextName, nextEmail, nextRole, nextActive, id],
  );
  return toUserDto(rows[0]);
}

/** Privileged password reset — SuperAdmin / Manager per canManageRole. */
export async function adminResetPassword(actor, id, newPassword) {
  if (actor.id === id) {
    throw badRequest("Use profile settings to change your own password");
  }
  const { rows } = await query(
    `SELECT id, name, email, role, active FROM users WHERE id = $1`,
    [id],
  );
  const target = rows[0];
  if (!target) throw notFound("User not found");
  if (!canManageRole(actor, target.role)) {
    throw forbidden("You cannot reset this user’s password");
  }
  assertPassword(newPassword);
  const passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
  await query(`UPDATE users SET password_hash = $1 WHERE id = $2`, [passwordHash, id]);
  return toUserDto(target);
}

/** Soft-delete (deactivate). Managers may deactivate users they manage. */
export async function adminDeleteUser(actor, id) {
  if (actor.id === id) throw badRequest("You cannot delete your own account");
  const { rows } = await query(`SELECT id, role, active FROM users WHERE id = $1`, [id]);
  const target = rows[0];
  if (!target) throw notFound("User not found");
  if (!canManageRole(actor, target.role)) {
    throw forbidden("You cannot delete this user");
  }
  if (target.role === "SUPERADMIN") {
    const { rows: cnt } = await query(
      `SELECT COUNT(*)::int AS c FROM users WHERE role = 'SUPERADMIN' AND active = true`,
    );
    if (cnt[0].c <= 1) throw badRequest("Cannot delete the last SuperAdmin");
  }

  // Soft-delete — keep bug history (reporter/assignee IDs)
  await query(`UPDATE users SET active = false WHERE id = $1`, [id]);
  return { ok: true };
}

/**
 * Permanent delete — SuperAdmin only, and only after the user is deactivated.
 * Removes project memberships (CASCADE). Bug reporter/assignee IDs are kept as history.
 */
export async function adminHardDeleteUser(actor, id) {
  if (!isSuperAdmin(actor)) {
    throw forbidden("Only SuperAdmin can permanently delete users");
  }
  if (actor.id === id) throw badRequest("You cannot delete your own account");

  const { rows } = await query(`SELECT id, role, active FROM users WHERE id = $1`, [id]);
  const target = rows[0];
  if (!target) throw notFound("User not found");
  if (target.active !== false) {
    throw badRequest("Deactivate the user first, then permanently delete");
  }
  if (target.role === "SUPERADMIN") {
    const { rows: cnt } = await query(
      `SELECT COUNT(*)::int AS c FROM users WHERE role = 'SUPERADMIN'`,
    );
    if (cnt[0].c <= 1) throw badRequest("Cannot delete the last SuperAdmin");
  }

  await query(`DELETE FROM users WHERE id = $1`, [id]);
  return { ok: true };
}

export async function listOrganizations(actor) {
  if (isSuperAdmin(actor)) {
    const { rows } = await query(`SELECT * FROM organizations ORDER BY name ASC`);
    return Promise.all(rows.map(async (o) => enrichOrganization(o)));
  }
  const { rows } = await query(
    `SELECT o.* FROM organizations o
     INNER JOIN organization_members om ON om.organization_id = o.id
     WHERE om.user_id = $1
     ORDER BY o.name ASC`,
    [actor.id],
  );
  return Promise.all(rows.map(async (o) => enrichOrganization(o)));
}

async function enrichOrganization(org) {
  const projects = await query(
    `SELECT COUNT(*)::int AS c FROM projects WHERE organization_id = $1`,
    [org.id],
  );
  const members = await query(
    `SELECT COUNT(*)::int AS c FROM organization_members WHERE organization_id = $1`,
    [org.id],
  );
  return {
    ...toOrganizationDto(org),
    projectCount: projects.rows[0].c,
    memberCount: members.rows[0].c,
  };
}

export async function getOrganization(actor, id) {
  const org = await requireOrganization(id);
  await assertCanViewOrg(actor, id);
  const { rows: projects } = await query(
    `SELECT * FROM projects WHERE organization_id = $1 ORDER BY name ASC`,
    [id],
  );
  const detail = await enrichOrganization(org);
  const visible = [];
  for (const p of projects) {
    if (await canAccessProject(actor, p)) visible.push(toProjectDto(p));
  }
  return {
    ...detail,
    projects: visible,
  };
}

export async function createOrganization(actor, { name }) {
  if (!canCreateOrganization(actor)) {
    throw forbidden("Only SuperAdmin can create organizations");
  }
  const orgName = assertAlphabeticalName(name, "Organization name");
  const id = randomUUID();
  const { rows } = await query(
    `INSERT INTO organizations (id, name, created_at) VALUES ($1, $2, NOW()) RETURNING *`,
    [id, orgName],
  );
  // SuperAdmin auto-joins
  await query(
    `INSERT INTO organization_members (organization_id, user_id, created_at)
     VALUES ($1, $2, NOW()) ON CONFLICT DO NOTHING`,
    [id, actor.id],
  );
  return enrichOrganization(rows[0]);
}

export async function updateOrganization(actor, id, { name }) {
  if (!canCreateOrganization(actor)) {
    throw forbidden("Only SuperAdmin can update organizations");
  }
  await requireOrganization(id);
  const orgName = assertAlphabeticalName(name, "Organization name");
  const { rows } = await query(
    `UPDATE organizations SET name = $1 WHERE id = $2 RETURNING *`,
    [orgName, id],
  );
  return enrichOrganization(rows[0]);
}

export async function deleteOrganization(actor, id) {
  if (!canCreateOrganization(actor)) {
    throw forbidden("Only SuperAdmin can delete organizations");
  }
  await requireOrganization(id);
  // Cascades projects via FK — also need to clean screenshots for those projects
  const { rows: projects } = await query(
    `SELECT id FROM projects WHERE organization_id = $1`,
    [id],
  );
  for (const p of projects) {
    await deleteProject(actor, p.id);
  }
  await query(`DELETE FROM organizations WHERE id = $1`, [id]);
}

export async function listOrganizationMembers(actor, organizationId) {
  await assertCanViewOrg(actor, organizationId);
  const { rows } = await query(
    `SELECT u.id, u.name, u.email, u.role, u.active
     FROM organization_members om
     INNER JOIN users u ON u.id = om.user_id
     WHERE om.organization_id = $1
     ORDER BY u.name ASC`,
    [organizationId],
  );
  return rows.map(toUserDto);
}

export async function addOrganizationMember(actor, organizationId, userId) {
  if (!canManageOrgMembers(actor)) {
    throw forbidden("Only SuperAdmin or Manager can add organization members");
  }
  await requireOrganization(organizationId);
  if (!isSuperAdmin(actor)) {
    if (!(await isOrgMember(organizationId, actor.id))) {
      throw forbidden("You can only add members to organizations you belong to");
    }
  }
  const { rows: users } = await query(
    `SELECT id, name, email, role, active FROM users WHERE id = $1`,
    [userId],
  );
  if (!users[0]) throw notFound("User not found");
  if (users[0].active === false) throw badRequest("Cannot add an inactive user");
  await query(
    `INSERT INTO organization_members (organization_id, user_id, created_at)
     VALUES ($1, $2, NOW()) ON CONFLICT DO NOTHING`,
    [organizationId, userId],
  );
  return toUserDto(users[0]);
}

export async function removeOrganizationMember(actor, organizationId, userId) {
  if (!canManageOrgMembers(actor)) {
    throw forbidden("Only SuperAdmin or Manager can remove organization members");
  }
  await requireOrganization(organizationId);
  if (!isSuperAdmin(actor)) {
    if (!(await isOrgMember(organizationId, actor.id))) {
      throw forbidden("You can only manage members in organizations you belong to");
    }
  }
  await query(
    `DELETE FROM organization_members WHERE organization_id = $1 AND user_id = $2`,
    [organizationId, userId],
  );
  await query(
    `DELETE FROM project_members pm
     USING projects p
     WHERE pm.project_id = p.id
       AND p.organization_id = $1
       AND pm.user_id = $2`,
    [organizationId, userId],
  );
}

export async function listProjects(actor, { organizationId } = {}) {
  const params = [];
  let sql;
  if (isSuperAdmin(actor)) {
    sql = `SELECT * FROM projects`;
    if (organizationId) {
      params.push(organizationId);
      sql += ` WHERE organization_id = $${params.length}`;
    }
    sql += ` ORDER BY name ASC`;
  } else {
    params.push(actor.id);
    sql = `
      SELECT DISTINCT p.* FROM projects p
      WHERE ${PROJECT_VISIBILITY_WHERE}`;
    if (organizationId) {
      params.push(organizationId);
      sql += ` AND p.organization_id = $${params.length}`;
    }
    sql += ` ORDER BY p.name ASC`;
  }
  const { rows } = await query(sql, params);
  return rows.map(toProjectDto);
}

export async function getProject(actor, id) {
  await assertCanAccessProject(actor, id);
  const project = await requireProject(id);
  const cycles = await query(`SELECT COUNT(*)::int AS c FROM cycles WHERE project_id = $1`, [id]);
  const bugs = await query(`SELECT COUNT(*)::int AS c FROM bugs WHERE project_id = $1`, [id]);
  const members = await query(
    `SELECT COUNT(*)::int AS c FROM project_members WHERE project_id = $1`,
    [id],
  );
  const modules = await query(
    `SELECT COUNT(*)::int AS c FROM modules WHERE project_id = $1`,
    [id],
  );
  return {
    ...toProjectDto(project),
    cycleCount: cycles.rows[0].c,
    bugCount: bugs.rows[0].c,
    memberCount: members.rows[0].c,
    moduleCount: modules.rows[0].c,
  };
}

export async function createProject(actor, { name, organizationId, description, jiraProjectKey, adoOrgUrl, adoProject }) {
  if (!canCreateProject(actor)) {
    throw forbidden("Only Manager or SuperAdmin can create projects");
  }
  if (!organizationId) throw badRequest("organizationId is required");
  await requireOrganization(organizationId);
  if (!isSuperAdmin(actor) && !(await isOrgMember(organizationId, actor.id))) {
    throw forbidden("You must be a member of the organization to create a project");
  }

  if (isManager(actor)) {
    const limit = Math.max(1, Number(config.maxProjectsPerManager) || 10);
    const { rows: countRows } = await query(
      `SELECT COUNT(*)::int AS c FROM projects WHERE created_by = $1`,
      [actor.id],
    );
    const used = countRows[0]?.c ?? 0;
    if (used >= limit) {
      throw badRequest(
        `Project limit reached: Managers can create at most ${limit} projects (you have ${used}).`,
      );
    }
  }

  const projectName = assertAlphabeticalName(name, "Project name");
  return withTransaction(async (client) => {
    const id = randomUUID();
    const { rows } = await client.query(
      `INSERT INTO projects (id, name, description, jira_project_key, ado_org_url, ado_project, organization_id, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        id,
        projectName,
        blankToNull(description),
        blankToNull(jiraProjectKey),
        blankToNull(adoOrgUrl),
        blankToNull(adoProject),
        organizationId,
        actor.id,
      ],
    );
    await client.query(
      `INSERT INTO cycles (id, project_id, name, is_default, start_date, end_date)
       VALUES ($1, $2, 'Cycle 1', true, NULL, NULL)`,
      [randomUUID(), id],
    );
    await client.query(
      `INSERT INTO project_members (project_id, user_id, created_at)
       VALUES ($1, $2, NOW()) ON CONFLICT DO NOTHING`,
      [id, actor.id],
    );
    return toProjectDto(rows[0]);
  });
}

/** Manager quota for project creation. SuperAdmin: unlimited. Others: not allowed. */
export async function getProjectCreationQuota(actor) {
  if (isSuperAdmin(actor)) {
    return { role: "SUPERADMIN", limit: null, used: 0, remaining: null };
  }
  if (!isManager(actor)) {
    return { role: actor.role, limit: 0, used: 0, remaining: 0 };
  }
  const limit = Math.max(1, Number(config.maxProjectsPerManager) || 10);
  const { rows } = await query(
    `SELECT COUNT(*)::int AS c FROM projects WHERE created_by = $1`,
    [actor.id],
  );
  const used = rows[0]?.c ?? 0;
  return {
    role: "MANAGER",
    limit,
    used,
    remaining: Math.max(0, limit - used),
  };
}

export async function updateProject(actor, id, { name, description, jiraProjectKey, adoOrgUrl, adoProject }) {
  await assertCanManageProject(actor, id);
  const projectName = assertAlphabeticalName(name, "Project name");
  const { rows } = await query(
    `UPDATE projects
     SET name = $1, description = $2, jira_project_key = $3, ado_org_url = $4, ado_project = $5
     WHERE id = $6
     RETURNING *`,
    [
      projectName,
      blankToNull(description),
      blankToNull(jiraProjectKey),
      blankToNull(adoOrgUrl),
      blankToNull(adoProject),
      id,
    ],
  );
  return toProjectDto(rows[0]);
}

export async function listModules(actor, projectId) {
  await assertCanAccessProject(actor, projectId);
  const { rows } = await query(
    `SELECT * FROM modules WHERE project_id = $1 ORDER BY name ASC`,
    [projectId],
  );
  return rows.map(toModuleDto);
}

export async function createModule(actor, projectId, { name, description }) {
  if (!canManageModules(actor)) {
    throw forbidden("You cannot manage modules");
  }
  await assertCanAccessProject(actor, projectId);
  if (!name || String(name).trim().length < 1) {
    throw badRequest("Module name is required");
  }
  const id = randomUUID();
  const { rows } = await query(
    `INSERT INTO modules (id, project_id, name, description, created_at)
     VALUES ($1, $2, $3, $4, NOW()) RETURNING *`,
    [id, projectId, String(name).trim(), blankToNull(description)],
  );
  return toModuleDto(rows[0]);
}

export async function updateModule(actor, id, { name, description }) {
  if (!canManageModules(actor)) {
    throw forbidden("You cannot manage modules");
  }
  const mod = await requireModule(id);
  await assertCanAccessProject(actor, mod.project_id);
  if (!name || String(name).trim().length < 1) {
    throw badRequest("Module name is required");
  }
  const { rows } =
    description !== undefined
      ? await query(
          `UPDATE modules SET name = $1, description = $2 WHERE id = $3 RETURNING *`,
          [String(name).trim(), blankToNull(description), id],
        )
      : await query(`UPDATE modules SET name = $1 WHERE id = $2 RETURNING *`, [
          String(name).trim(),
          id,
        ]);
  return toModuleDto(rows[0]);
}

export async function deleteModule(actor, id) {
  if (!canManageModules(actor)) {
    throw forbidden("You cannot manage modules");
  }
  const mod = await requireModule(id);
  await assertCanAccessProject(actor, mod.project_id);
  await query(`DELETE FROM modules WHERE id = $1`, [id]);
}

export async function listBugComments(actor, bugId) {
  await assertCanAccessBug(actor, bugId);
  const { rows } = await query(
    `SELECT c.*, u.name AS author_name
     FROM bug_comments c
     LEFT JOIN users u ON u.id = c.author_id
     WHERE c.bug_id = $1
     ORDER BY c.created_at ASC`,
    [bugId],
  );
  return rows.map(toCommentDto);
}

export async function createBugComment(actor, bugId, { body }) {
  if (!canCommentOnBug(actor)) {
    throw forbidden("You cannot comment on bugs");
  }
  await assertCanAccessBug(actor, bugId);
  const text = body != null ? String(body).trim() : "";
  if (!text) throw badRequest("Comment body is required");
  if (text.length > 4000) throw badRequest("Comment is too long");
  const id = randomUUID();
  const { rows } = await query(
    `INSERT INTO bug_comments (id, bug_id, author_id, body, created_at)
     VALUES ($1, $2, $3, $4, NOW()) RETURNING *`,
    [id, bugId, actor.id, text],
  );
  return {
    ...toCommentDto(rows[0]),
    authorName: actor.name,
  };
}

export async function deleteBugComment(actor, commentId) {
  const { rows } = await query(`SELECT * FROM bug_comments WHERE id = $1`, [commentId]);
  const comment = rows[0];
  if (!comment) throw notFound("Comment not found");
  await assertCanAccessBug(actor, comment.bug_id);
  const isAuthor = String(comment.author_id) === String(actor.id);
  if (!isAuthor && !canDeleteBug(actor)) {
    throw forbidden("You can only delete your own comments");
  }
  await query(`DELETE FROM bug_comments WHERE id = $1`, [commentId]);
}

export async function deleteProject(actor, id) {
  await assertCanManageProject(actor, id);
  const shots = await query(
    `SELECT s.storage_path FROM screenshots s
     JOIN bugs b ON b.id = s.bug_id
     WHERE b.project_id = $1`,
    [id],
  );
  await withTransaction(async (client) => {
    await client.query(
      `DELETE FROM bug_steps WHERE bug_id IN (SELECT id FROM bugs WHERE project_id = $1)`,
      [id],
    );
    await client.query(
      `DELETE FROM screenshots WHERE bug_id IN (SELECT id FROM bugs WHERE project_id = $1)`,
      [id],
    );
    await client.query(`DELETE FROM bugs WHERE project_id = $1`, [id]);
    await client.query(`DELETE FROM cycles WHERE project_id = $1`, [id]);
    await client.query(`DELETE FROM projects WHERE id = $1`, [id]);
  });
  for (const row of shots.rows) {
    await deleteScreenshotFile(row.storage_path);
  }
}

export async function listCycles(actor, projectId) {
  await assertCanAccessProject(actor, projectId);
  const { rows } = await query(
    `SELECT * FROM cycles WHERE project_id = $1 ORDER BY name ASC`,
    [projectId],
  );
  return rows.map((c) => ({
    id: c.id,
    projectId: c.project_id,
    name: c.name,
    isDefault: c.is_default,
    startDate: c.start_date,
    endDate: c.end_date,
  }));
}

function buildBugFilters({ projectId, projectIds, priority, severity, assigneeId, cycleId, status, moduleId }) {
  const clauses = [];
  const params = [];
  const add = (sql, value) => {
    params.push(value);
    clauses.push(`${sql} $${params.length}`);
  };
  if (projectId) add("project_id =", projectId);
  else if (projectIds) {
    if (projectIds.length === 0) {
      clauses.push("FALSE");
    } else {
      params.push(projectIds);
      clauses.push(`project_id = ANY($${params.length}::uuid[])`);
    }
  }
  if (priority) add("priority =", priority);
  if (severity) add("severity =", severity);
  if (assigneeId) add("assignee_id =", assigneeId);
  if (cycleId) add("cycle_id =", cycleId);
  if (status) add("status =", status);
  if (moduleId) add("module_id =", moduleId);
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  return { where, params };
}

export async function listBugs(actor, filters = {}) {
  const scoped = { ...filters };
  if (scoped.projectId) {
    await assertCanAccessProject(actor, scoped.projectId);
  } else if (!isSuperAdmin(actor)) {
    scoped.projectIds = await listAccessibleProjectIds(actor);
  }
  const { where, params } = buildBugFilters(scoped);
  const { rows } = await query(
    `SELECT * FROM bugs ${where} ORDER BY created_at DESC`,
    params,
  );
  const result = [];
  for (const bug of rows) {
    result.push(await hydrateBug(bug));
  }
  return result;
}

export async function exportBugs(actor, filters) {
  const bugs = await listBugs(actor, filters);
  return { exportedAt: new Date().toISOString(), count: bugs.length, bugs };
}

export async function exportBug(actor, id) {
  const bug = await getBug(actor, id);
  return { exportedAt: new Date().toISOString(), count: 1, bugs: [bug] };
}

export async function importBugs({ bugs }, reporter) {
  const imported = [];
  for (const bugRequest of bugs) {
    imported.push(await createBug(bugRequest, reporter));
  }
  return { imported: imported.length, bugs: imported };
}

export async function getBug(actor, id) {
  const bug = await assertCanAccessBug(actor, id);
  return hydrateBug(bug);
}

async function persistScreenshots(client, bugId, screenshots) {
  if (!screenshots?.length) return;
  for (const shot of screenshots) {
    if (!shot?.id || !shot?.dataUrl) continue;
    const { contentType, storagePath } = await saveScreenshotFile(shot.id, shot.dataUrl);
    await client.query(
      `INSERT INTO screenshots (
        id, bug_id, overview, page_url, content_type, storage_path, annotations, created_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
      ON CONFLICT (id) DO NOTHING`,
      [
        shot.id,
        bugId,
        shot.overview ?? "",
        shot.pageUrl ?? "",
        contentType,
        storagePath,
        JSON.stringify(shot.annotations ?? []),
        shot.createdAt ? new Date(shot.createdAt) : new Date(),
      ],
    );
  }
}

export async function createBug(request, reporter) {
  if (!canCreateBug(reporter)) {
    throw forbidden("You cannot create bugs");
  }
  if (!request.projectId) throw badRequest("projectId is required");
  await assertCanAccessProject(reporter, request.projectId);
  await validateRefs(request.projectId, request.cycleId, request.assigneeId);
  await validateModuleForProject(request.moduleId, request.projectId);
  return withTransaction(async (client) => {
    const id = randomUUID();
    const now = new Date();
    const { rows } = await client.query(
      `INSERT INTO bugs (
        id, title, description, priority, severity, assignee_id, reporter_id,
        cycle_id, project_id, module_id, status, jira_issue_key, ado_work_item_id,
        created_at, updated_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,NULL,NULL,$12,$12)
      RETURNING *`,
      [
        id,
        request.title,
        request.description,
        request.priority,
        request.severity,
        request.assigneeId,
        reporter.id,
        request.cycleId,
        request.projectId,
        request.moduleId || null,
        request.status || "NEW",
        now,
      ],
    );
    await replaceSteps(client, id, request.steps);
    await persistScreenshots(client, id, request.screenshots);
    return hydrateBug(rows[0], client);
  });
}

export async function updateBug(id, request, actor) {
  const existing = await assertCanAccessBug(actor, id);
  const keys = Object.keys(request || {}).filter((k) => request[k] !== undefined);

  // Status-only shortcut (Developers + anyone with status permission)
  if (keys.length === 1 && keys[0] === "status") {
    if (!canUpdateBugStatus(actor)) {
      throw forbidden("You cannot update this bug");
    }
    if (!request.status) throw badRequest("status is required");
    const { rows } = await query(
      `UPDATE bugs SET status = $1, updated_at = $2 WHERE id = $3 RETURNING *`,
      [request.status, new Date(), id],
    );
    return hydrateBug(rows[0]);
  }

  if (canFullEditBug(actor)) {
    const projectId = request.projectId ?? existing.project_id;
    const cycleId = request.cycleId ?? existing.cycle_id;
    const assigneeId = request.assigneeId ?? existing.assignee_id;
    const moduleId =
      request.moduleId !== undefined ? request.moduleId : existing.module_id;
    await validateRefs(projectId, cycleId, assigneeId);
    await validateModuleForProject(moduleId, projectId);
    if (String(projectId) !== String(existing.project_id)) {
      await assertCanAccessProject(actor, projectId);
    }
    return withTransaction(async (client) => {
      const now = new Date();
      const { rows } = await client.query(
        `UPDATE bugs SET
          title = $1, description = $2, priority = $3, severity = $4,
          assignee_id = $5, cycle_id = $6, project_id = $7, module_id = $8, status = $9,
          updated_at = $10
         WHERE id = $11
         RETURNING *`,
        [
          request.title ?? existing.title,
          request.description ?? existing.description,
          request.priority ?? existing.priority,
          request.severity ?? existing.severity,
          assigneeId,
          cycleId,
          projectId,
          moduleId || null,
          request.status ?? existing.status,
          now,
          id,
        ],
      );
      if (request.steps) {
        await replaceSteps(client, id, request.steps);
      }
      return hydrateBug(rows[0], client);
    });
  }

  throw forbidden("You can only update bug status");
}

export async function deleteBug(id, actor) {
  if (!actor || !canDeleteBug(actor)) {
    throw forbidden("You cannot delete bugs");
  }
  await assertCanAccessBug(actor, id);
  const shots = await query(`SELECT storage_path FROM screenshots WHERE bug_id = $1`, [id]);
  await withTransaction(async (client) => {
    await client.query(`DELETE FROM bug_steps WHERE bug_id = $1`, [id]);
    await client.query(`DELETE FROM screenshots WHERE bug_id = $1`, [id]);
    await client.query(`DELETE FROM bugs WHERE id = $1`, [id]);
  });
  for (const row of shots.rows) {
    await deleteScreenshotFile(row.storage_path);
  }
}

export async function getScreenshot(actor, id) {
  const { rows } = await query(
    `SELECT s.*, b.project_id
     FROM screenshots s
     JOIN bugs b ON b.id = s.bug_id
     WHERE s.id = $1`,
    [id],
  );
  if (!rows[0]) throw notFound("Screenshot not found");
  await assertCanAccessProject(actor, rows[0].project_id);
  return rows[0];
}

export async function readScreenshotBytes(actor, id) {
  const row = await getScreenshot(actor, id);
  const buffer = await readScreenshotFile(row.storage_path);
  return { row, buffer };
}
