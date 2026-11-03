import crypto from "node:crypto";
import type { PaymentProvider, ReturnResult } from "./types";
import { appUrl } from "../mailer";
import { orderById } from "../orders";

const cb = (id: string) => `${appUrl()}/api/payments/${id}`;
const amount = (cents: number) => (cents / 100).toFixed(2);

/**
 * WiPay (Trinidad & Tobago, Jamaica, Barbados, Guyana). Cards + WiPay vouchers, settles to local banks in TTD.
 * Verify field names against WiPay's current developer docs before going live.
 */
const wipay: PaymentProvider = {
  id: "wipay",
  label: "Card (WiPay)",
  description: "Visa / Mastercard, settled in TTD to a local bank.",
  configured: () => !!process.env.WIPAY_ACCOUNT_NUMBER && !!process.env.WIPAY_API_KEY,
  async start(order) {
    const body = new URLSearchParams({
      account_number: process.env.WIPAY_ACCOUNT_NUMBER!,
      avs: "0",
      country_code: process.env.WIPAY_COUNTRY_CODE || "TT",
      currency: order.currency,
      environment: process.env.WIPAY_ENVIRONMENT || "sandbox",
      fee_structure: "merchant_absorb",
      method: "credit_card",
      order_id: order.id,
      origin: "racekit",
      response_url: cb("wipay"),
      total: amount(order.total_cents),
    });
    const res = await fetch("https://tt.wipayfinancial.com/plugins/payments/request", {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    const json = (await res.json().catch(() => ({}))) as { url?: string; message?: string };
    return json.url ? { type: "redirect", url: json.url } : { type: "error", message: json.message || "WiPay is unavailable." };
  },
  async handleReturn(req) {
    const q = new URL(req.url).searchParams;
    const orderId = q.get("order_id") || "";
    const txn = q.get("transaction_id") || "";
    const total = q.get("total") || "";
    const expected = crypto.createHash("md5").update(txn + total + process.env.WIPAY_API_KEY).digest("hex");
    const order = orderById(orderId);
    const hashOk = !!q.get("hash") && safeEqual(q.get("hash")!, expected);
    const amountOk = !!order && amount(order.total_cents) === parseFloat(total).toFixed(2);
    const paid = q.get("status") === "success" && hashOk && amountOk;
    return { orderId, paid, ref: txn, message: paid ? undefined : q.get("message") || "Payment was not completed." };
  },
};

/**
 * PayPal (Orders v2). PayPal does not support TTD, so prices are converted to USD using PAYPAL_TTD_PER_USD.
 * Useful for overseas participants. Check that your PayPal account can receive payments in your country.
 */
const paypalBase = () =>
  process.env.PAYPAL_ENVIRONMENT === "live" ? "https://api-m.paypal.com" : "https://api-m.sandbox.paypal.com";
async function paypalToken() {
  const res = await fetch(`${paypalBase()}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: "Basic " + Buffer.from(`${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_CLIENT_SECRET}`).toString("base64"),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  return ((await res.json()) as { access_token: string }).access_token;
}
function toPaypalAmount(cents: number, currency: string) {
  if (currency !== "TTD") return { currency_code: currency, value: amount(cents) };
  const rate = parseFloat(process.env.PAYPAL_TTD_PER_USD || "6.78");
  return { currency_code: "USD", value: amount(Math.ceil(cents / rate)) };
}
const paypal: PaymentProvider = {
  id: "paypal",
  label: "PayPal",
  description: "PayPal balance or card. Charged in USD.",
  configured: () => !!process.env.PAYPAL_CLIENT_ID && !!process.env.PAYPAL_CLIENT_SECRET,
  async start(order, eventName) {
    const token = await paypalToken();
    const res = await fetch(`${paypalBase()}/v2/checkout/orders`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        intent: "CAPTURE",
        purchase_units: [{ custom_id: order.id, description: eventName.slice(0, 120), amount: toPaypalAmount(order.total_cents, order.currency) }],
        payment_source: { paypal: { experience_context: { return_url: cb("paypal"), cancel_url: `${appUrl()}/checkout/${order.id}?cancelled=1`, user_action: "PAY_NOW" } } },
      }),
    });
    const json = (await res.json()) as { links?: { rel: string; href: string }[] };
    const link = json.links?.find((l) => l.rel === "payer-action" || l.rel === "approve");
    return link ? { type: "redirect", url: link.href } : { type: "error", message: "PayPal is unavailable." };
  },
  async handleReturn(req) {
    const ppId = new URL(req.url).searchParams.get("token") || "";
    const token = await paypalToken();
    const res = await fetch(`${paypalBase()}/v2/checkout/orders/${encodeURIComponent(ppId)}/capture`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    });
    const json = (await res.json()) as {
      status?: string;
      purchase_units?: { payments?: { captures?: { id: string; custom_id?: string }[] } }[];
    };
    const cap = json.purchase_units?.[0]?.payments?.captures?.[0];
    return { orderId: cap?.custom_id || "", paid: json.status === "COMPLETED", ref: cap?.id ?? ppId };
  },
};

/**
 * First Atlantic Commerce (PowerTranz) hosted payment page with 3-D Secure.
 * Structure follows the PowerTranz SPI flow; confirm endpoints and fields with FAC during merchant onboarding.
 */
// Set FAC_API_BASE to the production URL FAC gives you at go-live.
const facBase = () => process.env.FAC_API_BASE || "https://staging.ptranz.com";
const ISO_NUM: Record<string, string> = { TTD: "780", USD: "840", JMD: "388", BBD: "052", XCD: "951", GYD: "328" };
const fac: PaymentProvider = {
  id: "fac",
  label: "Card (First Atlantic Commerce)",
  description: "Visa / Mastercard via a Caribbean bank acquirer, with 3-D Secure.",
  configured: () => !!process.env.FAC_MERCHANT_ID && !!process.env.FAC_PASSWORD,
  async start(order) {
    const res = await fetch(`${facBase()}/api/spi/sale`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "PowerTranz-PowerTranzId": process.env.FAC_MERCHANT_ID!,
        "PowerTranz-PowerTranzPassword": process.env.FAC_PASSWORD!,
      },
      body: JSON.stringify({
        TransactionIdentifier: crypto.randomUUID(),
        TotalAmount: order.total_cents / 100,
        CurrencyCode: ISO_NUM[order.currency] ?? "780",
        ThreeDSecure: true,
        OrderIdentifier: order.id,
        ExtendedData: {
          MerchantResponseUrl: cb("fac"),
          HostedPage: { PageSet: process.env.FAC_PAGESET || "", PageName: process.env.FAC_PAGENAME || "" },
        },
      }),
    });
    const json = (await res.json().catch(() => ({}))) as { RedirectData?: string; ResponseMessage?: string };
    return json.RedirectData ? { type: "html", html: json.RedirectData } : { type: "error", message: json.ResponseMessage || "Card payment is unavailable." };
  },
  async handleReturn(req) {
    const form = await req.formData();
    const resp = JSON.parse(String(form.get("Response") || "{}")) as { SpiToken?: string; OrderIdentifier?: string };
    const res = await fetch(`${facBase()}/api/spi/payment`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(resp.SpiToken),
    });
    const json = (await res.json().catch(() => ({}))) as { Approved?: boolean; TransactionIdentifier?: string; OrderIdentifier?: string; ResponseMessage?: string };
    return { orderId: json.OrderIdentifier || resp.OrderIdentifier || "", paid: !!json.Approved, ref: json.TransactionIdentifier ?? null, message: json.ResponseMessage };
  },
};

/** Cash, bank transfer, Linx at packet pickup: organizer marks the order paid in the dashboard. */
const manual: PaymentProvider = {
  id: "manual",
  label: "Bank transfer or cash",
  description: "Pay the organizer directly. Your spot is confirmed once they mark it paid.",
  configured: () => true,
  async start() {
    return { type: "manual" };
  },
};

/** Fake processor for development and demos. */
const sandbox: PaymentProvider = {
  id: "sandbox",
  label: "Test payment (sandbox)",
  description: "Simulates a successful card payment. Disabled in production.",
  configured: () => process.env.PAYMENTS_SANDBOX === "1" || process.env.NODE_ENV !== "production",
  async start(order) {
    return { type: "redirect", url: `${cb("sandbox")}?order_id=${order.id}&sig=${sandboxSig(order.id)}` };
  },
  async handleReturn(req): Promise<ReturnResult> {
    const q = new URL(req.url).searchParams;
    const orderId = q.get("order_id") || "";
    return { orderId, paid: safeEqual(q.get("sig") || "", sandboxSig(orderId)), ref: "sandbox-" + Date.now() };
  },
};

function sandboxSig(id: string) {
  return crypto.createHmac("sha256", process.env.DATA_ENCRYPTION_KEY || "dev").update(id).digest("hex").slice(0, 16);
}
function safeEqual(a: string, b: string) {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

export const PROVIDERS: PaymentProvider[] = [wipay, fac, paypal, manual, sandbox];
export const provider = (id: string) => PROVIDERS.find((p) => p.id === id);
