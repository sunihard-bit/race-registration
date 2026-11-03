import { requireEventRole } from "@/lib/auth";
import { all, one } from "@/lib/db";
import { checkIn } from "../actions";

export default async function CheckIn({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ q?: string }> }) {
  const { id } = await params;
  const { q = "" } = await searchParams;
  await requireEventRole(id, "checkin");
  const counts = one<{ done: number | null; total: number }>("SELECT SUM(checked_in_at IS NOT NULL) done, COUNT(*) total FROM registrations WHERE event_id=? AND status='confirmed'", id)!;
  const rows = q
    ? all<{ id: string; bib: number; first_name: string; last_name: string; race: string; tshirt: string; team: string | null; checked_in_at: string | null }>(
        `SELECT r.id, r.bib, r.first_name, r.last_name, ra.name race, r.tshirt, t.name team, r.checked_in_at
         FROM registrations r JOIN races ra ON ra.id=r.race_id LEFT JOIN teams t ON t.id=r.team_id
         WHERE r.event_id=? AND r.status='confirmed' AND (CAST(r.bib AS TEXT)=? OR r.first_name || ' ' || r.last_name LIKE ? OR t.name LIKE ?)
         ORDER BY r.last_name LIMIT 30`, id, q, `%${q}%`, `%${q}%`)
    : [];
  return (
    <div style={{ maxWidth: 640 }}>
      <p><strong>{counts.done ?? 0}</strong> of {counts.total} checked in</p>
      <div className="progress" style={{ marginBottom: 16 }}><div style={{ width: `${counts.total ? ((counts.done ?? 0) / counts.total) * 100 : 0}%` }} /></div>
      <form className="row" style={{ marginBottom: 16 }}>
        <input name="q" defaultValue={q} placeholder="Bib, name or team" autoFocus style={{ fontSize: "1.2rem", flex: 1 }} inputMode="search" />
        <button>Find</button>
      </form>
      <div className="stack">
        {rows.map((r) => (
          <form key={r.id} action={checkIn} className="card row" style={{ justifyContent: "space-between" }}>
            <input type="hidden" name="event_id" value={id} /><input type="hidden" name="reg_id" value={r.id} />
            {r.checked_in_at && <input type="hidden" name="undo" value="1" />}
            <div><div className="stat">#{r.bib}</div><strong>{r.first_name} {r.last_name}</strong>
              <div className="small muted">{r.race}{r.team && ` · ${r.team}`} · shirt {r.tshirt || "none"}</div></div>
            {r.checked_in_at ? <button className="secondary">✓ Checked in (undo)</button> : <button>Check in</button>}
          </form>
        ))}
        {q && rows.length === 0 && <p className="muted">No confirmed participant matches “{q}”.</p>}
      </div>
    </div>
  );
}
