import { NextResponse } from "next/server";
import { can, currentUser, staffRole } from "@/lib/auth";
import { audit } from "@/lib/db";
import { startList, startListCsv } from "@/lib/timing";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await currentUser();
  if (!user || !can(user ? staffRole(id, user) : null, "manager")) return new NextResponse("Forbidden", { status: 403 });
  const race = new URL(req.url).searchParams.get("race") || "";
  const rows = startList(id, race);
  audit(user.id, id, "timing.startlist", `${rows.length} rows`);
  return new NextResponse(startListCsv(rows), {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="start-list.csv"', "Cache-Control": "no-store" },
  });
}
