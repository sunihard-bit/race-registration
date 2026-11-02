import { redirect } from "next/navigation";
import { destroySession, requireUser, verifyPassword } from "@/lib/auth";
import { audit, newId, one, run } from "@/lib/db";
import { eraseUser } from "@/lib/privacy";
import { str } from "@/lib/format";

async function setMarketing(formData: FormData) {
  "use server";
  const user = await requireUser("/account/data");
  const on = formData.get("marketing") === "on" ? 1 : 0;
  run("UPDATE registrations SET consent_marketing=? WHERE user_id=?", on, user.id);
  audit(user.id, null, "privacy.marketing", on ? "opt-in" : "opt-out");
  redirect("/account/data?saved=1");
}

async function erase(formData: FormData) {
  "use server";
  const user = await requireUser("/account/data");
  const row = one<{ password_hash: string }>("SELECT password_hash FROM users WHERE id=?", user.id)!;
  if (str(formData.get("confirm")) !== "DELETE" || !(await verifyPassword(str(formData.get("password")), row.password_hash))) {
    redirect("/account/data?error=confirm");
  }
  run("INSERT INTO data_requests (id, user_id, email, kind) VALUES (?,?,?, 'delete')", newId(), user.id, user.email);
  eraseUser(user.id, user.email);
  await destroySession();
  redirect("/?deleted=1");
}

export default async function DataPage({ searchParams }: { searchParams: Promise<{ saved?: string; error?: string }> }) {
  const { saved, error } = await searchParams;
  const user = await requireUser("/account/data");
  const marketing = one<{ m: number }>("SELECT MAX(consent_marketing) m FROM registrations WHERE user_id=?", user.id)?.m ?? 0;
  return (
    <div style={{ maxWidth: 640 }}>
      <h1>Your data</h1>
      <p className="muted">You have the right to see, correct and delete the personal information we hold about you.</p>
      {saved && <div className="alert">Saved.</div>}
      {error && <div className="alert error">Type DELETE and your current password to confirm.</div>}

      <div className="card stack">
        <h3>Download a copy</h3>
        <p className="small">A JSON file with your account, registrations (including encrypted fields, decrypted for you), orders and donations.</p>
        <a className="btn secondary" href="/account/data/export">Download my data</a>
      </div>

      <form action={setMarketing} className="card stack" style={{ marginTop: 16 }}>
        <h3>Email preferences</h3>
        <label className="check"><input type="checkbox" name="marketing" defaultChecked={!!marketing} /> Organizers may email me about future events</label>
        <p className="small muted">You will always get essential emails about events you registered for (start times, changes, cancellations).</p>
        <button className="secondary">Save preferences</button>
      </form>

      <form action={erase} className="card stack" style={{ marginTop: 16 }}>
        <h3>Delete my account</h3>
        <p className="small">This removes your name, contact details, date of birth, emergency contact and answers from every registration, and deletes your account. Payment amounts are kept without your name for the organizer&apos;s accounting records. Unpaid registrations are cancelled. This can&apos;t be undone.</p>
        <div className="cols">
          <div className="field"><label>Type DELETE</label><input name="confirm" /></div>
          <div className="field"><label>Password</label><input name="password" type="password" /></div>
        </div>
        <button className="danger">Delete my account and data</button>
      </form>
    </div>
  );
}
