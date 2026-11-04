import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { all } from "@/lib/db";
import { eventById } from "@/lib/events";
import { money } from "@/lib/format";
import { orderById } from "@/lib/orders";
import { appUrl } from "@/lib/mailer";
import { feesForOrder } from "@/lib/fees";

export default async function OrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser(`/orders/${id}`);
  const o = orderById(id);
  if (!o || o.user_id !== user.id) notFound();
  const e = eventById(o.event_id)!;
  const regs = all<{ id: string; first_name: string; bib: number | null; race: string; race_id: string; team: string | null; invite_code: string | null; relay_leg: string; status: string }>(
    `SELECT r.id, r.first_name, r.bib, ra.name race, ra.id race_id, t.name team, t.invite_code, r.relay_leg, r.status
     FROM registrations r JOIN races ra ON ra.id=r.race_id LEFT JOIN teams t ON t.id=r.team_id WHERE r.order_id=?`, o.id);
  const paid = o.status === "paid";
  return (
    <div style={{ maxWidth: 640 }}>
      <h1>{paid ? "You're registered!" : "Registration received"}</h1>
      <p className="muted">{e.name}</p>
      {!paid && o.payment_method === "manual" && (
        <div className="alert">
          <strong>Payment pending.</strong> Your spot is held until the organizer receives {money(o.total_cents, o.currency)}.
          <div style={{ whiteSpace: "pre-wrap", marginTop: 6 }}>{e.manual_payment_instructions || "The organizer will contact you with payment details."}</div>
          <div className="small" style={{ marginTop: 6 }}>Use reference <strong>{o.id.slice(0, 8).toUpperCase()}</strong>.</div>
        </div>
      )}
      {!paid && o.payment_method !== "manual" && <p><Link className="btn" href={`/checkout/${o.id}`}>Complete payment</Link></p>}
      {regs.map((r) => (
        <div key={r.id} className="card stack" style={{ marginBottom: 12 }}>
          <div className="row" style={{ justifyContent: "space-between" }}>
            <strong>{r.first_name}: {r.race}</strong>
            {r.bib ? <span className="badge">Bib #{r.bib}</span> : <span className="badge warn">{r.status}</span>}
          </div>
          {r.team && (
            <div className="small">
              Team <strong>{r.team}</strong>{r.relay_leg && `, ${r.relay_leg} leg`}. Invite teammates with code <strong>{r.invite_code}</strong> or this link:
              <div><code>{appUrl()}/events/{e.slug}/register?race={r.race_id}&invite={r.invite_code}</code></div>
            </div>
          )}
          {e.fundraising_enabled === 1 && <div className="small">Share your fundraising page: <Link href={`/fundraise/${r.id}`}>{appUrl()}/fundraise/{r.id}</Link></div>}
        </div>
      ))}
      {feesForOrder(o.id).map((f, i) => (
        <p key={i} className="small">{f.name} ({f.organization}): {f.exempt ? `existing member #${f.member_number}` : money(f.amount_cents, o.currency)}</p>
      ))}
      <p><Link href="/account">Go to my account</Link></p>
    </div>
  );
}
