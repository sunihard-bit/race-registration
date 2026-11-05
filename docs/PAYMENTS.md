# Payment processors

Stripe does not onboard merchants in Trinidad and Tobago, so the app uses a pluggable payment layer (`src/lib/payments/`). Each processor is an adapter with `start()` (send the participant to pay) and `handleReturn()` (verify the result and confirm the order). Organizers tick which methods they accept in **Settings → Payments**. A method only appears at checkout once its API keys are set in `.env`.

| Processor | Good for | Settles in | Status in this code |
|---|---|---|---|
| **WiPay** | Local Visa/Mastercard, TT-based, quick sign-up | TTD to a local bank | Adapter built. Verify field names and the response hash against WiPay's current docs, then test in their sandbox. |
| **First Atlantic Commerce (FAC / PowerTranz)** | Card payments through a Caribbean bank merchant account (e.g. Republic, First Citizens, Scotiabank, RBC), 3-D Secure | TTD or USD | Adapter built on the PowerTranz hosted-page flow. FAC gives you exact endpoints and page set names at onboarding; confirm before go-live. |
| **PayPal** | Overseas participants | USD (PayPal has no TTD) | Adapter built (Orders v2). Prices are converted using `PAYPAL_TTD_PER_USD`. Check that a PayPal account in your country can **receive** and withdraw funds before relying on it. |
| **Bank transfer / cash / Linx at pickup** | Clubs and small events, people without cards | Direct to organizer | Built. Participant gets instructions and a reference; organizer clicks **Mark paid**. |
| **Sandbox** | Development and demos | – | Built. Disabled in production unless `PAYMENTS_SANDBOX=1`. Never enable it on a live site. |

Other options worth a look: 2Checkout (Verifone) and other international gateways that onboard Caribbean merchants. Adding one means writing one more adapter in `src/lib/payments/index.ts`.

## Fees

The platform fee is set with `PLATFORM_FEE_PERCENT` and `PLATFORM_FEE_FIXED_CENTS` (default 4% + TT$2.00, chosen so card processing of about 3–4% does not eat the margin). Organizers choose to pass it to participants (shown as a line at checkout) or absorb it. Processor fees (WiPay, FAC, PayPal) are charged by the processor on top of this, so price the platform fee with that in mind.

## Security notes

- Card details are typed on the processor's page, so the app never sees card numbers. This keeps you in the lightest PCI DSS scope (SAQ A).
- Every return from a processor is verified on the server (hash or API call), and the amount is checked against the order before it is marked paid.
- `markOrderPaid` is idempotent, so a repeated callback does not double-assign bibs.

## Payouts to organizers

Card payments (WiPay, FAC, PayPal) land in the platform's merchant account, so the platform pays each organizer afterwards.

- **What's owed** = card money collected − platform fees on card orders − platform fees on cash, bank and prepaid-code orders (that money went straight to the organizer). Donations and fees for other organizations are included, because the organizer passes them on. Card processing costs are the platform's, covered by the platform fee.
- **Organizers** see a statement on their event's **Payouts** tab, download an order-by-order CSV, and the event owner enters the bank account to pay into (stored encrypted).
- **Admins** see every balance at `/admin/payouts`. Open an event to see the organizer's bank details, then record a payout, money received from the organizer, or a deduction (e.g. a featured listing fee). Mistakes are voided, not deleted. Recording a payout can email the organizer. Recording does not move money; send the bank transfer first.
- Pay out after race day so there is room for refunds and chargebacks.

Holding organizers' money may need registration with the Central Bank of Trinidad and Tobago. Asking WiPay or FAC about split payouts to sub-merchants, so the processor pays organizers directly, is the cleaner long-term setup.
