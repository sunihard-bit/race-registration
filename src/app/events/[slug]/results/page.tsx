import { notFound } from "next/navigation";
import { all } from "@/lib/db";
import { eventBySlug, racesFor } from "@/lib/events";

type Res = { place: number | null; bib: number | null; name: string; gender: string; category: string; chip_time: string; gun_time: string };

export default async function Results({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ race?: string; q?: string }> }) {
  const { slug } = await params;
  const { race, q = "" } = await searchParams;
  const e = eventBySlug(slug);
  if (!e || e.status === "draft") notFound();
  const races = racesFor(e.id);
  const sel = races.find((r) => r.id === race) ?? races[0];
  const rows = sel
    ? all<Res>("SELECT * FROM results WHERE race_id=? AND (?='' OR name LIKE ? OR CAST(bib AS TEXT)=?) ORDER BY COALESCE(place, 999999), chip_time", sel.id, q, `%${q}%`, q)
    : [];
  return (
    <>
      <h1>{e.name}: results</h1>
      <form className="row">
        <select name="race" defaultValue={sel?.id} style={{ maxWidth: 240 }}>
          {races.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
        </select>
        <input name="q" defaultValue={q} placeholder="Name or bib" style={{ maxWidth: 220 }} />
        <button>Show</button>
      </form>
      <div className="table-wrap card" style={{ marginTop: 16 }}>
        <table>
          <thead><tr><th>Place</th><th>Bib</th><th>Name</th><th>Gender</th><th>Category</th><th>Chip time</th><th>Gun time</th></tr></thead>
          <tbody>
            {rows.map((r, i) => <tr key={i}><td>{r.place}</td><td>{r.bib}</td><td>{r.name}</td><td>{r.gender}</td><td>{r.category}</td><td>{r.chip_time}</td><td>{r.gun_time}</td></tr>)}
            {rows.length === 0 && <tr><td colSpan={7} className="muted">No results yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}
