import Link from "next/link";
import { requireEventRole } from "@/lib/auth";
import { one } from "@/lib/db";
import { eventById, racesFor } from "@/lib/events";
import { appUrl } from "@/lib/mailer";
import { timingToken } from "@/lib/timing";
import { rotateTimingLink, uploadChips, uploadResults } from "../actions";

type SP = { uploaded?: string; skipped?: string; chips?: string; error?: string };

export default async function TimingTab({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<SP> }) {
  const { id } = await params;
  const sp = await searchParams;
  await requireEventRole(id, "manager");
  const e = eventById(id)!;
  const races = racesFor(id);
  const token = timingToken(id);
  const feed = `${appUrl()}/api/timing/${token}`;
  const confirmed = one<{ n: number; chips: number }>(
    "SELECT COUNT(*) n, SUM(chip!='') chips FROM registrations WHERE event_id=? AND status='confirmed' AND anonymized_at IS NULL", id)!;
  return (
    <div className="stack" style={{ maxWidth: 820 }}>
      {sp.uploaded && <div className="alert">Imported {sp.uploaded} results{Number(sp.skipped) ? `, skipped ${sp.skipped} row${sp.skipped === "1" ? "" : "s"} with an unknown bib and no race column` : ""}. <Link href={`/events/${e.slug}/results`}>View public results</Link></div>}
      {sp.chips && <div className="alert">Updated chips or waves for {sp.chips} participants.</div>}
      {sp.error === "header" && <div className="alert error">Couldn&apos;t find a bib or name column in the first row of that file.</div>}
      {sp.error === "chips" && <div className="alert error">The chip file needs a bib column and a chip or wave column.</div>}

      <div className="card small">
        This tab is for your race timer. Send them the start list before race day, then upload the results file they give you.
        Their software can also read the start list and send results directly using the private link below.
      </div>

      <section className="card">
        <h2>1. Start list</h2>
        <p className="small muted">{confirmed.n} confirmed participants, {confirmed.chips || 0} with a chip assigned (otherwise the bib number is used as the chip).</p>
        <p className="small">Columns: <code>bib, chip, first_name, last_name, gender, birth_year, age, category, race, wave, team, relay_leg, club, city, country</code>.
          Age is on race day, and category is a 10-year age group such as <code>F 30-39</code>. No contact or medical details are included.</p>
        <div className="row">
          <a className="btn" href={`/organizer/events/${id}/timing/startlist`}>Download start list (CSV)</a>
          {races.map((r) => <a key={r.id} className="btn secondary small" href={`/organizer/events/${id}/timing/startlist?race=${r.id}`}>{r.name} only</a>)}
        </div>
      </section>

      <section className="card">
        <h2>2. Private link for timing software</h2>
        <p className="small">Give these to your timer only. Anyone with the link can read the start list, so make a new link if it gets shared by mistake.</p>
        <div className="field"><label>Start list (CSV)</label><input readOnly value={`${feed}/participants`} /></div>
        <div className="field"><label>Start list (JSON)</label><input readOnly value={`${feed}/participants?format=json`} /></div>
        <div className="field"><label>Send results (POST a CSV file or JSON array)</label><input readOnly value={`${feed}/results`} /></div>
        <form action={rotateTimingLink}><input type="hidden" name="event_id" value={id} /><button className="secondary small">Make a new link (old one stops working)</button></form>
      </section>

      <section className="card">
        <h2>3. Chips and waves</h2>
        <p className="small">If the timer assigns chips that differ from bib numbers, upload their file with a <code>bib</code> column and a <code>chip</code> and/or <code>wave</code> column.</p>
        <form action={uploadChips} className="stack">
          <input type="hidden" name="event_id" value={id} />
          <input type="file" name="file" accept=".csv,.txt,.tsv,text/csv" />
          <details><summary className="small">Or paste</summary><textarea name="csv" placeholder={"bib,chip,wave\n101,E200341201,Wave 1"} /></details>
          <p><button className="secondary">Upload chips</button></p>
        </form>
      </section>

      <section className="card">
        <h2>4. Results</h2>
        <p className="small">Upload the timer&apos;s results export as it is (CSV, tab or semicolon separated). Common headings are recognised, such as
          <code> Place / Pos / Overall</code>, <code>Bib / No.</code>, <code>Name</code> or <code>First + Last</code>, <code>Chip / Net Time</code>,
          <code> Gun / Finish Time</code>, <code>Sex</code>, <code>Division / Age Group</code> and <code>Race / Event</code>.
          Missing names, genders and age groups are filled in from the bib. Uploading again replaces the results for those races.</p>
        <form action={uploadResults} className="stack">
          <input type="hidden" name="event_id" value={id} /><input type="hidden" name="back" value="timing" />
          <div className="field"><label>Race</label>
            <select name="race_id" defaultValue="">
              <option value="">Work it out from the file (race column or bib)</option>
              {races.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </div>
          <input type="file" name="file" accept=".csv,.txt,.tsv,text/csv" />
          <details><summary className="small">Or paste</summary><textarea name="csv" placeholder={"Pos,Bib,Name,Chip Time\n1,101,Jane Doe,00:34:12"} /></details>
          <p><button>Upload results</button></p>
        </form>
      </section>
    </div>
  );
}
