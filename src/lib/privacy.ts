import { decrypt } from "./crypto";
import { all, audit, db, run } from "./db";
import { getProfile } from "./profile";

type RegRow = Record<string, unknown> & { id: string; dob_enc: string | null; phone_enc: string | null; emergency_enc: string | null; medical_enc: string | null };

/** Everything we hold about a user, decrypted, for a data access request. */
export function exportUserData(userId: string, email: string) {
  const user = db.prepare("SELECT id, email, name, is_organizer, created_at FROM users WHERE id=?").get(userId);
  const regs = all<RegRow>("SELECT * FROM registrations WHERE user_id=? OR email=?", userId, email).map((r) => {
    const { dob_enc, phone_enc, emergency_enc, medical_enc, ...rest } = r;
    return {
      ...rest,
      answers: JSON.parse(String(r.answers || "{}")),
      date_of_birth: decrypt(dob_enc),
      phone: decrypt(phone_enc),
      emergency_contact: decrypt(emergency_enc) ? JSON.parse(decrypt(emergency_enc)) : null,
      medical: decrypt(medical_enc),
    };
  });
  const orders = all("SELECT id, event_id, subtotal_cents, discount_cents, donation_cents, fee_cents, total_cents, currency, status, payment_method, paid_at, created_at FROM orders WHERE user_id=?", userId);
  const donations = all("SELECT d.* FROM donations d JOIN orders o ON o.id=d.order_id WHERE o.user_id=?", userId);
  const requests = all("SELECT kind, status, created_at, completed_at FROM data_requests WHERE user_id=?", userId);
  return { exported_at: new Date().toISOString(), user, saved_profile: getProfile(userId), registrations: regs, orders, donations, data_requests: requests };
}

/** Removes personal data from a registration but keeps anonymous counts for organizer statistics. */
export function anonymizeRegistration(regId: string) {
  const r = db.prepare("SELECT race_id, bib FROM registrations WHERE id=?").get(regId) as { race_id: string; bib: number | null } | undefined;
  run(`UPDATE registrations SET first_name='Removed', last_name='', email='removed-' || id || '@invalid', dob_enc=NULL, phone_enc=NULL,
         emergency_enc=NULL, medical_enc=NULL, city='', club='', answers='{}', waiver_name=NULL, guardian_name=NULL, user_id=NULL,
         consent_marketing=0, anonymized_at=datetime('now') WHERE id=?`, regId);
  if (r?.bib) run("UPDATE results SET name='Removed' WHERE race_id=? AND bib=?", r.race_id, r.bib);
}

/** Right to erasure: anonymize registrations, scrub order emails (amounts kept for accounting), delete the account. */
export function eraseUser(userId: string, email: string) {
  db.transaction(() => {
    for (const r of all<{ id: string }>("SELECT id FROM registrations WHERE user_id=? OR email=?", userId, email)) anonymizeRegistration(r.id);
    run("UPDATE registrations SET status='cancelled' WHERE anonymized_at IS NOT NULL AND status='pending'");
    run("UPDATE orders SET buyer_email='removed@invalid', user_id=NULL WHERE user_id=?", userId);
    run("UPDATE donations SET donor_name='Anonymous' WHERE order_id IN (SELECT id FROM orders WHERE buyer_email='removed@invalid')");
    run("UPDATE data_requests SET status='done', completed_at=datetime('now'), user_id=NULL, email='removed@invalid' WHERE user_id=?", userId);
    run("UPDATE teams SET captain_user_id=NULL WHERE captain_user_id=?", userId);
    run("DELETE FROM event_staff WHERE user_id=?", userId);
    run("DELETE FROM sessions WHERE user_id=?", userId);
    run("DELETE FROM profiles WHERE user_id=?", userId);
    run("DELETE FROM users WHERE id=?", userId);
  })();
  audit(null, null, "privacy.erased", "user account erased on request");
}

/** Retention: anonymize participants of events that ended more than retention_days ago. */
export function applyRetention() {
  const regs = all<{ id: string }>(
    `SELECT r.id FROM registrations r JOIN events e ON e.id=r.event_id
     WHERE r.anonymized_at IS NULL AND date(e.start_date, '+' || e.retention_days || ' days') < date('now')`
  );
  for (const r of regs) anonymizeRegistration(r.id);
  if (regs.length) audit(null, null, "privacy.retention", `${regs.length} registrations anonymized`);
  // Saved profiles unused for 3 years are deleted.
  const stale = run("DELETE FROM profiles WHERE updated_at < datetime('now', '-3 years')").changes;
  if (stale) audit(null, null, "privacy.retention", `${stale} unused saved profiles deleted`);
  return regs.length;
}
