import { can, requireEventRole } from "@/lib/auth";
import { eventById, paymentMethods } from "@/lib/events";
import { SPORTS } from "@/lib/format";
import { PROVIDERS, availableFor } from "@/lib/payments";
import { maskKey, wamCreds, wamEnabled, wamWebhookUrl } from "@/lib/payments/wam";
import { askToFeature, saveSettings, saveWam, setStatus } from "../actions";
import { FEATURED_WEEKS, featuredWeekCents, pendingRequest } from "@/lib/featured";
import { date, money } from "@/lib/format";
import LocationPicker from "@/components/LocationPicker";

export default async function Settings({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { role } = await requireEventRole(id, "manager");
  const e = eventById(id)!;
  const wamOn = wamEnabled();
  const wc = wamOn ? wamCreds(id) : null;
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
      {wamOn && (
        <div className="card">
          <h3>Wam account</h3>
          <p className="small">Participants who pick Wam pay straight into <strong>your own</strong> Wam business account (cards 3% + TT$1.50, Wam balance 2%, charged by Wam). We bill our platform fee monthly.</p>
          {wc ? (
            <p className="small"><span className="badge">Connected</span> Business ID {wc.businessId || "not given"}, API key {maskKey(wc.apiKey)}, webhook secret {wc.webhookSecret ? "set" : <strong>missing</strong>}.</p>
          ) : (
            <p className="small muted">Not connected. In the Wam Business Portal go to Developers, Merchant Keys: copy your Business ID and create an API key.</p>
          )}
          {can(role, "owner") ? (
            <form action={saveWam} className="stack">
              <input type="hidden" name="event_id" value={id} />
              <div className="field"><label>Business ID</label><input name="business_id" defaultValue={wc?.businessId ?? ""} placeholder="a1b2c3d4-…" /></div>
              <div className="field"><label>API key {wc && <span className="small muted">(leave blank to keep the current key)</span>}</label><input name="api_key" type="password" autoComplete="off" /></div>
              <div className="field"><label>Webhook URL (add it in Wam under Developers, Merchant Keys, Webhooks, for payment_intent.succeeded)</label>
                <input readOnly value={wamWebhookUrl(id)} /></div>
              <div className="field"><label>Webhook signing secret (starts with whsec_) {wc?.webhookSecret && <span className="small muted">(leave blank to keep)</span>}</label><input name="webhook_secret" type="password" autoComplete="off" /></div>
              <div className="row">
                <button className="secondary">Save Wam keys</button>
                {wc && <button className="secondary" name="disconnect" value="1">Disconnect</button>}
              </div>
              <p className="small muted">Keys are stored encrypted and never shown again. Only the event owner can change them.</p>
            </form>
          ) : <p className="small muted">Only the event owner can connect or change the Wam account.</p>}
        </div>
      )}
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
        {PROVIDERS.filter((p) => p.id !== "sandbox" && (p.id !== "wam" || wamOn)).map((p) => (
          <label key={p.id} className="check">
            <input type="checkbox" name={`pm_${p.id}`} defaultChecked={pm.includes(p.id)} />
            <span>{p.label} {!availableFor(p, id) && <span className="badge warn">{p.configuredFor ? "connect your account below" : "needs API keys"}</span>}<br /><span className="small muted">{p.description}</span></span>
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
