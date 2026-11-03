"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireEventRole, type StaffRole } from "@/lib/auth";
import { all, audit, newId, one, run } from "@/lib/db";
import { eventById } from "@/lib/events";
import { str, toCents } from "@/lib/format";
import { sendEmail } from "@/lib/mailer";
import { markOrderPaid } from "@/lib/orders";
import { PROVIDERS } from "@/lib/payments";

async function guard(fd: FormData, min: StaffRole) {
  const eventId = str(fd.get("event_id"));
  const { user } = await requireEventRole(eventId, min);
  return { eventId, user };
}
const done = (eventId: string, tab: string) => revalidatePath(`/organizer/events/${eventId}/${tab}`);
const isoOrNull = (v: FormDataEntryValue | null) => (str(v) ? new Date(str(v)).toISOString() : null);

// ---------- Settings ----------
export async function saveSettings(fd: FormData) {
  const { eventId, user } = await guard(fd, "manager");
  const methods = PROVIDERS.map((p) => p.id).filter((id) => fd.get(`pm_${id}`) === "on");
  run(`UPDATE events SET name=?, sport=?, location=?, start_date=?, description=?, waiver_text=?, refund_policy=?, payment_methods=?,
         manual_payment_instructions=?, fee_absorbed=?, fundraising_enabled=?, fundraising_cause=?, fundraising_goal_cents=?, retention_days=?, currency=?
       WHERE id=?`,
    str(fd.get("name"), 120), str(fd.get("sport")), str(fd.get("location"), 200), str(fd.get("start_date"), 10), str(fd.get("description"), 5000),
    str(fd.get("waiver_text"), 10000), str(fd.get("refund_policy"), 3000), JSON.stringify(methods.length ? methods : ["manual"]),
    str(fd.get("manual_payment_instructions"), 2000), fd.get("fee_absorbed") === "on" ? 1 : 0, fd.get("fundraising_enabled") === "on" ? 1 : 0,
    str(fd.get("fundraising_cause"), 120), toCents(fd.get("fundraising_goal")), Math.max(30, parseInt(str(fd.get("retention_days")) || "365", 10)),
    str(fd.get("currency")) || "TTD", eventId);
  audit(user.id, eventId, "event.settings", "");
  done(eventId, "settings");
}

export async function setStatus(fd: FormData) {
  const { eventId, user } = await guard(fd, "manager");
  const status = str(fd.get("status"));
  if (!["draft", "published", "closed"].includes(status)) return;
  if (status === "published" && !one("SELECT 1 FROM races WHERE event_id=?", eventId)) redirect(`/organizer/events/${eventId}/races?error=norace`);
  run("UPDATE events SET status=? WHERE id=?", status, eventId);
  audit(user.id, eventId, "event.status", status);
  done(eventId, "settings");
}

