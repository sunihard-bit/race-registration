"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/admin";
import { audit, newId, one, run } from "@/lib/db";
import { decideRequest, extendFeatured, FEATURED_WEEKS } from "@/lib/featured";
import { money, str, toCents } from "@/lib/format";
import { appUrl, sendEmail } from "@/lib/mailer";
import { PAYOUT_KINDS, type PayoutKind } from "@/lib/payouts";
import { backupConfigured, runBackup } from "@/lib/backup";

export async function decide(fd: FormData) {
  const admin = await requireAdmin();
  await decideRequest(str(fd.get("id")), str(fd.get("approve")) === "1", admin.id);
  revalidatePath("/admin");
}

export async function featureNow(fd: FormData) {
  const admin = await requireAdmin();
  const eventId = str(fd.get("event_id")), weeks = parseInt(str(fd.get("weeks")), 10);
  if (!FEATURED_WEEKS.includes(weeks) || !one("SELECT 1 FROM events WHERE id=?", eventId)) return;
  extendFeatured(eventId, weeks);
  audit(admin.id, eventId, "featured.added", `${weeks} weeks`);
  revalidatePath("/admin");
}

export async function stopFeatured(fd: FormData) {
  const admin = await requireAdmin();
  const eventId = str(fd.get("event_id"));
  run("UPDATE events SET featured_until=NULL WHERE id=?", eventId);
  audit(admin.id, eventId, "featured.stopped", "");
  revalidatePath("/admin");
}

export async function backupNow() {
  const admin = await requireAdmin();
  if (!backupConfigured()) return;
  await runBackup("manual");
  audit(admin.id, null, "backup.manual", "");
  revalidatePath("/admin");
}

// ---------- Payouts ----------
export async function recordPayout(fd: FormData) {
  const admin = await requireAdmin();
  const eventId = str(fd.get("event_id"));
  const e = one<{ name: string; currency: string; owner_email: string }>(
    "SELECT e.name, e.currency, u.email owner_email FROM events e JOIN users u ON u.id=e.owner_id WHERE e.id=?", eventId);
  const kind = str(fd.get("kind")) as PayoutKind;
  const amount = toCents(fd.get("amount"));
  const paidOn = /^\d{4}-\d{2}-\d{2}$/.test(str(fd.get("paid_on"))) ? str(fd.get("paid_on")) : new Date().toISOString().slice(0, 10);
  if (!e || !(kind in PAYOUT_KINDS) || amount <= 0) redirect(`/admin/payouts/${eventId}?error=1`);
  const reference = str(fd.get("reference"), 120), method = str(fd.get("method"), 40), note = str(fd.get("note"), 300);
  run("INSERT INTO payouts (id, event_id, kind, amount_cents, paid_on, method, reference, note, created_by) VALUES (?,?,?,?,?,?,?,?,?)",
    newId(), eventId, kind, amount, paidOn, method, reference, note, admin.id);
  audit(admin.id, eventId, `payout.${kind}`, `${money(amount, e.currency)} ${reference}`.trim());
  if (kind === "payout" && fd.get("notify") === "on") {
    await sendEmail(e.owner_email, `Payout sent: ${e.name}`,
      `We've sent you ${money(amount, e.currency)} for ${e.name} by ${method.toLowerCase() || "bank transfer"}${reference ? ` (reference ${reference})` : ""}.\n\n` +
      `It can take a few working days to reach your account. Your statement is at ${appUrl()}/organizer/events/${eventId}/payouts`, eventId);
  }
  revalidatePath(`/admin/payouts/${eventId}`);
  revalidatePath("/admin/payouts");
}

export async function voidPayout(fd: FormData) {
  const admin = await requireAdmin();
  const id = str(fd.get("id")), eventId = str(fd.get("event_id"));
  if (run("UPDATE payouts SET void=1 WHERE id=? AND event_id=? AND void=0", id, eventId).changes) audit(admin.id, eventId, "payout.void", id);
  revalidatePath(`/admin/payouts/${eventId}`);
  revalidatePath("/admin/payouts");
}
