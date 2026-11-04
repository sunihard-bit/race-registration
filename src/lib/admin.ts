import { notFound } from "next/navigation";
import { requireUser } from "./auth";

/** Platform admins only. Others get a 404 so the page's existence isn't revealed. */
export async function requireAdmin() {
  const u = await requireUser("/admin");
  if (!u.is_admin) notFound();
  return u;
}
