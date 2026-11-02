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
  return db;
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
