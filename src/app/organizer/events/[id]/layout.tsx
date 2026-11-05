import Link from "next/link";
import { notFound } from "next/navigation";
import { can, requireEventRole } from "@/lib/auth";
import { eventById } from "@/lib/events";
import { date } from "@/lib/format";
import Tabs from "./Tabs";

export default async function EventAdminLayout({ children, params }: { children: React.ReactNode; params: Promise<{ id: string }> }) {
  const { id } = await params;
  const e = eventById(id);
  if (!e) notFound();
  const { role } = await requireEventRole(id, "viewer");
  const tabs: [string, string][] = [["", "Overview"], ["participants", "Participants"], ["checkin", "Check-in"], ["teams", "Teams"]];
  if (can(role, "manager")) tabs.push(["races", "Races & prices"], ["questions", "Form"], ["discounts", "Discounts"], ["prepaid", "Prepaid codes"], ["fees", "Other fees"], ["email", "Email"], ["timing", "Timing"], ["results", "Results"], ["payouts", "Payouts"], ["settings", "Settings"]);
  if (can(role, "owner")) tabs.push(["staff", "Staff"], ["audit", "Audit log"]);
  return (
    <>
      <p className="small"><Link href="/organizer">← All events</Link></p>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <div>
          <h1>{e.name}</h1>
          <div className="muted small">{date(e.start_date)} · <span className={`badge ${e.status === "published" ? "" : "grey"}`}>{e.status}</span> · your role: {role}</div>
        </div>
        {e.status !== "draft" && <Link className="btn secondary small" href={`/events/${e.slug}`}>View public page</Link>}
      </div>
      <Tabs base={`/organizer/events/${id}`} tabs={tabs} />
      {children}
    </>
  );
}
