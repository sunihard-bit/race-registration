import Link from "next/link";
import { redirect } from "next/navigation";
import { currentUser, requireUser } from "@/lib/auth";
import { all, audit, run } from "@/lib/db";
import { date } from "@/lib/format";

async function becomeOrganizer() {
  "use server";
  const u = await requireUser("/organizer");
  run("UPDATE users SET is_organizer=1 WHERE id=?", u.id);
  audit(u.id, null, "user.organizer", "");
  redirect("/organizer");
}

export default async function Organizer({ searchParams }: { searchParams: Promise<{ denied?: string }> }) {
  const { denied } = await searchParams;
  const user = await currentUser();
  if (!user) {
    return (
      <div style={{ maxWidth: 680 }}>
        <h1>Run your race with less admin</h1>
        <p>Online registration, relay teams, discount codes, waivers, race-day check-in, results and real statistics, with local payment options and low fees.</p>
        <p className="row"><Link className="btn" href="/signup?organizer=1&next=/organizer">Create an organizer account</Link><Link href="/login?next=/organizer">Log in</Link></p>
      </div>
    );
  }
  const events = all<{ id: string; name: string; start_date: string; status: string; role: string; regs: number }>(
    `SELECT e.id, e.name, e.start_date, e.status, s.role,
       (SELECT COUNT(*) FROM registrations r WHERE r.event_id=e.id AND r.status!='cancelled') regs
     FROM events e JOIN event_staff s ON s.event_id=e.id AND s.user_id=? ORDER BY e.start_date DESC`, user.id);
  return (
    <>
      {denied && <div className="alert error">You don&apos;t have access to that page for this event.</div>}
      <div className="row" style={{ justifyContent: "space-between" }}>
        <h1>Your events</h1>
        {user.is_organizer ? <Link className="btn" href="/organizer/new">Create event</Link> : <form action={becomeOrganizer}><button>Become an organizer</button></form>}
      </div>
      {events.length === 0 && <p className="muted">No events yet.</p>}
      <div className="grid">
        {events.map((e) => (
          <Link key={e.id} href={`/organizer/events/${e.id}`} className="card" style={{ textDecoration: "none", color: "inherit" }}>
            <div className="row" style={{ justifyContent: "space-between" }}><span className={`badge ${e.status === "published" ? "" : "grey"}`}>{e.status}</span><span className="small muted">{e.role}</span></div>
            <h3 style={{ marginTop: 8 }}>{e.name}</h3>
            <div className="muted small">{date(e.start_date)} · {e.regs} registered</div>
          </Link>
        ))}
      </div>
    </>
  );
}
