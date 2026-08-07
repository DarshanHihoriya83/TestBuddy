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
import { decryptSecret, encryptSecret } from "../cryptoSecrets.js";
import { listAdoIterations, testAdoConnection } from "./adoClient.js";
import {
  pushBugToAdo as pushBugToAdoImpl,
  syncBugFromAdo as syncBugFromAdoImpl,
  tryAutoPushBugToAdo,
  tryPushCommentToAdo,
} from "./adoSync.js";
import {
  canAssignRole,
  canAssignWorkTo,
  canAddAsMember,
  canCommentOnBug,
  canCreateBug,
  canCreateOrganization,
  canCreateProject,
  canDeleteBug,
  canFullEditBug,
  canManageEnvironments,
  canManageModules,
  canManageOrgMembers,
  canManageSprints,
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
import { checkPasswordStrength, generateTemporaryPassword } from "../passwordPolicy.js";

const BCRYPT_ROUNDS = 12;

/**
 * Compared against when the email is unknown, so a failed login costs the same
 * time whether or not the account exists.
 */
const DUMMY_PASSWORD_HASH = bcrypt.hashSync("tb-dummy-password-placeholder", BCRYPT_ROUNDS);

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

function assertPassword(password, context = {}) {
  const err = checkPasswordStrength(password, context);
  if (err) throw badRequest(err);
}

function toUserDto(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    active: user.active !== false,
    mustChangePassword: Boolean(
      user.mustChangePassword ?? user.must_change_password,
    ),
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
    adoTeam: project.ado_team ?? project.adoTeam ?? null,
    adoPatConfigured: Boolean(project.ado_pat_encrypted),
    createdBy: project.created_by ?? project.createdBy ?? null,
    createdAt: project.created_at ?? project.createdAt ?? null,
  };
}

function toOrganizationDto(org) {
  const maxProjects = Number(org.max_projects ?? org.maxProjects);
  return {
    id: org.id,
    name: org.name,
    createdAt: org.created_at ?? org.createdAt ?? null,
    maxProjects:
      Number.isFinite(maxProjects) && maxProjects >= 1
        ? Math.floor(maxProjects)
        : Math.max(1, Number(config.defaultOrgMaxProjects) || 10),
  };
}

/** Positive integer org project cap. */
function parseOrgMaxProjects(value, { required = false } = {}) {
  if (value === undefined || value === null || value === "") {
    if (required) throw badRequest("maxProjects is required");
    return Math.max(1, Number(config.defaultOrgMaxProjects) || 10);
  }
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1) {
    throw badRequest("maxProjects must be a positive integer (minimum 1)");
  }
  if (n > 1000) throw badRequest("maxProjects cannot exceed 1000");
  return n;
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

