import bcrypt from "bcryptjs";
import { randomUUID } from "crypto";
import { query } from "./db.js";

async function ensureDemoOrganization() {
  const { rows } = await query(
    `SELECT id FROM organizations WHERE name = 'Demo Organization' LIMIT 1`,
  );
  if (rows[0]) return rows[0].id;

  const orgId = randomUUID();
  await query(
    `INSERT INTO organizations (id, name, created_at) VALUES ($1, 'Demo Organization', NOW())`,
    [orgId],
  );
  console.log("Seeded Demo Organization");
  return orgId;
}

async function ensureDemoOrgMembers(orgId) {
  const { rows: countRows } = await query(
    `SELECT COUNT(*)::int AS c FROM organization_members WHERE organization_id = $1`,
    [orgId],
  );
  if (countRows[0].c > 0) return;

  await query(
    `INSERT INTO organization_members (organization_id, user_id, created_at)
     SELECT $1, id, NOW() FROM users
     WHERE active = true AND role <> 'SUPERADMIN'
     ON CONFLICT DO NOTHING`,
    [orgId],
  );
  console.log("Seeded organization members for Demo Organization");
}

async function ensureDemoProject(orgId) {
  const { rows } = await query(`SELECT COUNT(*)::int AS c FROM projects`);
  if (rows[0].c > 0) {
    // Ensure orphan projects point at demo org
    await query(
      `UPDATE projects SET organization_id = $1 WHERE organization_id IS NULL`,
      [orgId],
    );
    return null;
  }

  const projectId = randomUUID();
  await query(
    `INSERT INTO projects (id, name, jira_project_key, ado_org_url, ado_project, organization_id, created_at)
     VALUES ($1, 'Demo Project', NULL, NULL, NULL, $2, NOW())`,
    [projectId, orgId],
  );
  await query(
    `INSERT INTO cycles (id, project_id, name, is_default, start_date, end_date, source, active)
     VALUES ($1, $2, 'Sprint 1', true, NULL, NULL, 'MANUAL', true)`,
    [randomUUID(), projectId],
  );
  await query(
    `INSERT INTO cycles (id, project_id, name, is_default, start_date, end_date, source, active)
     VALUES ($1, $2, 'Sprint 2', false, NULL, NULL, 'MANUAL', true)`,
    [randomUUID(), projectId],
  );
  console.log("Seeded Demo Project");
  return projectId;
}

async function ensureDemoProjectMembers() {
  const { rows: projects } = await query(
    `SELECT id FROM projects ORDER BY name ASC LIMIT 1`,
  );
  if (!projects[0]) return;
  const projectId = projects[0].id;

  const { rows: countRows } = await query(
    `SELECT COUNT(*)::int AS c FROM project_members WHERE project_id = $1`,
    [projectId],
  );
  if (countRows[0].c > 0) return;

  await query(
    `INSERT INTO project_members (project_id, user_id, created_at)
     SELECT $1, id, NOW() FROM users WHERE active = true
     ON CONFLICT DO NOTHING`,
    [projectId],
  );
  console.log("Seeded project members for demo/first project");
}

async function ensureDemoModule() {
  const { rows: projects } = await query(
    `SELECT id FROM projects ORDER BY name ASC LIMIT 1`,
  );
  if (!projects[0]) return;
  const projectId = projects[0].id;
  const { rows: mods } = await query(
    `SELECT id FROM modules WHERE project_id = $1 ORDER BY created_at ASC LIMIT 1`,
    [projectId],
  );
  if (mods[0]) return mods[0].id;
  const moduleId = randomUUID();
  await query(
    `INSERT INTO modules (id, project_id, name, created_at)
     VALUES ($1, $2, 'General', NOW())`,
    [moduleId, projectId],
  );
  console.log("Seeded General module for demo project");
  return moduleId;
}

