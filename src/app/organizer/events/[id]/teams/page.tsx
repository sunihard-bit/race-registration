import { requireEventRole } from "@/lib/auth";
import { all } from "@/lib/db";
import { racesFor, relayLegs } from "@/lib/events";

export default async function Teams({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireEventRole(id, "viewer");
  const races = racesFor(id).filter((r) => r.kind !== "individual");
  if (!races.length) return <p className="muted">No team or relay races in this event. Add one under Races &amp; prices.</p>;
  return (
    <div className="stack">
      {races.map((race) => {
        const legs = relayLegs(race);
        const teams = all<{ id: string; name: string; invite_code: string }>("SELECT id, name, invite_code FROM teams WHERE race_id=? ORDER BY name", race.id);
        const members = all<{ team_id: string; first_name: string; last_name: string; relay_leg: string; status: string; bib: number | null }>(
          "SELECT team_id, first_name, last_name, relay_leg, status, bib FROM registrations WHERE race_id=? AND team_id IS NOT NULL AND status!='cancelled'", race.id);
        const need = race.kind === "relay" ? legs.length : race.team_min;
        return (
          <div key={race.id} className="card">
            <h3>{race.name} <span className="badge">{race.kind}</span> <span className="small muted">{teams.length} teams</span></h3>
            <div className="table-wrap"><table><thead><tr><th>Team</th><th>Code</th><th>Members</th><th>Status</th></tr></thead><tbody>
              {teams.map((t) => {
                const m = members.filter((x) => x.team_id === t.id);
                const missing = race.kind === "relay" ? legs.filter((l) => !m.some((x) => x.relay_leg === l)) : [];
                const complete = m.length >= need && missing.length === 0;
                return (
                  <tr key={t.id}><td><strong>{t.name}</strong></td><td><code>{t.invite_code}</code></td>
                    <td>{m.map((x, i) => <div key={i}>{x.relay_leg && <span className="muted">{x.relay_leg}: </span>}{x.first_name} {x.last_name}{x.status === "pending" && <span className="badge warn"> unpaid</span>}</div>)}</td>
                    <td>{complete ? <span className="badge">Complete</span> : <span className="badge warn">{missing.length ? `Missing ${missing.join(", ")}` : `${m.length} of ${need}`}</span>}</td></tr>
                );
              })}
              {teams.length === 0 && <tr><td colSpan={4} className="muted">No teams yet.</td></tr>}
            </tbody></table></div>
          </div>
        );
      })}
    </div>
  );
}
