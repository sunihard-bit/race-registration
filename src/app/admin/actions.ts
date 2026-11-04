"use server";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin";
import { audit, one, run } from "@/lib/db";
import { decideRequest, extendFeatured, FEATURED_WEEKS } from "@/lib/featured";
import { str } from "@/lib/format";

export async function decide(fd: FormData) {
  const admin = await requireAdmin();
  await decideRequest(str(fd.get("id")), str(fd.get("approve")) === "1", admin.id);
  revalidatePath("/admin");
}

export async function featureNow(fd: FormData) {
  const admin = await requireAdmin();
  const eventId = str(fd.get("event_id")), weeks = parseInt(str(fd.get("weeks")), 10);
  if (!FEATURED_WEEKS.includes(weeks) || !one("SELECT 1 FROM events WHERE id=?", eventId)) return;
  extendFeatured(eventId, weeks);
  audit(admin.id, eventId, "featured.added", `${weeks} weeks`);
  revalidatePath("/admin");
}

export async function stopFeatured(fd: FormData) {
  const admin = await requireAdmin();
  const eventId = str(fd.get("event_id"));
  run("UPDATE events SET featured_until=NULL WHERE id=?", eventId);
  audit(admin.id, eventId, "featured.stopped", "");
  revalidatePath("/admin");
}
