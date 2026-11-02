import { requireEventRole } from "@/lib/auth";
import { all } from "@/lib/db";
import { eventById, type Discount } from "@/lib/events";
import { date, money } from "@/lib/format";
import { addDiscount, deleteDiscount } from "../actions";

export default async function Discounts({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string }> }) {
  const { id } = await params;
  const { error } = await searchParams;
  await requireEventRole(id, "manager");
  const e = eventById(id)!;
  const codes = all<Discount>("SELECT * FROM discount_codes WHERE event_id=? ORDER BY code", id);
  return (
    <div className="stack" style={{ maxWidth: 760 }}>
      {error && <div className="alert error">{error === "dup" ? "That code already exists." : "Enter a code and an amount."}</div>}
      <div className="card table-wrap"><table><thead><tr><th>Code</th><th>Discount</th><th>Used</th><th>Expires</th><th></th></tr></thead><tbody>
        {codes.map((d) => (
          <tr key={d.id}><td><strong>{d.code}</strong></td><td>{d.kind === "percent" ? `${d.amount}%` : money(d.amount, e.currency)}</td>
            <td>{d.used_count}{d.max_uses ? ` of ${d.max_uses}` : ""}</td><td>{date(d.expires_at) || "Never"}</td>
            <td><form action={deleteDiscount}><input type="hidden" name="event_id" value={id} /><input type="hidden" name="discount_id" value={d.id} /><button className="small secondary">{d.used_count ? "Disable" : "Delete"}</button></form></td></tr>
        ))}
        {codes.length === 0 && <tr><td colSpan={5} className="muted">No codes yet.</td></tr>}
      </tbody></table></div>
      <form action={addDiscount} className="card">
        <input type="hidden" name="event_id" value={id} />
        <h3>New discount code</h3>
        <div className="cols">
          <div className="field"><label>Code</label><input name="code" required placeholder="CLUB20" style={{ textTransform: "uppercase" }} /></div>
          <div className="field"><label>Type</label><select name="kind"><option value="percent">Percent off</option><option value="fixed">Amount off</option></select></div>
          <div className="field"><label>Amount</label><input name="amount" type="number" min="1" step="0.01" required /></div>
          <div className="field"><label>Max uses (0 = unlimited)</label><input name="max_uses" type="number" min="0" defaultValue={0} /></div>
          <div className="field"><label>Expires</label><input name="expires_at" type="date" /></div>
        </div>
        <button>Create code</button>
      </form>
    </div>
  );
}
