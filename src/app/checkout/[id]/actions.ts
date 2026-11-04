"use server";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { audit, db, one, run } from "@/lib/db";
import { str } from "@/lib/format";
import { markOrderPaid, orderById } from "@/lib/orders";
import { findPrepaid } from "@/lib/prepaid";

export async function redeemPrepaid(fd: FormData) {
  const orderId = str(fd.get("order_id"));
  const user = await requireUser(`/checkout/${orderId}`);
  const o = orderById(orderId);
  if (!o || o.user_id !== user.id) redirect("/account");
  if (o.status !== "pending") redirect(`/orders/${o.id}`);
  const back = (msg: string) => redirect(`/checkout/${o.id}?error=${encodeURIComponent(msg)}`);

  const p = findPrepaid(o.event_id, str(fd.get("code"), 40));
  if (!p || p.void) return back("That prepaid code isn't valid for this event.");
  if (p.used_order_id) return back("That prepaid code has already been used.");
  const raceIds = db.prepare("SELECT race_id FROM registrations WHERE order_id=?").all(o.id) as { race_id: string }[];
  if (p.race_id && !raceIds.every((r) => r.race_id === p.race_id)) {
    const race = one<{ name: string }>("SELECT name FROM races WHERE id=?", p.race_id);
    return back(`That code is for the ${race?.name ?? "another"} race.`);
  }
  // Claim the code atomically so it can't be used twice.
  const claimed = run("UPDATE prepaid_codes SET used_order_id=?, used_at=datetime('now') WHERE id=? AND used_order_id IS NULL AND void=0", o.id, p.id).changes;
  if (!claimed) return back("That prepaid code has already been used.");
  audit(user.id, o.event_id, "prepaid.redeemed", `${p.code} on ${o.id}`);
  await markOrderPaid(o.id, "prepaid", p.code, user.id);
  redirect(`/orders/${o.id}`);
}
