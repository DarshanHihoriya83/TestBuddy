import bcrypt from "bcryptjs";
import { randomUUID } from "crypto";
import { query, withTransaction } from "../db.js";
import {
  badRequest,
  conflict,
  notFound,
  unauthorized,
} from "../errors.js";
import { generateToken } from "./jwt.js";
import {
  deleteScreenshotFile,
  saveScreenshotFile,
  readScreenshotFile,
} from "./screenshotStorage.js";

function blankToNull(value) {
  if (value == null || String(value).trim() === "") return null;
  return String(value).trim();
}

function toUserDto(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
  };
}

function toProjectDto(project) {
  return {
    id: project.id,
    name: project.name,
    jiraProjectKey: project.jira_project_key ?? project.jiraProjectKey ?? null,
    adoOrgUrl: project.ado_org_url ?? project.adoOrgUrl ?? null,
    adoProject: project.ado_project ?? project.adoProject ?? null,
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

  const user = await query(`SELECT 1 FROM users WHERE id = $1`, [assigneeId]);
  if (!user.rowCount) throw badRequest("Unknown assigneeId");
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
    `SELECT id, name, email, password_hash AS "passwordHash", role
     FROM users WHERE LOWER(email) = LOWER($1)`,
    [email],
  );
  const user = rows[0];
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    throw unauthorized("Invalid credentials");
  }
  return {
    token: generateToken(user.id, user.email),
    user: toUserDto(user),
  };
}

export async function register({ name, email, password, role }) {
  const normalized = email.trim().toLowerCase();
  const existing = await query(
    `SELECT 1 FROM users WHERE LOWER(email) = LOWER($1)`,
    [normalized],
  );
  if (existing.rowCount) {
    throw conflict("An account with this email already exists");
  }
  const id = randomUUID();
  const passwordHash = await bcrypt.hash(password, 10);
  const { rows } = await query(
    `INSERT INTO users (id, name, email, password_hash, role)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, name, email, role`,
    [id, name.trim(), normalized, passwordHash, role || "TESTER"],
  );
  const user = rows[0];
  return {
    token: generateToken(user.id, user.email),
    user: toUserDto(user),
  };
}

export function currentUser(user) {
  return toUserDto(user);
}

export async function updateProfile(current, { name, currentPassword, newPassword }) {
  let passwordHash = current.passwordHash;
  const changingPassword = newPassword != null && String(newPassword).trim() !== "";
  if (changingPassword) {
    if (currentPassword == null || String(currentPassword).trim() === "") {
      throw badRequest("Current password is required");
    }
    if (!(await bcrypt.compare(currentPassword, current.passwordHash))) {
      throw badRequest("Current password is incorrect");
    }
    passwordHash = await bcrypt.hash(newPassword, 10);
  }
  const { rows } = await query(
    `UPDATE users SET name = $1, password_hash = $2 WHERE id = $3
     RETURNING id, name, email, role`,
    [name.trim(), passwordHash, current.id],
  );
  return toUserDto(rows[0]);
}

export async function listUsers() {
  const { rows } = await query(`SELECT id, name, email, role FROM users ORDER BY name`);
  return rows.map(toUserDto);
}

export async function listProjects() {
  const { rows } = await query(`SELECT * FROM projects ORDER BY name`);
  return rows.map(toProjectDto);
}

export async function getProject(id) {
  const project = await requireProject(id);
  const cycles = await query(`SELECT COUNT(*)::int AS c FROM cycles WHERE project_id = $1`, [id]);
  const bugs = await query(`SELECT COUNT(*)::int AS c FROM bugs WHERE project_id = $1`, [id]);
  return {
    ...toProjectDto(project),
    cycleCount: cycles.rows[0].c,
    bugCount: bugs.rows[0].c,
  };
}

