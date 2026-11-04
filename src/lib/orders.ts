import { all, assignConfirmCodes, audit, db, one, run } from "./db";
import { qrPng } from "./confirm";
import { eventById } from "./events";
import { appName, appUrl, sendEmail } from "./mailer";
import { money } from "./format";
import { feesForOrder } from "./fees";

export type Order = {
  id: string; event_id: string; user_id: string | null; buyer_email: string; subtotal_cents: number;
  discount_cents: number; donation_cents: number; fee_cents: number; third_party_cents: number; total_cents: number; currency: string;
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
    assignConfirmCodes(orderId);
    run("UPDATE donations SET status='paid' WHERE order_id=?", orderId);
    if (order.discount_code_id) run("UPDATE discount_codes SET used_count = used_count + 1 WHERE id=?", order.discount_code_id);
  });
  tx();
  audit(actorId, order.event_id, "order.paid", `${orderId} via ${method}`);

  const ev = eventById(order.event_id)!;
  const regs = all<{ first_name: string; last_name: string; bib: number; race: string; confirm_code: string | null }>(
    "SELECT r.first_name, r.last_name, r.bib, ra.name race, r.confirm_code FROM registrations r JOIN races ra ON ra.id=r.race_id WHERE r.order_id=?",
    orderId
  );
  const feeLines = feesForOrder(orderId).map((f) => `- ${f.name} (${f.organization}): ${f.exempt ? `member #${f.member_number}` : money(f.amount_cents, order.currency)}`);
  const lines = [...regs.map((r) => `- ${r.first_name}: ${r.race}, bib #${r.bib}, confirmation code ${r.confirm_code}`), ...feeLines].join("\n");
  const body = `You're registered for ${ev.name}!\n\n${lines}\n\nTotal paid: ${money(order.total_cents, order.currency)}\nOrder: ${appUrl()}/orders/${orderId}\n\nManage your registration and your data at ${appUrl()}/account\n\n${appName()}`;
  const withCode = regs.filter((r) => r.confirm_code);
  const attachments = await Promise.all(withCode.map(async (r, i) => ({
    filename: `${r.confirm_code}.png`, content: await qrPng(r.confirm_code!), cid: `qr${i}@racekit`,
  })));
  const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
  const html = `<p>You're registered for <strong>${esc(ev.name)}</strong>!</p>` +
    withCode.map((r, i) => `<div style="border:1px solid #ddd;border-radius:8px;padding:12px;margin:12px 0;font-family:sans-serif">
      <div><strong>${esc(r.first_name)} ${esc(r.last_name)}</strong>: ${esc(r.race)}, bib #${r.bib}</div>
      <div style="font-size:20px;letter-spacing:2px;margin:6px 0"><strong>${r.confirm_code}</strong></div>
      <img src="cid:qr${i}@racekit" width="180" height="180" alt="QR code for ${r.confirm_code}">
      <div style="color:#666;font-size:13px">Show this QR code or confirmation code at packet pickup.</div></div>`).join("") +
    `<p>Total paid: ${money(order.total_cents, order.currency)}<br><a href="${appUrl()}/orders/${orderId}">View your order</a> · <a href="${appUrl()}/account">Manage your registration and data</a></p><p>${esc(appName())}</p>`;
  if (order.total_cents > 0 || regs.length) await sendEmail(order.buyer_email, `Confirmed: ${ev.name}`, body, ev.id, { html, attachments });
  return orderById(orderId);
}
