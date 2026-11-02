import { requireEventRole } from "@/lib/auth";
import { eventById, racesFor, relayLegs, spotsTaken, tiersFor } from "@/lib/events";
import { date, money } from "@/lib/format";
import { addRace, addTier, deleteRace, deleteTier } from "../actions";

export default async function Races({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string }> }) {
  const { id } = await params;
  const { error } = await searchParams;
  await requireEventRole(id, "manager");
  const e = eventById(id)!;
  const races = racesFor(id);
  const H = <input type="hidden" name="event_id" value={id} />;
  return (
    <div className="stack">
      {error === "norace" && <div className="alert error">Add at least one race before publishing.</div>}
      {error === "hasregs" && <div className="alert error">That race has registrations, so it can&apos;t be deleted. Set its capacity to stop new entries.</div>}
      {races.map((r) => (
        <div key={r.id} className="card stack">
          <div className="row" style={{ justifyContent: "space-between" }}>
            <div><h3>{r.name} <span className="badge">{r.kind}</span></h3>
              <div className="small muted">{r.distance} · {spotsTaken(r.id)}{r.capacity ? ` of ${r.capacity}` : ""} registered{r.min_age ? ` · ${r.min_age}+` : ""}{r.kind === "relay" ? ` · legs: ${relayLegs(r).join(", ")}` : ""}{r.kind === "team" ? ` · ${r.team_min}–${r.team_max} per team` : ""}</div></div>
            <form action={deleteRace}>{H}<input type="hidden" name="race_id" value={r.id} /><button className="small secondary">Delete</button></form>
          </div>
          <table><thead><tr><th>Price tier</th><th>Price</th><th>From</th><th>Until</th><th></th></tr></thead>
            <tbody>{tiersFor(r.id).map((t) => (
              <tr key={t.id}><td>{t.name}</td><td>{money(t.price_cents, e.currency)}</td><td>{date(t.starts_at) || "–"}</td><td>{date(t.ends_at) || "–"}</td>
                <td><form action={deleteTier}>{H}<input type="hidden" name="tier_id" value={t.id} /><button className="small secondary">Remove</button></form></td></tr>
            ))}</tbody></table>
          <form action={addTier} className="row">{H}<input type="hidden" name="race_id" value={r.id} />
            <input name="name" placeholder="Tier name (e.g. Early bird)" style={{ maxWidth: 200 }} required />
            <input name="price" type="number" step="0.01" min="0" placeholder="Price" style={{ maxWidth: 110 }} required />
            <label className="small">From <input name="starts_at" type="date" style={{ width: 150 }} /></label>
            <label className="small">Until <input name="ends_at" type="date" style={{ width: 150 }} /></label>
            <button className="small">Add tier</button>
          </form>
          <p className="small muted">The tier whose dates include today is used. Leave dates empty for an always-on price.</p>
        </div>
      ))}
      <form action={addRace} className="card">
        {H}
        <h3>Add a race</h3>
        <div className="cols">
          <div className="field"><label>Name</label><input name="name" placeholder="10K, Sprint Triathlon, 4x5K Relay" required /></div>
          <div className="field"><label>Distance</label><input name="distance" placeholder="10 km" /></div>
          <div className="field"><label>Type</label><select name="kind"><option value="individual">Individual</option><option value="team">Team</option><option value="relay">Relay</option></select></div>
          <div className="field"><label>Price</label><input name="price" type="number" step="0.01" min="0" required /></div>
          <div className="field"><label>Capacity (0 = unlimited)</label><input name="capacity" type="number" min="0" defaultValue={0} /></div>
          <div className="field"><label>Minimum age</label><input name="min_age" type="number" min="0" defaultValue={0} /></div>
          <div className="field"><label>Start time</label><input name="start_time" type="time" /></div>
          <div className="field"><label>Team size (min–max)</label><div className="row" style={{ flexWrap: "nowrap" }}><input name="team_min" type="number" defaultValue={2} /><input name="team_max" type="number" defaultValue={4} /></div></div>
        </div>
        <div className="field"><label>Relay legs, comma separated (relays only)</label><input name="relay_legs" placeholder="Swim, Bike, Run" /></div>
        <button>Add race</button>
      </form>
    </div>
  );
}
