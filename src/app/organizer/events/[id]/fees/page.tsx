import { requireEventRole } from "@/lib/auth";
import { all } from "@/lib/db";
import { eventById, racesFor } from "@/lib/events";
import { feesForEvent, processingDeduction } from "@/lib/fees";
import { money } from "@/lib/format";
import { addFee, deleteFee } from "../actions";

type Row = { first_name: string; last_name: string; bib: number | null; race: string; amount_cents: number; exempt: number; member_number: string; order_status: string; payment_method: string | null };

export default async function Fees({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string }> }) {
  const { id } = await params;
  const { error } = await searchParams;
  await requireEventRole(id, "manager");
  const e = eventById(id)!;
  const races = racesFor(id);
  const fees = feesForEvent(id);
  return (
    <div className="stack">
      <p className="small muted">
        Fees participants must pay to another organization to take part, such as a federation one-day licence. They&apos;re collected with the entry,
        shown as a separate line at checkout, and you pass them on. No platform fee is charged on them.
      </p>
      {error && <div className="alert error">Enter a fee name, the organization and an amount.</div>}

      {fees.map((f) => {
        const raceIds: string[] = JSON.parse(f.race_ids || "[]");
        const rows = all<Row>(
          `SELECT r.first_name, r.last_name, r.bib, ra.name race, rf.amount_cents, rf.exempt, rf.member_number, o.status order_status, o.payment_method
           FROM registration_fees rf JOIN registrations r ON r.id=rf.registration_id JOIN races ra ON ra.id=r.race_id JOIN orders o ON o.id=r.order_id
           WHERE rf.fee_id=? AND r.status!='cancelled' ORDER BY rf.exempt, r.last_name`, f.id);
        const paid = rows.filter((r) => !r.exempt && r.order_status === "paid");
        const members = rows.filter((r) => r.exempt);
        const gross = paid.reduce((s, r) => s + r.amount_cents, 0);
        const deducted = paid.reduce((s, r) => s + processingDeduction(f, r.amount_cents, r.payment_method), 0);
        return (
          <div key={f.id} className="card stack">
            <div className="row" style={{ justifyContent: "space-between" }}>
              <div>
                <h3>{f.name} · {money(f.amount_cents, e.currency)}</h3>
                <div className="small muted">
                  Paid to {f.organization} · {raceIds.length ? races.filter((r) => raceIds.includes(r.id)).map((r) => r.name).join(", ") : "all races"}
                  {f.member_exemption ? ` · members can skip with their ${f.member_label.toLowerCase()}` : " · everyone pays"}
                  {f.deduct_processing ? ` · ${f.processing_bps / 100}% card processing deducted before passing on` : " · you cover card processing"}
                </div>
              </div>
              <div className="row">
                <a className="btn secondary small" href={`/organizer/events/${id}/fees/export?fee=${f.id}`}>Export CSV</a>
                <form action={deleteFee}><input type="hidden" name="event_id" value={id} /><input type="hidden" name="fee_id" value={f.id} /><button className="small secondary">Remove</button></form>
              </div>
            </div>
            <div className="grid">
              <div><div className="muted small">Collected (paid orders)</div><div className="stat">{money(gross, e.currency)}</div><div className="small muted">{paid.length} participants</div></div>
              <div><div className="muted small">To pass on to {f.organization}</div><div className="stat">{money(gross - deducted, e.currency)}</div><div className="small muted">after {money(deducted, e.currency)} card processing</div></div>
              <div><div className="muted small">Existing members</div><div className="stat">{members.length}</div><div className="small muted">numbers to verify</div></div>
              <div><div className="muted small">Awaiting payment</div><div className="stat">{rows.filter((r) => !r.exempt && r.order_status !== "paid").length}</div></div>
            </div>
            {rows.length > 0 && (
              <details><summary className="small">Participants</summary>
                <div className="table-wrap"><table><thead><tr><th>Bib</th><th>Name</th><th>Race</th><th>Status</th></tr></thead><tbody>
                  {rows.map((r, i) => (
                    <tr key={i}><td>{r.bib}</td><td>{r.first_name} {r.last_name}</td><td>{r.race}</td>
                      <td>{r.exempt ? <>Member <code>{r.member_number}</code></> : r.order_status === "paid" ? <span className="badge">Paid {money(r.amount_cents, e.currency)}</span> : <span className="badge warn">Unpaid</span>}</td></tr>
                  ))}
                </tbody></table></div>
              </details>
            )}
          </div>
        );
      })}

      <form action={addFee} className="card">
        <input type="hidden" name="event_id" value={id} />
        <h3>Add a fee</h3>
        <div className="cols">
          <div className="field"><label>Fee name</label><input name="name" placeholder="One-day race licence" required /></div>
          <div className="field"><label>Paid to (organization)</label><input name="organization" placeholder="TT Triathlon Federation" required /></div>
          <div className="field"><label>Amount</label><input name="amount" type="number" min="0.01" step="0.01" required /></div>
        </div>
        {races.length > 1 && (
          <div className="field"><label>Applies to (leave all unticked for every race)</label>
            <div className="row">{races.map((r) => <label key={r.id} className="check"><input type="checkbox" name="race_ids" value={r.id} /> {r.name}</label>)}</div>
          </div>
        )}
        <label className="check"><input type="checkbox" name="member_exemption" defaultChecked /> Annual members don&apos;t pay; they give their membership number instead</label>
        <div className="field" style={{ maxWidth: 320 }}><label>What to ask members for</label><input name="member_label" defaultValue="Membership number" /></div>
        <label className="check"><input type="checkbox" name="deduct_processing" defaultChecked /> The organization covers card processing on its fee (deducted from what you pass on)</label>
        <div className="field" style={{ maxWidth: 220 }}><label>Card processing rate (%)</label><input name="processing_percent" type="number" min="0" max="15" step="0.01" defaultValue="3.5" />
          <div className="small muted">Your processor&apos;s rate. Cash and bank transfer payments have no deduction.</div></div>
        <button>Add fee</button>
      </form>
    </div>
  );
}
