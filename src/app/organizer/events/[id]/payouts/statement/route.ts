import { NextResponse } from "next/server";
import { can, currentUser, staffRole } from "@/lib/auth";
import { audit } from "@/lib/db";
import { eventById } from "@/lib/events";
import { csvEscape } from "@/lib/format";
import { OFFLINE_METHODS, statementRows } from "@/lib/payouts";

const amt = (c: number) => (c / 100).toFixed(2);

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await currentUser();
  if (!user || !can(staffRole(id, user), "manager")) return new NextResponse("Forbidden", { status: 403 });
  const e = eventById(id);
  if (!e) return new NextResponse("Not found", { status: 404 });
  const head = ["order", "paid_at", "buyer_email", "payment_method", "collected_by", "total", "platform_fee", "donation", "other_org_fees", "owed_to_organizer"];
  const rows = statementRows(id).map((o) => {
    const offline = OFFLINE_METHODS.includes(o.payment_method);
    const owed = offline ? -o.fee_cents : o.total_cents - o.fee_cents;
    return [o.id, o.paid_at, o.buyer_email, o.payment_method, offline ? "organizer" : "platform", amt(o.total_cents), amt(o.fee_cents),
      amt(o.donation_cents), amt(o.third_party_cents), amt(owed)];
  });
  audit(user.id, id, "export.statement", `${rows.length} orders`);
  // Amount columns (index 5+) are plain numbers; escaping them would turn "-2.00" into text.
  const csv = [head.join(","), ...rows.map((r) => r.map((v, i) => (i >= 5 ? v : csvEscape(v))).join(","))].join("\r\n") + "\r\n";
  return new NextResponse(csv, {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="statement-${e.slug}.csv"`, "Cache-Control": "no-store" },
  });
}
