export function money(cents: number, currency = "TTD") {
  const symbol = currency === "TTD" ? "TT$" : currency === "USD" ? "US$" : currency + " ";
  return symbol + (cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
export function date(d: string | null | undefined) {
  if (!d) return "";
  return new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}
export function slugify(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 60);
}
export function toCents(v: FormDataEntryValue | null) {
  const n = parseFloat(String(v ?? "0"));
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) : 0;
}
export function str(v: FormDataEntryValue | null, max = 500) {
  return String(v ?? "").trim().slice(0, max);
}
export function csvEscape(v: unknown) {
  let s = v == null ? "" : String(v);
  // Neutralise spreadsheet formula injection
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
export const SPORTS = [
  ["running", "Road running"],
  ["triathlon", "Triathlon"],
  ["duathlon", "Duathlon"],
  ["cycling", "Cycling"],
  ["swimming", "Open water swim"],
  ["trail", "Trail running"],
  ["walk", "Walk"],
  ["other", "Other"],
] as const;
export function sportLabel(s: string) {
  return SPORTS.find(([k]) => k === s)?.[1] ?? s;
}
