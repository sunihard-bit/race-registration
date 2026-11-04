# Racekit (working name)

Race registration for road races, triathlons, cycling, swims and relays, built for countries Stripe doesn't serve (Trinidad and Tobago first). Low fees, local payment processors, and data protection built in.

> "Racekit" is a placeholder set by `APP_NAME`. Run a trademark search (TT Intellectual Property Office, plus WIPO Global Brand Database) before choosing a final name.

## What's included

**Participants**
- Browse and search events by sport
- Register with custom questions, T-shirt size, emergency contact, medical notes and a typed waiver signature (guardian signature for under-18s, minimum age per race)
- Create or join **teams and relays** with an invite code or link; each relay leg can only be taken once per team
- Discount codes, optional donation, personal fundraising page with a goal
- Pay required fees to other organizations (e.g. a federation one-day licence) at checkout, or give an annual membership number instead
- Save their details for faster registration next time
- Pay by card (WiPay or First Atlantic Commerce), PayPal, bank transfer/cash, or a prepaid code from the organizer
- Confirmation email with bib number; account page with all registrations
- Download all their data, manage marketing consent, delete their account

**Organizers**
- Create events with several races (individual, team, relay), capacities, start times
- Date-based price tiers (early bird, regular, late)
- Custom registration questions, waiver, refund policy
- Discount codes (percent or fixed, usage limits, expiry)
- Prepaid codes: record a bank deposit or cash payment and the app generates a one-time code (optionally emailed) that the participant uses at checkout instead of a card
- Fees for other organizations (federation licences etc.) per event or race, with member exemptions and a remittance CSV per fee
- Dashboard: registrations per day, revenue, fees, donations, check-in progress, and breakdowns by race, age, gender, T-shirt size, town, country, club, discount code and payment method
- Participant list with search and filters, bib editing, mark paid, cancel, CSV export (with or without medical info)
- Race-day check-in screen for volunteers (search by bib, name or team)
- Team/relay view showing which teams are complete and which legs are missing
- Email participants (everyone, unpaid, per race, or marketing opt-ins only)
- Upload results from CSV; public results page with search
- Confirmation code (e.g. RK-7F3K9Q) and QR code for every participant, on the confirmation page and in the email; staff scan it with a phone camera to open that person's check-in
- Timing tab for race timers: start list download (bib, chip, age on race day, 10-year age group, race, wave, team, relay leg), a private link timing software can read the start list from and send results to, chip and wave import, and a results import that accepts common timer exports as they are (CSV, tab or semicolon; headings like Pos, Bib No., Net Time, Division)
- Staff roles (owner, manager, check-in, viewer) and an audit log
- Choose to absorb the platform fee or pass it on; set a data retention period

## Run it

```bash
npm install
cp .env.example .env.local     # set DATA_ENCRYPTION_KEY and APP_URL
npm run seed                   # demo event + 120 demo participants
npm run dev                    # http://localhost:3000
```

Demo logins: `organizer@example.com` / `password1234` and `runner@example.com` / `password1234`. In development a "Test payment (sandbox)" option completes payments instantly.

Other commands: `npm run build`, `npm start`, `npm run typecheck`, `npm run retention` (run daily in production).

## Stack

Next.js 15 (App Router, server actions) and TypeScript, SQLite via better-sqlite3 (schema in `src/lib/schema.sql`), no client-side state library. Move to Postgres before running more than one server.

| Path | What it is |
|---|---|
| `src/lib/schema.sql` | Database schema |
| `src/lib/payments/` | Payment adapters (WiPay, FAC, PayPal, manual, sandbox) |
| `src/lib/privacy.ts` | Data export, erasure, retention |
| `src/lib/crypto.ts` | Field-level encryption |
| `src/app/events/[slug]/register/` | Registration flow |
| `src/app/organizer/events/[id]/` | Organizer dashboard and tools |

## Guides

- [Payment processors](docs/PAYMENTS.md)
- [Data protection](docs/DATA_PROTECTION.md)
- [Roadmap](docs/ROADMAP.md)

## Deploy a demo on Render

Click **New → Blueprint** in Render, pick this repo, and Render reads `render.yaml`. The free plan resets the database on every restart and re-seeds demo data, so use it only for trying things out.
