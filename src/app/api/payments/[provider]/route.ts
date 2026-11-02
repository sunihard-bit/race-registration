import { NextResponse } from "next/server";
import { audit } from "@/lib/db";
import { markOrderPaid, orderById } from "@/lib/orders";
import { provider } from "@/lib/payments";

async function handle(req: Request, { params }: { params: Promise<{ provider: string }> }) {
  const { provider: id } = await params;
  const p = provider(id);
  if (!p?.handleReturn || !p.configured()) return new NextResponse("Unknown provider", { status: 404 });
  try {
    const r = await p.handleReturn(req);
    const order = orderById(r.orderId);
    if (!order) return new NextResponse("Unknown order", { status: 404 });
    if (r.paid) {
      await markOrderPaid(order.id, p.id, r.ref);
      return NextResponse.redirect(new URL(`/orders/${order.id}`, req.url), 303);
    }
    audit(null, order.event_id, "payment.failed", `${order.id} via ${p.id}: ${r.message ?? ""}`);
    return NextResponse.redirect(new URL(`/checkout/${order.id}?error=${encodeURIComponent(r.message || "declined")}`, req.url), 303);
  } catch (e) {
    console.error("[payments] callback failed", e);
    return new NextResponse("Payment callback error", { status: 500 });
  }
}
export { handle as GET, handle as POST };