async function ensureDemoTestCases() {
  const { rows: countRows } = await query(`SELECT COUNT(*)::int AS c FROM test_cases`);
  if (countRows[0].c > 0) return;

  const { rows: projects } = await query(`SELECT id FROM projects ORDER BY name ASC LIMIT 1`);
  if (!projects[0]) return;
  const projectId = projects[0].id;

  let moduleId;
  const { rows: mods } = await query(
    `SELECT id FROM modules WHERE project_id = $1 ORDER BY created_at ASC LIMIT 1`,
    [projectId],
  );
  if (mods[0]) moduleId = mods[0].id;
  else {
    moduleId = await ensureDemoModule();
  }
  if (!moduleId) return;

  const { rows: cycles } = await query(
    `SELECT id FROM cycles WHERE project_id = $1 AND is_default = true LIMIT 1`,
    [projectId],
  );
  const cycleId = cycles[0]?.id;
  if (!cycleId) return;

  const { rows: users } = await query(
    `SELECT id, name FROM users WHERE active = true ORDER BY name ASC`,
  );
  if (!users.length) return;

  const samples = [
    ["Verify successful login with valid credentials", "POSITIVE", "HIGH", "PASSED", "VERIFIED"],
    ["Login fails with invalid password", "NEGATIVE", "HIGH", "FAILED", "VERIFIED"],
    ["Login blocked for locked account", "NEGATIVE", "MEDIUM", "BLOCKED", "AI_DRAFT"],
    ["Remember me keeps session after refresh", "POSITIVE", "MEDIUM", "PASSED", "VERIFIED"],
    ["Empty email shows validation error", "NEGATIVE", "LOW", "NOT_EXECUTED", "AI_DRAFT"],
    ["Password reset email is delivered", "POSITIVE", "HIGH", "PASSED", "VERIFIED"],
    ["SSO login redirects to IdP", "POSITIVE", "MEDIUM", "NOT_EXECUTED", "AI_DRAFT"],
    ["Logout clears session cookie", "POSITIVE", "LOW", "PASSED", "UPLOADED"],
    ["SQL injection rejected on login form", "NEGATIVE", "CRITICAL", "FAILED", "VERIFIED"],
    ["Concurrent login from two devices", "POSITIVE", "MEDIUM", "BLOCKED", "REJECTED"],
  ];

  for (let i = 0; i < samples.length; i++) {
    const [title, type, priority, executionStatus, status] = samples[i];
    const assignee = users[i % users.length];
    const steps = [
      { order: 1, action: "Open the application login page", expectedResult: "Login form is displayed" },
      { order: 2, action: "Enter credentials and submit", expectedResult: "System responds as expected" },
    ];
    await query(
      `INSERT INTO test_cases (
         id, title, flow_description, type, preconditions, steps, priority, status,
         execution_status, generated_by_ai, project_id, module_id, cycle_id, assignee_id,
         created_at, updated_at
       ) VALUES (
         $1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9, false, $10, $11, $12, $13, NOW(), NOW()
       )`,
      [
        randomUUID(),
        title,
        "Authentication flow for the General module",
        type,
        "User has a registered account",
        JSON.stringify(steps),
        priority === "CRITICAL" ? "HIGH" : priority,
        status,
        executionStatus,
        projectId,
        moduleId,
        cycleId,
        assignee.id,
      ],
    );
  }
  console.log(`Seeded ${samples.length} demo test cases`);
}

async function ensureSuperAdmin() {
  const { rows } = await query(
    `SELECT id FROM users WHERE LOWER(email) = LOWER($1)`,
    ["superadmin@testbuddy.local"],
  );
  if (rows[0]) return;

  const passwordHash = await bcrypt.hash("password", 12);
  await query(
    `INSERT INTO users (id, name, email, password_hash, role, active)
     VALUES ($1, $2, $3, $4, 'SUPERADMIN', true)`,
    [randomUUID(), "Super Admin", "superadmin@testbuddy.local", passwordHash],
  );
  console.log("Seeded SuperAdmin (superadmin@testbuddy.local)");
}

export async function seedIfEmpty() {
  const { rows } = await query(`SELECT COUNT(*)::int AS c FROM users`);
  if (rows[0].c === 0) {
    const passwordHash = await bcrypt.hash("password", 12);
    const users = [
      ["Super Admin", "superadmin@testbuddy.local", "SUPERADMIN"],
      ["Alice Tester", "alice@testbuddy.local", "TESTER"],
      ["Bob Developer", "bob@testbuddy.local", "DEVELOPER"],
      ["Carol Manager", "carol@testbuddy.local", "MANAGER"],
    ];

    for (const [name, email, role] of users) {
      await query(
        `INSERT INTO users (id, name, email, password_hash, role, active)
         VALUES ($1, $2, $3, $4, $5, true)`,
        [randomUUID(), name, email, passwordHash, role],
      );
    }
    console.log("Seeded demo users (incl. SuperAdmin)");
  } else {
    await ensureSuperAdmin();
  }

  const orgId = await ensureDemoOrganization();
  await ensureDemoOrgMembers(orgId);
  await ensureDemoProject(orgId);
  await ensureDemoProjectMembers();
  await ensureDemoModule();
  await ensureDemoTestCases();
}
