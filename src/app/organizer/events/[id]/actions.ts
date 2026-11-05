"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireEventRole, type StaffRole } from "@/lib/auth";
import { all, audit, db, newId, one, run } from "@/lib/db";
import { eventById } from "@/lib/events";
import { money, str, toCents } from "@/lib/format";
import { appUrl, sendEmail } from "@/lib/mailer";
import { markOrderPaid } from "@/lib/orders";
import { PROVIDERS } from "@/lib/payments";
import { newPrepaidCode } from "@/lib/prepaid";
import { requestFeatured } from "@/lib/featured";
import { encrypt } from "@/lib/crypto";
import { parseDelimited, parseResults, saveResults, timingToken } from "@/lib/timing";

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
  const lat = parseFloat(str(fd.get("lat"))), lng = parseFloat(str(fd.get("lng")));
  const ok = Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
  run("UPDATE events SET lat=?, lng=? WHERE id=?", ok ? lat : null, ok ? lng : null, eventId);
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

// ---------- Results & timing ----------
async function uploadedText(fd: FormData) {
  const file = fd.get("file");
  return file instanceof File && file.size ? await file.text() : str(fd.get("csv"), 5_000_000);
}

export async function uploadResults(fd: FormData) {
  const { eventId, user } = await guard(fd, "manager");
  const raceId = str(fd.get("race_id"));
  if (raceId && !one("SELECT 1 FROM races WHERE id=? AND event_id=?", raceId, eventId)) return;
  const back = str(fd.get("back")) === "timing" ? "timing" : "results";
  const { rows, error } = parseResults(await uploadedText(fd));
  if (error) redirect(`/organizer/events/${eventId}/${back}?error=header`);
  const r = saveResults(eventId, rows, raceId);
  audit(user.id, eventId, "results.uploaded", `${r.saved} rows, ${r.skipped} skipped`);
  redirect(`/organizer/events/${eventId}/${back}?uploaded=${r.saved}&skipped=${r.skipped}`);
}

/** Bib-to-chip (and optional wave) assignments from the timer's chip file. */
export async function uploadChips(fd: FormData) {
  const { eventId, user } = await guard(fd, "manager");
  const table = parseDelimited(await uploadedText(fd));
  const header = (table.shift() || []).map((h) => h.toLowerCase().trim());
  const bi = header.findIndex((h) => ["bib", "bib #", "bib number", "no", "number"].includes(h));
  const ci = header.findIndex((h) => ["chip", "chip id", "chip code", "tag", "tag id", "transponder", "epc"].includes(h));
  const wi = header.findIndex((h) => ["wave", "start wave", "corral", "heat"].includes(h));
  if (bi < 0 || (ci < 0 && wi < 0)) redirect(`/organizer/events/${eventId}/timing?error=chips`);
  let n = 0;
  db.transaction(() => {
    for (const row of table) {
      const bib = parseInt(row[bi] ?? "", 10);
      if (!Number.isFinite(bib)) continue;
      const sets: string[] = [], vals: unknown[] = [];
      if (ci >= 0) { sets.push("chip=?"); vals.push((row[ci] ?? "").slice(0, 64)); }
      if (wi >= 0) { sets.push("wave=?"); vals.push((row[wi] ?? "").slice(0, 40)); }
      n += run(`UPDATE registrations SET ${sets.join(",")} WHERE event_id=? AND bib=?`, ...vals, eventId, bib).changes;
    }
  })();
  audit(user.id, eventId, "timing.chips", `${n} participants`);
  redirect(`/organizer/events/${eventId}/timing?chips=${n}`);
}

export async function rotateTimingLink(fd: FormData) {
  const { eventId, user } = await guard(fd, "manager");
  timingToken(eventId, true);
  audit(user.id, eventId, "timing.link_rotated", "");
  done(eventId, "timing");
}

