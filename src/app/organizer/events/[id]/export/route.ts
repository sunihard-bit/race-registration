import { NextResponse } from "next/server";
import { can, currentUser, staffRole } from "@/lib/auth";
import { decrypt } from "@/lib/crypto";
import { all, audit } from "@/lib/db";
import { csvEscape } from "@/lib/format";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await currentUser();
  const role = user ? staffRole(id, user) : null;
  if (!user || !can(role, "viewer")) return new NextResponse("Forbidden", { status: 403 });
  const q = new URL(req.url).searchParams;
  const sensitive = q.get("sensitive") === "1" && can(role, "manager");
  const race = q.get("race") || "", status = q.get("status") || "";
  const rows = all<Record<string, string | number | null>>(
    `SELECT r.bib, r.first_name, r.last_name, r.email, r.gender, r.birth_year, r.city, r.country, r.club, r.tshirt, ra.name race,
            t.name team, r.relay_leg, r.status, r.checked_in_at, o.total_cents, o.payment_method, r.consent_marketing, r.answers,
            r.waiver_name, r.waiver_at, r.guardian_name, r.created_at, r.phone_enc, r.emergency_enc, r.medical_enc
     FROM registrations r JOIN races ra ON ra.id=r.race_id JOIN orders o ON o.id=r.order_id LEFT JOIN teams t ON t.id=r.team_id
     WHERE r.event_id=? AND (?='' OR r.race_id=?) AND (?='' OR r.status=?) ORDER BY r.bib`, id, race, race, status, status);
  const answerKeys = Array.from(new Set(rows.flatMap((r) => Object.keys(JSON.parse(String(r.answers || "{}"))))));
  const base = ["bib", "first_name", "last_name", "email", "gender", "birth_year", "city", "country", "club", "tshirt", "race", "team", "relay_leg",
    "status", "checked_in_at", "paid", "payment_method", "consent_marketing", "waiver_name", "waiver_at", "guardian_name", "created_at"];
  const extra = sensitive ? ["phone", "emergency_name", "emergency_phone", "medical"] : [];
  const lines = [[...base, ...extra, ...answerKeys].map(csvEscape).join(",")];
  for (const r of rows) {
    const ans = JSON.parse(String(r.answers || "{}"));
    const em = sensitive && r.emergency_enc ? JSON.parse(decrypt(String(r.emergency_enc)) || "{}") : {};
    const vals = base.map((k) => (k === "paid" ? ((Number(r.total_cents) || 0) / 100).toFixed(2) : r[k]));
    if (sensitive) vals.push(decrypt(r.phone_enc as string), em.name, em.phone, decrypt(r.medical_enc as string));
    lines.push([...vals, ...answerKeys.map((k) => ans[k])].map(csvEscape).join(","));
  }
  audit(user.id, id, sensitive ? "export.sensitive" : "export", `${rows.length} rows`);
  return new NextResponse(lines.join("\n"), {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="participants${sensitive ? "-sensitive" : ""}.csv"`, "Cache-Control": "no-store" },
  });
}
