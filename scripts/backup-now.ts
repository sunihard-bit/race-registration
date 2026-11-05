// Make one backup immediately:  npm run backup-now
import { recentBackups, runBackup } from "../src/lib/backup";
runBackup("manual").then(() => {
  const b = recentBackups()[0];
  console.log(b?.status === "ok" ? `Backed up to ${b.object_key} (${Math.round((b.size_bytes || 0) / 1024)} KB)` : `Backup failed: ${b?.error}`);
  process.exit(b?.status === "ok" ? 0 : 1);
}).catch((e) => { console.error(e.message || e); process.exit(1); });
