import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { all } from "@/lib/db";
import { date } from "@/lib/format";

export default async function Account() {
  const user = await requireUser();
  const regs = all<{ order_id: string; event: string; slug: string; start_date: string; race: string; bib: number | null; status: string; checked_in_at: string | null }>(
    `SELECT r.order_id, e.name event, e.slug, e.start_date, ra.name race, r.bib, r.status, r.checked_in_at
     FROM registrations r JOIN events e ON e.id=r.event_id JOIN races ra ON ra.id=r.race_id
     WHERE r.user_id=? ORDER BY e.start_date DESC`, user.id);
  return (
    <>
      <h1>Hi {user.name.split(" ")[0]}</h1>
      <p className="muted">{user.email}</p>
      <h2>My registrations</h2>
      {regs.length === 0 && <p className="muted">No registrations yet. <Link href="/">Find a race</Link>.</p>}
      <div className="grid">
        {regs.map((r, i) => (
          <Link key={i} href={`/orders/${r.order_id}`} className="card" style={{ textDecoration: "none", color: "inherit" }}>
            <h3>{r.event}</h3>
            <div className="muted small">{date(r.start_date)} · {r.race}</div>
            <div style={{ marginTop: 6 }}>{r.bib ? <span className="badge">Bib #{r.bib}</span> : <span className="badge warn">{r.status}</span>}</div>
          </Link>
        ))}
      </div>
      <h2>Privacy</h2>
      <p><Link href="/account/data">Download or delete your data, and manage email preferences</Link></p>
    </>
  );
}
