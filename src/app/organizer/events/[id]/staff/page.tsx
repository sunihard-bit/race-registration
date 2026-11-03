import { requireEventRole } from "@/lib/auth";
import { all } from "@/lib/db";
import { addStaff, removeStaff } from "../actions";

export default async function Staff({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string }> }) {
  const { id } = await params;
  const { error } = await searchParams;
  await requireEventRole(id, "owner");
  const staff = all<{ user_id: string; name: string; email: string; role: string }>(
    "SELECT s.user_id, u.name, u.email, s.role FROM event_staff s JOIN users u ON u.id=s.user_id WHERE s.event_id=? ORDER BY s.role", id);
  return (
    <div className="stack" style={{ maxWidth: 720 }}>
      {error && <div className="alert error">No account with that email. Ask them to sign up first.</div>}
      <div className="card small">
        <strong>Roles</strong>: <em>Manager</em> can edit the event and see medical and emergency details. <em>Check-in</em> volunteers can only search and check in participants.
        <em> Viewer</em> sees the dashboard and participant list without sensitive details. Give people the lowest role they need.
      </div>
      <div className="card"><table><tbody>
        {staff.map((s) => (
          <tr key={s.user_id}><td>{s.name}<div className="small muted">{s.email}</div></td><td>{s.role}</td>
            <td>{s.role !== "owner" && <form action={removeStaff}><input type="hidden" name="event_id" value={id} /><input type="hidden" name="user_id" value={s.user_id} /><button className="small secondary">Remove</button></form>}</td></tr>
        ))}
      </tbody></table></div>
      <form action={addStaff} className="card row">
        <input type="hidden" name="event_id" value={id} />
        <input name="email" type="email" placeholder="Email of their account" required style={{ maxWidth: 280 }} />
        <select name="role" style={{ maxWidth: 160 }}><option value="checkin">Check-in</option><option value="viewer">Viewer</option><option value="manager">Manager</option></select>
        <button>Add</button>
      </form>
    </div>
  );
}