function toBugDto(bug, steps, screenshots = [], environmentName = null) {
  return {
    id: bug.id,
    title: bug.title,
    description: bug.description,
    priority: bug.priority,
    severity: bug.severity,
    assigneeId: bug.assignee_id,
    reporterId: bug.reporter_id,
    sprintId: bug.cycle_id,
    projectId: bug.project_id,
    moduleId: bug.module_id ?? null,
    environmentId: bug.environment_id ?? null,
    environmentName: environmentName ?? null,
    environmentSnapshot: bug.environment_snapshot ?? null,
    status: bug.status,
    steps: steps.map(toStepDto),
    screenshots: screenshots.map(toScreenshotDto),
    externalRefs: {
      jiraIssueKey: bug.jira_issue_key,
      adoWorkItemId: bug.ado_work_item_id,
      adoWorkItemUrl: bug.ado_work_item_url ?? null,
    },
    adoLastSyncedAt: bug.ado_last_synced_at ?? null,
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
  const q = client ? client.query.bind(client) : query;
  const [steps, screenshots, envRows] = await Promise.all([
    loadSteps(bug.id, client),
    loadScreenshots(bug.id, client),
    bug.environment_id
      ? q(`SELECT name FROM environments WHERE id = $1`, [bug.environment_id])
      : Promise.resolve({ rows: [] }),
  ]);
  const environmentName = envRows.rows[0]?.name ?? null;
  return toBugDto(bug, steps, screenshots, environmentName);
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

async function requireEnvironment(id) {
  const { rows } = await query(`SELECT * FROM environments WHERE id = $1`, [id]);
  if (!rows[0]) throw notFound("Environment not found");
  return rows[0];
}

async function validateEnvironmentForProject(environmentId, projectId, { existingEnvironmentId } = {}) {
  if (!environmentId) return null;
  const env = await requireEnvironment(environmentId);
  if (String(env.project_id) !== String(projectId)) {
    throw badRequest("environmentId does not belong to projectId");
  }
  const unchanged =
    existingEnvironmentId && String(environmentId) === String(existingEnvironmentId);
  if (!env.active && !unchanged) {
    throw badRequest("environment is inactive");
  }
  return env;
}

function toEnvironmentDto(row) {
  return {
    id: row.id,
    projectId: row.project_id,
    name: row.name,
    sortOrder: row.sort_order,
    isDefault: row.is_default,
    active: row.active,
    createdAt: row.created_at,
  };
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

async function validateRefs(projectId, sprintId, assigneeId, actor = null) {
  const project = await query(`SELECT 1 FROM projects WHERE id = $1`, [projectId]);
  if (!project.rowCount) throw badRequest("Unknown projectId");

  if (!sprintId) throw badRequest("sprintId is required");
  const sprint = await query(`SELECT * FROM cycles WHERE id = $1`, [sprintId]);
  if (!sprint.rows[0]) throw badRequest("Unknown sprintId");
  if (String(sprint.rows[0].project_id) !== String(projectId)) {
    throw badRequest("sprintId does not belong to projectId");
  }
  if (sprint.rows[0].active === false) {
    throw badRequest("sprint is inactive");
  }

  const user = await query(
    `SELECT id, role, active FROM users WHERE id = $1 AND active = true`,
    [assigneeId],
  );
  if (!user.rowCount) throw badRequest("Unknown or inactive assigneeId");
  if (actor && !canAssignWorkTo(actor, user.rows[0])) {
    throw forbidden("SuperAdmin cannot be assigned to bugs or test cases");
  }
}

function resolveSprintId(request) {
  return request?.sprintId || request?.cycleId || null;
}

async function assertAssignableUser(actor, userId, { optional = false } = {}) {
  if (!userId) {
    if (optional) return;
    throw badRequest("assigneeId is required");
  }
  const { rows } = await query(
    `SELECT id, role, active FROM users WHERE id = $1`,
    [userId],
  );
  if (!rows[0] || rows[0].active === false) {
    throw badRequest("Unknown or inactive assigneeId");
  }
  if (!canAssignWorkTo(actor, rows[0])) {
    throw forbidden("SuperAdmin cannot be assigned to bugs or test cases");
  }
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
    `SELECT id, name, email, password_hash AS "passwordHash", role, active,
            must_change_password AS "mustChangePassword"
     FROM users WHERE LOWER(email) = LOWER($1)`,
    [email],
  );
  const user = rows[0];
  // Always run a compare so response time does not reveal whether the email exists
  const passwordOk = await bcrypt.compare(
    String(password || ""),
    user?.passwordHash || DUMMY_PASSWORD_HASH,
  );
  // Constant-ish failure message — don't reveal which part failed
  if (!user || !passwordOk) {
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
  const normalized = String(email || "").trim().toLowerCase();
  if (!normalized.includes("@")) throw badRequest("Valid email is required");
  assertPassword(password, { name, email: normalized });

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
  const mustChange = Boolean(current.mustChangePassword ?? current.must_change_password);
  const changingPassword = newPassword != null && String(newPassword).trim() !== "";
  if (mustChange && !changingPassword) {
    throw badRequest("You must set a new password before continuing");
  }
  let nextMustChange = mustChange;
  if (changingPassword) {
    if (currentPassword == null || String(currentPassword).trim() === "") {
      throw badRequest("Current password is required");
    }
    if (!(await bcrypt.compare(String(currentPassword), current.passwordHash))) {
      throw badRequest("Current password is incorrect");
    }
    assertPassword(newPassword, { name, email: current.email });
    if (await bcrypt.compare(String(newPassword), current.passwordHash)) {
      throw badRequest("New password must be different from your current password");
    }
    passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
    nextMustChange = false;
  }
  const { rows } = await query(
    `UPDATE users
     SET name = $1,
         password_hash = $2,
         must_change_password = $3,
         password_changed_at = CASE WHEN $4 THEN NOW() ELSE password_changed_at END
     WHERE id = $5
     RETURNING id, name, email, role, active, must_change_password AS "mustChangePassword",
               password_changed_at AS "passwordChangedAt"`,
    [name.trim(), passwordHash, nextMustChange, changingPassword, current.id],
  );
  const dto = toUserDto(rows[0]);
  if (!changingPassword) return dto;
  // Older tokens are revoked, so hand back one stamped at the change itself.
  const changedSec = Math.floor(new Date(rows[0].passwordChangedAt).getTime() / 1000);
  return { ...dto, token: generateToken(dto.id, dto.email, changedSec) };
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
  // Managers (and other non–Super Admin roles) must never see Super Admin accounts.
  const hideSuperAdmins = !isSuperAdmin(actor);
  const excludeSuperAdminSql = hideSuperAdmins ? ` AND u.role <> 'SUPERADMIN'` : "";

  if (projectId) {
    await assertCanAccessProject(actor, projectId);
    const { rows } = await query(
      `SELECT u.id, u.name, u.email, u.role, u.active
       FROM users u
       INNER JOIN project_members pm ON pm.user_id = u.id
       WHERE pm.project_id = $1${excludeSuperAdminSql}
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

  // Full directory — SuperAdmin sees everyone; Manager only their org(s).
  if (directory || isSuperAdmin(actor)) {
    if (isSuperAdmin(actor)) {
      const { rows } = await query(
        `SELECT id, name, email, role, active FROM users ORDER BY ${USER_ROLE_ORDER}, name`,
      );
      return rows.map(toUserDto);
    }
    const { rows } = await query(
      `SELECT u.id, u.name, u.email, u.role, u.active
       FROM users u
       INNER JOIN organization_members om ON om.user_id = u.id
       WHERE om.organization_id IN (
         SELECT organization_id FROM organization_members WHERE user_id = $1
       )
         AND u.role <> 'SUPERADMIN'
       GROUP BY u.id, u.name, u.email, u.role, u.active
       ORDER BY
         CASE u.role
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

  // Assignees / pickers: only users sharing an org or project with the actor
  const { rows } = await query(
    `SELECT u.id, u.name, u.email, u.role, u.active
     FROM users u
     WHERE (u.id = $1
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
        ))${excludeSuperAdminSql}
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
  if (!canAddAsMember(actor, user.rows[0])) {
    throw forbidden("Only SuperAdmin can add a SuperAdmin to a project");
  }
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
  return { ok: true, id: target.id, role: target.role };
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

/** Org + project memberships for the Edit-user access panel (SuperAdmin / Manager). */
export async function getUserMemberships(actor, id) {
  const target = await getUser(id);
  if (!canManageRole(actor, target.role) && actor.id !== target.id) {
    throw forbidden("You cannot view this user’s memberships");
  }
  const { rows: orgRows } = await query(
    `SELECT organization_id FROM organization_members WHERE user_id = $1 ORDER BY created_at ASC`,
    [id],
  );
  const { rows: projectRows } = await query(
    `SELECT project_id FROM project_members WHERE user_id = $1 ORDER BY created_at ASC`,
    [id],
  );
  return {
    organizationIds: orgRows.map((r) => r.organization_id),
    projectIds: projectRows.map((r) => r.project_id),
  };
}

export async function adminCreateUser(
  actor,
  { name, email, role, organizationId, projectIds = [] },
) {
  if (!name?.trim() || name.trim().length < 2) {
    throw badRequest("Name must be at least 2 characters");
  }
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

  const uniqueProjectIds = [
    ...new Set(
      (Array.isArray(projectIds) ? projectIds : [])
        .map((id) => String(id || "").trim())
        .filter(Boolean),
    ),
  ];

  // Resolve + authorize projects before writing anything, so a bad id cannot
  // leave a half-created user behind.
  const projectRows = [];
  for (const projectId of uniqueProjectIds) {
    await assertCanManageProject(actor, projectId);
    const project = await requireProject(projectId);
    if (!project.organization_id) {
      throw badRequest(`Project "${project.name}" has no organization`);
    }
    if (!isSuperAdmin(actor) && !(await isOrgMember(project.organization_id, actor.id))) {
      throw forbidden("You can only assign projects in organizations you belong to");
    }
    projectRows.push(project);
  }

  // An explicit organization enrolls the user even when no project is picked.
  const requestedOrgId = String(organizationId || "").trim();
  if (requestedOrgId) {
    const { rows: orgRows } = await query(`SELECT id FROM organizations WHERE id = $1`, [
      requestedOrgId,
    ]);
    if (!orgRows[0]) throw badRequest("Unknown organization");
    if (!isSuperAdmin(actor) && !(await isOrgMember(requestedOrgId, actor.id))) {
      throw forbidden("You can only add users to organizations you belong to");
    }
  }

  // Without explicit projects, still enroll Managers' new users into every org
  // the manager belongs to so they show up in shared-org directories.
  let fallbackOrgIds = [];
  if (projectRows.length === 0 && isManager(actor) && !isSuperAdmin(actor)) {
    const { rows: orgs } = await query(
      `SELECT organization_id FROM organization_members WHERE user_id = $1`,
      [actor.id],
    );
    fallbackOrgIds = orgs.map((r) => r.organization_id);
  }

  const temporaryPassword = generateTemporaryPassword();
  const id = randomUUID();
  const passwordHash = await bcrypt.hash(temporaryPassword, BCRYPT_ROUNDS);

  const created = await withTransaction(async (client) => {
    const { rows } = await client.query(
      `INSERT INTO users (id, name, email, password_hash, role, active, must_change_password, password_changed_at)
       VALUES ($1, $2, $3, $4, $5, true, true, NOW())
       RETURNING id, name, email, role, active, must_change_password AS "mustChangePassword"`,
      [id, name.trim(), normalized, passwordHash, assigned],
    );

    const orgIds = new Set(fallbackOrgIds);
    if (requestedOrgId) orgIds.add(requestedOrgId);
    for (const project of projectRows) {
      orgIds.add(project.organization_id);
    }
    for (const organizationId of orgIds) {
      await client.query(
        `INSERT INTO organization_members (organization_id, user_id, created_at)
         VALUES ($1, $2, NOW()) ON CONFLICT DO NOTHING`,
        [organizationId, id],
      );
    }
    for (const project of projectRows) {
      await client.query(
        `INSERT INTO project_members (project_id, user_id, created_at)
         VALUES ($1, $2, NOW()) ON CONFLICT DO NOTHING`,
        [project.id, id],
      );
    }

    return rows[0];
  });

  return { ...toUserDto(created), temporaryPassword };
}

export async function adminUpdateUser(
  actor,
  id,
  { name, email, role, active, newPassword, organizationId, projectIds },
) {
  // Admins never choose a password for someone else — only the reset endpoint,
  // which auto-generates one and forces a change, may touch credentials.
  if (newPassword != null && String(newPassword) !== "") {
    throw badRequest(
      "Passwords cannot be set directly. Use Reset password to generate a temporary one.",
    );
  }
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

  // SuperAdmin Edit mirrors Create: pick an org (mandatory in UI) and sync that
  // org's project memberships. Other orgs/projects are left alone.
  const syncAccess = organizationId !== undefined || projectIds !== undefined;
  let requestedOrgId = null;
  let desiredProjectIds = null;
  if (syncAccess) {
    if (!isSuperAdmin(actor)) {
      throw forbidden("Only SuperAdmin can update organization or project access here");
    }
    requestedOrgId = String(organizationId || "").trim();
    if (!requestedOrgId) throw badRequest("Select an organization");
    const { rows: orgRows } = await query(`SELECT id FROM organizations WHERE id = $1`, [
      requestedOrgId,
    ]);
    if (!orgRows[0]) throw badRequest("Unknown organization");

    if (projectIds !== undefined) {
      desiredProjectIds = [
        ...new Set(
          (Array.isArray(projectIds) ? projectIds : [])
            .map((pid) => String(pid || "").trim())
            .filter(Boolean),
        ),
      ];
      for (const projectId of desiredProjectIds) {
        await assertCanManageProject(actor, projectId);
        const project = await requireProject(projectId);
        if (project.organization_id !== requestedOrgId) {
          throw badRequest("Projects must belong to the selected organization");
        }
      }
    }
  }

  return withTransaction(async (client) => {
    const { rows } = await client.query(
      `UPDATE users
       SET name = $1,
           email = $2,
           role = $3,
           active = $4,
           password_changed_at = CASE
             WHEN active IS DISTINCT FROM $4 THEN NOW()
             ELSE password_changed_at
           END
       WHERE id = $5
       RETURNING id, name, email, role, active, must_change_password AS "mustChangePassword"`,
      [nextName, nextEmail, nextRole, nextActive, id],
    );

    if (requestedOrgId) {
      await client.query(
        `INSERT INTO organization_members (organization_id, user_id, created_at)
         VALUES ($1, $2, NOW()) ON CONFLICT DO NOTHING`,
        [requestedOrgId, id],
      );

      if (desiredProjectIds) {
        const { rows: orgProjects } = await client.query(
          `SELECT id FROM projects WHERE organization_id = $1`,
          [requestedOrgId],
        );
        const orgProjectIds = orgProjects.map((p) => p.id);
        const desired = new Set(desiredProjectIds);

        for (const projectId of orgProjectIds) {
          if (desired.has(projectId)) {
            await client.query(
              `INSERT INTO project_members (project_id, user_id, created_at)
               VALUES ($1, $2, NOW()) ON CONFLICT DO NOTHING`,
              [projectId, id],
            );
          } else {
            await client.query(
              `DELETE FROM project_members WHERE project_id = $1 AND user_id = $2`,
              [projectId, id],
            );
          }
        }
      }
    }

    return toUserDto(rows[0]);
  });
}

/** Privileged password reset — SuperAdmin / Manager per canManageRole. Auto-generates a temporary password. */
export async function adminResetPassword(actor, id) {
  if (actor.id === id) {
    throw badRequest("Use profile settings to change your own password");
  }
  const { rows } = await query(
    `SELECT id, name, email, role, active, must_change_password AS "mustChangePassword"
     FROM users WHERE id = $1`,
    [id],
  );
  const target = rows[0];
  if (!target) throw notFound("User not found");
  if (!canManageRole(actor, target.role)) {
    throw forbidden("You cannot reset this user’s password");
  }
  if (target.active === false) {
    throw badRequest("Reactivate this user before resetting their password");
  }
  const temporaryPassword = generateTemporaryPassword();
  const passwordHash = await bcrypt.hash(temporaryPassword, BCRYPT_ROUNDS);
  // password_changed_at bump signs out every existing session for this user.
  const { rows: updated } = await query(
    `UPDATE users
     SET password_hash = $1, must_change_password = true, password_changed_at = NOW()
     WHERE id = $2
     RETURNING id, name, email, role, active, must_change_password AS "mustChangePassword"`,
    [passwordHash, id],
  );
  return { ...toUserDto(updated[0]), temporaryPassword };
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

  // Soft-delete — keep bug history. Advance the session cutoff as well, so
  // tokens held before deactivation cannot come back to life after reactivation.
  await query(
    `UPDATE users
     SET active = false,
         password_changed_at = CASE WHEN active = true THEN NOW() ELSE password_changed_at END
     WHERE id = $1`,
    [id],
  );
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
  // SuperAdmin is platform-scoped — never count them as org people.
  const members = await query(
    `SELECT COUNT(*)::int AS c
     FROM organization_members om
     INNER JOIN users u ON u.id = om.user_id
     WHERE om.organization_id = $1 AND u.role <> 'SUPERADMIN'`,
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

export async function createOrganization(actor, { name, maxProjects }) {
  if (!canCreateOrganization(actor)) {
    throw forbidden("Only SuperAdmin can create organizations");
  }
  const orgName = assertAlphabeticalName(name, "Organization name");
  const orgMax = parseOrgMaxProjects(maxProjects);
  const id = randomUUID();
  const { rows } = await query(
    `INSERT INTO organizations (id, name, max_projects, created_at)
     VALUES ($1, $2, $3, NOW()) RETURNING *`,
    [id, orgName, orgMax],
  );
  // SuperAdmin can view every org without being enrolled as a member.
  return enrichOrganization(rows[0]);
}

export async function updateOrganization(actor, id, { name, maxProjects }) {
  if (!canCreateOrganization(actor)) {
    throw forbidden("Only SuperAdmin can update organizations");
  }
  const existing = await requireOrganization(id);
  const patches = [];
  const params = [];

  if (name !== undefined) {
    const orgName = assertAlphabeticalName(name, "Organization name");
    params.push(orgName);
    patches.push(`name = $${params.length}`);
  }
  if (maxProjects !== undefined) {
    const orgMax = parseOrgMaxProjects(maxProjects, { required: true });
    params.push(orgMax);
    patches.push(`max_projects = $${params.length}`);
  }
  if (patches.length === 0) {
    return enrichOrganization(existing);
  }
  params.push(id);
  const { rows } = await query(
    `UPDATE organizations SET ${patches.join(", ")} WHERE id = $${params.length} RETURNING *`,
    params,
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
       AND u.role <> 'SUPERADMIN'
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
  if (users[0].role === "SUPERADMIN") {
    throw badRequest("SuperAdmin is platform-scoped and cannot be added as an organization member");
  }
  if (!canAddAsMember(actor, users[0])) {
    throw forbidden("Only SuperAdmin can add a SuperAdmin to an organization");
  }
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
  const sprints = await query(`SELECT COUNT(*)::int AS c FROM cycles WHERE project_id = $1 AND active = true`, [id]);
  const bugs = await query(`SELECT COUNT(*)::int AS c FROM bugs WHERE project_id = $1`, [id]);
  const members = await query(
    `SELECT COUNT(*)::int AS c FROM project_members WHERE project_id = $1`,
    [id],
  );
  const modules = await query(
    `SELECT COUNT(*)::int AS c FROM modules WHERE project_id = $1`,
    [id],
  );
  const environments = await query(
    `SELECT COUNT(*)::int AS c FROM environments WHERE project_id = $1 AND active = true`,
    [id],
  );
  return {
    ...toProjectDto(project),
    sprintCount: sprints.rows[0].c,
    bugCount: bugs.rows[0].c,
    memberCount: members.rows[0].c,
    moduleCount: modules.rows[0].c,
    environmentCount: environments.rows[0].c,
  };
}

export async function createProject(actor, { name, organizationId, description, jiraProjectKey, adoOrgUrl, adoProject, adoTeam, adoPat }) {
  if (!canCreateProject(actor)) {
    throw forbidden("Only Manager or SuperAdmin can create projects");
  }
  if (!organizationId) throw badRequest("organizationId is required");
  const org = await requireOrganization(organizationId);
  if (!isSuperAdmin(actor) && !(await isOrgMember(organizationId, actor.id))) {
    throw forbidden("You must be a member of the organization to create a project");
  }

  // Org-level cap: SuperAdmin may exceed; Managers cannot.
  if (!isSuperAdmin(actor)) {
    const orgMax = toOrganizationDto(org).maxProjects;
    const { rows: orgCountRows } = await query(
      `SELECT COUNT(*)::int AS c FROM projects WHERE organization_id = $1`,
      [organizationId],
    );
    const orgUsed = orgCountRows[0]?.c ?? 0;
    if (orgUsed >= orgMax) {
      throw badRequest(
        `Organization project limit reached: this organization allows at most ${orgMax} projects (currently ${orgUsed}). Ask a SuperAdmin to raise the limit.`,
      );
    }
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
      `INSERT INTO projects (id, name, description, jira_project_key, ado_org_url, ado_project, ado_team, ado_pat_encrypted, organization_id, created_by, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())
       RETURNING *`,
      [
        id,
        projectName,
        blankToNull(description),
        blankToNull(jiraProjectKey),
        blankToNull(adoOrgUrl),
        blankToNull(adoProject),
        blankToNull(adoTeam),
        adoPat ? encryptSecret(String(adoPat).trim()) : null,
        organizationId,
        actor.id,
      ],
    );
    await client.query(
      `INSERT INTO cycles (id, project_id, name, is_default, start_date, end_date, source, active)
       VALUES ($1, $2, 'Sprint 1', true, NULL, NULL, 'MANUAL', true)`,
      [randomUUID(), id],
    );
    await client.query(
      `INSERT INTO environments (id, project_id, name, sort_order, is_default, active)
       VALUES ($1, $2, 'Dev', 0, true, true)`,
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

export async function updateProject(actor, id, { name, description, jiraProjectKey, adoOrgUrl, adoProject, adoTeam, adoPat, clearAdoPat }) {
  await assertCanManageProject(actor, id);
  const projectName = assertAlphabeticalName(name, "Project name");
  const existing = await requireProject(id);
  let patEncrypted = existing.ado_pat_encrypted;
  if (clearAdoPat) patEncrypted = null;
  else if (adoPat !== undefined && adoPat !== null && String(adoPat).trim()) {
    patEncrypted = encryptSecret(String(adoPat).trim());
  }
  const { rows } = await query(
    `UPDATE projects
     SET name = $1, description = $2, jira_project_key = $3, ado_org_url = $4, ado_project = $5,
         ado_team = $6, ado_pat_encrypted = $7
     WHERE id = $8
     RETURNING *`,
    [
      projectName,
      blankToNull(description),
      blankToNull(jiraProjectKey),
      blankToNull(adoOrgUrl),
      blankToNull(adoProject),
      blankToNull(adoTeam !== undefined ? adoTeam : existing.ado_team),
      patEncrypted,
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
  const comment = {
    ...toCommentDto(rows[0]),
    authorName: actor.name,
  };
  // Best-effort: mirror comment to linked ADO work item
  void tryPushCommentToAdo(actor, bugId, id, {
    getBug: loadBugDto,
    assertCanAccessBug,
  });
  return comment;
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
    await client.query(`DELETE FROM test_cases WHERE project_id = $1`, [id]);
    await client.query(`DELETE FROM cycles WHERE project_id = $1`, [id]);
    await client.query(`DELETE FROM projects WHERE id = $1`, [id]);
  });
  for (const row of shots.rows) {
    await deleteScreenshotFile(row.storage_path);
  }
}

export async function listCycles(actor, projectId) {
  return listSprints(actor, projectId);
}

function toSprintDto(c) {
  return {
    id: c.id,
    projectId: c.project_id,
    name: c.name,
    isDefault: c.is_default,
    startDate: c.start_date,
    endDate: c.end_date,
    active: c.active !== false,
    source: c.source || "MANUAL",
    adoIterationId: c.ado_iteration_id ?? null,
    adoIterationPath: c.ado_iteration_path ?? null,
    lastSyncedAt: c.last_synced_at ?? null,
  };
}

export async function listSprints(actor, projectId) {
  await assertCanAccessProject(actor, projectId);
  const includeInactive = canManageSprints(actor);
  const { rows } = await query(
    includeInactive
      ? `SELECT * FROM cycles WHERE project_id = $1 ORDER BY is_default DESC, name ASC`
      : `SELECT * FROM cycles WHERE project_id = $1 AND active = true ORDER BY is_default DESC, name ASC`,
    [projectId],
  );
  return rows.map(toSprintDto);
}

export async function createSprint(actor, projectId, { name, isDefault, startDate, endDate }) {
  if (!canManageSprints(actor)) throw forbidden("You cannot manage sprints");
  await assertCanManageProject(actor, projectId);
  const sprintName = String(name || "").trim();
  if (!sprintName) throw badRequest("Sprint name is required");

  return withTransaction(async (client) => {
    const { rows: countRows } = await client.query(
      `SELECT COUNT(*)::int AS c FROM cycles WHERE project_id = $1 AND active = true`,
      [projectId],
    );
    const makeDefault = isDefault === true || countRows[0].c === 0;
    const id = randomUUID();
    const { rows } = await client.query(
      `INSERT INTO cycles (
        id, project_id, name, is_default, start_date, end_date, source, active
      ) VALUES ($1,$2,$3,$4,$5,$6,'MANUAL',true)
      RETURNING *`,
      [
        id,
        projectId,
        sprintName,
        makeDefault,
        blankToNull(startDate),
        blankToNull(endDate),
      ],
    );
    if (makeDefault) {
      await client.query(
        `UPDATE cycles SET is_default = false WHERE project_id = $1 AND id <> $2`,
        [projectId, id],
      );
    }
    return toSprintDto(rows[0]);
  });
}

export async function updateSprint(actor, id, { name, isDefault, active, startDate, endDate }) {
  if (!canManageSprints(actor)) throw forbidden("You cannot manage sprints");
  const { rows: existingRows } = await query(`SELECT * FROM cycles WHERE id = $1`, [id]);
  if (!existingRows[0]) throw notFound("Sprint not found");
  const sprint = existingRows[0];
  await assertCanManageProject(actor, sprint.project_id);

  const nextName = name !== undefined ? String(name).trim() : sprint.name;
  if (!nextName) throw badRequest("Sprint name is required");
  const nextActive = active !== undefined ? !!active : sprint.active !== false;
  const nextDefault =
    isDefault === true ? true : isDefault === false ? false : sprint.is_default;
  if (nextDefault && !nextActive) {
    throw badRequest("Inactive sprint cannot be default");
  }

  return withTransaction(async (client) => {
    const { rows } = await client.query(
      `UPDATE cycles SET
        name = $1,
        is_default = $2,
        active = $3,
        start_date = COALESCE($4, start_date),
        end_date = COALESCE($5, end_date)
       WHERE id = $6
       RETURNING *`,
      [
        nextName,
        nextDefault,
        nextActive,
        startDate !== undefined ? blankToNull(startDate) : null,
        endDate !== undefined ? blankToNull(endDate) : null,
        id,
      ],
    );
    if (nextDefault) {
      await client.query(
        `UPDATE cycles SET is_default = false WHERE project_id = $1 AND id <> $2`,
        [sprint.project_id, id],
      );
      rows[0].is_default = true;
    } else if ((sprint.is_default && !nextDefault) || (sprint.is_default && !nextActive)) {
      await client.query(`UPDATE cycles SET is_default = false WHERE id = $1`, [id]);
      const { rows: fallback } = await client.query(
        `SELECT id FROM cycles
         WHERE project_id = $1 AND active = true AND id <> $2
         ORDER BY name ASC LIMIT 1`,
        [sprint.project_id, id],
      );
      if (fallback[0]) {
        await client.query(`UPDATE cycles SET is_default = true WHERE id = $1`, [
          fallback[0].id,
        ]);
      }
      rows[0].is_default = false;
    }
    return toSprintDto(rows[0]);
  });
}

export async function deleteSprint(actor, id) {
  if (!canManageSprints(actor)) throw forbidden("You cannot manage sprints");
  const { rows: existingRows } = await query(`SELECT * FROM cycles WHERE id = $1`, [id]);
  if (!existingRows[0]) throw notFound("Sprint not found");
  const sprint = existingRows[0];
  await assertCanManageProject(actor, sprint.project_id);

  const { rows: activeRows } = await query(
    `SELECT COUNT(*)::int AS c FROM cycles WHERE project_id = $1 AND active = true`,
    [sprint.project_id],
  );
  if (activeRows[0].c <= 1 && sprint.active !== false) {
    throw badRequest("Project must keep at least one active sprint");
  }

  const { rows: bugCount } = await query(
    `SELECT COUNT(*)::int AS c FROM bugs WHERE cycle_id = $1`,
    [id],
  );
  const { rows: tcCount } = await query(
    `SELECT COUNT(*)::int AS c FROM test_cases WHERE cycle_id = $1`,
    [id],
  );
  if (bugCount[0].c > 0 || tcCount[0].c > 0) {
    throw badRequest(
      "Cannot delete sprint with bugs or test cases — deactivate it instead",
    );
  }

  if (sprint.is_default) {
    const { rows: fallback } = await query(
      `SELECT id FROM cycles
       WHERE project_id = $1 AND active = true AND id <> $2
       ORDER BY name ASC LIMIT 1`,
      [sprint.project_id, id],
    );
    if (fallback[0]) {
      await query(`UPDATE cycles SET is_default = true WHERE id = $1`, [fallback[0].id]);
    }
  }
  await query(`DELETE FROM cycles WHERE id = $1`, [id]);
}

export async function testProjectAdoConnection(actor, projectId) {
  if (!canManageSprints(actor)) throw forbidden("You cannot manage Azure DevOps settings");
  await assertCanManageProject(actor, projectId);
  const project = await requireProject(projectId);
  if (!project.ado_org_url || !project.ado_project) {
    throw badRequest("Set Azure DevOps org URL and project name first");
  }
  if (!project.ado_pat_encrypted) {
    throw badRequest("Save an Azure DevOps PAT first");
  }
  const pat = decryptSecret(project.ado_pat_encrypted);
  return testAdoConnection({
    orgUrl: project.ado_org_url,
    project: project.ado_project,
    team: project.ado_team,
    pat,
  });
}

export async function listProjectAdoIterations(actor, projectId) {
  if (!canManageSprints(actor)) throw forbidden("You cannot manage Azure DevOps settings");
  await assertCanManageProject(actor, projectId);
  const project = await requireProject(projectId);
  if (!project.ado_org_url || !project.ado_project || !project.ado_pat_encrypted) {
    throw badRequest("Configure Azure DevOps org URL, project, and PAT first");
  }
  const pat = decryptSecret(project.ado_pat_encrypted);
  return listAdoIterations({
    orgUrl: project.ado_org_url,
    project: project.ado_project,
    team: project.ado_team,
    pat,
  });
}

export async function importAdoSprints(actor, projectId, { iterationIds } = {}) {
  if (!canManageSprints(actor)) throw forbidden("You cannot manage sprints");
  await assertCanManageProject(actor, projectId);
  const iterations = await listProjectAdoIterations(actor, projectId);
  const wanted = Array.isArray(iterationIds) && iterationIds.length
    ? new Set(iterationIds.map(String))
    : null;
  const selected = wanted
    ? iterations.filter((it) => wanted.has(String(it.id)))
    : iterations;
  if (!selected.length) throw badRequest("No iterations to import");

  const imported = [];
  await withTransaction(async (client) => {
    const { rows: activeCount } = await client.query(
      `SELECT COUNT(*)::int AS c FROM cycles WHERE project_id = $1 AND active = true`,
      [projectId],
    );
    let hasDefault = activeCount[0].c > 0;

    for (const it of selected) {
      const { rows: existing } = await client.query(
        `SELECT * FROM cycles WHERE project_id = $1 AND ado_iteration_id = $2`,
        [projectId, it.id],
      );
      const start = it.startDate ? String(it.startDate).slice(0, 10) : null;
      const end = it.finishDate ? String(it.finishDate).slice(0, 10) : null;
      const makeDefault = !hasDefault && it.timeFrame === "current";
      if (existing[0]) {
        const { rows } = await client.query(
          `UPDATE cycles SET
            name = $1,
            ado_iteration_path = $2,
            start_date = $3,
            end_date = $4,
            source = 'ADO',
            active = true,
            last_synced_at = NOW(),
            is_default = CASE WHEN $5 THEN true ELSE is_default END
           WHERE id = $6
           RETURNING *`,
          [it.name, it.path, start, end, makeDefault, existing[0].id],
        );
        if (makeDefault) {
          await client.query(
            `UPDATE cycles SET is_default = false WHERE project_id = $1 AND id <> $2`,
            [projectId, existing[0].id],
          );
          hasDefault = true;
        }
        imported.push(toSprintDto(rows[0]));
      } else {
        const id = randomUUID();
        const { rows } = await client.query(
          `INSERT INTO cycles (
            id, project_id, name, is_default, start_date, end_date,
            ado_iteration_id, ado_iteration_path, source, active, last_synced_at
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'ADO',true,NOW())
          RETURNING *`,
          [id, projectId, it.name, makeDefault || !hasDefault, start, end, it.id, it.path],
        );
        if (makeDefault || !hasDefault) {
          await client.query(
            `UPDATE cycles SET is_default = false WHERE project_id = $1 AND id <> $2`,
            [projectId, id],
          );
          hasDefault = true;
        }
        imported.push(toSprintDto(rows[0]));
      }
    }
  });
  return { imported: imported.length, sprints: imported };
}

export async function listEnvironments(actor, projectId) {
  await assertCanAccessProject(actor, projectId);
  const includeInactive = canManageEnvironments(actor);
  const { rows } = await query(
    includeInactive
      ? `SELECT * FROM environments WHERE project_id = $1
         ORDER BY sort_order ASC, name ASC`
      : `SELECT * FROM environments WHERE project_id = $1 AND active = true
         ORDER BY sort_order ASC, name ASC`,
    [projectId],
  );
  return rows.map(toEnvironmentDto);
}

export async function createEnvironment(actor, projectId, { name, isDefault }) {
  if (!canManageEnvironments(actor)) {
    throw forbidden("You cannot manage environments");
  }
  await assertCanManageProject(actor, projectId);
  const envName = String(name || "").trim();
  if (!envName) throw badRequest("Environment name is required");
  if (envName.length > 255) throw badRequest("Environment name is too long");

  return withTransaction(async (client) => {
    const { rows: orderRows } = await client.query(
      `SELECT COALESCE(MAX(sort_order), -1) + 1 AS next_order
       FROM environments WHERE project_id = $1`,
      [projectId],
    );
    const sortOrder = orderRows[0]?.next_order ?? 0;
    const { rows: countRows } = await client.query(
      `SELECT COUNT(*)::int AS c FROM environments WHERE project_id = $1 AND active = true`,
      [projectId],
    );
    const makeDefault = isDefault === true || countRows[0].c === 0;
    const id = randomUUID();
    const { rows } = await client.query(
      `INSERT INTO environments (id, project_id, name, sort_order, is_default, active)
       VALUES ($1, $2, $3, $4, $5, true)
       RETURNING *`,
      [id, projectId, envName, sortOrder, makeDefault],
    );
    if (makeDefault) {
      await client.query(
        `UPDATE environments SET is_default = false
         WHERE project_id = $1 AND id <> $2`,
        [projectId, id],
      );
    }
    return toEnvironmentDto(rows[0]);
  });
}

export async function updateEnvironment(actor, id, { name, isDefault, active, sortOrder }) {
  if (!canManageEnvironments(actor)) {
    throw forbidden("You cannot manage environments");
  }
  const env = await requireEnvironment(id);
  await assertCanManageProject(actor, env.project_id);

  const nextName = name !== undefined ? String(name).trim() : env.name;
  if (!nextName) throw badRequest("Environment name is required");

  return withTransaction(async (client) => {
    const nextActive = active !== undefined ? !!active : env.active;
    const nextDefault = isDefault === true ? true : isDefault === false ? false : env.is_default;

    if (nextDefault && !nextActive) {
      throw badRequest("Inactive environment cannot be default");
    }

    const { rows } = await client.query(
      `UPDATE environments SET
        name = $1,
        is_default = $2,
        active = $3,
        sort_order = COALESCE($4, sort_order)
       WHERE id = $5
       RETURNING *`,
      [
        nextName,
        nextDefault,
        nextActive,
        sortOrder !== undefined ? Number(sortOrder) : null,
        id,
      ],
    );

    if (nextDefault) {
      await client.query(
        `UPDATE environments SET is_default = false
         WHERE project_id = $1 AND id <> $2`,
        [env.project_id, id],
      );
      rows[0].is_default = true;
    } else if (env.is_default && !nextDefault) {
      const { rows: fallback } = await client.query(
        `SELECT id FROM environments
         WHERE project_id = $1 AND active = true AND id <> $2
         ORDER BY sort_order ASC, name ASC
         LIMIT 1`,
        [env.project_id, id],
      );
      if (fallback[0]) {
        await client.query(`UPDATE environments SET is_default = true WHERE id = $1`, [
          fallback[0].id,
        ]);
      }
    }

    if (env.is_default && !nextActive) {
      await client.query(`UPDATE environments SET is_default = false WHERE id = $1`, [id]);
      const { rows: fallback } = await client.query(
        `SELECT id FROM environments
         WHERE project_id = $1 AND active = true AND id <> $2
         ORDER BY sort_order ASC, name ASC
         LIMIT 1`,
        [env.project_id, id],
      );
      if (fallback[0]) {
        await client.query(`UPDATE environments SET is_default = true WHERE id = $1`, [
          fallback[0].id,
        ]);
      }
      rows[0].is_default = false;
    }

    return toEnvironmentDto(rows[0]);
  });
}

export async function deleteEnvironment(actor, id) {
  if (!canManageEnvironments(actor)) {
    throw forbidden("You cannot manage environments");
  }
  const env = await requireEnvironment(id);
  await assertCanManageProject(actor, env.project_id);

  const { rows: activeRows } = await query(
    `SELECT COUNT(*)::int AS c FROM environments
     WHERE project_id = $1 AND active = true`,
    [env.project_id],
  );
  if (activeRows[0].c <= 1 && env.active) {
    throw badRequest("Project must keep at least one active environment");
  }

  await query(`UPDATE bugs SET environment_id = NULL WHERE environment_id = $1`, [id]);

  if (env.is_default) {
    const { rows: fallback } = await query(
      `SELECT id FROM environments
       WHERE project_id = $1 AND active = true AND id <> $2
       ORDER BY sort_order ASC, name ASC
       LIMIT 1`,
      [env.project_id, id],
    );
    if (fallback[0]) {
      await query(`UPDATE environments SET is_default = true WHERE id = $1`, [fallback[0].id]);
    }
  }

  await query(`DELETE FROM environments WHERE id = $1`, [id]);
}

function buildBugFilters({ projectId, projectIds, priority, severity, assigneeId, sprintId, cycleId, status, moduleId, environmentId }) {
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
  const resolvedSprint = sprintId || cycleId;
  if (resolvedSprint) add("cycle_id =", resolvedSprint);
  if (status) add("status =", status);
  if (moduleId) add("module_id =", moduleId);
  if (environmentId) add("environment_id =", environmentId);
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

async function loadBugDto(actor, id) {
  const row = await assertCanAccessBug(actor, id);
  return hydrateBug(row);
}

export async function getBug(actor, id, { syncFromAdo = false } = {}) {
  let bug = await loadBugDto(actor, id);

  const linked = bug.externalRefs?.adoWorkItemId;
  if (linked) {
    const last = bug.adoLastSyncedAt ? new Date(bug.adoLastSyncedAt).getTime() : 0;
    const stale = Date.now() - last > 60_000;
    if (syncFromAdo || stale) {
      try {
        const synced = await syncBugFromAdoImpl(actor, id, {
          getBug: loadBugDto,
          assertCanAccessBug,
        });
        bug = synced.bug;
      } catch {
        /* keep local copy if ADO unreachable */
      }
    }
  }
  return bug;
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
  await validateRefs(request.projectId, resolveSprintId(request), request.assigneeId, reporter);
  await validateModuleForProject(request.moduleId, request.projectId);
  await validateEnvironmentForProject(request.environmentId, request.projectId);
  const environmentSnapshot = blankToNull(request.environmentSnapshot);
  const bug = await withTransaction(async (client) => {
    const id = randomUUID();
    const now = new Date();
    const { rows } = await client.query(
      `INSERT INTO bugs (
        id, title, description, priority, severity, assignee_id, reporter_id,
        cycle_id, project_id, module_id, environment_id, environment_snapshot,
        status, jira_issue_key, ado_work_item_id, created_at, updated_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,NULL,NULL,$14,$14)
      RETURNING *`,
      [
        id,
        request.title,
        request.description,
        request.priority,
        request.severity,
        request.assigneeId,
        reporter.id,
        resolveSprintId(request),
        request.projectId,
        request.moduleId || null,
        request.environmentId || null,
        environmentSnapshot,
        request.status || "NEW",
        now,
      ],
    );
    await replaceSteps(client, id, request.steps);
    await persistScreenshots(client, id, request.screenshots);
    return hydrateBug(rows[0], client);
  });

  // Best-effort ADO create when project has PAT configured
  const adoPush = await tryAutoPushBugToAdo(reporter, bug.id, {
    getBug: loadBugDto,
    assertCanAccessBug,
  });
  if (!adoPush.skipped && adoPush.bug) {
    return adoPush.bug;
  }
  return bug;
}

export async function pushBugToAdo(actor, bugId) {
  return pushBugToAdoImpl(actor, bugId, { getBug: loadBugDto, assertCanAccessBug });
}

export async function syncBugFromAdo(actor, bugId) {
  return syncBugFromAdoImpl(actor, bugId, { getBug: loadBugDto, assertCanAccessBug });
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
    const updated = await hydrateBug(rows[0]);
    if (existing.ado_work_item_id) {
      void tryAutoPushBugToAdo(actor, id, { getBug: loadBugDto, assertCanAccessBug });
    }
    return updated;
  }

  if (canFullEditBug(actor)) {
    const projectId = request.projectId ?? existing.project_id;
    const assigneeId = request.assigneeId ?? existing.assignee_id;
    const sprintId =
      resolveSprintId(request) !== null &&
      (request.sprintId !== undefined || request.cycleId !== undefined)
        ? resolveSprintId(request)
        : existing.cycle_id;
    const moduleId =
      request.moduleId !== undefined ? request.moduleId : existing.module_id;
    const environmentId =
      request.environmentId !== undefined ? request.environmentId : existing.environment_id;
    const environmentSnapshot =
      request.environmentSnapshot !== undefined
        ? blankToNull(request.environmentSnapshot)
        : existing.environment_snapshot;
    await validateRefs(
      projectId,
      sprintId,
      assigneeId,
      request.assigneeId !== undefined ? actor : null,
    );
    await validateModuleForProject(moduleId, projectId);
    await validateEnvironmentForProject(environmentId, projectId, {
      existingEnvironmentId: existing.environment_id,
    });
    if (String(projectId) !== String(existing.project_id)) {
      await assertCanAccessProject(actor, projectId);
    }
    const updated = await withTransaction(async (client) => {
      const now = new Date();
      const { rows } = await client.query(
        `UPDATE bugs SET
          title = $1, description = $2, priority = $3, severity = $4,
          assignee_id = $5, cycle_id = $6, project_id = $7, module_id = $8,
          environment_id = $9, environment_snapshot = $10, status = $11,
          updated_at = $12
         WHERE id = $13
         RETURNING *`,
        [
          request.title ?? existing.title,
          request.description ?? existing.description,
          request.priority ?? existing.priority,
          request.severity ?? existing.severity,
          assigneeId,
          sprintId,
          projectId,
          moduleId || null,
          environmentId || null,
          environmentSnapshot,
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
    if (existing.ado_work_item_id || updated.externalRefs?.adoWorkItemId) {
      void tryAutoPushBugToAdo(actor, id, { getBug: loadBugDto, assertCanAccessBug });
    }
    return updated;
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

const TC_TYPES = new Set(["POSITIVE", "NEGATIVE"]);
const TC_PRIORITIES = new Set(["LOW", "MEDIUM", "HIGH"]);
const TC_STATUSES = new Set(["AI_DRAFT", "VERIFIED", "REJECTED", "UPLOADED"]);
const TC_EXEC = new Set(["PASSED", "FAILED", "BLOCKED", "NOT_EXECUTED"]);

function toTestCaseDto(row) {
  let steps = row.steps;
  if (typeof steps === "string") {
    try {
      steps = JSON.parse(steps);
    } catch {
      steps = [];
    }
  }
  if (!Array.isArray(steps)) steps = [];
  return {
    id: row.id,
    title: row.title,
    flowDescription: row.flow_description ?? "",
    type: row.type,
    preconditions: row.preconditions ?? null,
    steps,
    priority: row.priority,
    status: row.status,
    executionStatus: row.execution_status ?? "NOT_EXECUTED",
    generatedByAi: !!row.generated_by_ai,
    projectId: row.project_id,
    moduleId: row.module_id ?? null,
    sprintId: row.cycle_id,
    assigneeId: row.assignee_id ?? null,
    linkedBugId: row.linked_bug_id ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function buildTestCaseFilters({
  projectId,
  projectIds,
  moduleId,
  status,
  type,
  priority,
  assigneeId,
  executionStatus,
}) {
  const clauses = [];
  const params = [];
  const add = (sql, value) => {
    params.push(value);
    clauses.push(`${sql} $${params.length}`);
  };
  if (projectId) add("project_id =", projectId);
  else if (projectIds) {
    if (projectIds.length === 0) clauses.push("FALSE");
    else {
      params.push(projectIds);
      clauses.push(`project_id = ANY($${params.length}::uuid[])`);
    }
  }
  if (moduleId) add("module_id =", moduleId);
  if (status) add("status =", status);
  if (type) add("type =", type);
  if (priority) add("priority =", priority);
  if (assigneeId) add("assignee_id =", assigneeId);
  if (executionStatus) add("execution_status =", executionStatus);
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  return { where, params };
}

export async function listTestCases(actor, filters = {}) {
  const scoped = { ...filters };
  if (scoped.projectId) {
    await assertCanAccessProject(actor, scoped.projectId);
  } else if (!isSuperAdmin(actor)) {
    scoped.projectIds = await listAccessibleProjectIds(actor);
  }
  const { where, params } = buildTestCaseFilters(scoped);
  const { rows } = await query(
    `SELECT * FROM test_cases ${where} ORDER BY updated_at DESC`,
    params,
  );
  return rows.map(toTestCaseDto);
}

export async function getTestCase(actor, id) {
  const { rows } = await query(`SELECT * FROM test_cases WHERE id = $1`, [id]);
  if (!rows[0]) throw notFound("Test case not found");
  await assertCanAccessProject(actor, rows[0].project_id);
  return toTestCaseDto(rows[0]);
}

export async function createTestCase(actor, body) {
  if (!actor || !canCreateBug(actor)) {
    throw forbidden("You cannot create test cases");
  }
  const {
    title,
    flowDescription = "",
    type,
    preconditions,
    steps = [],
    priority,
    status = "AI_DRAFT",
    executionStatus = "NOT_EXECUTED",
    projectId,
    moduleId,
    cycleId,
    sprintId,
    assigneeId,
    linkedBugId,
    generatedByAi = false,
  } = body || {};

  if (!title?.trim()) throw badRequest("title is required");
  if (!TC_TYPES.has(type)) throw badRequest("type must be POSITIVE or NEGATIVE");
  if (!TC_PRIORITIES.has(priority)) throw badRequest("priority must be LOW, MEDIUM, or HIGH");
  if (!TC_STATUSES.has(status)) throw badRequest("invalid status");
  if (!TC_EXEC.has(executionStatus)) throw badRequest("invalid executionStatus");
  if (!projectId) throw badRequest("projectId is required");
  const resolvedSprint = sprintId || cycleId;
  if (!resolvedSprint) throw badRequest("sprintId is required");

  await assertCanAccessProject(actor, projectId);

  if (moduleId) {
    const { rows: mods } = await query(`SELECT project_id FROM modules WHERE id = $1`, [moduleId]);
    if (!mods[0] || mods[0].project_id !== projectId) {
      throw badRequest("moduleId does not belong to project");
    }
  }

  await assertAssignableUser(actor, assigneeId, { optional: true });

  const id = randomUUID();
  const { rows } = await query(
    `INSERT INTO test_cases (
       id, title, flow_description, type, preconditions, steps, priority, status,
       execution_status, generated_by_ai, project_id, module_id, cycle_id, assignee_id,
       linked_bug_id, created_at, updated_at
     ) VALUES (
       $1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9, $10, $11, $12, $13, $14, $15, NOW(), NOW()
     ) RETURNING *`,
    [
      id,
      title.trim(),
      String(flowDescription ?? ""),
      type,
      blankToNull(preconditions),
      JSON.stringify(Array.isArray(steps) ? steps : []),
      priority,
      status,
      executionStatus,
      !!generatedByAi,
      projectId,
      moduleId || null,
      resolvedSprint,
      assigneeId || null,
      linkedBugId || null,
    ],
  );
  return toTestCaseDto(rows[0]);
}

export async function updateTestCase(actor, id, body) {
  if (!actor || !canCreateBug(actor)) {
    throw forbidden("You cannot update test cases");
  }
  const existing = await getTestCase(actor, id);
  const {
    title = existing.title,
    flowDescription = existing.flowDescription,
    type = existing.type,
    preconditions = existing.preconditions,
    steps = existing.steps,
    priority = existing.priority,
    status = existing.status,
    executionStatus = existing.executionStatus,
    moduleId = existing.moduleId,
    cycleId,
    sprintId,
    assigneeId = existing.assigneeId,
    linkedBugId = existing.linkedBugId,
  } = body || {};

  if (!String(title).trim()) throw badRequest("title is required");
  if (!TC_TYPES.has(type)) throw badRequest("type must be POSITIVE or NEGATIVE");
  if (!TC_PRIORITIES.has(priority)) throw badRequest("priority must be LOW, MEDIUM, or HIGH");
  if (!TC_STATUSES.has(status)) throw badRequest("invalid status");
  if (!TC_EXEC.has(executionStatus)) throw badRequest("invalid executionStatus");
  const resolvedSprint = sprintId || cycleId || existing.sprintId;
  if (!resolvedSprint) throw badRequest("sprintId is required");

  if (moduleId) {
    const { rows: mods } = await query(`SELECT project_id FROM modules WHERE id = $1`, [moduleId]);
    if (!mods[0] || mods[0].project_id !== existing.projectId) {
      throw badRequest("moduleId does not belong to project");
    }
  }

  if (body && Object.prototype.hasOwnProperty.call(body, "assigneeId")) {
    await assertAssignableUser(actor, assigneeId, { optional: true });
  }

  const { rows } = await query(
    `UPDATE test_cases SET
       title = $1, flow_description = $2, type = $3, preconditions = $4, steps = $5::jsonb,
       priority = $6, status = $7, execution_status = $8, module_id = $9, cycle_id = $10,
       assignee_id = $11, linked_bug_id = $12, updated_at = NOW()
     WHERE id = $13
     RETURNING *`,
    [
      String(title).trim(),
      String(flowDescription ?? ""),
      type,
      blankToNull(preconditions),
      JSON.stringify(Array.isArray(steps) ? steps : []),
      priority,
      status,
      executionStatus,
      moduleId || null,
      resolvedSprint,
      assigneeId || null,
      linkedBugId || null,
      id,
    ],
  );
  return toTestCaseDto(rows[0]);
}

export async function deleteTestCase(actor, id) {
  if (!actor || !canDeleteBug(actor)) {
    throw forbidden("You cannot delete test cases");
  }
  await getTestCase(actor, id);
  await query(`DELETE FROM test_cases WHERE id = $1`, [id]);
}
