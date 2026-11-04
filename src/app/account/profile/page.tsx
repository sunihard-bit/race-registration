import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { str } from "@/lib/format";
import { deleteProfile, getProfile, PROFILE_FIELDS, saveProfile, type Profile } from "@/lib/profile";

async function save(formData: FormData) {
  "use server";
  const user = await requireUser("/account/profile");
  const p = Object.fromEntries(PROFILE_FIELDS.map((k) => [k, str(formData.get(k), 200)])) as Profile;
  if (p.dob && !/^\d{4}-\d{2}-\d{2}$/.test(p.dob)) redirect("/account/profile?error=dob");
  saveProfile(user.id, p);
  redirect("/account/profile?saved=1");
}

async function remove() {
  "use server";
  const user = await requireUser("/account/profile");
  deleteProfile(user.id);
  redirect("/account/profile?deleted=1");
}

const LABELS: Record<keyof Profile, string> = {
  first_name: "First name", last_name: "Last name", email: "Email for race information", phone: "Phone", dob: "Date of birth",
  gender: "Gender", country: "Country", city: "Town / city", club: "Club", tshirt: "T-shirt size",
  emergency_name: "Emergency contact name", emergency_phone: "Emergency contact phone",
};

export default async function ProfilePage({ searchParams }: { searchParams: Promise<{ saved?: string; deleted?: string; error?: string }> }) {
  const { saved, deleted, error } = await searchParams;
  const user = await requireUser("/account/profile");
  const p = getProfile(user.id);
  return (
    <div style={{ maxWidth: 680 }}>
      <p className="small"><Link href="/account">← My account</Link></p>
      <h1>Saved details</h1>
      <p className="muted">If you save your details, registration forms are filled in for you. They&apos;re stored encrypted and only used to pre-fill your own registrations. Medical notes are never saved. Saved details you don&apos;t use for 3 years are deleted automatically.</p>
      {saved && <div className="alert">Saved.</div>}
      {deleted && <div className="alert">Your saved details were deleted. Your past registrations are not affected.</div>}
      {error && <div className="alert error">Please use a valid date of birth.</div>}
      <form action={save} className="card">
        <div className="cols">
          {PROFILE_FIELDS.map((k) => (
            <div className="field" key={k}>
              <label>{LABELS[k]}</label>
              {k === "gender" ? (
                <select name={k} defaultValue={p?.[k] ?? ""}><option value="">Prefer not to say</option><option>Female</option><option>Male</option><option>Non-binary</option></select>
              ) : k === "tshirt" ? (
                <select name={k} defaultValue={p?.[k] ?? ""}><option value="">No shirt</option>{["XS", "S", "M", "L", "XL", "XXL"].map((s) => <option key={s}>{s}</option>)}</select>
              ) : (
                <input name={k} type={k === "dob" ? "date" : k === "email" ? "email" : "text"} defaultValue={p?.[k] ?? (k === "email" ? user.email : "")} />
              )}
            </div>
          ))}
        </div>
        <button>{p ? "Update saved details" : "Save my details"}</button>
      </form>
      {p && (
        <form action={remove} className="card stack" style={{ marginTop: 16 }}>
          <div><strong>Delete saved details</strong><div className="small muted">Last updated {p.updated_at} UTC.</div></div>
          <button className="danger">Delete saved details</button>
        </form>
      )}
    </div>
  );
}
