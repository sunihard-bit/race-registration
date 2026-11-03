import Link from "next/link";
import { notFound } from "next/navigation";
import { currentTier, eventBySlug, racesFor, relayLegs, spotsLeft, tiersFor } from "@/lib/events";
import { date, money, sportLabel } from "@/lib/format";
import { one } from "@/lib/db";

export default async function EventPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const e = eventBySlug(slug);
  if (!e || e.status === "draft") notFound();
  const races = racesFor(e.id);
  const raised = one<{ s: number }>("SELECT COALESCE(SUM(amount_cents),0) s FROM donations WHERE event_id=? AND status='paid'", e.id)!.s;
  const hasResults = !!one("SELECT 1 FROM results r JOIN races ra ON ra.id=r.race_id WHERE ra.event_id=? LIMIT 1", e.id);
  const open = e.status === "published";
  return (
    <>
      <span className="badge">{sportLabel(e.sport)}</span>
      <h1 style={{ marginTop: 8 }}>{e.name}</h1>
      <p className="muted">{date(e.start_date)} · {e.location}</p>
      {!open && <div className="alert">Registration is closed.</div>}
      {hasResults && <p><Link href={`/events/${e.slug}/results`} className="btn secondary">View results</Link></p>}
      <p style={{ whiteSpace: "pre-wrap" }}>{e.description}</p>

      <h2>Races</h2>
      <div className="grid">
        {races.map((r) => {
          const tier = currentTier(r.id);
          const left = spotsLeft(r);
          const tiers = tiersFor(r.id);
          return (
            <div key={r.id} className="card stack">
              <div>
                <h3>{r.name}</h3>
                <div className="muted small">
                  {r.distance}{r.start_time && ` · starts ${r.start_time}`}{r.min_age > 0 && ` · ages ${r.min_age}+`}
                </div>
                {r.kind !== "individual" && (
                  <div className="small" style={{ marginTop: 4 }}>
                    <span className="badge">{r.kind === "relay" ? "Relay" : "Team"}</span>{" "}
                    {r.kind === "relay" ? `${relayLegs(r).join(" → ")}` : `${r.team_min}–${r.team_max} per team`}
                  </div>
                )}
              </div>
              {tier ? <div><span className="stat">{money(tier.price_cents, e.currency)}</span> <span className="muted small">{tier.name}</span></div> : <div className="muted">Not on sale</div>}
              {tiers.length > 1 && (
                <details className="small"><summary>All prices</summary>
                  <ul>{tiers.map((t) => <li key={t.id}>{t.name}: {money(t.price_cents, e.currency)}{t.ends_at && ` until ${date(t.ends_at)}`}</li>)}</ul>
                </details>
              )}
              {left !== Infinity && <div className="small muted">{left > 0 ? `${left} spots left` : "Sold out"}</div>}
              {open && tier && left > 0 && <Link className="btn" href={`/events/${e.slug}/register?race=${r.id}`}>Register</Link>}
            </div>
          );
        })}
      </div>

      {e.fundraising_enabled === 1 && (
        <>
          <h2>Fundraising: {e.fundraising_cause}</h2>
          <div className="card">
            <div className="row" style={{ justifyContent: "space-between" }}>
              <strong>{money(raised, e.currency)} raised</strong>
              {e.fundraising_goal_cents > 0 && <span className="muted">Goal {money(e.fundraising_goal_cents, e.currency)}</span>}
            </div>
            {e.fundraising_goal_cents > 0 && <div className="progress" style={{ marginTop: 8 }}><div style={{ width: `${Math.min(100, (raised / e.fundraising_goal_cents) * 100)}%` }} /></div>}
            <p className="small muted">Participants can add a donation at checkout and share a personal fundraising page.</p>
          </div>
        </>
      )}

      {e.refund_policy && (<><h2>Refund policy</h2><p className="small" style={{ whiteSpace: "pre-wrap" }}>{e.refund_policy}</p></>)}
    </>
  );
}
