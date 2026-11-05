import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { audit, newId, one, run } from "@/lib/db";
import { slugify, SPORTS, str } from "@/lib/format";

const DEFAULT_WAIVER = `I understand that taking part in this event involves risk of injury. I confirm I am medically fit to take part, I will follow the instructions of officials and marshals, and I accept the event rules. I agree that the organizer may provide first aid or arrange medical treatment if needed.

[Organizer: replace this with your own waiver, reviewed by a lawyer.]`;

async function create(formData: FormData) {
  "use server";
  const user = await requireUser("/organizer/new");
  if (!user.is_organizer) redirect("/organizer");
  const name = str(formData.get("name"), 120);
  const start = str(formData.get("start_date"), 10);
  if (!name || !start) redirect("/organizer/new?error=1");
  let slug = slugify(name) || "event";
  if (one("SELECT 1 FROM events WHERE slug=?", slug)) slug = `${slug}-${newId(3).toLowerCase().replace(/[^a-z0-9]/g, "")}`;
  const id = newId();
  run(`INSERT INTO events (id, slug, owner_id, name, sport, location, start_date, description, waiver_text, payment_methods)
       VALUES (?,?,?,?,?,?,?,?,?,?)`, id, slug, user.id, name, str(formData.get("sport")), str(formData.get("location"), 200), start,
    str(formData.get("description"), 5000), DEFAULT_WAIVER, JSON.stringify(["manual"]));
  run("INSERT INTO event_staff (event_id, user_id, role) VALUES (?,?, 'owner')", id, user.id);
  audit(user.id, id, "event.created", name);
  redirect(`/organizer/events/${id}/races`);
}

export default async function NewEvent() {
  await requireUser("/organizer/new");
  return (
    <div className="card" style={{ maxWidth: 640 }}>
      <h1>Create an event</h1>
      <p className="muted small">You can change everything later. The event stays a draft until you publish it.</p>
      <form action={create}>
        <div className="field"><label>Event name</label><input name="name" required /></div>
        <div className="cols">
          <div className="field"><label>Sport</label><select name="sport">{SPORTS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div>
          <div className="field"><label>Date</label><input name="start_date" type="date" required /></div>
        </div>
        <div className="field"><label>Location</label><input name="location" placeholder="e.g. Queen's Park Savannah, Port of Spain" /></div>
        <div className="field"><label>Description</label><textarea name="description" /></div>
        <p className="small muted">By creating an event you agree to the <a href="/terms#organizers" target="_blank">organizer terms</a>, including how published events are listed.</p>
        <button>Create and add races</button>
      </form>
    </div>
  );
}
