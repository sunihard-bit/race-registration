// Race-day pack: everything an organizer needs to run check-in and timing with no internet.
import { strToU8, zipSync } from "fflate";
import { NextResponse } from "next/server";
import { can, currentUser, staffRole } from "@/lib/auth";
import { decrypt } from "@/lib/crypto";
import { all, audit } from "@/lib/db";
import { eventById } from "@/lib/events";
import { csvEscape, date } from "@/lib/format";
import { startList, startListCsv } from "@/lib/timing";

type Reg = {
  bib: number | null; confirm_code: string | null; first_name: string; last_name: string; gender: string; race: string;
  team: string | null; relay_leg: string; tshirt: string; checked_in_at: string | null;
  phone_enc: string | null; emergency_enc: string | null; medical_enc: string | null;
};

const esc = (s: unknown) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const csv = (head: string[], rows: unknown[][]) => [head, ...rows].map((r) => r.map(csvEscape).join(",")).join("\r\n") + "\r\n";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await currentUser();
  if (!user || !can(staffRole(id, user), "manager")) return new NextResponse("Forbidden", { status: 403 });
  const e = eventById(id)!;
  const regs = all<Reg>(
    `SELECT r.bib, r.confirm_code, r.first_name, r.last_name, r.gender, ra.name race, t.name team, r.relay_leg, r.tshirt, r.checked_in_at,
            r.phone_enc, r.emergency_enc, r.medical_enc
     FROM registrations r JOIN races ra ON ra.id=r.race_id LEFT JOIN teams t ON t.id=r.team_id
     WHERE r.event_id=? AND r.status='confirmed' AND r.anonymized_at IS NULL
     ORDER BY lower(r.last_name), lower(r.first_name)`, id);

  const sheet = `<!doctype html><meta charset="utf-8"><title>Check-in sheet: ${esc(e.name)}</title>
<style>body{font:12px/1.35 system-ui,sans-serif;margin:16px}h1{font-size:18px;margin:0}table{border-collapse:collapse;width:100%;margin-top:10px}
th,td{border:1px solid #999;padding:4px 6px;text-align:left}th{background:#eee}td.box{width:22px}tr{page-break-inside:avoid}
@media print{.noprint{display:none}}</style>
<h1>${esc(e.name)}: check-in sheet</h1><div>${esc(date(e.start_date))} · ${esc(e.location)} · ${regs.length} participants · printed ${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC</div>
<p class="noprint">Print this page (Ctrl+P or Share → Print). Tick the box when a participant collects their pack.</p>
<table><thead><tr><th></th><th>Last name</th><th>First name</th><th>Bib</th><th>Code</th><th>Race</th><th>Team / leg</th><th>Shirt</th></tr></thead><tbody>
${regs.map((r) => `<tr><td class="box">${r.checked_in_at ? "✓" : ""}</td><td>${esc(r.last_name)}</td><td>${esc(r.first_name)}</td><td><b>${r.bib ?? ""}</b></td><td>${esc(r.confirm_code)}</td><td>${esc(r.race)}</td><td>${esc([r.team, r.relay_leg].filter(Boolean).join(" · "))}</td><td>${esc(r.tshirt)}</td></tr>`).join("\n")}
</tbody></table>`;

  const emergency = csv(["bib", "first_name", "last_name", "race", "phone", "emergency_name", "emergency_phone", "medical_notes"],
    regs.map((r) => {
      const em = r.emergency_enc ? JSON.parse(decrypt(r.emergency_enc) || "{}") : {};
      return [r.bib, r.first_name, r.last_name, r.race, decrypt(r.phone_enc), em.name, em.phone, decrypt(r.medical_enc)];
    }));

  const shirts = new Map<string, number>();
  for (const r of regs) shirts.set(r.tshirt || "None", (shirts.get(r.tshirt || "None") ?? 0) + 1);

  const readme = `${e.name}: race-day pack
Downloaded ${new Date().toISOString()} by ${user.email}

check-in-sheet.html     Open and print. Alphabetical, with bib, confirmation code, race, team and shirt size.
start-list.csv          For your timer (same as the Timing tab download).
participants.csv        Everyone confirmed, alphabetical. Opens in Excel or Google Sheets.
emergency-contacts.csv  CONFIDENTIAL: phone, emergency contact and medical notes. Give only to the medical / safety lead.
                        Delete it after the event.
shirt-sizes.txt         Counts for packing.

This pack is a snapshot. Registrations or check-ins after this download aren't in it.
`;

  const zip = zipSync({
    "README.txt": strToU8(readme),
    "check-in-sheet.html": strToU8(sheet),
    "start-list.csv": strToU8(startListCsv(startList(id))),
    "participants.csv": strToU8(csv(["last_name", "first_name", "bib", "confirmation_code", "gender", "race", "team", "relay_leg", "tshirt", "checked_in"],
      regs.map((r) => [r.last_name, r.first_name, r.bib, r.confirm_code, r.gender, r.race, r.team, r.relay_leg, r.tshirt, r.checked_in_at ? "yes" : ""]))),
    "emergency-contacts.csv": strToU8(emergency),
    "shirt-sizes.txt": strToU8([...shirts].sort().map(([k, n]) => `${k}: ${n}`).join("\n") + "\n"),
  });
  audit(user.id, id, "export.raceday", `${regs.length} participants (includes emergency contacts)`);
  const slug = e.slug.replace(/[^a-z0-9-]/gi, "");
  return new NextResponse(Buffer.from(zip), {
    headers: { "Content-Type": "application/zip", "Content-Disposition": `attachment; filename="${slug}-race-day-pack.zip"`, "Cache-Control": "no-store" },
  });
}