export async function createProject({ name, jiraProjectKey, adoOrgUrl, adoProject }) {
  return withTransaction(async (client) => {
    const id = randomUUID();
    const { rows } = await client.query(
      `INSERT INTO projects (id, name, jira_project_key, ado_org_url, ado_project)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [id, name.trim(), blankToNull(jiraProjectKey), blankToNull(adoOrgUrl), blankToNull(adoProject)],
    );
    await client.query(
      `INSERT INTO cycles (id, project_id, name, is_default, start_date, end_date)
       VALUES ($1, $2, 'Cycle 1', true, NULL, NULL)`,
      [randomUUID(), id],
    );
    return toProjectDto(rows[0]);
  });
}

export async function updateProject(id, { name, jiraProjectKey, adoOrgUrl, adoProject }) {
  await requireProject(id);
  const { rows } = await query(
    `UPDATE projects
     SET name = $1, jira_project_key = $2, ado_org_url = $3, ado_project = $4
     WHERE id = $5
     RETURNING *`,
    [name.trim(), blankToNull(jiraProjectKey), blankToNull(adoOrgUrl), blankToNull(adoProject), id],
  );
  return toProjectDto(rows[0]);
}

export async function deleteProject(id) {
  await requireProject(id);
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

export async function deleteBug(id) {
  await requireBug(id);
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

export async function listCycles(projectId) {
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

function buildBugFilters({ projectId, priority, severity, assigneeId, cycleId, status }) {
  const clauses = [];
  const params = [];
  const add = (sql, value) => {
    params.push(value);
    clauses.push(`${sql} $${params.length}`);
  };
  if (projectId) add("project_id =", projectId);
  if (priority) add("priority =", priority);
  if (severity) add("severity =", severity);
  if (assigneeId) add("assignee_id =", assigneeId);
  if (cycleId) add("cycle_id =", cycleId);
  if (status) add("status =", status);
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  return { where, params };
}

export async function listBugs(filters) {
  const { where, params } = buildBugFilters(filters);
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

export async function exportBugs(filters) {
  const bugs = await listBugs(filters);
  return { exportedAt: new Date().toISOString(), count: bugs.length, bugs };
}

export async function exportBug(id) {
  const bug = await getBug(id);
  return { exportedAt: new Date().toISOString(), count: 1, bugs: [bug] };
}

export async function importBugs({ bugs }, reporter) {
  const imported = [];
  for (const bugRequest of bugs) {
    imported.push(await createBug(bugRequest, reporter));
  }
  return { imported: imported.length, bugs: imported };
}

export async function getBug(id) {
  const bug = await requireBug(id);
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
  await validateRefs(request.projectId, request.cycleId, request.assigneeId);
  return withTransaction(async (client) => {
    const id = randomUUID();
    const now = new Date();
    const { rows } = await client.query(
      `INSERT INTO bugs (
        id, title, description, priority, severity, assignee_id, reporter_id,
        cycle_id, project_id, status, jira_issue_key, ado_work_item_id,
        created_at, updated_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NULL,NULL,$11,$11)
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
        request.status || "NEW",
        now,
      ],
    );
    await replaceSteps(client, id, request.steps);
    await persistScreenshots(client, id, request.screenshots);
    return hydrateBug(rows[0], client);
  });
}

export async function updateBug(id, request) {
  await requireBug(id);
  await validateRefs(request.projectId, request.cycleId, request.assigneeId);
  return withTransaction(async (client) => {
    const now = new Date();
    const { rows } = await client.query(
      `UPDATE bugs SET
        title = $1, description = $2, priority = $3, severity = $4,
        assignee_id = $5, cycle_id = $6, project_id = $7, status = $8,
        updated_at = $9
       WHERE id = $10
       RETURNING *`,
      [
        request.title,
        request.description,
        request.priority,
        request.severity,
        request.assigneeId,
        request.cycleId,
        request.projectId,
        request.status,
        now,
        id,
      ],
    );
    await replaceSteps(client, id, request.steps);
    return hydrateBug(rows[0], client);
  });
}

export async function getScreenshot(id) {
  const { rows } = await query(`SELECT * FROM screenshots WHERE id = $1`, [id]);
  if (!rows[0]) throw notFound("Screenshot not found");
  return rows[0];
}

export async function readScreenshotBytes(id) {
  const row = await getScreenshot(id);
  const buffer = await readScreenshotFile(row.storage_path);
  return { row, buffer };
}
