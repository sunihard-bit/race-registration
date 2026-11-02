import Link from "next/link";
import { redirect } from "next/navigation";
import { createSession, throttle, verifyPassword } from "@/lib/auth";
import { one } from "@/lib/db";
import { str } from "@/lib/format";

function safeNext(n: string) {
  return n.startsWith("/") && !n.startsWith("//") ? n : "/account";
}

async function login(formData: FormData) {
  "use server";
  const email = str(formData.get("email")).toLowerCase();
  const next = safeNext(str(formData.get("next")) || "/account");
  if (!(await throttle("login"))) redirect(`/login?error=throttled&next=${encodeURIComponent(next)}`);
  const u = one<{ id: string; password_hash: string }>("SELECT id, password_hash FROM users WHERE email = ?", email);
  if (!u || !(await verifyPassword(str(formData.get("password")), u.password_hash))) {
    redirect(`/login?error=1&next=${encodeURIComponent(next)}`);
  }
  await createSession(u.id);
  redirect(next);
}

export default async function Login({ searchParams }: { searchParams: Promise<{ error?: string; next?: string }> }) {
  const { error, next = "/account" } = await searchParams;
  return (
    <div className="card" style={{ maxWidth: 420, margin: "24px auto" }}>
      <h1>Log in</h1>
      {error && <div className="alert error">{error === "throttled" ? "Too many attempts. Try again in 15 minutes." : "Email or password is incorrect."}</div>}
      <form action={login}>
        <input type="hidden" name="next" value={next} />
        <div className="field"><label>Email</label><input name="email" type="email" required autoComplete="email" /></div>
        <div className="field"><label>Password</label><input name="password" type="password" required autoComplete="current-password" /></div>
        <button>Log in</button>
      </form>
      <p className="small">New here? <Link href={`/signup?next=${encodeURIComponent(next)}`}>Create an account</Link></p>
    </div>
  );
}
