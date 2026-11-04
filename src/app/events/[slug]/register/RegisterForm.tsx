"use client";
import { useActionState, useState } from "react";
import Link from "next/link";
import { register, type RegState } from "./actions";

type Props = {
  eventId: string; raceId: string; raceKind: string; legs: string[]; waiver: string; fundraising: boolean; cause: string;
  questions: { id: string; label: string; kind: string; options: string[]; required: boolean }[];
  defaults: { name: string; email: string };
  profile?: Record<string, string> | null;
  fees?: { id: string; name: string; organization: string; amount: string; memberExemption: boolean; memberLabel: string }[];
  inviteCode?: string;
};

export default function RegisterForm(p: Props) {
  const [state, action, pending] = useActionState<RegState, FormData>(register, {});
  const v = state.values ?? {};
  const [first, ...rest] = p.defaults.name.split(" ");
  const [teamMode, setTeamMode] = useState(v.team_mode || (p.inviteCode ? "join" : "create"));
  const [dob, setDob] = useState(v.dob || p.profile?.dob || "");
  const minor = dob && (Date.now() - new Date(dob).getTime()) / 31557600000 < 18;
  const d = (k: string, fallback = "") => v[k] ?? (p.profile?.[k] || fallback);

  return (
    <form action={action} key={JSON.stringify(state)}>
      {state.error && <div className="alert error" role="alert">{state.error}</div>}
      {p.profile && !state.values && <div className="alert">We filled in your saved details. Check they&apos;re still right. <Link href="/account/profile">Manage saved details</Link></div>}
      <input type="hidden" name="event_id" value={p.eventId} />
      <input type="hidden" name="race_id" value={p.raceId} />

      {p.raceKind !== "individual" && (
        <section className="card stack" style={{ marginBottom: 16 }}>
          <h3>{p.raceKind === "relay" ? "Relay team" : "Team"}</h3>
          <div className="row">
            <label className="check"><input type="radio" name="team_mode" value="create" checked={teamMode === "create"} onChange={() => setTeamMode("create")} /> Start a new team</label>
            <label className="check"><input type="radio" name="team_mode" value="join" checked={teamMode === "join"} onChange={() => setTeamMode("join")} /> Join a team with an invite code</label>
          </div>
          {teamMode === "create" ? (
            <div className="field"><label>Team name</label><input name="team_name" defaultValue={d("team_name")} /></div>
          ) : (
            <div className="field"><label>Invite code</label><input name="invite_code" defaultValue={d("invite_code", p.inviteCode)} style={{ textTransform: "uppercase" }} /></div>
          )}
          {p.raceKind === "relay" && (
            <div className="field"><label>Your leg</label>
              <select name="relay_leg" defaultValue={d("relay_leg")}><option value="">Choose…</option>{p.legs.map((l) => <option key={l}>{l}</option>)}</select>
            </div>
          )}
          <p className="small muted">After registering, you will get an invite code to share with teammates.</p>
        </section>
      )}

      <section className="card" style={{ marginBottom: 16 }}>
        <h3>Participant</h3>
        <div className="cols">
          <div className="field"><label>First name</label><input name="first_name" required defaultValue={d("first_name", first)} /></div>
          <div className="field"><label>Last name</label><input name="last_name" required defaultValue={d("last_name", rest.join(" "))} /></div>
          <div className="field"><label>Email</label><input name="email" type="email" required defaultValue={d("email", p.defaults.email)} /></div>
          <div className="field"><label>Phone</label><input name="phone" type="tel" defaultValue={d("phone")} /></div>
          <div className="field"><label>Date of birth</label><input name="dob" type="date" required value={dob} onChange={(e) => setDob(e.target.value)} /></div>
          <div className="field"><label>Gender</label>
            <select name="gender" defaultValue={d("gender")}><option value="">Prefer not to say</option><option>Female</option><option>Male</option><option>Non-binary</option></select>
          </div>
          <div className="field"><label>Country</label><input name="country" defaultValue={d("country", "Trinidad and Tobago")} /></div>
          <div className="field"><label>Town / city</label><input name="city" defaultValue={d("city")} /></div>
          <div className="field"><label>Club (optional)</label><input name="club" defaultValue={d("club")} /></div>
          <div className="field"><label>T-shirt size</label>
            <select name="tshirt" defaultValue={d("tshirt")}><option value="">No shirt</option>{["XS", "S", "M", "L", "XL", "XXL"].map((s) => <option key={s}>{s}</option>)}</select>
          </div>
        </div>
        <h3 style={{ marginTop: 8 }}>Emergency contact</h3>
        <div className="cols">
          <div className="field"><label>Name</label><input name="emergency_name" required defaultValue={d("emergency_name")} /></div>
          <div className="field"><label>Phone</label><input name="emergency_phone" type="tel" required defaultValue={d("emergency_phone")} /></div>
        </div>
        <div className="field"><label>Medical information for race medics (optional)</label>
          <textarea name="medical" defaultValue={d("medical")} placeholder="Allergies, conditions, medication" />
          <span className="small muted">Encrypted, and shown only to event managers.</span>
        </div>
      </section>

      {p.questions.length > 0 && (
        <section className="card" style={{ marginBottom: 16 }}>
          <h3>A few more questions</h3>
          {p.questions.map((q) => (
            <div className="field" key={q.id}>
              {q.kind === "checkbox" ? (
                <label className="check"><input type="checkbox" name={`q_${q.id}`} defaultChecked={v[`q_${q.id}`] === "on"} /> {q.label}{q.required && " *"}</label>
              ) : (
                <>
                  <label>{q.label}{q.required && " *"}</label>
                  {q.kind === "select" ? (
                    <select name={`q_${q.id}`} defaultValue={d(`q_${q.id}`)}><option value="">Choose…</option>{q.options.map((o) => <option key={o}>{o}</option>)}</select>
                  ) : <input name={`q_${q.id}`} defaultValue={d(`q_${q.id}`)} />}
                </>
              )}
            </div>
          ))}
        </section>
      )}

      {p.waiver && (
        <section className="card" style={{ marginBottom: 16 }}>
          <h3>Waiver</h3>
          <div className="small" style={{ whiteSpace: "pre-wrap", maxHeight: 200, overflowY: "auto", border: "1px solid var(--line)", padding: 10, borderRadius: 8 }}>{p.waiver}</div>
          <div className="field" style={{ marginTop: 10 }}><label>Type your full name to sign</label><input name="waiver_name" defaultValue={d("waiver_name")} /></div>
          {minor && <div className="field"><label>Parent or guardian full name (participant is under 18)</label><input name="guardian_name" defaultValue={d("guardian_name")} /></div>}
        </section>
      )}

      {p.fees && p.fees.length > 0 && (
        <section className="card stack" style={{ marginBottom: 16 }}>
          <h3>Required memberships and fees</h3>
          <p className="small muted">These are collected with your entry and passed on to the organization named.</p>
          {p.fees.map((f) => (
            <FeeChoice key={f.id} fee={f} initial={v[`fee_${f.id}`]} member={d(`fee_member_${f.id}`)} />
          ))}
        </section>
      )}

      <section className="card" style={{ marginBottom: 16 }}>
        <h3>Payment extras</h3>
        <div className="cols">
          <div className="field"><label>Discount code</label><input name="discount_code" defaultValue={d("discount_code")} /></div>
          {p.fundraising && <div className="field"><label>Donation to {p.cause} (TT$)</label><input name="donation" type="number" min="0" step="1" defaultValue={d("donation")} /></div>}
          {p.fundraising && <div className="field"><label>Your personal fundraising goal (TT$, optional)</label><input name="fundraising_goal" type="number" min="0" step="1" defaultValue={d("fundraising_goal")} /></div>}
        </div>
      </section>

      <section className="card stack" style={{ marginBottom: 16 }}>
        <label className="check"><input type="checkbox" name="privacy" required defaultChecked={v.privacy === "on"} /> I agree that my details are used to run this event, as described in the <Link href="/privacy" target="_blank">privacy notice</Link>.</label>
        <label className="check"><input type="checkbox" name="save_profile" defaultChecked={state.values ? v.save_profile === "on" : !!p.profile} /> Save my details for faster registration next time (medical notes are never saved). You can edit or delete them anytime in My account.</label>
        <label className="check"><input type="checkbox" name="marketing" defaultChecked={v.marketing === "on"} /> Send me news about future events from this organizer (optional, you can opt out anytime).</label>
      </section>

      <button disabled={pending}>{pending ? "Saving…" : "Continue to payment"}</button>
    </form>
  );
}

function FeeChoice({ fee, initial, member }: { fee: NonNullable<Props["fees"]>[number]; initial?: string; member: string }) {
  const [choice, setChoice] = useState(initial || "pay");
  return (
    <div>
      <strong>{fee.name}</strong> <span className="muted small">({fee.organization})</span>
      <label className="check"><input type="radio" name={`fee_${fee.id}`} value="pay" checked={choice === "pay"} onChange={() => setChoice("pay")} /> Pay {fee.amount}</label>
      {fee.memberExemption && (
        <>
          <label className="check"><input type="radio" name={`fee_${fee.id}`} value="member" checked={choice === "member"} onChange={() => setChoice("member")} /> I&apos;m already a member of {fee.organization}</label>
          {choice === "member" && (
            <div className="field" style={{ marginLeft: 24 }}><label>{fee.memberLabel}</label><input name={`fee_member_${fee.id}`} defaultValue={member} required /></div>
          )}
        </>
      )}
    </div>
  );
}
