import crypto from "node:crypto";
import type { PaymentProvider, ReturnResult } from "./types";
import { appUrl } from "../mailer";
import { orderById, type Order } from "../orders";
import { one, run } from "../db";
import { decrypt, encrypt } from "../crypto";

/**
 * Wam (WamNow Technologies, Trinidad & Tobago). Cards and Wam balance via a hosted checkout.
 *
 * Per-organizer: each event connects the organizer's OWN Wam business account (Business ID, API key,
 * webhook secret), stored encrypted in events.wam_creds_enc. Money goes straight to the organizer;
 * the platform fee is invoiced separately. Nothing is collected into a platform account.
 *
 * Off unless WAM_ENABLED=1, because Wam has not yet confirmed that individuals may collect event fees
 * or that platforms like this are allowed.
 *
 * Built from docs.wam.money (Payment SDK: REST API, Payment Intents, Webhooks, API Keys), read 2026-11-23:
 *  - POST {base}/api/public/payment-intents  { amountCents, currency, orderReference, description, returnUrl, metadata }
 *    -> 201 { data: { paymentId, checkoutUrl, status, ... } }
 *  - GET  {base}/api/public/payment-intents/{paymentId} -> { data: { status: "succeeded" | ..., amountCents, currency } }
 *  - Request headers X-WAM-Api-Key, X-WAM-Timestamp (unix s), X-WAM-Signature = hex HMAC-SHA256("{ts}.{body}", apiKey)
 *  - Webhooks: x-wam-signature = hex HMAC-SHA256("{ts}.{rawBody}", whsec_ secret), x-wam-timestamp, 300 s tolerance
 * Not verified against a live account yet: test in staging before turning it on.
 */

export type WamCreds = { businessId: string; apiKey: string; webhookSecret: string };

export const wamEnabled = () => process.env.WAM_ENABLED === "1";
const wamBase = () =>
  process.env.WAM_API_BASE ||
  (process.env.WAM_ENVIRONMENT === "production" ? "https://billing.wam.money" : "https://staging.billing.wam.money");

export function wamCreds(eventId: string): WamCreds | null {
  const row = one<{ wam_creds_enc: string | null }>("SELECT wam_creds_enc FROM events WHERE id=?", eventId);
  const raw = decrypt(row?.wam_creds_enc);
  if (!raw) return null;
  try {
    const c = JSON.parse(raw) as WamCreds;
    return c.apiKey ? c : null;
  } catch {
    return null;
  }
}

export function saveWamCreds(eventId: string, c: WamCreds | null) {
  run("UPDATE events SET wam_creds_enc=? WHERE id=?", c ? encrypt(JSON.stringify(c)) : null, eventId);
}

/** Shows the organizer which key is connected without revealing it. */
export const maskKey = (k: string) => (k.length > 8 ? `${k.slice(0, 4)}…${k.slice(-4)}` : "set");

export const wamWebhookUrl = (eventId: string) => `${appUrl()}/api/payments/webhooks/wam/${eventId}`;

const hmac = (key: string, msg: string) => crypto.createHmac("sha256", key).update(msg).digest("hex");

function safeEqual(a: string, b: string) {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

async function wamFetch(creds: WamCreds, method: "GET" | "POST", path: string, body?: unknown) {
  const ts = Math.floor(Date.now() / 1000).toString();
  const json = body === undefined ? "" : JSON.stringify(body);
  const res = await fetch(`${wamBase()}/api/public${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      "X-WAM-Api-Key": creds.apiKey,
      "X-WAM-Timestamp": ts,
      "X-WAM-Signature": hmac(creds.apiKey, `${ts}.${json}`),
    },
    body: method === "POST" ? json : undefined,
  });
  const out = (await res.json().catch(() => ({}))) as { data?: Record<string, unknown>; error?: { message?: string }; message?: string };
  return { ok: res.ok, status: res.status, data: out.data, message: out.error?.message || out.message };
}

type Intent = { paymentId?: string; checkoutUrl?: string; status?: string; amountCents?: number; currency?: string };

/** Asks Wam for the payment's real status. Never trust the browser redirect or the webhook body alone. */
export async function wamCheck(order: Order, paymentId: string): Promise<ReturnResult> {
  const creds = wamCreds(order.event_id);
  if (!creds || !paymentId) return { orderId: order.id, paid: false, ref: null, message: "Wam is not connected for this event." };
  const r = await wamFetch(creds, "GET", `/payment-intents/${encodeURIComponent(paymentId)}`);
  const d = (r.data ?? {}) as Intent;
  const paid = r.ok && d.status === "succeeded" && d.amountCents === order.total_cents && d.currency === order.currency;
  return {
    orderId: order.id,
    paid,
    ref: paymentId,
    message: paid ? undefined : d.status ? `Wam payment ${d.status}.` : r.message || "Payment was not completed.",
  };
}

export const wam: PaymentProvider = {
  id: "wam",
  label: "Card or Wam (Wam)",
  description: "Visa / Mastercard or Wam balance. Paid straight to the organizer's Wam account.",
  configured: wamEnabled,
  configuredFor: (eventId) => wamEnabled() && !!wamCreds(eventId),
  async start(order, eventName) {
    const creds = wamCreds(order.event_id);
    if (!creds) return { type: "error", message: "This organizer hasn't connected Wam yet." };
    const r = await wamFetch(creds, "POST", "/payment-intents", {
      amountCents: order.total_cents,
      currency: order.currency,
      // Same order + amount returns the existing intent, so a retry doesn't create a second payment.
      orderReference: order.id,
      description: eventName.slice(0, 255),
      returnUrl: `${appUrl()}/api/payments/wam?order_id=${encodeURIComponent(order.id)}`,
      metadata: { orderId: order.id, eventId: order.event_id },
    });
    const d = (r.data ?? {}) as Intent;
    if (!d.checkoutUrl || !d.paymentId) return { type: "error", message: r.message || "Wam is unavailable." };
    run("UPDATE orders SET provider_ref=? WHERE id=? AND status='pending'", d.paymentId, order.id);
    return { type: "redirect", url: d.checkoutUrl };
  },
  async handleReturn(req) {
    const orderId = new URL(req.url).searchParams.get("order_id") || "";
    const order = orderById(orderId);
    if (!order) return { orderId, paid: false, ref: null, message: "Unknown order." };
    return wamCheck(order, order.provider_ref || "");
  },
};

/** Verifies a Wam webhook (HMAC-SHA256 over "{timestamp}.{rawBody}" with the endpoint's whsec_ secret). */
export function verifyWamWebhook(rawBody: string, signature: string, timestamp: string, secret: string, now = Date.now()) {
  const ts = parseInt(timestamp, 10);
  if (!secret || !signature || !Number.isFinite(ts)) return false;
  if (Math.abs(now / 1000 - ts) > 300) return false;
  return safeEqual(signature.toLowerCase(), hmac(secret, `${timestamp}.${rawBody}`));
}
