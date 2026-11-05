import { all, one } from "./db";

export type Event = {
  id: string; slug: string; owner_id: string; name: string; sport: string; description: string;
  location: string; lat: number | null; lng: number | null; featured_until: string | null; start_date: string; currency: string; status: string; waiver_text: string;
  refund_policy: string; payment_methods: string; manual_payment_instructions: string; fee_absorbed: number;
  fundraising_enabled: number; fundraising_cause: string; fundraising_goal_cents: number;
  retention_days: number; next_bib: number; created_at: string;
};
export type Race = {
  id: string; event_id: string; name: string; distance: string; kind: "individual" | "team" | "relay";
  capacity: number; min_age: number; team_min: number; team_max: number; relay_legs: string;
  start_time: string; sort: number;
};
export type Tier = { id: string; race_id: string; name: string; price_cents: number; starts_at: string | null; ends_at: string | null };
export type Question = { id: string; event_id: string; label: string; kind: "text" | "select" | "checkbox"; options: string; required: number; sort: number };
export type Discount = { id: string; event_id: string; code: string; kind: "percent" | "fixed"; amount: number; max_uses: number; used_count: number; expires_at: string | null };

export const eventBySlug = (slug: string) => one<Event>("SELECT * FROM events WHERE slug = ?", slug);
export const eventById = (id: string) => one<Event>("SELECT * FROM events WHERE id = ?", id);
export const racesFor = (eventId: string) => all<Race>("SELECT * FROM races WHERE event_id = ? ORDER BY sort, name", eventId);
export const questionsFor = (eventId: string) => all<Question>("SELECT * FROM questions WHERE event_id = ? ORDER BY sort, label", eventId);
export const tiersFor = (raceId: string) =>
  all<Tier>("SELECT * FROM price_tiers WHERE race_id = ? ORDER BY COALESCE(starts_at,''), price_cents", raceId);

/** The price tier active right now (date windows), falling back to the last tier. */
export function currentTier(raceId: string, now = new Date()): Tier | undefined {
  const tiers = tiersFor(raceId);
  const iso = now.toISOString();
  return tiers.find((t) => (!t.starts_at || t.starts_at <= iso) && (!t.ends_at || t.ends_at >= iso));
}

export function spotsTaken(raceId: string) {
  return one<{ n: number }>(
    "SELECT COUNT(*) n FROM registrations WHERE race_id = ? AND status != 'cancelled'",
    raceId
  )!.n;
}

export function spotsLeft(race: Race) {
  return race.capacity > 0 ? Math.max(0, race.capacity - spotsTaken(race.id)) : Infinity;
}

export function paymentMethods(e: Event): string[] {
  try { return JSON.parse(e.payment_methods); } catch { return ["manual"]; }
}

export function relayLegs(r: Race): string[] {
  try { return JSON.parse(r.relay_legs); } catch { return []; }
}

/** Platform fee (configurable; default 4% + TT$2). */
export function platformFee(subtotalCents: number) {
  if (subtotalCents <= 0) return 0;
  const pct = parseFloat(process.env.PLATFORM_FEE_PERCENT ?? "4");
  const fixed = parseInt(process.env.PLATFORM_FEE_FIXED_CENTS ?? "200", 10);
  return Math.round((subtotalCents * pct) / 100) + fixed;
}

export function validateDiscount(eventId: string, code: string): { ok: true; d: Discount } | { ok: false; error: string } {
  if (!code) return { ok: false, error: "" };
  const d = one<Discount>("SELECT * FROM discount_codes WHERE event_id = ? AND upper(code) = upper(?)", eventId, code.trim());
  if (!d) return { ok: false, error: "That discount code is not valid." };
  if (d.expires_at && d.expires_at < new Date().toISOString()) return { ok: false, error: "That discount code has expired." };
  if (d.max_uses > 0 && d.used_count >= d.max_uses) return { ok: false, error: "That discount code has been used up." };
  return { ok: true, d };
}

export function applyDiscount(price: number, d?: Discount) {
  if (!d) return 0;
  const off = d.kind === "percent" ? Math.round((price * Math.min(100, d.amount)) / 100) : d.amount;
  return Math.min(price, off);
}

export function age(birthYear: number | null, at = new Date()) {
  return birthYear ? at.getFullYear() - birthYear : null;
}
