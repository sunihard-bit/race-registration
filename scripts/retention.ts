// Run daily (e.g. cron): npm run retention
import { applyRetention } from "../src/lib/privacy";
import { run } from "../src/lib/db";
const n = applyRetention();
run("DELETE FROM sessions WHERE expires_at < ?", new Date().toISOString());
run("DELETE FROM email_outbox WHERE created_at < datetime('now', '-90 days')");
console.log(`Anonymized ${n} registrations; cleaned expired sessions and old outbox mail.`);
