import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

export const DB_PATH = process.env.DATABASE_PATH || path.join(process.cwd(), "data", "app.db");

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
  // Several build workers can open the DB at once, so ignore "duplicate column" from a lost race.
  const exec = (sql: string) => {
    try { d.exec(sql); } catch (e) { if (!/duplicate column/i.test(String(e))) throw e; }
  };
  if (!has("event_fees", "deduct_processing")) {
    exec("ALTER TABLE event_fees ADD COLUMN deduct_processing INTEGER NOT NULL DEFAULT 1");
    exec("ALTER TABLE event_fees ADD COLUMN processing_bps INTEGER NOT NULL DEFAULT 350");
  }
  if (!has("registrations", "chip")) exec("ALTER TABLE registrations ADD COLUMN chip TEXT NOT NULL DEFAULT ''");
  if (!has("registrations", "wave")) exec("ALTER TABLE registrations ADD COLUMN wave TEXT NOT NULL DEFAULT ''");
  if (!has("events", "timing_token")) exec("ALTER TABLE events ADD COLUMN timing_token TEXT");
  if (!has("registrations", "confirm_code")) exec("ALTER TABLE registrations ADD COLUMN confirm_code TEXT");
  d.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_reg_confirm_code ON registrations(confirm_code)");
  // Give every confirmed registration a code (covers data from before codes existed, and seeded data).
  const missing = d.prepare("SELECT id FROM registrations WHERE status='confirmed' AND confirm_code IS NULL").all() as { id: string }[];
  const set = d.prepare("UPDATE registrations SET confirm_code=? WHERE id=? AND confirm_code IS NULL");
  for (const r of missing) {
    for (let i = 0; i < 5; i++) {
      try { set.run(newConfirmCode(), r.id); break; } catch (e) { if (!/UNIQUE/i.test(String(e))) throw e; }
    }
  }
  if (!has("events", "lat")) { exec("ALTER TABLE events ADD COLUMN lat REAL"); exec("ALTER TABLE events ADD COLUMN lng REAL"); }
  if (!has("events", "featured_until")) exec("ALTER TABLE events ADD COLUMN featured_until TEXT");
  if (!has("orders", "third_party_cents")) exec("ALTER TABLE orders ADD COLUMN third_party_cents INTEGER NOT NULL DEFAULT 0");
  if (!has("events", "payout_details_enc")) exec("ALTER TABLE events ADD COLUMN payout_details_enc TEXT");
}

export const db: Database.Database = globalThis.__db ?? (globalThis.__db = open());

export function newConfirmCode() {
  // No 0/O, 1/I/L so codes are easy to read out at packet pickup. (Declared inside: open() runs before module consts.)
  const CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
  const b = crypto.randomBytes(6);
  return "RK-" + Array.from(b, (x) => CODE_ALPHABET[x % CODE_ALPHABET.length]).join("");
}

/** Assigns confirmation codes to an order's confirmed registrations that don't have one yet. */
export function assignConfirmCodes(orderId: string) {
  const regs = all<{ id: string }>("SELECT id FROM registrations WHERE order_id=? AND status='confirmed' AND confirm_code IS NULL", orderId);
  for (const r of regs) {
    for (let i = 0; i < 5; i++) {
      try { run("UPDATE registrations SET confirm_code=? WHERE id=?", newConfirmCode(), r.id); break; } catch (e) { if (!/UNIQUE/i.test(String(e))) throw e; }
    }
  }
}

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
