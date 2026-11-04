import { all, one } from "@/lib/db";
import { eventById, racesFor } from "@/lib/events";
import { money } from "@/lib/format";
import { BarList, Columns, Stat } from "@/components/charts";

type Agg = [string, number][];
const pairs = (rows: { k: string | null; n: number }[], empty = "Not given"): Agg => rows.map((r) => [r.k || empty, r.n]);

export default async function Overview({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const e = eventById(id)!;
  const c = e.currency;
  const live = "event_id=? AND status!='cancelled'";
  const t = one<{ total: number; confirmed: number | null; pending: number | null; checked: number | null; marketing: number | null }>(
    `SELECT COUNT(*) total, SUM(status='confirmed') confirmed, SUM(status='pending') pending, SUM(checked_in_at IS NOT NULL) checked,
            SUM(consent_marketing) marketing FROM registrations WHERE ${live}`, id)!;
  const m = one<{ gross: number; entries: number; fees: number; donations: number; discounts: number; third: number }>(
    `SELECT COALESCE(SUM(total_cents),0) gross, COALESCE(SUM(subtotal_cents - discount_cents),0) entries, COALESCE(SUM(fee_cents),0) fees,
            COALESCE(SUM(donation_cents),0) donations, COALESCE(SUM(discount_cents),0) discounts, COALESCE(SUM(third_party_cents),0) third
     FROM orders WHERE event_id=? AND status='paid'`, id)!;
  const netEntries = m.entries - (e.fee_absorbed ? m.fees : 0);
  const daily = all<{ k: string; n: number }>(`SELECT date(created_at) k, COUNT(*) n FROM registrations WHERE ${live} GROUP BY k ORDER BY k`, id);
  const year = new Date(e.start_date).getFullYear();
  const ages = all<{ k: string; n: number }>(
    `SELECT CASE WHEN birth_year IS NULL THEN 'Unknown'
       WHEN ?-birth_year < 20 THEN 'Under 20' WHEN ?-birth_year < 30 THEN '20–29' WHEN ?-birth_year < 40 THEN '30–39'
       WHEN ?-birth_year < 50 THEN '40–49' WHEN ?-birth_year < 60 THEN '50–59' ELSE '60+' END k, COUNT(*) n
     FROM registrations WHERE ${live} GROUP BY k ORDER BY MIN(COALESCE(birth_year, 0)) DESC`, year, year, year, year, year, id);
  const group = (col: "gender" | "tshirt" | "city" | "country" | "club") =>
    all<{ k: string; n: number }>(`SELECT ${col} k, COUNT(*) n FROM registrations WHERE ${live} GROUP BY k ORDER BY n DESC LIMIT 8`, id);
  const races = racesFor(id).map((r) => {
    const n = one<{ n: number }>("SELECT COUNT(*) n FROM registrations WHERE race_id=? AND status!='cancelled'", r.id)!.n;
    return [r.capacity ? `${r.name} (of ${r.capacity})` : r.name, n] as [string, number];
  });
  const codes = all<{ k: string; n: number }>("SELECT code k, used_count n FROM discount_codes WHERE event_id=? AND used_count>0 ORDER BY n DESC", id);
  const methods = all<{ k: string; n: number }>("SELECT payment_method k, COUNT(*) n FROM orders WHERE event_id=? AND status='paid' GROUP BY k ORDER BY n DESC", id);
  const teams = one<{ n: number }>("SELECT COUNT(*) n FROM teams t JOIN races r ON r.id=t.race_id WHERE r.event_id=?", id)!.n;

  return (
    <div className="stack">
      <div className="grid">
        <Stat label="Registered" value={String(t.total)} sub={`${t.confirmed ?? 0} confirmed · ${t.pending ?? 0} awaiting payment`} />
        <Stat label="Collected from participants" value={money(m.gross, c)} sub={`Platform fees ${money(m.fees, c)}${e.fee_absorbed ? " (you absorb)" : " (paid by participants)"}`} />
        <Stat label="Net entry income" value={money(netEntries, c)} sub={`After ${money(m.discounts, c)} in discounts`} />
        <Stat label="Donations" value={money(m.donations, c)} sub={e.fundraising_goal_cents ? `Goal ${money(e.fundraising_goal_cents, c)}` : undefined} />
        {m.third > 0 && <Stat label="Held for other organizations" value={money(m.third, c)} sub="Federation and other fees to pass on" />}
        <Stat label="Checked in" value={`${t.checked ?? 0} of ${t.confirmed ?? 0}`} sub={`${teams} teams`} />
        <Stat label="Marketing opt-in" value={t.total ? `${Math.round(((t.marketing ?? 0) / t.total) * 100)}%` : "–"} sub="Can be emailed about future events" />
      </div>
      <Columns title="Registrations per day" rows={pairs(daily)} />
      <div className="grid">
        <BarList title="By race" rows={races} />
        <BarList title="Age on race day" rows={pairs(ages)} />
        <BarList title="Gender" rows={pairs(group("gender"))} />
        <BarList title="T-shirt sizes" rows={pairs(group("tshirt"), "No shirt")} />
        <BarList title="Top towns" rows={pairs(group("city"))} />
        <BarList title="Countries" rows={pairs(group("country"))} />
        <BarList title="Clubs" rows={pairs(group("club"))} />
        <BarList title="Discount codes used" rows={pairs(codes)} />
        <BarList title="Payment methods" rows={pairs(methods)} />
      </div>
    </div>
  );
}
