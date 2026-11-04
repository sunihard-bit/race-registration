// Private start-list feed for timing software. The token in the URL is the credential; organizers can rotate it.
import { NextResponse } from "next/server";
import { audit } from "@/lib/db";
import { eventByTimingToken, startList, startListCsv, START_COLUMNS } from "@/lib/timing";

export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const e = eventByTimingToken(token);
  if (!e) return new NextResponse("Not found", { status: 404 });
  const q = new URL(req.url).searchParams;
  const rows = startList(e.id).filter((r) => !q.get("race") || r.race.toLowerCase() === q.get("race")!.toLowerCase());
  const fmt = q.get("format") === "json" ? "json" : "csv";
  audit(null, e.id, "timing.feed", `${fmt} ${rows.length} rows`);
  const headers = { "Cache-Control": "no-store", "X-Robots-Tag": "noindex" };
  if (fmt === "json") {
    return NextResponse.json({ event: e.name, generated_at: new Date().toISOString(), columns: START_COLUMNS,
      participants: rows.map((r) => Object.fromEntries(START_COLUMNS.map((k) => [k, r[k]]))) }, { headers });
  }
  return new NextResponse(startListCsv(rows), { headers: { ...headers, "Content-Type": "text/csv; charset=utf-8" } });
}
