// Demo data: npm run seed  (logins: organizer@example.com / password1234, runner@example.com / password1234)
import bcrypt from "bcryptjs";
import { db, newId, one, run } from "../src/lib/db";
import { encrypt } from "../src/lib/crypto";
import { markOrderPaid } from "../src/lib/orders";

async function main() {
  if (one("SELECT 1 FROM users WHERE email='organizer@example.com'")) return console.log("Already seeded.");
  const hash = bcrypt.hashSync("password1234", 10);
  const org = newId(), runner = newId();
  run("INSERT INTO users (id,email,name,password_hash,is_organizer) VALUES (?,?,?,?,1)", org, "organizer@example.com", "Demo Organizer", hash);
  run("INSERT INTO users (id,email,name,password_hash) VALUES (?,?,?,?)", runner, "runner@example.com", "Demo Runner", hash);

  const day = (d: number) => new Date(Date.now() + d * 864e5).toISOString().slice(0, 10);
  const ev = newId();
  run(`INSERT INTO events (id,slug,owner_id,name,sport,description,location,start_date,status,waiver_text,refund_policy,payment_methods,
        manual_payment_instructions,fundraising_enabled,fundraising_cause,fundraising_goal_cents)
       VALUES (?,?,?,?,?,?,?,?,'published',?,?,?,?,1,?,?)`, ev, "savannah-sunrise-run", org, "Savannah Sunrise Run", "running",
    "A flat, fast loop around the Savannah at sunrise. 5K, 10K and a 4 x 2.5K relay.", "Queen's Park Savannah, Port of Spain", day(40),
    "I accept the risks of taking part and confirm I am fit to run.", "Full refund up to 14 days before the race. Transfers allowed until race week.",
    JSON.stringify(["wipay", "manual"]), "Republic Bank, Acct name: Demo Events Ltd, Acct # 000000000. Use your order reference.",
    "Children's cancer ward", 2_000_000);
  run("INSERT INTO event_staff VALUES (?,?,'owner')", ev, org);
  run("UPDATE events SET lat=?, lng=? WHERE id=?", 10.6722, -61.5151, ev); // Queen's Park Savannah

  const races: [string, string, string, number, string][] = [
    ["5K", "5 km", "individual", 300, "[]"], ["10K", "10 km", "individual", 300, "[]"], ["4 x 2.5K Relay", "10 km", "relay", 40, JSON.stringify(["Leg 1", "Leg 2", "Leg 3", "Leg 4"])],
  ];
  const ids: string[] = [];
  races.forEach(([name, dist, kind, cap, legs], i) => {
    const id = newId(); ids.push(id);
    run("INSERT INTO races (id,event_id,name,distance,kind,capacity,relay_legs,start_time,sort) VALUES (?,?,?,?,?,?,?,?,?)", id, ev, name, dist, kind, cap, legs, "05:30", i);
    run("INSERT INTO price_tiers (id,race_id,name,price_cents,starts_at,ends_at) VALUES (?,?,?,?,NULL,?)", newId(), id, "Early bird", 15000 + i * 5000, new Date(Date.now() + 10 * 864e5).toISOString());
    run("INSERT INTO price_tiers (id,race_id,name,price_cents,starts_at,ends_at) VALUES (?,?,?,?,?,NULL)", newId(), id, "Regular", 20000 + i * 5000, new Date(Date.now() + 10 * 864e5).toISOString());
  });
  run("INSERT INTO questions (id,event_id,label,kind,options,required) VALUES (?,?,?,?,?,1)", newId(), ev, "Estimated finish time", "select", JSON.stringify(["Under 30 min", "30–45 min", "45–60 min", "Over 60 min"]));
  run("INSERT INTO discount_codes (id,event_id,code,kind,amount) VALUES (?,?,'CLUB20','percent',20)", newId(), ev);

  const first = ["Aaliyah", "Marcus", "Priya", "Kevon", "Shania", "Ravi", "Keisha", "Andre", "Leah", "Darren", "Nadia", "Jabari", "Anya", "Tariq", "Simone"];
  const last = ["Mohammed", "Joseph", "Ramdial", "Charles", "Baptiste", "Singh", "Phillip", "Thomas", "Ali", "Lewis"];
  const towns = ["Port of Spain", "San Fernando", "Chaguanas", "Arima", "Diego Martin", "Scarborough", "Couva", "Point Fortin"];
  const sizes = ["S", "M", "M", "L", "L", "XL", ""];
  for (let i = 0; i < 120; i++) {
    const raceIdx = i % 10 < 4 ? 0 : i % 10 < 9 ? 1 : 2;
    const order = newId(12), reg = newId(12);
    const created = new Date(Date.now() - Math.floor(Math.random() * 30) * 864e5).toISOString().replace("T", " ").slice(0, 19);
    const by = 1960 + Math.floor(Math.random() * 45);
    const price = 15000 + raceIdx * 5000;
    run("INSERT INTO orders (id,event_id,buyer_email,subtotal_cents,fee_cents,total_cents,currency,created_at) VALUES (?,?,?,?,?,?,'TTD',?)",
      order, ev, `demo${i}@example.com`, price, 575, price + 575, created);
    run(`INSERT INTO registrations (id,order_id,event_id,race_id,first_name,last_name,email,gender,birth_year,dob_enc,phone_enc,emergency_enc,country,city,tshirt,answers,consent_privacy_at,consent_marketing,created_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, reg, order, ev, ids[raceIdx], first[i % first.length], last[i % last.length], `demo${i}@example.com`,
      i % 2 ? "Female" : "Male", by, encrypt(`${by}-06-15`), encrypt("868-555-0100"), encrypt(JSON.stringify({ name: "Family member", phone: "868-555-0199" })),
      i % 17 === 0 ? "Barbados" : "Trinidad and Tobago", towns[i % towns.length], sizes[i % sizes.length], JSON.stringify({ "Estimated finish time": "30–45 min" }), created, i % 3 === 0 ? 1 : 0, created);
    if (i % 8 !== 0) await markOrderPaid(order, i % 5 === 0 ? "manual" : "wipay", "seed");
  }
  // A triathlon with a federation one-day licence
  const tri = newId();
  run(`INSERT INTO events (id,slug,owner_id,name,sport,description,location,start_date,status,waiver_text,payment_methods,manual_payment_instructions)
       VALUES (?,?,?,?,?,?,?,?,'published',?,?,?)`, tri, "pigeon-point-sprint-tri", org, "Pigeon Point Sprint Triathlon", "triathlon",
    "750 m sea swim, 20 km bike, 5 km run. Relay teams of three welcome. Athletes without an annual federation membership need a one-day licence.",
    "Pigeon Point, Tobago", day(60), "I accept the risks of open water swimming, cycling and running.", JSON.stringify(["wipay", "manual"]),
    "Pay at packet pickup or by bank transfer.");
  run("INSERT INTO event_staff VALUES (?,?,'owner')", tri, org);
  run("UPDATE events SET lat=?, lng=? WHERE id=?", 11.1636, -60.8436, tri); // Pigeon Point, Tobago
  const sprint = newId(), relay = newId();
  run("INSERT INTO races (id,event_id,name,distance,kind,capacity,min_age,start_time,sort) VALUES (?,?,?,?,?,?,?,?,0)", sprint, tri, "Sprint Triathlon", "750m / 20km / 5km", "individual", 150, 15, "06:30");
  run("INSERT INTO races (id,event_id,name,distance,kind,capacity,relay_legs,start_time,sort) VALUES (?,?,?,?,?,?,?,?,1)", relay, tri, "Sprint Relay (3 people)", "750m / 20km / 5km", "relay", 30, JSON.stringify(["Swim", "Bike", "Run"]), "06:35");
  run("INSERT INTO price_tiers (id,race_id,name,price_cents) VALUES (?,?,?,?)", newId(), sprint, "Regular", 35000);
  run("INSERT INTO price_tiers (id,race_id,name,price_cents) VALUES (?,?,?,?)", newId(), relay, "Per person", 20000);
  run(`INSERT INTO event_fees (id,event_id,name,organization,amount_cents,race_ids,member_exemption,member_label) VALUES (?,?,?,?,?,'[]',1,?)`,
    newId(), tri, "One-day race licence", "National Triathlon Federation", 5000, "Federation membership number");

  console.log("Seeded. Events: /events/savannah-sunrise-run and /events/pigeon-point-sprint-tri");
}
main();
