import { describe, expect, it, vi } from "vitest";
import { runServerMigrations, SERVER_MIGRATIONS } from "./migrations.js";

describe("server schema migrations", () => {
  it("records the human-release migration atomically", async () => {
    const statements: string[] = [];
    const client = {
      query: vi.fn(async (sql: string) => {
        statements.push(sql);
        return { rowCount: sql.startsWith("SELECT 1 FROM schema_migrations") ? 0 : 1, rows: [] };
      }),
      release: vi.fn()
    };
    await runServerMigrations({ connect: async () => client } as never);
    expect(statements[0]).toBe("BEGIN");
    expect(statements).toContain(SERVER_MIGRATIONS[0].sql);
    expect(statements.at(-1)).toBe("COMMIT");
    expect(client.release).toHaveBeenCalledOnce();
  });

  it("rolls back and releases the client on migration failure", async () => {
    const client = {
      query: vi.fn(async (sql: string) => {
        if (sql === SERVER_MIGRATIONS[0].sql) throw new Error("migration failed");
        return { rowCount: sql.startsWith("SELECT 1 FROM schema_migrations") ? 0 : 1, rows: [] };
      }),
      release: vi.fn()
    };
    await expect(runServerMigrations({ connect: async () => client } as never)).rejects.toThrow("migration failed");
    expect(client.query).toHaveBeenCalledWith("ROLLBACK");
    expect(client.release).toHaveBeenCalledOnce();
  });
});
