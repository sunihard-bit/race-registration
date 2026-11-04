import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const DB_PATH = process.env.DATABASE_PATH || path.join(process.cwd(), "data", "app.db");

declare global {
  // eslint-disable-next-line no-var
  var __db: Database.Database | undefined;
}

function open() {
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  const db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  const schema = fs.readFileSync(path.join(process.cwd(), "src", "lib", "schema.sql"), "utf8");
  db.exec(schema);
  migrate(db);
  return db;
}

/** Column additions for databases created by an older version of the schema. */
function migrate(d: Database.Database) {
  const has = (table: string, col: string) =>
    (d.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).some((c) => c.name === col);
  if (!has("event_fees", "deduct_processing")) {
    d.exec("ALTER TABLE event_fees ADD COLUMN deduct_processing INTEGER NOT NULL DEFAULT 1");
    d.exec("ALTER TABLE event_fees ADD COLUMN processing_bps INTEGER NOT NULL DEFAULT 350");
  }
  if (!has("orders", "third_party_cents")) d.exec("ALTER TABLE orders ADD COLUMN third_party_cents INTEGER NOT NULL DEFAULT 0");
}

export const db: Database.Database = globalThis.__db ?? (globalThis.__db = open());

export function newId(bytes = 9) {
  return crypto.randomBytes(bytes).toString("base64url");
}

export function one<T>(sql: string, ...params: unknown[]): T | undefined {
  return db.prepare(sql).get(...params) as T | undefined;
}
export function all<T>(sql: string, ...params: unknown[]): T[] {
  return db.prepare(sql).all(...params) as T[];
}
export function run(sql: string, ...params: unknown[]) {
  return db.prepare(sql).run(...params);
}

export function audit(userId: string | null, eventId: string | null, action: string, detail = "") {
  run("INSERT INTO audit_log (user_id, event_id, action, detail) VALUES (?,?,?,?)", userId, eventId, action, detail);
}
