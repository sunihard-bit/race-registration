import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { audit, run } from "@/lib/db";
import { eventById, paymentMethods } from "@/lib/events";
import { orderById } from "@/lib/orders";
import { provider } from "@/lib/payments";
import { sameOrigin } from "@/lib/http";

export async function POST(req: Request) {
  if (!sameOrigin(req)) return new NextResponse("Bad origin", { status: 403 });
  const form = await req.formData();
  const user = await currentUser();
  const order = orderById(String(form.get("order_id")));
  if (!user || !order || order.user_id !== user.id) return new NextResponse("Not found", { status: 404 });
  const back = (q: string) => NextResponse.redirect(new URL(`/checkout/${order.id}?${q}`, req.url), 303);
  if (order.status !== "pending") return NextResponse.redirect(new URL(`/orders/${order.id}`, req.url), 303);

  const ev = eventById(order.event_id)!;
  const p = provider(String(form.get("provider")));
  if (!p || !p.configured() || !(paymentMethods(ev).includes(p.id) || p.id === "sandbox")) return back("error=method");

  run("UPDATE orders SET payment_method=? WHERE id=?", p.id, order.id);
  audit(user.id, ev.id, "payment.start", `${order.id} via ${p.id}`);
  try {
    const r = await p.start(order, ev.name);
    if (r.type === "redirect") return NextResponse.redirect(r.url, 303);
    if (r.type === "html") return new NextResponse(r.html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
    if (r.type === "manual") return NextResponse.redirect(new URL(`/orders/${order.id}`, req.url), 303);
    return back(`error=${encodeURIComponent(r.message)}`);
  } catch (e) {
    console.error("[payments] start failed", e);
    return back("error=provider");
  }
}
