import bcrypt from "bcryptjs";
import { randomUUID } from "crypto";
import { query } from "./db.js";

async function ensureDemoProject() {
  const { rows } = await query(`SELECT COUNT(*)::int AS c FROM projects`);
  if (rows[0].c > 0) return;

  const projectId = randomUUID();
  await query(
    `INSERT INTO projects (id, name, jira_project_key, ado_org_url, ado_project)
     VALUES ($1, 'Demo Project', NULL, NULL, NULL)`,
    [projectId],
  );
  await query(
    `INSERT INTO cycles (id, project_id, name, is_default, start_date, end_date)
     VALUES ($1, $2, 'Cycle 1', true, NULL, NULL)`,
    [randomUUID(), projectId],
  );
  await query(
    `INSERT INTO cycles (id, project_id, name, is_default, start_date, end_date)
     VALUES ($1, $2, 'Cycle 2', false, NULL, NULL)`,
    [randomUUID(), projectId],
  );
  console.log("Seeded Demo Project");
}

export async function seedIfEmpty() {
  const { rows } = await query(`SELECT COUNT(*)::int AS c FROM users`);
  if (rows[0].c === 0) {
    const passwordHash = await bcrypt.hash("password", 10);
    const users = [
      ["Admin User", "admin@testbuddy.local", "ADMIN"],
      ["Alice Tester", "alice@testbuddy.local", "TESTER"],
      ["Bob Developer", "bob@testbuddy.local", "DEVELOPER"],
      ["Carol Manager", "carol@testbuddy.local", "MANAGER"],
    ];

    for (const [name, email, role] of users) {
      await query(
        `INSERT INTO users (id, name, email, password_hash, role)
         VALUES ($1, $2, $3, $4, $5)`,
        [randomUUID(), name, email, passwordHash, role],
      );
    }
    console.log("Seeded demo users");
  }

  await ensureDemoProject();
}
