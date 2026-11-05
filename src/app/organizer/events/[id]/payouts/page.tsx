import { can, requireEventRole } from "@/lib/auth";
import { eventById } from "@/lib/events";
import { appName } from "@/lib/mailer";
import { ledger, maskAccount, payoutDetails } from "@/lib/payouts";
import PayoutStatement from "@/components/PayoutStatement";
import { savePayoutDetails } from "../actions";

export default async function Payouts({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { role } = await requireEventRole(id, "manager");
  const e = eventById(id)!;
  const l = ledger(id);
  const d = payoutDetails(id);
  const owner = can(role, "owner");
  const name = appName();
  return (
    <div className="stack" style={{ maxWidth: 760 }}>
      <p className="small muted">
        Card payments go to {name} first. After your event, {name} sends you what was collected minus its fee. If you took cash or bank
        transfers yourself, the {name} fee on those is taken out of your payout, or invoiced if there is nothing to pay out.
      </p>
      <PayoutStatement l={l} currency={e.currency} appName={name} eventId={id} />

      <section className="card">
        <h3>Where to send your money</h3>
        {owner ? (
          <form action={savePayoutDetails} className="stack">
            <input type="hidden" name="event_id" value={id} />
            <div className="grid">
              <div className="field"><label>Account name</label><input name="account_name" defaultValue={d.account_name} required /></div>
              <div className="field"><label>Bank</label><input name="bank" defaultValue={d.bank} placeholder="e.g. Republic Bank" required /></div>
              <div className="field"><label>Branch</label><input name="branch" defaultValue={d.branch} /></div>
              <div className="field"><label>Account number</label><input name="account_number" defaultValue={d.account_number} autoComplete="off" required /></div>
              <div className="field"><label>Account type</label>
                <select name="account_type" defaultValue={d.account_type}><option value="">Choose</option><option>Chequing</option><option>Savings</option></select></div>
            </div>
            <div className="field"><label>Notes for {name}</label><textarea name="notes" defaultValue={d.notes} rows={2} placeholder="Anything we should know, e.g. send a remittance email to the treasurer" /></div>
            <div><button>Save payout details</button></div>
            <p className="small muted">Stored encrypted. Only the event owner and {name} staff can see them.</p>
          </form>
        ) : d.account_number ? (
          <p>{d.account_name}, {d.bank} {maskAccount(d.account_number)}. Only the event owner can change this.</p>
        ) : <p className="muted">Not set yet. Ask the event owner to add bank details here.</p>}
      </section>
    </div>
  );
}
