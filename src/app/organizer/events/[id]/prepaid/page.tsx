import { requireEventRole } from "@/lib/auth";
import { all } from "@/lib/db";
import { currentTier, eventById, platformFee, racesFor } from "@/lib/events";
import { feesForRace } from "@/lib/fees";
import { money } from "@/lib/format";
import type { PrepaidCode } from "@/lib/prepaid";
import { issuePrepaid, voidPrepaid } from "../actions";

type Row = PrepaidCode & { race: string | null; used_by: string | null; order_total: number | null; issuer: string | null };

export default async function Prepaid({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ issued?: string; error?: string }> }) {
  const { id } = await params;
  const { issued, error } = await searchParams;
  await requireEventRole(id, "manager");
  const e = eventById(id)!;
  const races = racesFor(id);
  const rows = all<Row>(
    `SELECT p.*, ra.name race, u.name issuer, o.total_cents order_total,
            (SELECT r.first_name || ' ' || r.last_name FROM registrations r WHERE r.order_id=p.used_order_id LIMIT 1) used_by
     FROM prepaid_codes p LEFT JOIN races ra ON ra.id=p.race_id LEFT JOIN users u ON u.id=p.created_by LEFT JOIN orders o ON o.id=p.used_order_id
     WHERE p.event_id=? ORDER BY p.created_at DESC`, id);
  const received = rows.filter((r) => !r.void).reduce((s, r) => s + r.amount_cents, 0);
  return (
    <div className="stack">
      <p className="small muted">
        For people paying by bank deposit, transfer or cash. Once you&apos;ve confirmed their payment, record it here and the app generates a one-time code.
        They enter it at checkout and their registration is confirmed. The code covers the whole registration for the race you choose (or any race).
      </p>
      {issued && <div className="alert">Code created: <strong style={{ fontSize: "1.2rem" }}>{issued}</strong>. Send it to the participant if you didn&apos;t email it.</div>}
      {error && <div className="alert error">Enter the payer&apos;s name and the amount received.</div>}

      <form action={issuePrepaid} className="card">
        <input type="hidden" name="event_id" value={id} />
        <h3>Record a payment and create a code</h3>
        <div className="cols">
          <div className="field"><label>Paid by (name)</label><input name="payer_name" required /></div>
          <div className="field"><label>Their email (to send the code)</label><input name="payer_email" type="email" /></div>
          <div className="field"><label>Amount received</label><input name="amount" type="number" min="0.01" step="0.01" required /></div>
          <div className="field"><label>Bank or receipt reference</label><input name="payment_ref" placeholder="Deposit slip #, transfer ref" /></div>
          <div className="field"><label>For race</label>
            <select name="race_id"><option value="">Any race</option>{races.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</select></div>
        </div>
        <div className="small muted" style={{ marginBottom: 10 }}>
          Amount to ask for today:{" "}
          {races.map((r) => {
            const t = currentTier(r.id);
            if (!t) return null;
            const total = t.price_cents + (e.fee_absorbed ? 0 : platformFee(t.price_cents));
            const extra = feesForRace(id, r.id).reduce((s, f) => s + f.amount_cents, 0);
            return <span key={r.id} style={{ marginRight: 12 }}>{r.name} {money(total, e.currency)}{extra ? ` (+${money(extra, e.currency)} other fees for non-members)` : ""}</span>;
          })}
        </div>
        <label className="check"><input type="checkbox" name="send_email" defaultChecked /> Email the code to them</label>
        <p><button>Create code</button></p>
      </form>

      <div className="card table-wrap">
        <div className="row" style={{ justifyContent: "space-between" }}><h3>Codes</h3><span className="small muted">{money(received, e.currency)} received offline</span></div>
        <table>
          <thead><tr><th>Code</th><th>Paid by</th><th>Received</th><th>Race</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td><code>{r.code}</code><div className="small muted">{r.created_at.slice(0, 10)}{r.issuer && ` by ${r.issuer}`}</div></td>
                <td>{r.payer_name}<div className="small muted">{r.payer_email}{r.payment_ref && ` · ref ${r.payment_ref}`}</div></td>
                <td>{money(r.amount_cents, e.currency)}</td>
                <td>{r.race ?? "Any"}</td>
                <td>
                  {r.void ? <span className="badge grey">Void</span> : r.used_order_id ? (
                    <>
                      <span className="badge">Used</span> <span className="small">{r.used_by}</span>
                      {r.order_total != null && r.order_total !== r.amount_cents && (
                        <div className="small" style={{ color: "var(--warn)" }}>Order total was {money(r.order_total, e.currency)}</div>
                      )}
                    </>
                  ) : <span className="badge warn">Not used yet</span>}
                </td>
                <td>{!r.void && !r.used_order_id && (
                  <form action={voidPrepaid}><input type="hidden" name="event_id" value={id} /><input type="hidden" name="prepaid_id" value={r.id} /><button className="small secondary">Void</button></form>
                )}</td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={6} className="muted">No codes yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
