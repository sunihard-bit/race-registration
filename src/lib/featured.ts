import { all, audit, newId, one, run } from "./db";
import { money } from "./format";
import { appUrl, sendEmail } from "./mailer";

/** Price per week for a Featured listing, in the event's currency (env FEATURED_PRICE_PER_WEEK_CENTS, default 150.00). */
export const featuredWeekCents = () => parseInt(process.env.FEATURED_PRICE_PER_WEEK_CENTS || "15000", 10);
export const FEATURED_WEEKS = [1, 2, 4];

export type FeaturedRequest = {
  id: string; event_id: string; user_id: string | null; weeks: number; note: string; price_cents: number; status: string;
  created_at: string; decided_at: string | null;
};

export const pendingRequest = (eventId: string) =>
  one<FeaturedRequest>("SELECT * FROM featured_requests WHERE event_id=? AND status='pending' ORDER BY created_at DESC", eventId);

export async function requestFeatured(eventId: string, userId: string, weeks: number, note: string) {
  if (!FEATURED_WEEKS.includes(weeks) || pendingRequest(eventId)) return;
  const e = one<{ name: string; currency: string }>("SELECT name, currency FROM events WHERE id=?", eventId)!;
  const price = featuredWeekCents() * weeks;
  run("INSERT INTO featured_requests (id, event_id, user_id, weeks, note, price_cents) VALUES (?,?,?,?,?,?)", newId(), eventId, userId, weeks, note, price);
  audit(userId, eventId, "featured.requested", `${weeks} weeks`);
  for (const a of all<{ email: string }>("SELECT email FROM users WHERE is_admin=1")) {
    await sendEmail(a.email, `Featured request: ${e.name}`, `${e.name} asked to be featured for ${weeks} week(s) (${money(price, e.currency)}).\n\n${note}\n\nReview it at ${appUrl()}/admin`);
  }
}

/** Extends (or starts) featuring from today or the current end date, whichever is later. */
export function extendFeatured(eventId: string, weeks: number) {
  run(`UPDATE events SET featured_until = date(max(date('now'), coalesce(featured_until, date('now'))), ?) WHERE id=?`, `+${weeks * 7} days`, eventId);
}

export async function decideRequest(id: string, approve: boolean, adminId: string) {
  const r = one<FeaturedRequest & { name: string; currency: string; email: string | null }>(
    `SELECT f.*, e.name, e.currency, u.email FROM featured_requests f JOIN events e ON e.id=f.event_id LEFT JOIN users u ON u.id=f.user_id
     WHERE f.id=? AND f.status='pending'`, id);
  if (!r) return;
  run("UPDATE featured_requests SET status=?, decided_at=datetime('now') WHERE id=?", approve ? "approved" : "declined", id);
  if (approve) extendFeatured(r.event_id, r.weeks);
  const until = one<{ featured_until: string }>("SELECT featured_until FROM events WHERE id=?", r.event_id)?.featured_until;
  audit(adminId, r.event_id, approve ? "featured.approved" : "featured.declined", `${r.weeks} weeks`);
  if (r.email) {
    await sendEmail(r.email, approve ? `${r.name} is now featured` : `Featured request for ${r.name}`, approve
      ? `${r.name} is featured on ${appUrl()} until ${until}. An invoice for ${money(r.price_cents, r.currency)} will follow.`
      : `Your request to feature ${r.name} wasn't approved this time. Reply to this email if you have questions.`, r.event_id);
  }
}
