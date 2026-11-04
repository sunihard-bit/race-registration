// Timing software can push results here (CSV body, or JSON array of rows). Each push replaces the races it covers.
import { NextResponse } from "next/server";
import { audit } from "@/lib/db";
import { eventByTimingToken, parseResults, saveResults, type ParsedResult } from "@/lib/timing";

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const e = eventByTimingToken(token);
  if (!e) return NextResponse.json({ error: "not found" }, { status: 404 });
  const body = await req.text();
  if (body.length > 5_000_000) return NextResponse.json({ error: "too large" }, { status: 413 });
  let rows: ParsedResult[];
  if ((req.headers.get("content-type") || "").includes("json")) {
    let data: unknown;
    try { data = JSON.parse(body); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
    const list = Array.isArray(data) ? data : (data as { results?: unknown[] })?.results;
    if (!Array.isArray(list) || !list.length) return NextResponse.json({ error: "expected an array of results" }, { status: 400 });
    // Reuse the CSV header aliases by turning the JSON rows into a table.
    const keys = Array.from(new Set(list.flatMap((r) => Object.keys((r ?? {}) as object))));
    const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const csv = [keys.map(esc).join(","), ...list.map((r) => keys.map((k) => esc((r as Record<string, unknown>)[k])).join(","))].join("\n");
    const parsed = parseResults(csv);
    if (parsed.error) return NextResponse.json({ error: parsed.error }, { status: 400 });
    rows = parsed.rows;
  } else {
    const parsed = parseResults(body);
    if (parsed.error) return NextResponse.json({ error: parsed.error }, { status: 400 });
    rows = parsed.rows;
  }
  const r = saveResults(e.id, rows);
  audit(null, e.id, "results.pushed", `${r.saved} rows, ${r.skipped} skipped`);
  return NextResponse.json({ ok: true, ...r });
}
