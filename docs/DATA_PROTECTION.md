# Data protection guide

This is practical guidance, not legal advice. Have a Trinidad and Tobago attorney review your privacy notice, waiver and organizer agreement before launch.

## The law that applies

- **Trinidad and Tobago Data Protection Act, 2011.** Only parts of the Act have been proclaimed (mainly those setting up the Office of the Information Commissioner). The **General Privacy Principles** in section 6 are the standard you will be held to once the rest comes into force, and they are good practice now. Check the current proclamation status before launch.
- **Other countries' laws** apply when you register people who live there. If you take EU or UK residents, the GDPR can apply; Jamaica (Data Protection Act 2020), Barbados (Data Protection Act 2019) and the Bahamas also have laws in force. Designing to the strictest common standard keeps you safe across the region.
- **Your role.** The platform operator is a *processor* acting for each organizer, who is the *controller* for their event. Put this in your organizer terms.

## The General Privacy Principles, and how the app supports them

| Principle (summarised) | What the app does | What you still need to do |
|---|---|---|
| Be accountable for the data you hold | Audit log of exports, payments, staff changes, check-ins and erasures | Name a privacy contact; keep a record of processing |
| Say why you collect it, before or when you collect it | Privacy notice linked on sign-up and registration, with a required tick box | Fill in the template at `/privacy` |
| Get consent | Separate, unticked marketing opt-in; guardian name required for under-18s; consent time stored | Don't pre-tick boxes or bundle consents |
| Collect only what you need | Fixed core fields; custom questions show a reminder to only ask what's needed | Review organizers' custom questions |
| Use it only for the stated purpose | Email tool separates event updates from opt-in-only marketing | Don't sell or share lists |
| Keep it only as long as needed | Per-event retention period; `npm run retention` anonymizes participants afterwards | Run the retention job daily (cron) |
| Keep it accurate | Participants can see their registrations and export their data | Add self-service edit of registration details (planned) |
| Protect it | Encrypted sensitive fields, role-based staff access, hashed passwords, security headers, login throttling | HTTPS, backups, server patching, key management |
| Be open about practices | Public privacy notice | Publish your contact details |
| Give people access | One-click JSON download at `/account/data` | Answer emailed requests within a reasonable time |
| Allow challenges and corrections | Account deletion with password confirmation | Process correction requests manually for now |
| Transfers abroad | – | Pick hosting and email providers with adequate safeguards and say where data is stored |

## Security features built in

- **Field encryption (AES-256-GCM)** for date of birth, phone, emergency contact and medical notes. Set `DATA_ENCRYPTION_KEY` and keep it out of the database backups. Losing the key means losing those fields.
- **Roles per event**: owner, manager, check-in, viewer. Only managers and owners see medical and emergency details. Check-in volunteers see names, bibs and shirt sizes only.
- **Audit log** per event, highlighting exports that include medical data.
- **Exports** neutralise spreadsheet formula injection and are marked no-store.
- **Passwords** are hashed with bcrypt (cost 12); sessions are random, httpOnly, SameSite cookies that expire after 14 days.
- **Payment data** never touches the app; processors host the card form.
- **Erasure** anonymizes registrations and results, keeps anonymous payment amounts for accounting, and deletes the account.

## Operating checklist before launch

1. Host in a reputable cloud region, behind HTTPS only. Turn on automatic encrypted backups and test a restore.
2. Generate a strong `DATA_ENCRYPTION_KEY` and store it in your host's secret manager.
3. Move from SQLite to managed Postgres when you have more than one server.
4. Schedule `npm run retention` daily.
5. Finish the privacy notice and terms, and sign a data processing agreement with each organizer.
6. Write a breach response plan: who decides, how you tell organizers and participants, and within what time.
7. Train organizers: give volunteers the check-in role only, and delete exported spreadsheets after the event.
