"use server";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { encrypt } from "@/lib/crypto";
import { audit, db, newId, one, run } from "@/lib/db";
import {
  applyDiscount, currentTier, eventById, platformFee, questionsFor, racesFor, relayLegs, spotsLeft, validateDiscount,
} from "@/lib/events";
import { str, toCents } from "@/lib/format";
import { markOrderPaid } from "@/lib/orders";
import { saveProfile } from "@/lib/profile";
import { feesForRace } from "@/lib/fees";

export type RegState = { error?: string; values?: Record<string, string> };

export async function register(_: RegState, formData: FormData): Promise<RegState> {
  const values: Record<string, string> = {};
  formData.forEach((v, k) => { if (typeof v === "string") values[k] = v; });
  const fail = (error: string): RegState => ({ error, values });

  const user = await currentUser();
  if (!user) return fail("Please log in first.");
  const e = eventById(str(formData.get("event_id")));
  if (!e || e.status !== "published") return fail("Registration for this event is closed.");
  const race = racesFor(e.id).find((r) => r.id === str(formData.get("race_id")));
  if (!race) return fail("Please choose a race.");
  const tier = currentTier(race.id);
  if (!tier) return fail("This race is not on sale right now.");
  if (spotsLeft(race) <= 0) return fail("Sorry, this race is sold out.");

  const first = str(formData.get("first_name"), 80), last = str(formData.get("last_name"), 80);
  const email = str(formData.get("email"), 200).toLowerCase();
  const dob = str(formData.get("dob"), 10);
  if (!first || !last || !/^\S+@\S+\.\S+$/.test(email)) return fail("Please fill in your name and a valid email.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dob)) return fail("Please enter your date of birth.");
  const eventDay = new Date(e.start_date);
  const b = new Date(dob);
  let ageOnDay = eventDay.getFullYear() - b.getFullYear();
  if (eventDay < new Date(eventDay.getFullYear(), b.getMonth(), b.getDate())) ageOnDay--;
  if (race.min_age && ageOnDay < race.min_age) return fail(`Participants must be at least ${race.min_age} on race day.`);
  const guardian = str(formData.get("guardian_name"), 120);
  if (ageOnDay < 18 && !guardian) return fail("Participants under 18 need a parent or guardian to sign the waiver.");

  const emergencyName = str(formData.get("emergency_name"), 120), emergencyPhone = str(formData.get("emergency_phone"), 40);
  if (!emergencyName || !emergencyPhone) return fail("Please add an emergency contact.");

  // Custom questions
  const answers: Record<string, string> = {};
  for (const q of questionsFor(e.id)) {
    const v = q.kind === "checkbox" ? (formData.get(`q_${q.id}`) === "on" ? "Yes" : "No") : str(formData.get(`q_${q.id}`), 500);
    if (q.required && (!v || (q.kind === "checkbox" && v === "No"))) return fail(`Please answer: ${q.label}`);
    answers[q.label] = v;
  }

  if (e.waiver_text && !str(formData.get("waiver_name"))) return fail("Please sign the waiver by typing your full name.");
  if (formData.get("privacy") !== "on") return fail("Please accept the privacy notice.");

  // Teams and relays
  let teamId: string | null = null;
  let teamToCreate: { name: string } | null = null;
  let leg = "";
  if (race.kind !== "individual") {
    const mode = str(formData.get("team_mode"));
    if (mode === "create") {
      const name = str(formData.get("team_name"), 80);
      if (!name) return fail("Please give your team a name.");
      if (one("SELECT 1 FROM teams WHERE race_id=? AND lower(name)=lower(?)", race.id, name)) return fail("That team name is taken.");
      teamToCreate = { name };
    } else if (mode === "join") {
      const t = one<{ id: string }>("SELECT id FROM teams WHERE race_id=? AND invite_code=?", race.id, str(formData.get("invite_code")).toUpperCase());
      if (!t) return fail("We couldn't find a team with that invite code for this race.");
      const size = one<{ n: number }>("SELECT COUNT(*) n FROM registrations WHERE team_id=? AND status!='cancelled'", t.id)!.n;
      const max = race.kind === "relay" ? relayLegs(race).length || race.team_max : race.team_max;
      if (size >= max) return fail("That team is full.");
      teamId = t.id;
    } else return fail("Choose whether to create or join a team.");
    if (race.kind === "relay") {
      leg = str(formData.get("relay_leg"), 60);
      if (!relayLegs(race).includes(leg)) return fail("Please choose your relay leg.");
      if (teamId && one("SELECT 1 FROM registrations WHERE team_id=? AND relay_leg=? AND status!='cancelled'", teamId, leg))
        return fail(`Someone on that team already has the ${leg} leg.`);
    }
  }

  // Pricing
  const code = str(formData.get("discount_code"), 40);
  let discountId: string | null = null, discount = 0;
  if (code) {
    const v = validateDiscount(e.id, code);
    if (!v.ok) return fail(v.error);
    discountId = v.d.id;
    discount = applyDiscount(tier.price_cents, v.d);
  }
  const donation = e.fundraising_enabled ? toCents(formData.get("donation")) : 0;

  // Fees owed to other organizations (federation licences etc.). Members can be exempt with their number.
  const thirdParty: { id: string; name: string; organization: string; amount: number; exempt: boolean; member: string }[] = [];
  for (const f of feesForRace(e.id, race.id)) {
    const exempt = !!f.member_exemption && formData.get(`fee_${f.id}`) === "member";
    const member = str(formData.get(`fee_member_${f.id}`), 60);
    if (exempt && !member) return fail(`Please enter your ${f.member_label.toLowerCase()} for ${f.organization}, or pay the ${f.name}.`);
    thirdParty.push({ id: f.id, name: f.name, organization: f.organization, amount: exempt ? 0 : f.amount_cents, exempt, member: exempt ? member : "" });
  }
  const thirdPartyTotal = thirdParty.reduce((s, f) => s + f.amount, 0);

  const net = tier.price_cents - discount;
  const fee = platformFee(net); // no platform fee on donations or pass-through fees
  const total = net + donation + thirdPartyTotal + (e.fee_absorbed ? 0 : fee);

  const orderId = newId(12), regId = newId(12);
  db.transaction(() => {
    if (teamToCreate) {
      teamId = newId();
      run("INSERT INTO teams (id, race_id, name, invite_code, captain_user_id) VALUES (?,?,?,?,?)",
        teamId, race.id, teamToCreate.name, newId(4).replace(/[^A-Za-z0-9]/g, "X").toUpperCase().slice(0, 6), user.id);
    }
    run(`INSERT INTO orders (id, event_id, user_id, buyer_email, subtotal_cents, discount_cents, donation_cents, fee_cents, third_party_cents, total_cents, currency, discount_code_id)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`, orderId, e.id, user.id, user.email, tier.price_cents, discount, donation, fee, thirdPartyTotal, total, e.currency, discountId);
    run(`INSERT INTO registrations (id, order_id, event_id, race_id, user_id, first_name, last_name, email, gender, birth_year, dob_enc, phone_enc,
           emergency_enc, medical_enc, country, city, club, tshirt, answers, team_id, relay_leg, waiver_name, waiver_at, guardian_name,
           consent_privacy_at, consent_marketing, fundraising_goal_cents)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,datetime('now'),?,?)`,
      regId, orderId, e.id, race.id, user.id, first, last, email, str(formData.get("gender"), 20), b.getFullYear(), encrypt(dob),
      encrypt(str(formData.get("phone"), 40)), encrypt(JSON.stringify({ name: emergencyName, phone: emergencyPhone })),
      encrypt(str(formData.get("medical"), 1000)), str(formData.get("country"), 60), str(formData.get("city"), 60), str(formData.get("club"), 80),
      str(formData.get("tshirt"), 10), JSON.stringify(answers), teamId, leg, str(formData.get("waiver_name"), 120) || null,
      e.waiver_text ? new Date().toISOString() : null, guardian || null, formData.get("marketing") === "on" ? 1 : 0,
      toCents(formData.get("fundraising_goal")));
    for (const f of thirdParty) {
      run("INSERT INTO registration_fees (id, registration_id, fee_id, name, organization, amount_cents, exempt, member_number) VALUES (?,?,?,?,?,?,?,?)",
        newId(), regId, f.id, f.name, f.organization, f.amount, f.exempt ? 1 : 0, f.member);
    }
    if (donation > 0) run("INSERT INTO donations (id, event_id, registration_id, order_id, donor_name, amount_cents) VALUES (?,?,?,?,?,?)",
      newId(), e.id, regId, orderId, `${first} ${last}`, donation);
  })();
  audit(user.id, e.id, "registration.created", regId);
  if (formData.get("save_profile") === "on") {
    saveProfile(user.id, { ...values, emergency_name: emergencyName, emergency_phone: emergencyPhone, email, dob });
  }

  if (total === 0) await markOrderPaid(orderId, "free", null, user.id);
  redirect(total === 0 ? `/orders/${orderId}` : `/checkout/${orderId}`);
}
