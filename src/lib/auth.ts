import bcrypt from "bcryptjs";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { db, newId, one, run } from "./db";

export type User = { id: string; email: string; name: string; is_organizer: number; is_admin: number };
export type StaffRole = "owner" | "manager" | "checkin" | "viewer";

const COOKIE = "sid";
const SESSION_DAYS = 14;

export async function hashPassword(pw: string) {
  return bcrypt.hash(pw, 12);
}
export async function verifyPassword(pw: string, hash: string) {
  return bcrypt.compare(pw, hash);
}

export async function createSession(userId: string) {
  const id = newId(32);
  const expires = new Date(Date.now() + SESSION_DAYS * 864e5);
  run("INSERT INTO sessions (id, user_id, expires_at) VALUES (?,?,?)", id, userId, expires.toISOString());
  const jar = await cookies();
  jar.set(COOKIE, id, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires,
  });
}

export async function destroySession() {
  const jar = await cookies();
  const sid = jar.get(COOKIE)?.value;
  if (sid) run("DELETE FROM sessions WHERE id = ?", sid);
  jar.delete(COOKIE);
}

export async function currentUser(): Promise<User | null> {
  const jar = await cookies();
  const sid = jar.get(COOKIE)?.value;
  if (!sid) return null;
  const u = one<User & { expires_at: string }>(
    `SELECT u.id, u.email, u.name, u.is_organizer, u.is_admin, s.expires_at
     FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.id = ?`,
    sid
  );
  if (!u || new Date(u.expires_at) < new Date()) return null;
  return { id: u.id, email: u.email, name: u.name, is_organizer: u.is_organizer, is_admin: u.is_admin };
}

export async function requireUser(next = "/account"): Promise<User> {
  const u = await currentUser();
  if (!u) redirect(`/login?next=${encodeURIComponent(next)}`);
  return u;
}

const RANK: Record<StaffRole, number> = { viewer: 1, checkin: 2, manager: 3, owner: 4 };

export function staffRole(eventId: string, user: User): StaffRole | null {
  if (user.is_admin) return "owner";
  const r = one<{ role: StaffRole }>("SELECT role FROM event_staff WHERE event_id = ? AND user_id = ?", eventId, user.id);
  return r?.role ?? null;
}

/** Ensures the signed-in user has at least `min` role on the event. */
export async function requireEventRole(eventId: string, min: StaffRole) {
  const user = await requireUser(`/organizer/events/${eventId}`);
  const role = staffRole(eventId, user);
  if (!role || RANK[role] < RANK[min]) redirect("/organizer?denied=1");
  return { user, role };
}

export function can(role: StaffRole | null, min: StaffRole) {
  return !!role && RANK[role] >= RANK[min];
}

// Very small in-memory login throttle (per process). Swap for Redis in multi-instance deployments.
const attempts = new Map<string, { n: number; until: number }>();
export async function throttle(key: string) {
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  const k = `${key}:${ip}`;
  const now = Date.now();
  const a = attempts.get(k);
  if (a && a.until > now && a.n >= 8) return false;
  attempts.set(k, { n: a && a.until > now ? a.n + 1 : 1, until: now + 15 * 60e3 });
  return true;
}

export { db };
