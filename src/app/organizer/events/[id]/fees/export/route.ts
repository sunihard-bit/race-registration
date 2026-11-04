import { NextResponse } from "next/server";
import { can, currentUser, staffRole } from "@/lib/auth";
import { all, audit, one } from "@/lib/db";
import { csvEscape } from "@/lib/format";
import { processingDeduction, type EventFee } from "@/lib/fees";

/** Remittance list for one fee, to send to the organization it is collected for. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await currentUser();
  if (!user || !can(staffRole(id, user), "manager")) return new NextResponse("Forbidden", { status: 403 });
  const feeId = new URL(req.url).searchParams.get("fee") || "";
  const fee = one<EventFee>("SELECT * FROM event_fees WHERE id=? AND event_id=?", feeId, id);
  if (!fee) return new NextResponse("Not found", { status: 404 });
  const rows = all<Record<string, unknown>>(
    `SELECT r.bib, r.first_name, r.last_name, r.email, r.gender, r.birth_year, ra.name race,
            CASE WHEN rf.exempt=1 THEN 'member' WHEN o.status='paid' THEN 'paid' ELSE 'unpaid' END status,
            rf.member_number, rf.amount_cents, o.payment_method, o.status order_status, o.paid_at
     FROM registration_fees rf JOIN registrations r ON r.id=rf.registration_id JOIN races ra ON ra.id=r.race_id JOIN orders o ON o.id=r.order_id
     WHERE rf.fee_id=? AND r.status!='cancelled' ORDER BY status, r.last_name`, feeId);
  for (const r of rows) {
    const amt = Number(r.amount_cents) || 0;
    const ded = r.order_status === "paid" ? processingDeduction(fee, amt, r.payment_method as string | null) : 0;
    r.amount = (amt / 100).toFixed(2);
    r.processing_deduction = (ded / 100).toFixed(2);
    r.net_to_remit = r.status === "paid" ? ((amt - ded) / 100).toFixed(2) : "0.00";
  }
  const cols = ["bib", "first_name", "last_name", "email", "gender", "birth_year", "race", "status", "member_number", "payment_method", "amount", "processing_deduction", "net_to_remit", "paid_at"];
  const csv = [cols.join(","), ...rows.map((r) => cols.map((c) => csvEscape(r[c])).join(","))].join("\n");
  audit(user.id, id, "export.fee", `${fee.name}: ${rows.length} rows`);
  return new NextResponse(csv, {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="fee-${fee.name.replace(/[^a-z0-9]+/gi, "-")}.csv"`, "Cache-Control": "no-store" },
  });
}
