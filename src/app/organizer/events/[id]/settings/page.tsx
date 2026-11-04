import { requireEventRole } from "@/lib/auth";
import { eventById, paymentMethods } from "@/lib/events";
import { SPORTS } from "@/lib/format";
import { PROVIDERS } from "@/lib/payments";
import { askToFeature, saveSettings, setStatus } from "../actions";
import { FEATURED_WEEKS, featuredWeekCents, pendingRequest } from "@/lib/featured";
import { date, money } from "@/lib/format";
import LocationPicker from "@/components/LocationPicker";

export default async function Settings({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireEventRole(id, "manager");
  const e = eventById(id)!;
  const pm = paymentMethods(e);
  const pending = pendingRequest(id);
  const featuredNow = e.featured_until && e.featured_until >= new Date().toISOString().slice(0, 10);
  return (
    <div className="stack" style={{ maxWidth: 760 }}>
      <div className="card row" style={{ justifyContent: "space-between" }}>
        <div><strong>Status: {e.status}</strong><div className="small muted">Drafts are hidden. Closed events show the page but stop new registrations.</div></div>
        <div className="row">
          {(["draft", "published", "closed"] as const).filter((s) => s !== e.status).map((s) => (
            <form key={s} action={setStatus}><input type="hidden" name="event_id" value={id} /><input type="hidden" name="status" value={s} />
              <button className={s === "published" ? "" : "secondary"}>{s === "published" ? "Publish" : s === "closed" ? "Close registration" : "Back to draft"}</button></form>
          ))}
        </div>
      </div>
      <div className="card">
        <h3>Feature this event</h3>
        <p className="small">Featured events appear at the top of Find a race with a &ldquo;Featured&rdquo; label, so more runners see them.
          {" "}{money(featuredWeekCents(), e.currency)} per week, invoiced after approval.</p>
        {featuredNow && <p className="small"><span className="badge">Featured</span> until {date(e.featured_until)}.</p>}
        {pending ? (
          <p className="small muted">Request for {pending.weeks} week{pending.weeks > 1 ? "s" : ""} sent {date(pending.created_at.slice(0, 10))}. We&apos;ll email you when it&apos;s approved.</p>
        ) : e.status !== "published" ? (
          <p className="small muted">Publish the event first, then you can request featuring.</p>
        ) : (
          <form action={askToFeature} className="row">
            <input type="hidden" name="event_id" value={id} />
            <select name="weeks" style={{ maxWidth: 220 }}>{FEATURED_WEEKS.map((w) => <option key={w} value={w}>{w} week{w > 1 ? "s" : ""} · {money(featuredWeekCents() * w, e.currency)}</option>)}</select>
            <input name="note" placeholder="Anything we should know (optional)" style={{ maxWidth: 300 }} />
            <button className="secondary">{featuredNow ? "Extend featuring" : "Request featuring"}</button>
          </form>
        )}
      </div>
      <form action={saveSettings} className="card">
        <input type="hidden" name="event_id" value={id} />
        <h3>Event details</h3>
        <div className="field"><label>Name</label><input name="name" defaultValue={e.name} required /></div>
        <div className="cols">
          <div className="field"><label>Sport</label><select name="sport" defaultValue={e.sport}>{SPORTS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div>
          <div className="field"><label>Date</label><input name="start_date" type="date" defaultValue={e.start_date} required /></div>
          <div className="field"><label>Currency</label><select name="currency" defaultValue={e.currency}>{["TTD", "USD", "JMD", "BBD", "XCD", "GYD"].map((c) => <option key={c}>{c}</option>)}</select></div>
        </div>
        <div className="field"><label>Location</label><input name="location" defaultValue={e.location} /></div>
        <LocationPicker lat={e.lat} lng={e.lng} />
        <div className="field"><label>Description</label><textarea name="description" defaultValue={e.description} rows={6} /></div>

        <h3>Waiver and policies</h3>
        <div className="field"><label>Waiver (participants sign by typing their name; guardians sign for under-18s)</label><textarea name="waiver_text" defaultValue={e.waiver_text} rows={6} /></div>
        <div className="field"><label>Refund and transfer policy</label><textarea name="refund_policy" defaultValue={e.refund_policy} /></div>

        <h3>Payments</h3>
        {PROVIDERS.filter((p) => p.id !== "sandbox").map((p) => (
          <label key={p.id} className="check">
            <input type="checkbox" name={`pm_${p.id}`} defaultChecked={pm.includes(p.id)} />
            <span>{p.label} {!p.configured() && <span className="badge warn">needs API keys</span>}<br /><span className="small muted">{p.description}</span></span>
          </label>
        ))}
        <div className="field" style={{ marginTop: 10 }}><label>Bank transfer / cash instructions</label>
          <textarea name="manual_payment_instructions" defaultValue={e.manual_payment_instructions} placeholder="Bank, account name and number, or where to pay cash" /></div>
        <label className="check"><input type="checkbox" name="fee_absorbed" defaultChecked={!!e.fee_absorbed} /> I&apos;ll absorb the platform fee (participants see one all-in price)</label>

        <h3 style={{ marginTop: 16 }}>Fundraising</h3>
        <label className="check"><input type="checkbox" name="fundraising_enabled" defaultChecked={!!e.fundraising_enabled} /> Accept donations and personal fundraising pages</label>
        <div className="cols">
          <div className="field"><label>Cause or charity</label><input name="fundraising_cause" defaultValue={e.fundraising_cause} /></div>
          <div className="field"><label>Event goal</label><input name="fundraising_goal" type="number" min="0" defaultValue={e.fundraising_goal_cents / 100 || ""} /></div>
        </div>

        <h3>Data retention</h3>
        <div className="field"><label>Anonymize participant details this many days after the event</label>
          <input name="retention_days" type="number" min="30" defaultValue={e.retention_days} style={{ maxWidth: 160 }} />
          <div className="small muted">Names, contact details, birth dates and answers are removed. Anonymous counts stay for your statistics.</div></div>
        <button>Save settings</button>
      </form>
    </div>
  );
}
