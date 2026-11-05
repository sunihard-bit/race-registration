import { date, money } from "@/lib/format";
import { PAYOUT_KINDS, type Ledger } from "@/lib/payouts";

/** The money statement for one event, shared by the organizer's Payouts tab and the admin payout page. */
export default function PayoutStatement({ l, currency, appName, admin = false, voidAction, eventId }: {
  l: Ledger; currency: string; appName: string; admin?: boolean; eventId: string;
  voidAction?: (fd: FormData) => Promise<void>;
}) {
  const m = (c: number) => money(c, currency);
  const passOn = l.card.donations + l.card.third;
  return (
    <>
      <section className="card">
        <h3>Statement</h3>
        <table className="statement">
          <tbody>
            <tr><td>Card payments collected by {appName} ({l.card.orders} orders)</td><td className="num">{m(l.card.total)}</td></tr>
            <tr><td>Less {appName} fees on card orders</td><td className="num">−{m(l.card.fees)}</td></tr>
            {l.offline.fees > 0 && (
              <tr><td>Less {appName} fees on cash, bank and prepaid-code orders ({l.offline.orders} orders, {m(l.offline.total)} paid to {admin ? "the organizer" : "you"} directly)</td>
                <td className="num">−{m(l.offline.fees)}</td></tr>
            )}
            <tr className="sum"><td>Total owed to {admin ? "organizer" : "you"}</td><td className="num">{m(l.earned)}</td></tr>
            {l.paidOut > 0 && <tr><td>Paid out so far</td><td className="num">−{m(l.paidOut)}</td></tr>}
            {l.deducted > 0 && <tr><td>Deductions</td><td className="num">−{m(l.deducted)}</td></tr>}
            {l.received > 0 && <tr><td>Received from {admin ? "organizer" : "you"}</td><td className="num">+{m(l.received)}</td></tr>}
            <tr className="sum">
              <td>{l.balance >= 0 ? (admin ? "Balance to pay organizer" : `Balance ${appName} owes you`) : (admin ? "Organizer owes us" : `You owe ${appName}`)}</td>
              <td className="num">{m(Math.abs(l.balance))}</td>
            </tr>
          </tbody>
        </table>
        {passOn > 0 && (
          <p className="small muted">
            The card total includes {l.card.donations > 0 && <>{m(l.card.donations)} in donations</>}
            {l.card.donations > 0 && l.card.third > 0 && " and "}
            {l.card.third > 0 && <>{m(l.card.third)} in fees for other organizations</>}, which {admin ? "the organizer passes" : "you pass"} on.
          </p>
        )}
        <p className="small muted">Card processing costs are covered by the {appName} fee and are not deducted again. Pending and cancelled orders are not counted.</p>
        <a className="btn secondary small" href={`/organizer/events/${eventId}/payouts/statement`}>Download order statement (CSV)</a>
      </section>

      <section className="card">
        <h3>Payments</h3>
        {l.payouts.length === 0 ? <p className="muted">Nothing paid yet.</p> : (
          <table>
            <thead><tr><th>Date</th><th>Type</th><th className="num">Amount</th><th>Method</th><th>Reference</th>{admin && <th></th>}</tr></thead>
            <tbody>{l.payouts.map((p) => (
              <tr key={p.id} style={p.void ? { textDecoration: "line-through", color: "#999" } : undefined}>
                <td>{date(p.paid_on)}</td>
                <td>{PAYOUT_KINDS[p.kind]}{p.void ? " (void)" : ""}{p.note && <div className="small muted">{p.note}</div>}</td>
                <td className="num">{m(p.amount_cents)}</td><td>{p.method}</td><td>{p.reference}</td>
                {admin && <td>{!p.void && voidAction && (
                  <form action={voidAction}><input type="hidden" name="id" value={p.id} /><input type="hidden" name="event_id" value={eventId} />
                    <button className="secondary small">Void</button></form>
                )}</td>}
              </tr>
            ))}</tbody>
          </table>
        )}
      </section>
    </>
  );
}
