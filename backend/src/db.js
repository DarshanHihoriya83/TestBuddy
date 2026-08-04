import pg from "pg";
import { config } from "./config.js";

const { Pool } = pg;

export const pool = new Pool({ connectionString: config.databaseUrl });

export async function query(text, params) {
  return pool.query(text, params);
}

export async function withClient(fn) {
  const client = await pool.connect();
  try {
    return await fn(client);
  } finally {
    client.release();
  }
}

export async function withTransaction(fn) {
  return withClient(async (client) => {
    await client.query("BEGIN");
    try {
      const result = await fn(client);
      await client.query("COMMIT");
      return result;
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    }
  });
}

export async function ensureSchema() {
  await query(`
    CREATE TABLE IF NOT EXISTS users (
      id UUID PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      email VARCHAR(255) NOT NULL UNIQUE,
      password_hash VARCHAR(255) NOT NULL,
      role VARCHAR(255) NOT NULL
    );

    CREATE TABLE IF NOT EXISTS projects (
      id UUID PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      description VARCHAR(4000),
      jira_project_key VARCHAR(255),
      ado_org_url VARCHAR(255),
      ado_project VARCHAR(255)
    );

    CREATE TABLE IF NOT EXISTS cycles (
      id UUID PRIMARY KEY,
      project_id UUID NOT NULL,
      name VARCHAR(255) NOT NULL,
      is_default BOOLEAN NOT NULL,
      start_date DATE,
      end_date DATE
    );

    CREATE TABLE IF NOT EXISTS bugs (
      id UUID PRIMARY KEY,
      title VARCHAR(255) NOT NULL,
      description VARCHAR(4000) NOT NULL,
      priority VARCHAR(255) NOT NULL,
      severity VARCHAR(255) NOT NULL,
      assignee_id UUID NOT NULL,
      reporter_id UUID NOT NULL,
      cycle_id UUID NOT NULL,
      project_id UUID NOT NULL,
      status VARCHAR(255) NOT NULL,
      jira_issue_key VARCHAR(255),
      ado_work_item_id VARCHAR(255),
      created_at TIMESTAMPTZ NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL
    );

    CREATE TABLE IF NOT EXISTS bug_steps (
      id UUID PRIMARY KEY,
      bug_id UUID REFERENCES bugs(id) ON DELETE CASCADE,
      step_order INTEGER NOT NULL,
      action_type VARCHAR(255) NOT NULL,
      element_label VARCHAR(255) NOT NULL,
      selector VARCHAR(255) NOT NULL,
      value_entered VARCHAR(255),
      page_url VARCHAR(255) NOT NULL,
      description VARCHAR(2000) NOT NULL,
      actual_result VARCHAR(2000),
      expected_result VARCHAR(2000),
      screenshot_id VARCHAR(255)
    );

    CREATE TABLE IF NOT EXISTS screenshots (
      id UUID PRIMARY KEY,
      bug_id UUID NOT NULL REFERENCES bugs(id) ON DELETE CASCADE,
      overview VARCHAR(2000),
      page_url VARCHAR(2000),
      content_type VARCHAR(100) NOT NULL,
      storage_path VARCHAR(500) NOT NULL,
      annotations JSONB,
      created_at TIMESTAMPTZ NOT NULL
    );

    CREATE TABLE IF NOT EXISTS project_members (
      project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (project_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS organizations (
      id UUID PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS organization_members (
      organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (organization_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS modules (
      id UUID PRIMARY KEY,
      project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      name VARCHAR(255) NOT NULL,
      description VARCHAR(4000),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS bug_comments (
      id UUID PRIMARY KEY,
      bug_id UUID NOT NULL REFERENCES bugs(id) ON DELETE CASCADE,
      author_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      body VARCHAR(4000) NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await query(`
    ALTER TABLE users
    ADD COLUMN IF NOT EXISTS active BOOLEAN NOT NULL DEFAULT true
  `);

  await query(`
    ALTER TABLE projects
    ADD COLUMN IF NOT EXISTS description VARCHAR(4000)
  `);

  await query(`
    ALTER TABLE modules
    ADD COLUMN IF NOT EXISTS description VARCHAR(4000)
  `);

  // Backfill organization_id on projects, then enforce NOT NULL
  await query(`
    ALTER TABLE projects
    ADD COLUMN IF NOT EXISTS organization_id UUID
  `);
  await query(`
    DO $$
    DECLARE
      demo_org UUID;
    BEGIN
      IF EXISTS (SELECT 1 FROM projects WHERE organization_id IS NULL) THEN
        SELECT id INTO demo_org FROM organizations WHERE name = 'Demo Organization' LIMIT 1;
        IF demo_org IS NULL THEN
          demo_org := '00000000-0000-4000-8000-000000000001';
          INSERT INTO organizations (id, name, created_at)
          VALUES (demo_org, 'Demo Organization', NOW())
          ON CONFLICT (id) DO NOTHING;
          SELECT id INTO demo_org FROM organizations WHERE name = 'Demo Organization' LIMIT 1;
        END IF;
        UPDATE projects SET organization_id = demo_org WHERE organization_id IS NULL;
      END IF;
    END $$;
  `);
  await query(`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'projects' AND column_name = 'organization_id'
          AND is_nullable = 'YES'
      ) THEN
        ALTER TABLE projects ALTER COLUMN organization_id SET NOT NULL;
      END IF;
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'projects_organization_id_fkey'
      ) THEN
        ALTER TABLE projects
          ADD CONSTRAINT projects_organization_id_fkey
          FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;
      END IF;
    END $$;
  `);

  await query(`
    ALTER TABLE bugs
    ADD COLUMN IF NOT EXISTS module_id UUID
  `);
  await query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'bugs_module_id_fkey'
      ) THEN
        ALTER TABLE bugs
          ADD CONSTRAINT bugs_module_id_fkey
          FOREIGN KEY (module_id) REFERENCES modules(id) ON DELETE SET NULL;
      END IF;
    END $$;
  `);

  // Migrate legacy ADMIN → MANAGER, then enforce role check without ADMIN.
  await query(`UPDATE users SET role = 'MANAGER' WHERE role = 'ADMIN'`);
  await query(`
    DO $$
    DECLARE
      r RECORD;
    BEGIN
      FOR r IN
        SELECT con.conname
        FROM pg_constraint con
        JOIN pg_class rel ON rel.oid = con.conrelid
        JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
        WHERE nsp.nspname = 'public'
          AND rel.relname = 'users'
          AND con.contype = 'c'
          AND pg_get_constraintdef(con.oid) ILIKE '%role%'
      LOOP
        EXECUTE format('ALTER TABLE users DROP CONSTRAINT %I', r.conname);
      END LOOP;
      ALTER TABLE users
        ADD CONSTRAINT users_role_check
        CHECK (role IN ('SUPERADMIN','MANAGER','DEVELOPER','TESTER'));
    END $$;
  `);

  // Existing DBs created before actual_result
  await query(`
    ALTER TABLE bug_steps
    ADD COLUMN IF NOT EXISTS actual_result VARCHAR(2000)
  `);

  // Ensure bug_steps → bugs deletes cascade (older Hibernate FKs were RESTRICT)
  await query(`
    DO $$
    DECLARE
      r RECORD;
    BEGIN
      FOR r IN
        SELECT con.conname
        FROM pg_constraint con
        JOIN pg_class rel ON rel.oid = con.conrelid
        JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
        WHERE nsp.nspname = 'public'
          AND rel.relname = 'bug_steps'
          AND con.contype = 'f'
          AND con.confrelid = 'bugs'::regclass
      LOOP
        EXECUTE format('ALTER TABLE bug_steps DROP CONSTRAINT %I', r.conname);
      END LOOP;
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'bug_steps_bug_id_fkey'
      ) THEN
        ALTER TABLE bug_steps
          ADD CONSTRAINT bug_steps_bug_id_fkey
          FOREIGN KEY (bug_id) REFERENCES bugs(id) ON DELETE CASCADE;
      END IF;
    END $$;
  `);

  // Track who created each project (Manager per-user create limit).
  await query(`
    ALTER TABLE projects
    ADD COLUMN IF NOT EXISTS created_by UUID
  `);
  await query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'projects_created_by_fkey'
      ) THEN
        ALTER TABLE projects
          ADD CONSTRAINT projects_created_by_fkey
          FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL;
      END IF;
    END $$;
  `);
  // Backfill: prefer a Manager who is already a project member, else first member.
  await query(`
    UPDATE projects p
    SET created_by = sub.user_id
    FROM (
      SELECT DISTINCT ON (pm.project_id)
        pm.project_id,
        pm.user_id
      FROM project_members pm
      JOIN users u ON u.id = pm.user_id
      ORDER BY pm.project_id,
        CASE u.role WHEN 'MANAGER' THEN 0 WHEN 'SUPERADMIN' THEN 1 ELSE 2 END,
        pm.created_at ASC
    ) sub
    WHERE p.id = sub.project_id AND p.created_by IS NULL
  `);
}
