import crypto from "node:crypto";
import { one } from "./db";

export type PrepaidCode = {
  id: string; event_id: string; code: string; race_id: string | null; amount_cents: number; payer_name: string;
  payer_email: string; payment_ref: string; created_by: string | null; created_at: string;
  used_order_id: string | null; used_at: string | null; void: number;
};

/** Short, unambiguous code (no 0/O/1/I), e.g. PAID-7KQ4MX. */
export function newPrepaidCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  for (;;) {
    const bytes = crypto.randomBytes(6);
    const code = "PAID-" + Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
    if (!one("SELECT 1 FROM prepaid_codes WHERE code=?", code)) return code;
  }
}

export const findPrepaid = (eventId: string, code: string) =>
  one<PrepaidCode>("SELECT * FROM prepaid_codes WHERE event_id=? AND code=?", eventId, code.trim().toUpperCase());
