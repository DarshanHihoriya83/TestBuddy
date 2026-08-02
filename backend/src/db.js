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
}
