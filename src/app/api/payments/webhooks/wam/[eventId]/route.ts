import { NextResponse } from "next/server";
import { audit } from "@/lib/db";
import { markOrderPaid, orderById } from "@/lib/orders";
import { verifyWamWebhook, wamCheck, wamCreds, wamEnabled } from "@/lib/payments/wam";

/**
 * Wam webhook for one event's (organizer's) Wam account. The organizer pastes this URL into
 * Business Portal > Developers > Merchant Keys > Webhooks and copies the whsec_ secret back into Settings.
 * 2xx = handled; 4xx = bad request (Wam doesn't retry); 5xx = try again later (Wam retries up to 5 times).
 */
export async function POST(req: Request, { params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  const creds = wamEnabled() ? wamCreds(eventId) : null;
  if (!creds) return new NextResponse("Not found", { status: 404 });

  const raw = await req.text();
  const sig = req.headers.get("x-wam-signature") || "";
  const ts = req.headers.get("x-wam-timestamp") || "";
  if (!verifyWamWebhook(raw, sig, ts, creds.webhookSecret)) return new NextResponse("Bad signature", { status: 401 });

  let evt: { id?: string; type?: string; data?: { paymentId?: string; merchantReference?: string; metadata?: { orderId?: string } } };
  try { evt = JSON.parse(raw); } catch { return new NextResponse("Bad JSON", { status: 400 }); }
  if (evt.type !== "payment_intent.succeeded") return NextResponse.json({ ok: true, ignored: evt.type });

  const orderId = evt.data?.metadata?.orderId || evt.data?.merchantReference || "";
  const order = orderById(orderId);
  // Only orders of this event, so one organizer's secret can't confirm another event's orders.
  if (!order || order.event_id !== eventId) return NextResponse.json({ ok: true, ignored: "unknown order" });
  if (order.status === "paid") return NextResponse.json({ ok: true }); // duplicate delivery

  try {
    // Re-check with Wam's API (amount and currency must match the order) before confirming.
    const r = await wamCheck(order, evt.data?.paymentId || order.provider_ref || "");
    if (!r.paid) {
      audit(null, eventId, "payment.failed", `${order.id} via wam webhook: ${r.message ?? ""}`);
      return NextResponse.json({ ok: true, paid: false });
    }
    await markOrderPaid(order.id, "wam", r.ref);
    return NextResponse.json({ ok: true, paid: true });
  } catch (e) {
    console.error("[payments] wam webhook failed", e);
    return new NextResponse("Try again", { status: 500 });
  }
}