// ---------- Races & prices ----------
export async function addRace(fd: FormData) {
  const { eventId, user } = await guard(fd, "manager");
  const kind = str(fd.get("kind"));
  const legs = str(fd.get("relay_legs"), 300).split(",").map((s) => s.trim()).filter(Boolean);
  const id = newId();
  run(`INSERT INTO races (id, event_id, name, distance, kind, capacity, min_age, team_min, team_max, relay_legs, start_time) VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
    id, eventId, str(fd.get("name"), 80) || "Race", str(fd.get("distance"), 40), ["individual", "team", "relay"].includes(kind) ? kind : "individual",
    parseInt(str(fd.get("capacity")) || "0", 10), parseInt(str(fd.get("min_age")) || "0", 10), parseInt(str(fd.get("team_min")) || "2", 10),
    parseInt(str(fd.get("team_max")) || "4", 10), JSON.stringify(legs), str(fd.get("start_time"), 10));
  const price = toCents(fd.get("price"));
  run("INSERT INTO price_tiers (id, race_id, name, price_cents) VALUES (?,?,?,?)", newId(), id, "Regular", price);
  audit(user.id, eventId, "race.added", str(fd.get("name")));
  done(eventId, "races");
}

export async function deleteRace(fd: FormData) {
  const { eventId, user } = await guard(fd, "manager");
  const raceId = str(fd.get("race_id"));
  if (one("SELECT 1 FROM registrations WHERE race_id=?", raceId)) redirect(`/organizer/events/${eventId}/races?error=hasregs`);
  run("DELETE FROM races WHERE id=? AND event_id=?", raceId, eventId);
  audit(user.id, eventId, "race.deleted", raceId);
  done(eventId, "races");
}

export async function addTier(fd: FormData) {
  const { eventId, user } = await guard(fd, "manager");
  const raceId = str(fd.get("race_id"));
  if (!one("SELECT 1 FROM races WHERE id=? AND event_id=?", raceId, eventId)) return;
  run("INSERT INTO price_tiers (id, race_id, name, price_cents, starts_at, ends_at) VALUES (?,?,?,?,?,?)",
    newId(), raceId, str(fd.get("name"), 60) || "Tier", toCents(fd.get("price")), isoOrNull(fd.get("starts_at")), isoOrNull(fd.get("ends_at")));
  audit(user.id, eventId, "tier.added", raceId);
  done(eventId, "races");
}

export async function deleteTier(fd: FormData) {
  const { eventId } = await guard(fd, "manager");
  run("DELETE FROM price_tiers WHERE id=? AND race_id IN (SELECT id FROM races WHERE event_id=?)", str(fd.get("tier_id")), eventId);
  done(eventId, "races");
}

// ---------- Questions ----------
export async function addQuestion(fd: FormData) {
  const { eventId } = await guard(fd, "manager");
  const kind = str(fd.get("kind"));
  run("INSERT INTO questions (id, event_id, label, kind, options, required) VALUES (?,?,?,?,?,?)", newId(), eventId, str(fd.get("label"), 200),
    ["text", "select", "checkbox"].includes(kind) ? kind : "text",
    JSON.stringify(str(fd.get("options"), 1000).split(",").map((s) => s.trim()).filter(Boolean)), fd.get("required") === "on" ? 1 : 0);
  done(eventId, "questions");
}
export async function deleteQuestion(fd: FormData) {
  const { eventId } = await guard(fd, "manager");
  run("DELETE FROM questions WHERE id=? AND event_id=?", str(fd.get("question_id")), eventId);
  done(eventId, "questions");
}

// ---------- Discounts ----------
export async function addDiscount(fd: FormData) {
  const { eventId, user } = await guard(fd, "manager");
  const kind = str(fd.get("kind")) === "fixed" ? "fixed" : "percent";
  const amount = kind === "fixed" ? toCents(fd.get("amount")) : Math.min(100, parseInt(str(fd.get("amount")) || "0", 10));
  const code = str(fd.get("code"), 40).toUpperCase().replace(/\s+/g, "");
  if (!code || amount <= 0) redirect(`/organizer/events/${eventId}/discounts?error=1`);
  if (one("SELECT 1 FROM discount_codes WHERE event_id=? AND code=?", eventId, code)) redirect(`/organizer/events/${eventId}/discounts?error=dup`);
  run("INSERT INTO discount_codes (id, event_id, code, kind, amount, max_uses, expires_at) VALUES (?,?,?,?,?,?,?)",
    newId(), eventId, code, kind, amount, parseInt(str(fd.get("max_uses")) || "0", 10), isoOrNull(fd.get("expires_at")));
  audit(user.id, eventId, "discount.added", code);
  done(eventId, "discounts");
}
export async function deleteDiscount(fd: FormData) {
  const { eventId } = await guard(fd, "manager");
  run("DELETE FROM discount_codes WHERE id=? AND event_id=? AND used_count=0", str(fd.get("discount_id")), eventId);
  run("UPDATE discount_codes SET max_uses=used_count WHERE id=? AND event_id=?", str(fd.get("discount_id")), eventId); // used codes: just disable
  done(eventId, "discounts");
}

// ---------- Participants ----------
export async function markPaid(fd: FormData) {
  const { eventId, user } = await guard(fd, "manager");
  const orderId = str(fd.get("order_id"));
  if (!one("SELECT 1 FROM orders WHERE id=? AND event_id=?", orderId, eventId)) return;
  await markOrderPaid(orderId, "manual", str(fd.get("ref"), 80) || "marked by organizer", user.id);
  done(eventId, "participants");
}
export async function cancelRegistration(fd: FormData) {
  const { eventId, user } = await guard(fd, "manager");
  const regId = str(fd.get("reg_id"));
  run("UPDATE registrations SET status='cancelled' WHERE id=? AND event_id=?", regId, eventId);
  audit(user.id, eventId, "registration.cancelled", regId);
  done(eventId, "participants");
}
export async function setBib(fd: FormData) {
  const { eventId, user } = await guard(fd, "manager");
  const regId = str(fd.get("reg_id"));
  const bib = parseInt(str(fd.get("bib")), 10);
  if (!Number.isFinite(bib)) return;
  if (one("SELECT 1 FROM registrations WHERE event_id=? AND bib=? AND id!=?", eventId, bib, regId)) redirect(`/organizer/events/${eventId}/participants?error=bib`);
  run("UPDATE registrations SET bib=? WHERE id=? AND event_id=?", bib, regId, eventId);
  audit(user.id, eventId, "registration.bib", `${regId} -> ${bib}`);
  done(eventId, "participants");
}

// ---------- Check-in ----------
export async function checkIn(fd: FormData) {
  const { eventId, user } = await guard(fd, "checkin");
  const regId = str(fd.get("reg_id"));
  const undo = fd.get("undo") === "1";
  run(`UPDATE registrations SET checked_in_at=${undo ? "NULL" : "datetime('now')"} WHERE id=? AND event_id=? AND status='confirmed'`, regId, eventId);
  audit(user.id, eventId, undo ? "checkin.undo" : "checkin", regId);
  revalidatePath(`/organizer/events/${eventId}/checkin`);
}

// ---------- Email ----------
export async function emailParticipants(fd: FormData) {
  const { eventId, user } = await guard(fd, "manager");
  const e = eventById(eventId)!;
  const audience = str(fd.get("audience"));
  const subject = str(fd.get("subject"), 200), body = str(fd.get("body"), 20000);
  if (!subject || !body) redirect(`/organizer/events/${eventId}/email?error=1`);
  const where =
    audience === "marketing" ? "AND consent_marketing=1" :
    audience === "pending" ? "AND status='pending'" :
    audience.startsWith("race:") ? "AND race_id=?" : "";
  const params: unknown[] = [eventId];
  if (audience.startsWith("race:")) params.push(audience.slice(5));
  const to = all<{ email: string }>(`SELECT DISTINCT email FROM registrations WHERE event_id=? AND status!='cancelled' AND anonymized_at IS NULL ${where}`, ...params);
  for (const r of to) await sendEmail(r.email, subject, `${body}\n\n—\n${e.name}\nYou are receiving this because you registered for this event.`, eventId);
  audit(user.id, eventId, "email.sent", `${to.length} recipients: ${subject}`);
  redirect(`/organizer/events/${eventId}/email?sent=${to.length}`);
}

// ---------- Results ----------
export async function uploadResults(fd: FormData) {
  const { eventId, user } = await guard(fd, "manager");
  const raceId = str(fd.get("race_id"));
  if (!one("SELECT 1 FROM races WHERE id=? AND event_id=?", raceId, eventId)) return;
  const file = fd.get("file");
  const text = file instanceof File && file.size ? await file.text() : str(fd.get("csv"), 2_000_000);
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  const header = (lines.shift() || "").toLowerCase().split(",").map((h) => h.trim());
  const col = (n: string) => header.indexOf(n);
  if (col("name") < 0 && col("bib") < 0) redirect(`/organizer/events/${eventId}/results?error=header`);
  run("DELETE FROM results WHERE race_id=?", raceId);
  let n = 0;
  for (const line of lines) {
    const c = line.split(",").map((s) => s.trim());
    const bib = col("bib") >= 0 ? parseInt(c[col("bib")], 10) : NaN;
    let name = col("name") >= 0 ? c[col("name")] : "";
    let gender = col("gender") >= 0 ? c[col("gender")] : "";
    if (!name && Number.isFinite(bib)) {
      const r = one<{ first_name: string; last_name: string; gender: string }>("SELECT first_name, last_name, gender FROM registrations WHERE event_id=? AND bib=?", eventId, bib);
      if (r) { name = `${r.first_name} ${r.last_name}`; gender ||= r.gender; }
    }
    run("INSERT INTO results (id, race_id, bib, name, gender, category, chip_time, gun_time, place) VALUES (?,?,?,?,?,?,?,?,?)",
      newId(), raceId, Number.isFinite(bib) ? bib : null, name || "Unknown", gender, col("category") >= 0 ? c[col("category")] : "",
      col("chip_time") >= 0 ? c[col("chip_time")] : "", col("gun_time") >= 0 ? c[col("gun_time")] : "",
      col("place") >= 0 ? parseInt(c[col("place")], 10) || null : null);
    n++;
  }
  audit(user.id, eventId, "results.uploaded", `${n} rows`);
  redirect(`/organizer/events/${eventId}/results?uploaded=${n}`);
}

// ---------- Staff ----------
export async function addStaff(fd: FormData) {
  const { eventId, user } = await guard(fd, "owner");
  const role = str(fd.get("role"));
  if (!["manager", "checkin", "viewer"].includes(role)) return;
  const u = one<{ id: string }>("SELECT id FROM users WHERE email=?", str(fd.get("email")).toLowerCase());
  if (!u) redirect(`/organizer/events/${eventId}/staff?error=nouser`);
  run("INSERT INTO event_staff (event_id, user_id, role) VALUES (?,?,?) ON CONFLICT(event_id, user_id) DO UPDATE SET role=excluded.role", eventId, u.id, role);
  audit(user.id, eventId, "staff.added", `${str(fd.get("email"))} as ${role}`);
  done(eventId, "staff");
}
export async function removeStaff(fd: FormData) {
  const { eventId, user } = await guard(fd, "owner");
  run("DELETE FROM event_staff WHERE event_id=? AND user_id=? AND role!='owner'", eventId, str(fd.get("user_id")));
  audit(user.id, eventId, "staff.removed", str(fd.get("user_id")));
  done(eventId, "staff");
}
