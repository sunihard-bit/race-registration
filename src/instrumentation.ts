// Starts the nightly backup timer when the server boots (Node runtime only).
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (!process.env.BACKUP_S3_BUCKET) return;
  const { backupIfDue } = await import("./lib/backup");
  const tick = () => backupIfDue().catch((e) => console.error("[backup]", e));
  setTimeout(tick, 2 * 60_000); // shortly after start, if the last backup is a day old
  setInterval(tick, 60 * 60_000).unref();
}
