import { all } from "./db";

export type EventFee = {
  id: string; event_id: string; name: string; organization: string; amount_cents: number;
  race_ids: string; member_exemption: number; member_label: string; deduct_processing: number; processing_bps: number; sort: number;
};

export const feesForEvent = (eventId: string) =>
  all<EventFee>("SELECT * FROM event_fees WHERE event_id=? ORDER BY sort, name", eventId);

/** Fees that apply to a given race (a fee with no races listed applies to all of them). */
export function feesForRace(eventId: string, raceId: string) {
  return feesForEvent(eventId).filter((f) => {
    const ids: string[] = JSON.parse(f.race_ids || "[]");
    return ids.length === 0 || ids.includes(raceId);
  });
}

export const feesForOrder = (orderId: string) =>
  all<{ name: string; organization: string; amount_cents: number; exempt: number; member_number: string }>(
    `SELECT rf.name, rf.organization, rf.amount_cents, rf.exempt, rf.member_number
     FROM registration_fees rf JOIN registrations r ON r.id=rf.registration_id WHERE r.order_id=?`, orderId);

/** Card payments incur processor fees; cash, bank transfer, prepaid codes and free orders don't. */
export const isCardPayment = (method: string | null) => !!method && !["manual", "free", "prepaid"].includes(method);

/** Processing cost on one fee amount, borne by the receiving organization when the fee is set up that way. */
export function processingDeduction(f: Pick<EventFee, "deduct_processing" | "processing_bps">, amountCents: number, method: string | null) {
  if (!f.deduct_processing || !isCardPayment(method)) return 0;
  return Math.round((amountCents * f.processing_bps) / 10000);
}
