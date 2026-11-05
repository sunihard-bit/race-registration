// Nightly off-site backups to any S3-compatible storage (Cloudflare R2, Backblaze B2, AWS S3).
// The database is copied with SQLite's online backup, gzipped, encrypted with AES-256-GCM and uploaded.
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import zlib from "node:zlib";
import { DeleteObjectsCommand, GetObjectCommand, ListObjectsV2Command, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { all, db, one, run } from "./db";

const MAGIC = Buffer.from("RKB1");
const PREFIX = "backups/";

export const backupConfigured = () =>
  !!(process.env.BACKUP_S3_BUCKET && process.env.BACKUP_S3_ACCESS_KEY_ID && process.env.BACKUP_S3_SECRET_ACCESS_KEY && process.env.BACKUP_S3_ENDPOINT);

export function s3() {
  return new S3Client({
    region: process.env.BACKUP_S3_REGION || "auto",
    endpoint: process.env.BACKUP_S3_ENDPOINT,
    forcePathStyle: true,
    credentials: { accessKeyId: process.env.BACKUP_S3_ACCESS_KEY_ID!, secretAccessKey: process.env.BACKUP_S3_SECRET_ACCESS_KEY! },
  });
}

/** Backups are encrypted with a key derived from DATA_ENCRYPTION_KEY, so keep that key safe: without it a backup can't be read. */
function backupKey() {
  const raw = process.env.DATA_ENCRYPTION_KEY;
  if (!raw) throw new Error("DATA_ENCRYPTION_KEY must be set to make or read backups");
  return Buffer.from(crypto.hkdfSync("sha256", Buffer.from(raw), Buffer.alloc(0), Buffer.from("racekit-backup-v1"), 32));
}

export function sealBackup(dbFile: Buffer) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv("aes-256-gcm", backupKey(), iv);
  const data = Buffer.concat([c.update(zlib.gzipSync(dbFile)), c.final()]);
  return Buffer.concat([MAGIC, iv, c.getAuthTag(), data]);
}

export function openBackup(sealed: Buffer) {
  if (!sealed.subarray(0, 4).equals(MAGIC)) throw new Error("Not a backup file");
  const iv = sealed.subarray(4, 16), tag = sealed.subarray(16, 32);
  const d = crypto.createDecipheriv("aes-256-gcm", backupKey(), iv);
  d.setAuthTag(tag);
  return zlib.gunzipSync(Buffer.concat([d.update(sealed.subarray(32)), d.final()]));
}

let running = false;

export async function runBackup(trigger: "schedule" | "manual" = "schedule") {
  if (!backupConfigured()) throw new Error("Backups aren't set up (BACKUP_S3_* settings missing)");
  if (running) return;
  running = true;
  const id = Number(run("INSERT INTO backups (trigger) VALUES (?)", trigger).lastInsertRowid);
  const tmp = path.join(os.tmpdir(), `racekit-backup-${process.pid}-${Date.now()}.db`);
  try {
    await db.backup(tmp);
    const sealed = sealBackup(fs.readFileSync(tmp));
    const now = new Date().toISOString();
    const key = `${PREFIX}${now.slice(0, 10)}/${now.slice(11, 19).replace(/:/g, "")}.db.gz.enc`;
    const client = s3();
    await client.send(new PutObjectCommand({ Bucket: process.env.BACKUP_S3_BUCKET, Key: key, Body: sealed, ContentType: "application/octet-stream" }));
    await prune(client);
    run("UPDATE backups SET status='ok', finished_at=datetime('now'), object_key=?, size_bytes=? WHERE id=?", key, sealed.length, id);
  } catch (e) {
    run("UPDATE backups SET status='failed', finished_at=datetime('now'), error=? WHERE id=?", String((e as Error).message || e).slice(0, 500), id);
    console.error("[backup] failed", e);
  } finally {
    fs.rmSync(tmp, { force: true });
    running = false;
  }
}

/** Deletes backups older than BACKUP_KEEP_DAYS (default 30), always keeping the 7 newest. */
async function prune(client: S3Client) {
  const keepDays = parseInt(process.env.BACKUP_KEEP_DAYS || "30", 10);
  const cutoff = Date.now() - keepDays * 86400_000;
  const objs = await listBackups(client);
  const old = objs.slice(7).filter((o) => o.modified.getTime() < cutoff);
  if (old.length) {
    await client.send(new DeleteObjectsCommand({ Bucket: process.env.BACKUP_S3_BUCKET, Delete: { Objects: old.map((o) => ({ Key: o.key })) } }));
  }
}

/** Newest first. */
export async function listBackups(client = s3()) {
  const out: { key: string; size: number; modified: Date }[] = [];
  let token: string | undefined;
  do {
    const r = await client.send(new ListObjectsV2Command({ Bucket: process.env.BACKUP_S3_BUCKET, Prefix: PREFIX, ContinuationToken: token }));
    for (const o of r.Contents ?? []) out.push({ key: o.Key!, size: o.Size ?? 0, modified: o.LastModified ?? new Date(0) });
    token = r.IsTruncated ? r.NextContinuationToken : undefined;
  } while (token);
  return out.sort((a, b) => b.key.localeCompare(a.key));
}

export async function downloadBackup(key: string, client = s3()) {
  const r = await client.send(new GetObjectCommand({ Bucket: process.env.BACKUP_S3_BUCKET, Key: key }));
  return openBackup(Buffer.from(await r.Body!.transformToByteArray()));
}

export const recentBackups = () =>
  all<{ id: number; started_at: string; finished_at: string | null; status: string; trigger: string; object_key: string | null; size_bytes: number | null; error: string | null }>(
    "SELECT * FROM backups ORDER BY id DESC LIMIT 7");

/** Runs a backup when the last good one is older than ~a day. Called hourly from instrumentation.ts. */
export async function backupIfDue() {
  if (!backupConfigured()) return;
  const due = !one("SELECT 1 FROM backups WHERE status='ok' AND started_at > datetime('now', '-23 hours')");
  if (due) await runBackup("schedule");
}
