import Link from "next/link";
import { Suspense } from "react";
import NearMe from "@/components/NearMe";
import { all } from "@/lib/db";
import { date, sportLabel, SPORTS } from "@/lib/format";

type Row = { slug: string; name: string; sport: string; location: string; start_date: string; races: string | null; lat: number | null; lng: number | null };
type SP = { q?: string; sport?: string; lat?: string; lng?: string; within?: string };

/** Great-circle distance in km. */
function km(aLat: number, aLng: number, bLat: number, bLng: number) {
  const r = (d: number) => (d * Math.PI) / 180;
  const h = Math.sin(r(bLat - aLat) / 2) ** 2 + Math.cos(r(aLat)) * Math.cos(r(bLat)) * Math.sin(r(bLng - aLng) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

const RANGES = [["10", "10 km"], ["25", "25 km"], ["50", "50 km"], ["100", "100 km"], ["any", "Any distance"]];

export default async function Home({ searchParams }: { searchParams: Promise<SP> }) {
  const { q = "", sport = "", lat = "", lng = "", within = "50" } = await searchParams;
  const here = Number.isFinite(parseFloat(lat)) && Number.isFinite(parseFloat(lng)) ? [parseFloat(lat), parseFloat(lng)] as const : null;
  const rows = all<Row>(
    `SELECT e.slug, e.name, e.sport, e.location, e.start_date, e.lat, e.lng,
            (SELECT group_concat(name, ' · ') FROM races r WHERE r.event_id = e.id) races
     FROM events e
     WHERE e.status = 'published' AND e.start_date >= date('now', '-1 day')
       AND (? = '' OR e.sport = ?) AND (? = '' OR e.name LIKE ? OR e.location LIKE ?)
     ORDER BY e.start_date LIMIT 500`,
    sport, sport, q, `%${q}%`, `%${q}%`
  );
  let events = rows.map((e) => ({ ...e, dist: here && e.lat != null && e.lng != null ? km(here[0], here[1], e.lat, e.lng) : null }));
  let unmapped = 0;
  if (here) {
    const max = within === "any" ? Infinity : parseFloat(within) || 50;
    unmapped = events.filter((e) => e.dist == null).length;
    events = events.filter((e) => e.dist != null && e.dist <= max).sort((a, b) => a.dist! - b.dist!);
  }
  events = events.slice(0, 100);
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
          {here && (
            <>
              <input type="hidden" name="lat" value={lat} /><input type="hidden" name="lng" value={lng} />
              <select name="within" defaultValue={within} style={{ maxWidth: 160 }} aria-label="Distance">
                {RANGES.map(([v, l]) => <option key={v} value={v}>{v === "any" ? l : `Within ${l}`}</option>)}
              </select>
            </>
          )}
          <button>Search</button>
          <Suspense><NearMe /></Suspense>
        </form>
      </section>
      <h2>{here ? "Upcoming events near you" : "Upcoming events"}</h2>
      {events.length === 0 && (here
        ? <p className="muted">No events within that distance. Try a wider range.</p>
        : <p className="muted">No events found yet. Organizers can <Link href="/organizer/new">create one</Link>.</p>)}
      <div className="grid">
        {events.map((e) => (
          <Link key={e.slug} href={`/events/${e.slug}`} className="card" style={{ textDecoration: "none", color: "inherit" }}>
            <div className="row" style={{ justifyContent: "space-between" }}>
              <span className="badge">{sportLabel(e.sport)}</span>
              {e.dist != null && <span className="small muted">{e.dist < 1 ? "Under 1 km" : `${Math.round(e.dist)} km away`}</span>}
            </div>
            <h3 style={{ marginTop: 8 }}>{e.name}</h3>
            <div className="muted small">{date(e.start_date)} · {e.location}</div>
            {e.races && <div className="small" style={{ marginTop: 6 }}>{e.races}</div>}
          </Link>
        ))}
      </div>
      {here && unmapped > 0 && <p className="small muted" style={{ marginTop: 12 }}>{unmapped} event{unmapped === 1 ? " has" : "s have"} no map location yet and {unmapped === 1 ? "isn't" : "aren't"} shown. <Link href="/">See all events</Link></p>}
    </>
  );
}
