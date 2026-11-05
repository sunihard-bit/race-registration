// Restore a backup.  npm run restore-backup -- [list | latest | <object key>] [--out path] [--force]
// Needs the same BACKUP_S3_* settings and DATA_ENCRYPTION_KEY as the live site.
import fs from "node:fs";
import { backupConfigured, downloadBackup, listBackups } from "../src/lib/backup";

async function main() {
  const args = process.argv.slice(2);
  const what = args.find((a) => !a.startsWith("--")) || "list";
  const outIdx = args.indexOf("--out");
  const out = outIdx >= 0 ? args[outIdx + 1] : "restored.db";
  if (!backupConfigured()) throw new Error("Set BACKUP_S3_ENDPOINT, BACKUP_S3_BUCKET, BACKUP_S3_ACCESS_KEY_ID and BACKUP_S3_SECRET_ACCESS_KEY first.");
  const list = await listBackups();
  if (what === "list") {
    for (const b of list.slice(0, 40)) console.log(`${b.key}  ${(b.size / 1024).toFixed(0)} KB`);
    console.log(`${list.length} backups. Restore one with: npm run restore-backup -- <key> --out restored.db`);
    return;
  }
  const key = what === "latest" ? list[0]?.key : what;
  if (!key) throw new Error("No backups found.");
  if (fs.existsSync(out) && !args.includes("--force")) throw new Error(`${out} already exists. Use --force to overwrite, or pick another --out.`);
  fs.writeFileSync(out, await downloadBackup(key));
  console.log(`Restored ${key} to ${out}. Stop the app, put this file at DATABASE_PATH, then start it again.`);
}
main().catch((e) => { console.error(e.message || e); process.exit(1); });
