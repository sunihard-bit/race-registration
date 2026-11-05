import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/admin";
import { audit, one } from "@/lib/db";
import { date, money } from "@/lib/format";
import { appName } from "@/lib/mailer";
import { ledger, PAYOUT_KINDS, PAYOUT_METHODS, payoutDetails } from "@/lib/payouts";
import PayoutStatement from "@/components/PayoutStatement";
import { recordPayout, voidPayout } from "../../actions";

export const metadata = { title: "Payout" };

export default async function PayoutEvent({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string }> }) {
  const admin = await requireAdmin();
  const { id } = await params;
  const { error } = await searchParams;
  const e = one<{ id: string; name: string; start_date: string; currency: string; owner_email: string; owner_name: string }>(
    "SELECT e.id, e.name, e.start_date, e.currency, u.email owner_email, u.name owner_name FROM events e JOIN users u ON u.id=e.owner_id WHERE e.id=?", id);
  if (!e) notFound();
  const l = ledger(id);
  const d = payoutDetails(id);
  if (d.account_number) audit(admin.id, id, "payout.details_viewed", "");
  const today = new Date().toISOString().slice(0, 10);
  return (
    <div className="stack" style={{ maxWidth: 820 }}>
      <p className="small"><Link href="/admin/payouts">← Payouts</Link></p>
      <div>
        <h1>{e.name}</h1>
        <div className="muted small">{date(e.start_date)} · {e.owner_name} ({e.owner_email}) · <Link href={`/organizer/events/${id}`}>Event dashboard</Link></div>
      </div>
      {e.start_date >= today && l.balance > 0 && (
        <p className="card small">This event hasn&rsquo;t happened yet. Paying out after race day leaves room for refunds and chargebacks.</p>
      )}

      <section className="card">
        <h3>Organizer&rsquo;s bank details</h3>
        {d.account_number ? (
          <table><tbody>
            <tr><td>Account name</td><td>{d.account_name}</td></tr>
            <tr><td>Bank</td><td>{d.bank}{d.branch && `, ${d.branch}`}</td></tr>
            <tr><td>Account number</td><td><code>{d.account_number}</code> {d.account_type}</td></tr>
            {d.notes && <tr><td>Notes</td><td>{d.notes}</td></tr>}
          </tbody></table>
        ) : <p className="muted">The organizer hasn&rsquo;t added bank details yet. They do this on their event&rsquo;s Payouts tab.</p>}
      </section>

      <PayoutStatement l={l} currency={e.currency} appName={appName()} admin eventId={id} voidAction={voidPayout} />

      <section className="card">
        <h3>Record a payment</h3>
        {error && <p className="alert error">Enter an amount above zero.</p>}
        <form action={recordPayout} className="stack">
          <input type="hidden" name="event_id" value={id} />
          <div className="grid">
            <div className="field"><label>Type</label>
              <select name="kind" defaultValue={l.balance < 0 ? "received" : "payout"}>
                {Object.entries(PAYOUT_KINDS).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
              </select></div>
            <div className="field"><label>Amount ({e.currency})</label>
              <input name="amount" type="number" step="0.01" min="0.01" defaultValue={l.balance ? (Math.abs(l.balance) / 100).toFixed(2) : ""} required /></div>
            <div className="field"><label>Date</label><input name="paid_on" type="date" defaultValue={today} required /></div>
            <div className="field"><label>Method</label>
              <select name="method">{PAYOUT_METHODS.map((m) => <option key={m}>{m}</option>)}</select></div>
            <div className="field"><label>Reference</label><input name="reference" placeholder="Bank transfer reference" /></div>
          </div>
          <div className="field"><label>Note</label><input name="note" placeholder="Optional, shown to the organizer" /></div>
          <label className="row small"><input type="checkbox" name="notify" defaultChecked /> Email the organizer when I record a payout</label>
          <div><button>Record</button></div>
          <p className="small muted">
            This only records the payment. Send the money from your bank first. Current balance: {money(l.balance, e.currency)}.
          </p>
        </form>
      </section>
    </div>
  );
}
