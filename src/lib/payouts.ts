// Payout ledger: what the platform owes each organizer, and what has been paid.
//
// Card payments (WiPay, FAC, PayPal) land in the platform's merchant account, so the platform owes the organizer
// everything collected on those orders except the platform fee. Cash, bank transfer and prepaid-code orders were paid
// to the organizer directly, so the organizer owes the platform its fee on those. Card processing costs are the
// platform's, covered by the platform fee.
import { all, one } from "./db";
import { decrypt } from "./crypto";

export const OFFLINE_METHODS = ["manual", "prepaid", "free"];
export const PAYOUT_KINDS = {
  payout: "Paid to organizer",
  received: "Received from organizer",
  deduction: "Deducted (e.g. featured listing)",
} as const;
export type PayoutKind = keyof typeof PAYOUT_KINDS;
export const PAYOUT_METHODS = ["Bank transfer", "Cheque", "Cash", "Other"];

type Sums = { orders: number; total: number; fees: number; donations: number; third: number };
export type Payout = {
  id: string; kind: PayoutKind; amount_cents: number; paid_on: string; method: string; reference: string; note: string;
  created_at: string; void: number; by_email: string | null;
};
export type Ledger = {
  card: Sums; offline: Sums;
  earned: number;        // card money collected minus all platform fees
  paidOut: number; received: number; deducted: number;
  balance: number;       // > 0: platform owes organizer; < 0: organizer owes platform
  payouts: Payout[];
};

const placeholders = OFFLINE_METHODS.map(() => "?").join(",");

function sums(eventId: string, offline: boolean): Sums {
  return one<Sums>(
    `SELECT COUNT(*) orders, COALESCE(SUM(total_cents),0) total, COALESCE(SUM(fee_cents),0) fees,
            COALESCE(SUM(donation_cents),0) donations, COALESCE(SUM(third_party_cents),0) third
     FROM orders WHERE event_id=? AND status='paid' AND COALESCE(payment_method,'') ${offline ? "" : "NOT"} IN (${placeholders})`,
    eventId, ...OFFLINE_METHODS)!;
}

export function ledger(eventId: string): Ledger {
  const card = sums(eventId, false), offline = sums(eventId, true);
  const payouts = all<Payout>(
    `SELECT p.id, p.kind, p.amount_cents, p.paid_on, p.method, p.reference, p.note, p.created_at, p.void, u.email by_email
     FROM payouts p LEFT JOIN users u ON u.id=p.created_by WHERE p.event_id=? ORDER BY p.paid_on DESC, p.created_at DESC`, eventId);
  const live = payouts.filter((p) => !p.void);
  const total = (k: PayoutKind) => live.filter((p) => p.kind === k).reduce((s, p) => s + p.amount_cents, 0);
  const earned = card.total - card.fees - offline.fees;
  const paidOut = total("payout"), received = total("received"), deducted = total("deduction");
  return { card, offline, earned, paidOut, received, deducted, balance: earned - paidOut - deducted + received, payouts };
}

/** Every event with money in it, for the admin list. */
export function allBalances() {
  const events = all<{ id: string; name: string; start_date: string; currency: string; owner_email: string }>(
    `SELECT e.id, e.name, e.start_date, e.currency, u.email owner_email FROM events e JOIN users u ON u.id=e.owner_id
     WHERE EXISTS (SELECT 1 FROM orders o WHERE o.event_id=e.id AND o.status='paid' AND o.total_cents>0)
        OR EXISTS (SELECT 1 FROM payouts p WHERE p.event_id=e.id)
     ORDER BY e.start_date DESC`);
  return events.map((e) => ({ ...e, ...ledger(e.id) }));
}

export type PayoutDetails = { account_name: string; bank: string; branch: string; account_number: string; account_type: string; notes: string };
export const EMPTY_DETAILS: PayoutDetails = { account_name: "", bank: "", branch: "", account_number: "", account_type: "", notes: "" };

/** Where the organizer wants to be paid. Stored encrypted. */
export function payoutDetails(eventId: string): PayoutDetails {
  const enc = one<{ payout_details_enc: string | null }>("SELECT payout_details_enc FROM events WHERE id=?", eventId)?.payout_details_enc;
  if (!enc) return { ...EMPTY_DETAILS };
  try { return { ...EMPTY_DETAILS, ...JSON.parse(decrypt(enc)) }; } catch { return { ...EMPTY_DETAILS }; }
}

export const maskAccount = (n: string) => (n.length > 4 ? "•••• " + n.slice(-4) : n);

/** Order-level statement rows for the CSV. */
export function statementRows(eventId: string) {
  return all<{ id: string; paid_at: string; buyer_email: string; payment_method: string; total_cents: number; fee_cents: number;
    donation_cents: number; third_party_cents: number }>(
    `SELECT id, paid_at, buyer_email, payment_method, total_cents, fee_cents, donation_cents, third_party_cents
     FROM orders WHERE event_id=? AND status='paid' ORDER BY paid_at`, eventId);
}
