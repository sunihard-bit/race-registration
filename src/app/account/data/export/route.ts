import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { audit, newId, run } from "@/lib/db";
import { exportUserData } from "@/lib/privacy";

export async function GET(req: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.redirect(new URL("/login?next=/account/data", req.url));
  run("INSERT INTO data_requests (id, user_id, email, kind, status, completed_at) VALUES (?,?,?,'export','done',datetime('now'))", newId(), user.id, user.email);
  audit(user.id, null, "privacy.export", "");
  return new NextResponse(JSON.stringify(exportUserData(user.id, user.email), null, 2), {
    headers: { "Content-Type": "application/json", "Content-Disposition": 'attachment; filename="my-data.json"', "Cache-Control": "no-store" },
  });
}
