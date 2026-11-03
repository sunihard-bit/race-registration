import Link from "next/link";
import { all } from "@/lib/db";
import { date, sportLabel, SPORTS } from "@/lib/format";

type Row = { slug: string; name: string; sport: string; location: string; start_date: string; races: string | null };

export default async function Home({ searchParams }: { searchParams: Promise<{ q?: string; sport?: string }> }) {
  const { q = "", sport = "" } = await searchParams;
  const events = all<Row>(
    `SELECT e.slug, e.name, e.sport, e.location, e.start_date,
            (SELECT group_concat(name, ' · ') FROM races r WHERE r.event_id = e.id) races
     FROM events e
     WHERE e.status = 'published' AND e.start_date >= date('now', '-1 day')
       AND (? = '' OR e.sport = ?) AND (? = '' OR e.name LIKE ? OR e.location LIKE ?)
     ORDER BY e.start_date LIMIT 100`,
    sport, sport, q, `%${q}%`, `%${q}%`
  );
  return (
    <>
      <section className="hero">
        <h1>Find your next race</h1>
        <p className="muted">Road races, triathlons, rides, swims and relays. Register in a couple of minutes.</p>
        <form className="row" style={{ marginTop: 12 }}>
          <input name="q" defaultValue={q} placeholder="Search by name or place" style={{ maxWidth: 320 }} />
          <select name="sport" defaultValue={sport} style={{ maxWidth: 200 }}>
            <option value="">All sports</option>
            {SPORTS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
          <button>Search</button>
        </form>
      </section>
      <h2>Upcoming events</h2>
      {events.length === 0 && <p className="muted">No events found yet. Organizers can <Link href="/organizer/new">create one</Link>.</p>}
      <div className="grid">
        {events.map((e) => (
          <Link key={e.slug} href={`/events/${e.slug}`} className="card" style={{ textDecoration: "none", color: "inherit" }}>
            <span className="badge">{sportLabel(e.sport)}</span>
            <h3 style={{ marginTop: 8 }}>{e.name}</h3>
            <div className="muted small">{date(e.start_date)} · {e.location}</div>
            {e.races && <div className="small" style={{ marginTop: 6 }}>{e.races}</div>}
          </Link>
        ))}
      </div>
    </>
  );
}
