import { requireEventRole } from "@/lib/auth";
import { all } from "@/lib/db";
import { racesFor } from "@/lib/events";
import { emailParticipants } from "../actions";

export default async function Email({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ sent?: string; error?: string }> }) {
  const { id } = await params;
  const { sent, error } = await searchParams;
  await requireEventRole(id, "manager");
  const history = all<{ subject: string; n: number; at: string }>(
    "SELECT subject, COUNT(*) n, MAX(created_at) at FROM email_outbox WHERE event_id=? AND subject NOT LIKE 'Confirmed:%' GROUP BY subject ORDER BY at DESC LIMIT 20", id);
  return (
    <div className="stack" style={{ maxWidth: 720 }}>
      {sent && <div className="alert">Sent to {sent} people.</div>}
      {error && <div className="alert error">Add a subject and a message.</div>}
      <form action={emailParticipants} className="card">
        <input type="hidden" name="event_id" value={id} />
        <div className="field"><label>Send to</label>
          <select name="audience">
            <option value="all">Everyone registered (event information)</option>
            <option value="pending">People who haven&apos;t paid yet</option>
            {racesFor(id).map((r) => <option key={r.id} value={`race:${r.id}`}>Everyone in {r.name}</option>)}
            <option value="marketing">Only people who opted in to marketing (promotions, future events)</option>
          </select>
          <div className="small muted">Use the opt-in list for anything promotional. Event updates (start times, route changes) can go to everyone.</div>
        </div>
        <div className="field"><label>Subject</label><input name="subject" required /></div>
        <div className="field"><label>Message</label><textarea name="body" rows={10} required /></div>
        <button>Send</button>
      </form>
      {history.length > 0 && (
        <div className="card"><h3>Sent</h3><table><tbody>{history.map((h, i) => <tr key={i}><td>{h.subject}</td><td>{h.n} recipients</td><td className="small muted">{h.at}</td></tr>)}</tbody></table></div>
      )}
    </div>
  );
}
