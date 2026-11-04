import { decrypt, encrypt } from "./crypto";
import { audit, one, run } from "./db";

/** Details a participant can choose to save so later registrations are pre-filled. Medical notes are never saved. */
export type Profile = {
  first_name: string; last_name: string; email: string; phone: string; dob: string; gender: string;
  country: string; city: string; club: string; tshirt: string; emergency_name: string; emergency_phone: string;
};
export const PROFILE_FIELDS: (keyof Profile)[] = [
  "first_name", "last_name", "email", "phone", "dob", "gender", "country", "city", "club", "tshirt", "emergency_name", "emergency_phone",
];

export function getProfile(userId: string): (Profile & { updated_at: string }) | null {
  const row = one<{ data_enc: string; updated_at: string }>("SELECT data_enc, updated_at FROM profiles WHERE user_id=?", userId);
  if (!row) return null;
  try {
    return { ...(JSON.parse(decrypt(row.data_enc)) as Profile), updated_at: row.updated_at };
  } catch {
    return null;
  }
}

export function saveProfile(userId: string, p: Partial<Record<keyof Profile, string>>) {
  const clean = Object.fromEntries(PROFILE_FIELDS.map((k) => [k, String(p[k] ?? "").trim().slice(0, 200)]));
  run(
    `INSERT INTO profiles (user_id, data_enc) VALUES (?, ?)
     ON CONFLICT(user_id) DO UPDATE SET data_enc=excluded.data_enc, updated_at=datetime('now')`,
    userId, encrypt(JSON.stringify(clean))
  );
  audit(userId, null, "profile.saved", "");
}

export function deleteProfile(userId: string) {
  run("DELETE FROM profiles WHERE user_id=?", userId);
  audit(userId, null, "profile.deleted", "");
}
