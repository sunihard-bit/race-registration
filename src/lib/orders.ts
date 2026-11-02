import { all, audit, db, one, run } from "./db";
import { eventById } from "./events";
import { appName, appUrl, sendEmail } from "./mailer";
import { money } from "./format";

export type Order = {
  id: string; event_id: string; user_id: string | null; buyer_email: string; subtotal_cents: number;
  discount_cents: number; donation_cents: number; fee_cents: number; total_cents: number; currency: string;
  status: string; payment_method: string | null; provider_ref: string | null; discount_code_id: string | null;
  paid_at: string | null; created_at: string;
};

export const orderById = (id: string) => one<Order>("SELECT * FROM orders WHERE id = ?", id);

/** Idempotently marks an order paid, confirms its registrations and assigns bib numbers. */
export async function markOrderPaid(orderId: string, method: string, ref: string | null, actorId: string | null = null) {
  const order = orderById(orderId);
  if (!order || order.status === "paid") return order;

  const tx = db.transaction(() => {
    run("UPDATE orders SET status='paid', payment_method=?, provider_ref=?, paid_at=datetime('now') WHERE id=? AND status!='paid'", method, ref, orderId);
    const regs = all<{ id: string }>("SELECT id FROM registrations WHERE order_id=? AND bib IS NULL ORDER BY created_at", orderId);
    for (const r of regs) {
      const ev = one<{ next_bib: number }>("SELECT next_bib FROM events WHERE id=?", order.event_id)!;
      run("UPDATE registrations SET bib=?, status='confirmed' WHERE id=?", ev.next_bib, r.id);
      run("UPDATE events SET next_bib = next_bib + 1 WHERE id=?", order.event_id);
    }
    run("UPDATE registrations SET status='confirmed' WHERE order_id=? AND status='pending'", orderId);
    run("UPDATE donations SET status='paid' WHERE order_id=?", orderId);
    if (order.discount_code_id) run("UPDATE discount_codes SET used_count = used_count + 1 WHERE id=?", order.discount_code_id);
  });
  tx();
  audit(actorId, order.event_id, "order.paid", `${orderId} via ${method}`);

  const ev = eventById(order.event_id)!;
  const regs = all<{ first_name: string; bib: number; race: string }>(
    "SELECT r.first_name, r.bib, ra.name race FROM registrations r JOIN races ra ON ra.id=r.race_id WHERE r.order_id=?",
    orderId
  );
  const lines = regs.map((r) => `- ${r.first_name}: ${r.race}, bib #${r.bib}`).join("\n");
  const body = `You're registered for ${ev.name}!\n\n${lines}\n\nTotal paid: ${money(order.total_cents, order.currency)}\nOrder: ${appUrl()}/orders/${orderId}\n\nManage your registration and your data at ${appUrl()}/account\n\n${appName()}`;
  if (order.total_cents > 0 || regs.length) await sendEmail(order.buyer_email, `Confirmed: ${ev.name}`, body, ev.id);
  return orderById(orderId);
}
