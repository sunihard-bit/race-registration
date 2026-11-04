import Link from "next/link";
import { requireEventRole } from "@/lib/auth";
import { one } from "@/lib/db";
import { eventById, racesFor } from "@/lib/events";
import { uploadResults } from "../actions";

export default async function ResultsAdmin({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ uploaded?: string; error?: string }> }) {
  const { id } = await params;
  const { uploaded, error } = await searchParams;
  await requireEventRole(id, "manager");
  const e = eventById(id)!;
  const races = racesFor(id);
  return (
    <div className="stack" style={{ maxWidth: 720 }}>
      {uploaded && <div className="alert">Imported {uploaded} results. <Link href={`/events/${e.slug}/results`}>View public results</Link></div>}
      {error && <div className="alert error">The first line must be a header that includes at least a name or bib column.</div>}
      <div className="card small">
        Upload a results file from your timing system. Common headings like <code>Pos, Bib, Name, Chip Time, Gun Time, Sex, Division</code> are recognised (see the <Link href={`/organizer/events/${id}/timing`}>Timing</Link> tab for more).
        If you leave <code>name</code> out, names are filled in from bib numbers. Uploading again replaces that race&apos;s results.
      </div>
      {races.map((r) => {
        const n = one<{ n: number }>("SELECT COUNT(*) n FROM results WHERE race_id=?", r.id)!.n;
        return (
          <form key={r.id} action={uploadResults} className="card">
            <input type="hidden" name="event_id" value={id} /><input type="hidden" name="race_id" value={r.id} />
            <h3>{r.name} <span className="small muted">{n} results</span></h3>
            <div className="field"><input type="file" name="file" accept=".csv,text/csv" /></div>
            <details><summary className="small">Or paste CSV</summary><textarea name="csv" placeholder={"place,bib,chip_time\n1,101,00:34:12"} /></details>
            <p><button>Upload results</button></p>
          </form>
        );
      })}
    </div>
  );
}
