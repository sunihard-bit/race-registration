import { can, requireEventRole } from "@/lib/auth";
import { decrypt } from "@/lib/crypto";
import { all } from "@/lib/db";
import { eventById, racesFor } from "@/lib/events";
import { money } from "@/lib/format";
import { cancelRegistration, markPaid, setBib } from "../actions";

type Row = {
  id: string; order_id: string; first_name: string; last_name: string; email: string; gender: string; birth_year: number | null;
  race: string; bib: number | null; status: string; checked_in_at: string | null; team: string | null; relay_leg: string; tshirt: string; confirm_code: string | null;
  phone_enc: string | null; emergency_enc: string | null; medical_enc: string | null; total_cents: number; payment_method: string | null; order_status: string;
};

export default async function Participants({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ q?: string; race?: string; status?: string; error?: string }> }) {
  const { id } = await params;
  const { q = "", race = "", status = "", error } = await searchParams;
  const { role } = await requireEventRole(id, "viewer");
  const manager = can(role, "manager");
  const e = eventById(id)!;
  const rows = all<Row>(
    `SELECT r.*, ra.name race, t.name team, o.total_cents, o.payment_method, o.status order_status
     FROM registrations r JOIN races ra ON ra.id=r.race_id JOIN orders o ON o.id=r.order_id LEFT JOIN teams t ON t.id=r.team_id
     WHERE r.event_id=? AND (?='' OR r.race_id=?) AND (?='' OR r.status=?)
       AND (?='' OR r.first_name || ' ' || r.last_name LIKE ? OR r.email LIKE ? OR CAST(r.bib AS TEXT)=? OR r.confirm_code=? OR t.name LIKE ?)
     ORDER BY r.created_at DESC LIMIT 500`,
    id, race, race, status, status, q, `%${q}%`, `%${q}%`, q, q.toUpperCase(), `%${q}%`);
  const H = <input type="hidden" name="event_id" value={id} />;
  const qs = new URLSearchParams({ race, status }).toString();
  return (
    <>
      {error === "bib" && <div className="alert error">That bib number is already taken.</div>}
      <form className="row" style={{ marginBottom: 12 }}>
        <input name="q" defaultValue={q} placeholder="Name, email, bib, code or team" style={{ maxWidth: 260 }} />
        <select name="race" defaultValue={race} style={{ maxWidth: 200 }}><option value="">All races</option>{racesFor(id).map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</select>
        <select name="status" defaultValue={status} style={{ maxWidth: 180 }}><option value="">Any status</option><option value="confirmed">Confirmed</option><option value="pending">Awaiting payment</option><option value="cancelled">Cancelled</option></select>
        <button>Filter</button>
        <a className="btn secondary" href={`/organizer/events/${id}/export?${qs}`}>Export CSV</a>
        {manager && <a className="btn secondary" href={`/organizer/events/${id}/raceday`} title="Printable check-in sheet, start list and emergency contacts in one zip. Logged.">Race-day pack</a>}
        {manager && <a className="btn secondary" href={`/organizer/events/${id}/export?${qs}&sensitive=1`} title="Includes phone, emergency contact and medical notes. Logged.">Export with medical info</a>}
      </form>
      <p className="small muted">{rows.length} shown</p>
      <div className="card table-wrap">
        <table>
          <thead><tr><th>Bib</th><th>Name</th><th>Race</th><th>Team</th><th>Status</th><th>Paid</th><th></th></tr></thead>
          <tbody>
            {rows.map((r) => {
              const em = manager && r.emergency_enc ? JSON.parse(decrypt(r.emergency_enc) || "{}") : null;
              return (
                <tr key={r.id}>
                  <td>{manager ? (
                    <form action={setBib} className="row" style={{ flexWrap: "nowrap", gap: 4 }}>{H}<input type="hidden" name="reg_id" value={r.id} />
                      <input name="bib" defaultValue={r.bib ?? ""} style={{ width: 70, padding: 4 }} /><button className="small secondary">Set</button></form>
                  ) : r.bib}</td>
                  <td><strong>{r.first_name} {r.last_name}</strong><div className="small muted">{r.email}{r.confirm_code && ` · ${r.confirm_code}`}</div>
                    {manager && (
                      <details className="small"><summary>Details</summary>
                        <div>Phone: {decrypt(r.phone_enc) || "–"}</div>
                        <div>Emergency: {em?.name} {em?.phone}</div>
                        {r.medical_enc && <div>Medical: {decrypt(r.medical_enc)}</div>}
                        <div>Born {r.birth_year} · {r.gender || "–"} · shirt {r.tshirt || "none"}</div>
                      </details>
                    )}
                  </td>
                  <td>{r.race}</td>
                  <td>{r.team ?? ""}{r.relay_leg && <div className="small muted">{r.relay_leg}</div>}</td>
                  <td><span className={`badge ${r.status === "confirmed" ? "" : r.status === "pending" ? "warn" : "grey"}`}>{r.status}</span>{r.checked_in_at && <div className="small">checked in</div>}</td>
                  <td>{money(r.total_cents, e.currency)}<div className="small muted">{r.payment_method ?? ""}</div></td>
                  <td>{manager && (
                    <div className="row" style={{ gap: 4 }}>
                      {r.order_status === "pending" && <form action={markPaid}>{H}<input type="hidden" name="order_id" value={r.order_id} /><button className="small">Mark paid</button></form>}
                      {r.status !== "cancelled" && <form action={cancelRegistration}>{H}<input type="hidden" name="reg_id" value={r.id} /><button className="small secondary">Cancel</button></form>}
                    </div>
                  )}</td>
                </tr>
              );
            })}
            {rows.length === 0 && <tr><td colSpan={7} className="muted">No participants match.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}
