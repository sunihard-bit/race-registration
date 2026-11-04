import Link from "next/link";
import { redirect } from "next/navigation";
import { can, currentUser, staffRole } from "@/lib/auth";
import { normalizeCode } from "@/lib/confirm";
import { one } from "@/lib/db";

// Where a scanned QR code lands. Event staff go straight to check-in for that person;
// anyone else sees only that the code is valid, never the participant's details.
export default async function ConfirmCode({ params }: { params: Promise<{ code: string }> }) {
  const code = normalizeCode(decodeURIComponent((await params).code));
  const reg = code
    ? one<{ event_id: string; user_id: string | null; event: string }>(
        "SELECT r.event_id, o.user_id, e.name event FROM registrations r JOIN orders o ON o.id=r.order_id JOIN events e ON e.id=r.event_id WHERE r.confirm_code=? AND r.status='confirmed'", code)
    : undefined;
  const user = await currentUser();
  if (reg && user && can(staffRole(reg.event_id, user), "checkin")) {
    redirect(`/organizer/events/${reg.event_id}/checkin?q=${code}`);
  }
  return (
    <div style={{ maxWidth: 480 }}>
      {reg ? (
        <>
          <h1>{code}</h1>
          <p>This is a valid confirmation code for <strong>{reg.event}</strong>. Show it at packet pickup.</p>
          {!user && <p className="small muted">Event staff: <Link href={`/login?next=/c/${code}`}>log in</Link> to check this participant in.</p>}
        </>
      ) : (
        <><h1>Code not found</h1><p>Check the code and try again, or contact the event organizer.</p></>
      )}
    </div>
  );
}
