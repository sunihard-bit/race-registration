import { requireEventRole } from "@/lib/auth";
import { all } from "@/lib/db";

export default async function Audit({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireEventRole(id, "owner");
  const rows = all<{ at: string; action: string; detail: string; name: string | null }>(
    "SELECT a.at, a.action, a.detail, u.name FROM audit_log a LEFT JOIN users u ON u.id=a.user_id WHERE a.event_id=? ORDER BY a.id DESC LIMIT 300", id);
  return (
    <>
      <p className="small muted">Who did what with this event&apos;s data. Exports of sensitive data are highlighted.</p>
      <div className="card table-wrap"><table><thead><tr><th>When (UTC)</th><th>Who</th><th>Action</th><th>Detail</th></tr></thead><tbody>
        {rows.map((r, i) => <tr key={i}><td className="small">{r.at}</td><td>{r.name ?? "System / participant"}</td>
          <td>{r.action === "export.sensitive" ? <span className="badge warn">{r.action}</span> : r.action}</td><td className="small">{r.detail}</td></tr>)}
      </tbody></table></div>
    </>
  );
}
