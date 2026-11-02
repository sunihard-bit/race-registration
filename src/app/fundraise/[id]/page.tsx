import { notFound, redirect } from "next/navigation";
import { currentUser, requireUser } from "@/lib/auth";
import { all, newId, one, run } from "@/lib/db";
import { eventById } from "@/lib/events";
import { money, str, toCents } from "@/lib/format";

type Reg = { id: string; first_name: string; last_name: string; event_id: string; fundraising_goal_cents: number; anonymized_at: string | null };

async function donate(formData: FormData) {
  "use server";
  const regId = str(formData.get("reg"));
  const user = await requireUser(`/fundraise/${regId}`);
  const reg = one<Reg>("SELECT * FROM registrations WHERE id=? AND status='confirmed'", regId);
  if (!reg) redirect("/");
  const e = eventById(reg.event_id)!;
  const amount = toCents(formData.get("amount"));
  if (amount < 100) redirect(`/fundraise/${regId}?error=1`);
  const orderId = newId(12);
  run(`INSERT INTO orders (id, event_id, user_id, buyer_email, subtotal_cents, donation_cents, fee_cents, total_cents, currency) VALUES (?,?,?,?,0,?,0,?,?)`,
    orderId, e.id, user.id, user.email, amount, amount, e.currency);
  run("INSERT INTO donations (id, event_id, registration_id, order_id, donor_name, message, amount_cents) VALUES (?,?,?,?,?,?,?)",
    newId(), e.id, reg.id, orderId, formData.get("anonymous") === "on" ? "Anonymous" : user.name, str(formData.get("message"), 280), amount);
  redirect(`/checkout/${orderId}`);
}

export default async function Fundraise({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string }> }) {
  const { id } = await params;
  const { error } = await searchParams;
  const reg = one<Reg>("SELECT * FROM registrations WHERE id=? AND status='confirmed'", id);
  if (!reg || reg.anonymized_at) notFound();
  const e = eventById(reg.event_id)!;
  if (!e.fundraising_enabled) notFound();
  const gifts = all<{ donor_name: string; message: string; amount_cents: number }>(
    "SELECT donor_name, message, amount_cents FROM donations WHERE registration_id=? AND status='paid' ORDER BY created_at DESC", id);
  const raised = gifts.reduce((s, g) => s + g.amount_cents, 0);
  const goal = reg.fundraising_goal_cents;
  const user = await currentUser();
  return (
    <div style={{ maxWidth: 620 }}>
      <h1>{reg.first_name} is raising money for {e.fundraising_cause}</h1>
      <p className="muted">Taking part in {e.name}</p>
      <div className="card stack">
        <div className="row" style={{ justifyContent: "space-between" }}><strong>{money(raised, e.currency)} raised</strong>{goal > 0 && <span className="muted">of {money(goal, e.currency)}</span>}</div>
        {goal > 0 && <div className="progress"><div style={{ width: `${Math.min(100, (raised / goal) * 100)}%` }} /></div>}
      </div>
      <h2>Donate</h2>
      {error && <div className="alert error">Minimum donation is {money(100, e.currency)}.</div>}
      <form action={donate} className="card">
        <input type="hidden" name="reg" value={id} />
        <div className="cols">
          <div className="field"><label>Amount</label><input name="amount" type="number" min="1" step="1" required /></div>
          <div className="field"><label>Message (optional)</label><input name="message" maxLength={280} /></div>
        </div>
        <label className="check"><input type="checkbox" name="anonymous" /> Show my donation as anonymous</label>
        <p><button>{user ? "Donate" : "Log in to donate"}</button></p>
      </form>
      {gifts.length > 0 && (
        <><h2>Supporters</h2>
          <ul>{gifts.map((g, i) => <li key={i}><strong>{g.donor_name}</strong> {money(g.amount_cents, e.currency)}{g.message && `: "${g.message}"`}</li>)}</ul></>
      )}
    </div>
  );
}