// ---------- Featured listing ----------
export async function askToFeature(fd: FormData) {
  const { eventId, user } = await guard(fd, "manager");
  await requestFeatured(eventId, user.id, parseInt(str(fd.get("weeks")), 10), str(fd.get("note"), 1000));
  done(eventId, "settings");
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

// ---------- Fees for other organizations ----------
export async function addFee(fd: FormData) {
  const { eventId, user } = await guard(fd, "manager");
  const name = str(fd.get("name"), 120), org = str(fd.get("organization"), 120), amount = toCents(fd.get("amount"));
  if (!name || !org || amount <= 0) redirect(`/organizer/events/${eventId}/fees?error=1`);
  const races = fd.getAll("race_ids").map(String).filter((id) => one("SELECT 1 FROM races WHERE id=? AND event_id=?", id, eventId));
  const bps = Math.round(Math.min(15, Math.max(0, parseFloat(str(fd.get("processing_percent")) || "0"))) * 100);
  run(`INSERT INTO event_fees (id, event_id, name, organization, amount_cents, race_ids, member_exemption, member_label, deduct_processing, processing_bps)
       VALUES (?,?,?,?,?,?,?,?,?,?)`,
    newId(), eventId, name, org, amount, JSON.stringify(races), fd.get("member_exemption") === "on" ? 1 : 0,
    str(fd.get("member_label"), 80) || "Membership number", fd.get("deduct_processing") === "on" ? 1 : 0, bps);
  audit(user.id, eventId, "fee.added", `${name} (${org})`);
  done(eventId, "fees");
}
export async function deleteFee(fd: FormData) {
  const { eventId, user } = await guard(fd, "manager");
  run("DELETE FROM event_fees WHERE id=? AND event_id=?", str(fd.get("fee_id")), eventId);
  audit(user.id, eventId, "fee.deleted", str(fd.get("fee_id")));
  done(eventId, "fees");
}

// ---------- Prepaid codes (offline payment received, code issued) ----------
export async function issuePrepaid(fd: FormData) {
  const { eventId, user } = await guard(fd, "manager");
  const e = eventById(eventId)!;
  const payer = str(fd.get("payer_name"), 120), email = str(fd.get("payer_email"), 200).toLowerCase();
  const amount = toCents(fd.get("amount"));
  const raceId = str(fd.get("race_id")) || null;
  if (!payer || amount <= 0) redirect(`/organizer/events/${eventId}/prepaid?error=1`);
  if (raceId && !one("SELECT 1 FROM races WHERE id=? AND event_id=?", raceId, eventId)) return;
  const code = newPrepaidCode();
  run(`INSERT INTO prepaid_codes (id, event_id, code, race_id, amount_cents, payer_name, payer_email, payment_ref, created_by) VALUES (?,?,?,?,?,?,?,?,?)`,
    newId(), eventId, code, raceId, amount, payer, email, str(fd.get("payment_ref"), 120), user.id);
  audit(user.id, eventId, "prepaid.issued", `${code} for ${payer}, ${amount / 100}`);
  if (email && fd.get("send_email") === "on") {
    const race = raceId ? one<{ name: string }>("SELECT name FROM races WHERE id=?", raceId)?.name : null;
    await sendEmail(email, `Your registration code for ${e.name}`,
      `Hi ${payer},\n\nThanks, we received your payment of ${money(amount, e.currency)}.\n\nYour registration code is: ${code}\n\n` +
      `Register at ${appUrl()}/events/${e.slug}${race ? ` (for ${race})` : ""}. At checkout, choose "I have a prepaid code" and enter it. The code can be used once.\n\n${e.name}`, eventId);
  }
  redirect(`/organizer/events/${eventId}/prepaid?issued=${code}`);
}

export async function voidPrepaid(fd: FormData) {
  const { eventId, user } = await guard(fd, "manager");
  run("UPDATE prepaid_codes SET void=1 WHERE id=? AND event_id=? AND used_order_id IS NULL", str(fd.get("prepaid_id")), eventId);
  audit(user.id, eventId, "prepaid.void", str(fd.get("prepaid_id")));
  done(eventId, "prepaid");
}

// ---------- Payouts ----------
export async function savePayoutDetails(fd: FormData) {
  const { eventId, user } = await guard(fd, "owner");
  const d = {
    account_name: str(fd.get("account_name"), 120), bank: str(fd.get("bank"), 120), branch: str(fd.get("branch"), 120),
    account_number: str(fd.get("account_number"), 40), account_type: str(fd.get("account_type"), 20), notes: str(fd.get("notes"), 500),
  };
  run("UPDATE events SET payout_details_enc=? WHERE id=?", encrypt(JSON.stringify(d)), eventId);
  audit(user.id, eventId, "payout.details_updated", "");
  done(eventId, "payouts");
}
