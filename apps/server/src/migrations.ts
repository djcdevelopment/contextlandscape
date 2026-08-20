import type { Pool } from "pg";

export const SERVER_MIGRATIONS = [{
  id: "20260819_human_release_v1",
  sql: `
    CREATE TABLE IF NOT EXISTS player_accounts (
      account_id text PRIMARY KEY,
      discord_subject text UNIQUE NOT NULL,
      display_name text NOT NULL,
      avatar_url text,
      created_at timestamptz NOT NULL,
      last_seen_at timestamptz NOT NULL
    );
    CREATE TABLE IF NOT EXISTS player_sessions (
      session_hash text PRIMARY KEY,
      account_id text NOT NULL REFERENCES player_accounts(account_id) ON DELETE CASCADE,
      csrf_token text NOT NULL,
      expires_at timestamptz NOT NULL
    );
    CREATE INDEX IF NOT EXISTS player_sessions_account_idx ON player_sessions(account_id);
    CREATE TABLE IF NOT EXISTS player_fleets (
      fleet_id text PRIMARY KEY,
      owner_account_id text NOT NULL REFERENCES player_accounts(account_id) ON DELETE CASCADE,
      data jsonb NOT NULL,
      created_at timestamptz NOT NULL,
      updated_at timestamptz NOT NULL
    );
    CREATE INDEX IF NOT EXISTS player_fleets_owner_idx ON player_fleets(owner_account_id);
    CREATE TABLE IF NOT EXISTS battle_friend_challenges (
      challenge_id text PRIMARY KEY,
      creator_account_id text NOT NULL REFERENCES player_accounts(account_id) ON DELETE CASCADE,
      opponent_account_id text REFERENCES player_accounts(account_id) ON DELETE SET NULL,
      creator_fleet jsonb NOT NULL,
      opponent_fleet jsonb,
      status text NOT NULL,
      created_at timestamptz NOT NULL,
      expires_at timestamptz NOT NULL,
      match_id text REFERENCES battle_command_matches(match_id) ON DELETE SET NULL
    );
    CREATE INDEX IF NOT EXISTS battle_friend_challenges_creator_idx ON battle_friend_challenges(creator_account_id);
    CREATE INDEX IF NOT EXISTS battle_friend_challenges_opponent_idx ON battle_friend_challenges(opponent_account_id);
    CREATE TABLE IF NOT EXISTS battle_pending_submissions (
      match_id text NOT NULL REFERENCES battle_command_matches(match_id) ON DELETE CASCADE,
      round integer NOT NULL,
      phase text NOT NULL,
      player_id text NOT NULL,
      submission jsonb NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY(match_id,round,phase,player_id)
    );
  `
}] as const;

export async function runServerMigrations(pool: Pool): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext('context_landscape_schema_migrations'))");
    await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
      migration_id text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )`);
    for (const migration of SERVER_MIGRATIONS) {
      const applied = await client.query("SELECT 1 FROM schema_migrations WHERE migration_id=$1", [migration.id]);
      if (applied.rowCount) continue;
      await client.query(migration.sql);
      await client.query("INSERT INTO schema_migrations(migration_id) VALUES($1)", [migration.id]);
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
