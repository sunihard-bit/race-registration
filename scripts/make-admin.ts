// Usage: npm run make-admin -- someone@example.com   (the user must have signed up first)
import { run } from "../src/lib/db";
const email = (process.argv[2] || "").toLowerCase();
if (!email) { console.error("Usage: npm run make-admin -- email"); process.exit(1); }
const r = run("UPDATE users SET is_admin=1 WHERE email=?", email);
console.log(r.changes ? `${email} is now a platform admin.` : `No user with email ${email}. Sign up first.`);
