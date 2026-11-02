import Link from "next/link";
import { redirect } from "next/navigation";
import { createSession, hashPassword, throttle } from "@/lib/auth";
import { audit, newId, one, run } from "@/lib/db";
import { str } from "@/lib/format";

async function signup(formData: FormData) {
  "use server";
  const email = str(formData.get("email")).toLowerCase();
  const name = str(formData.get("name"), 120);
  const pw = str(formData.get("password"), 200);
  const organizer = formData.get("organizer") === "on";
  const nextRaw = str(formData.get("next")) || "/account";
  const next = nextRaw.startsWith("/") && !nextRaw.startsWith("//") ? nextRaw : "/account";
  if (!(await throttle("signup"))) redirect("/signup?error=throttled");
  if (!/^\S+@\S+\.\S+$/.test(email) || !name) redirect("/signup?error=invalid");
  if (pw.length < 10) redirect("/signup?error=password");
  if (formData.get("privacy") !== "on") redirect("/signup?error=privacy");
  if (one("SELECT 1 FROM users WHERE email = ?", email)) redirect("/signup?error=exists");
  const id = newId();
  run("INSERT INTO users (id, email, name, password_hash, is_organizer) VALUES (?,?,?,?,?)", id, email, name, await hashPassword(pw), organizer ? 1 : 0);
  audit(id, null, "user.signup", organizer ? "organizer" : "participant");
  await createSession(id);
  redirect(organizer ? "/organizer" : next);
}

const ERRORS: Record<string, string> = {
  invalid: "Please enter your name and a valid email.",
  password: "Use a password of at least 10 characters.",
  privacy: "Please accept the privacy notice to continue.",
  exists: "An account with that email already exists. Try logging in.",
  throttled: "Too many attempts. Try again later.",
};

export default async function Signup({ searchParams }: { searchParams: Promise<{ error?: string; next?: string; organizer?: string }> }) {
  const { error, next = "/account", organizer } = await searchParams;
  return (
    <div className="card" style={{ maxWidth: 460, margin: "24px auto" }}>
      <h1>Create an account</h1>
      {error && <div className="alert error">{ERRORS[error] ?? "Something went wrong."}</div>}
      <form action={signup}>
        <input type="hidden" name="next" value={next} />
        <div className="field"><label>Full name</label><input name="name" required autoComplete="name" /></div>
        <div className="field"><label>Email</label><input name="email" type="email" required autoComplete="email" /></div>
        <div className="field"><label>Password (10+ characters)</label><input name="password" type="password" minLength={10} required autoComplete="new-password" /></div>
        <label className="check"><input type="checkbox" name="organizer" defaultChecked={organizer === "1"} /> I organize events</label>
        <label className="check"><input type="checkbox" name="privacy" required /> I have read the <Link href="/privacy" target="_blank">privacy notice</Link>.</label>
        <p><button>Create account</button></p>
      </form>
      <p className="small">Already registered? <Link href="/login">Log in</Link></p>
    </div>
  );
}
