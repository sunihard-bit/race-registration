import { can, requireEventRole } from "@/lib/auth";
import { all, one } from "@/lib/db";
import { checkIn } from "../actions";
import { normalizeCode } from "@/lib/confirm";

export default async function CheckIn({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ q?: string }> }) {
  const { id } = await params;
  const { q = "" } = await searchParams;
  const { role } = await requireEventRole(id, "checkin");
  const counts = one<{ done: number | null; total: number }>("SELECT SUM(checked_in_at IS NOT NULL) done, COUNT(*) total FROM registrations WHERE event_id=? AND status='confirmed'", id)!;
  const code = normalizeCode(q);
  const rows = q
    ? all<{ id: string; bib: number; first_name: string; last_name: string; race: string; tshirt: string; team: string | null; checked_in_at: string | null; confirm_code: string | null }>(
        `SELECT r.id, r.bib, r.first_name, r.last_name, ra.name race, r.tshirt, t.name team, r.checked_in_at, r.confirm_code
         FROM registrations r JOIN races ra ON ra.id=r.race_id LEFT JOIN teams t ON t.id=r.team_id
         WHERE r.event_id=? AND r.status='confirmed' AND (r.confirm_code=? OR CAST(r.bib AS TEXT)=? OR r.first_name || ' ' || r.last_name LIKE ? OR t.name LIKE ?)
         ORDER BY r.confirm_code=? DESC, r.last_name LIMIT 30`, id, code, q, `%${q}%`, `%${q}%`, code)
    : [];
  return (
    <div style={{ maxWidth: 640 }}>
      {can(role, "manager") && (
        <div className="card small" style={{ marginBottom: 12 }}>
          <strong>No internet at the venue?</strong> Download the race-day pack the night before: a printable check-in sheet, start list,
          participant list and a confidential emergency-contacts file. <a href={`/organizer/events/${id}/raceday`}>Download race-day pack (.zip)</a>
        </div>
      )}
      <p><strong>{counts.done ?? 0}</strong> of {counts.total} checked in</p>
      <div className="progress" style={{ marginBottom: 16 }}><div style={{ width: `${counts.total ? ((counts.done ?? 0) / counts.total) * 100 : 0}%` }} /></div>
      <form className="row" style={{ marginBottom: 16 }}>
        <input name="q" defaultValue={q} placeholder="Code, bib, name or team" autoFocus style={{ fontSize: "1.2rem", flex: 1 }} inputMode="search" />
        <button>Find</button>
      </form>
      <p className="small muted" style={{ marginTop: -8 }}>Tip: scan a participant&apos;s QR code with this phone&apos;s camera to open their check-in directly.</p>
      <div className="stack">
        {rows.map((r) => (
          <form key={r.id} action={checkIn} className="card row" style={{ justifyContent: "space-between" }}>
            <input type="hidden" name="event_id" value={id} /><input type="hidden" name="reg_id" value={r.id} />
            {r.checked_in_at && <input type="hidden" name="undo" value="1" />}
            <div><div className="stat">#{r.bib}</div><strong>{r.first_name} {r.last_name}</strong>
              <div className="small muted">{r.race}{r.team && ` · ${r.team}`} · shirt {r.tshirt || "none"}{r.confirm_code && ` · ${r.confirm_code}`}</div></div>
            {r.checked_in_at ? <button className="secondary">✓ Checked in (undo)</button> : <button>Check in</button>}
          </form>
        ))}
        {q && rows.length === 0 && <p className="muted">No confirmed participant matches “{q}”.</p>}
      </div>
    </div>
  );
}
