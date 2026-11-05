import Link from "next/link";
import { requireAdmin } from "@/lib/admin";
import { date, money } from "@/lib/format";
import { allBalances } from "@/lib/payouts";

export const metadata = { title: "Payouts" };

export default async function PayoutsAdmin({ searchParams }: { searchParams: Promise<{ all?: string }> }) {
  await requireAdmin();
  const showAll = (await searchParams).all === "1";
  const today = new Date().toISOString().slice(0, 10);
  const rows = allBalances().filter((r) => showAll || r.balance !== 0);
  const due = rows.filter((r) => r.balance > 0 && r.start_date < today);
  return (
    <div className="stack" style={{ maxWidth: 960 }}>
      <p className="small"><Link href="/admin">← Admin</Link></p>
      <h1>Payouts</h1>
      <p className="muted">
        What you owe each organizer from card payments, less your fee. Events that have finished are ready to pay.
        {due.length > 0 && <> <strong>{due.length} finished event{due.length > 1 ? "s" : ""} waiting for a payout.</strong></>}
      </p>
      <p className="small">{showAll ? <Link href="/admin/payouts">Only show events with a balance</Link> : <Link href="/admin/payouts?all=1">Show settled events too</Link>}</p>
      {rows.length === 0 ? <p className="muted">Nothing to pay out.</p> : (
        <table>
          <thead><tr><th>Event</th><th>Date</th><th>Organizer</th><th className="num">Owed</th><th className="num">Paid</th><th className="num">Balance</th><th></th></tr></thead>
          <tbody>{rows.map((r) => (
            <tr key={r.id}>
              <td><Link href={`/admin/payouts/${r.id}`}>{r.name}</Link></td>
              <td>{date(r.start_date)} {r.start_date < today ? <span className="badge">finished</span> : <span className="badge grey">upcoming</span>}</td>
              <td className="small">{r.owner_email}</td>
              <td className="num">{money(r.earned, r.currency)}</td>
              <td className="num">{money(r.paidOut, r.currency)}</td>
              <td className="num"><strong>{r.balance < 0 ? `owes ${money(-r.balance, r.currency)}` : money(r.balance, r.currency)}</strong></td>
              <td><Link className="btn secondary small" href={`/admin/payouts/${r.id}`}>Open</Link></td>
            </tr>
          ))}</tbody>
        </table>
      )}
    </div>
  );
}
