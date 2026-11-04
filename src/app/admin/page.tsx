import { requireAdmin } from "@/lib/admin";
import { all } from "@/lib/db";
import { FEATURED_WEEKS } from "@/lib/featured";
import { date, money } from "@/lib/format";
import { decide, featureNow, stopFeatured } from "./actions";

export const metadata = { title: "Admin" };

export default async function Admin() {
  await requireAdmin();
  const pending = all<{ id: string; name: string; weeks: number; price_cents: number; currency: string; note: string; email: string | null; created_at: string }>(
    `SELECT f.id, e.name, f.weeks, f.price_cents, e.currency, f.note, u.email, f.created_at
     FROM featured_requests f JOIN events e ON e.id=f.event_id LEFT JOIN users u ON u.id=f.user_id WHERE f.status='pending' ORDER BY f.created_at`);
  const featured = all<{ id: string; name: string; featured_until: string }>(
    "SELECT id, name, featured_until FROM events WHERE featured_until >= date('now') ORDER BY featured_until");
  const upcoming = all<{ id: string; name: string; start_date: string }>(
    "SELECT id, name, start_date FROM events WHERE status='published' AND start_date >= date('now') ORDER BY start_date LIMIT 300");
  const recent = all<{ name: string; weeks: number; price_cents: number; currency: string; status: string; decided_at: string }>(
    `SELECT e.name, f.weeks, f.price_cents, e.currency, f.status, f.decided_at FROM featured_requests f JOIN events e ON e.id=f.event_id
     WHERE f.status!='pending' ORDER BY f.decided_at DESC LIMIT 20`);
  return (
    <div className="stack" style={{ maxWidth: 860 }}>
      <h1>Admin</h1>
      <section className="card">
        <h2>Featured requests</h2>
        {pending.length === 0 && <p className="muted">No requests waiting.</p>}
        {pending.map((r) => (
          <div key={r.id} className="row" style={{ justifyContent: "space-between", borderTop: "1px solid #eee", padding: "10px 0" }}>
            <div>
              <strong>{r.name}</strong> · {r.weeks} week{r.weeks > 1 ? "s" : ""} · {money(r.price_cents, r.currency)}
              <div className="small muted">{r.email} · requested {date(r.created_at.slice(0, 10))}</div>
              {r.note && <div className="small">{r.note}</div>}
            </div>
            <div className="row">
              <form action={decide}><input type="hidden" name="id" value={r.id} /><input type="hidden" name="approve" value="1" /><button>Approve</button></form>
              <form action={decide}><input type="hidden" name="id" value={r.id} /><input type="hidden" name="approve" value="0" /><button className="secondary">Decline</button></form>
            </div>
          </div>
        ))}
        <p className="small muted">Approving features the event straight away and emails the organizer that an invoice will follow. Send the invoice from your accounting tool.</p>
      </section>

      <section className="card">
        <h2>Featured now</h2>
        {featured.length === 0 && <p className="muted">Nothing is featured.</p>}
        {featured.map((e) => (
          <form key={e.id} action={stopFeatured} className="row" style={{ justifyContent: "space-between", padding: "6px 0" }}>
            <input type="hidden" name="event_id" value={e.id} />
            <span><strong>{e.name}</strong> <span className="small muted">until {date(e.featured_until)}</span></span>
            <button className="secondary small">Stop featuring</button>
          </form>
        ))}
        <form action={featureNow} className="row" style={{ marginTop: 12 }}>
          <select name="event_id" style={{ maxWidth: 360 }}>{upcoming.map((e) => <option key={e.id} value={e.id}>{e.name} ({date(e.start_date)})</option>)}</select>
          <select name="weeks" style={{ maxWidth: 140 }}>{FEATURED_WEEKS.map((w) => <option key={w} value={w}>{w} week{w > 1 ? "s" : ""}</option>)}</select>
          <button className="secondary">Feature an event</button>
        </form>
      </section>

      {recent.length > 0 && (
        <section className="card">
          <h2>Recent decisions</h2>
          <table><tbody>{recent.map((r, i) => (
            <tr key={i}><td>{r.name}</td><td>{r.weeks} wk</td><td>{money(r.price_cents, r.currency)}</td><td>{r.status}</td><td className="small muted">{r.decided_at}</td></tr>
          ))}</tbody></table>
        </section>
      )}
    </div>
  );
}
