import { notFound, redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { all } from "@/lib/db";
import { eventById, paymentMethods } from "@/lib/events";
import { money } from "@/lib/format";
import { orderById } from "@/lib/orders";
import { PROVIDERS } from "@/lib/payments";

const ERR: Record<string, string> = { method: "That payment method isn't available.", provider: "The payment provider didn't respond. Please try again." };

export default async function Checkout({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string; cancelled?: string }> }) {
  const { id } = await params;
  const { error, cancelled } = await searchParams;
  const user = await requireUser(`/checkout/${id}`);
  const o = orderById(id);
  if (!o || o.user_id !== user.id) notFound();
  if (o.status !== "pending") redirect(`/orders/${o.id}`);
  const e = eventById(o.event_id)!;
  const regs = all<{ first_name: string; last_name: string; race: string }>(
    "SELECT r.first_name, r.last_name, ra.name race FROM registrations r JOIN races ra ON ra.id=r.race_id WHERE order_id=?", o.id);
  const enabled = paymentMethods(e);
  const methods = PROVIDERS.filter((p) => p.configured() && (enabled.includes(p.id) || p.id === "sandbox"));
  const c = o.currency;
  return (
    <div style={{ maxWidth: 560 }}>
      <h1>Checkout</h1>
      <p className="muted">{e.name}</p>
      {cancelled && <div className="alert">Payment was cancelled. You can try again below.</div>}
      {error && <div className="alert error">{ERR[error] ?? error}</div>}
      <div className="card">
        <table>
          <tbody>
            {regs.map((r, i) => <tr key={i}><td>{r.first_name} {r.last_name}: {r.race}</td><td>{money(o.subtotal_cents, c)}</td></tr>)}
            {o.discount_cents > 0 && <tr><td>Discount</td><td>−{money(o.discount_cents, c)}</td></tr>}
            {o.donation_cents > 0 && <tr><td>Donation</td><td>{money(o.donation_cents, c)}</td></tr>}
            {!e.fee_absorbed && o.fee_cents > 0 && <tr><td>Processing fee</td><td>{money(o.fee_cents, c)}</td></tr>}
            <tr><th>Total</th><th>{money(o.total_cents, c)}</th></tr>
          </tbody>
        </table>
      </div>
      <h2>How would you like to pay?</h2>
      <div className="stack">
        {methods.map((p) => (
          <form key={p.id} action="/api/payments/start" method="post" className="card row" style={{ justifyContent: "space-between" }}>
            <input type="hidden" name="order_id" value={o.id} />
            <input type="hidden" name="provider" value={p.id} />
            <div><strong>{p.label}</strong><div className="small muted">{p.description}</div></div>
            <button>Pay {money(o.total_cents, c)}</button>
          </form>
        ))}
      </div>
    </div>
  );
}
