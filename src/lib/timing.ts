// Timing integration: start lists for timers, results import from any timing software, age-group categories.
import crypto from "node:crypto";
import { all, db, newId, one, run } from "./db";
import { eventById } from "./events";

/** Age on race day from birth year. Exact DOB is encrypted, so this can be a year high for late birthdays. */
export function ageOnRaceDay(birthYear: number | null, raceDate: string) {
  return birthYear ? new Date(raceDate).getFullYear() - birthYear : null;
}

/** Ten-year age groups, e.g. "M 30-39", "F U20", "F 60+". */
export function ageCategory(gender: string, age: number | null) {
  const g = /^f/i.test(gender) ? "F" : /^m/i.test(gender) ? "M" : "X";
  if (age == null) return g;
  if (age < 20) return `${g} U20`;
  if (age >= 60) return `${g} 60+`;
  const lo = Math.floor(age / 10) * 10;
  return `${g} ${lo}-${lo + 9}`;
}

export type StartRow = {
  bib: number | null; chip: string; first_name: string; last_name: string; gender: string; birth_year: number | null;
  age: number | null; category: string; race: string; wave: string; team: string; relay_leg: string; club: string;
  city: string; country: string; status: string;
};

/** Confirmed participants in the shape timing software imports. */
export function startList(eventId: string, raceId = ""): StartRow[] {
  const e = eventById(eventId)!;
  const rows = all<Omit<StartRow, "age" | "category"> & { chip: string | null; team: string | null }>(
    `SELECT r.bib, r.chip, r.first_name, r.last_name, r.gender, r.birth_year, ra.name race, r.wave, t.name team, r.relay_leg,
            r.club, r.city, r.country, r.status
     FROM registrations r JOIN races ra ON ra.id=r.race_id LEFT JOIN teams t ON t.id=r.team_id
     WHERE r.event_id=? AND r.status='confirmed' AND r.anonymized_at IS NULL AND (?='' OR r.race_id=?)
     ORDER BY ra.sort, r.bib`, eventId, raceId, raceId);
  return rows.map((r) => {
    const age = ageOnRaceDay(r.birth_year, e.start_date);
    return { ...r, chip: r.chip || (r.bib != null ? String(r.bib) : ""), team: r.team ?? "", age, category: ageCategory(r.gender, age) };
  });
}

export const START_COLUMNS: (keyof StartRow)[] = [
  "bib", "chip", "first_name", "last_name", "gender", "birth_year", "age", "category", "race", "wave", "team", "relay_leg", "club", "city", "country",
];

// ---------- Results import ----------

/** Minimal CSV/TSV parser that handles quoted fields. */
export function parseDelimited(text: string): string[][] {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? "";
  const delim = (firstLine.match(/\t/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? "\t"
    : (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? ";" : ",";
  const rows: string[][] = [];
  let row: string[] = [], field = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') q = false;
      else field += ch;
    } else if (ch === '"') q = true;
    else if (ch === delim) { row.push(field.trim()); field = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field.trim()); field = "";
      if (row.some((c) => c !== "")) rows.push(row);
      row = [];
    } else field += ch;
  }
  row.push(field.trim());
  if (row.some((c) => c !== "")) rows.push(row);
  return rows;
}

// Header names used by common timing programs, mapped to our fields.
const ALIASES: Record<string, string[]> = {
  place: ["place", "pos", "position", "overall", "overall place", "rank", "oa", "ovr", "finish place"],
  bib: ["bib", "bib #", "bib no", "bib number", "no", "number", "#", "race no", "startno", "start no"],
  name: ["name", "full name", "athlete", "participant", "runner"],
  first: ["first", "first name", "firstname", "given name"],
  last: ["last", "last name", "lastname", "surname", "family name"],
  gender: ["gender", "sex", "g", "m/f"],
  category: ["category", "cat", "division", "div", "age group", "agegroup", "ag", "class"],
  chip_time: ["chip time", "chiptime", "net time", "nettime", "net", "chip"],
  gun_time: ["gun time", "guntime", "time", "finish time", "official time", "elapsed", "gun", "clock time"],
  race: ["race", "event", "contest", "distance"],
};

function normalize(h: string) {
  return h.toLowerCase().replace(/[_.:]+/g, " ").replace(/[()]/g, "").replace(/\s+/g, " ").trim();
}

export type ParsedResult = { place: number | null; bib: number | null; name: string; gender: string; category: string; chip_time: string; gun_time: string; race: string };

export function parseResults(text: string): { rows: ParsedResult[]; error?: string } {
  const table = parseDelimited(text.replace(/^﻿/, ""));
  const header = (table.shift() || []).map(normalize);
  const idx: Record<string, number> = {};
  for (const [field, names] of Object.entries(ALIASES)) {
    const i = header.findIndex((h) => names.includes(h));
    if (i >= 0) idx[field] = i;
  }
  if (idx.bib == null && idx.name == null && idx.first == null) {
    return { rows: [], error: "Couldn't find a bib or name column in the first row." };
  }
  const get = (r: string[], f: string) => (idx[f] != null ? r[idx[f]] ?? "" : "");
  const rows = table.map((r) => {
    const bib = parseInt(get(r, "bib").replace(/\D/g, ""), 10);
    const place = parseInt(get(r, "place").replace(/\D/g, ""), 10);
    const name = get(r, "name") || [get(r, "first"), get(r, "last")].filter(Boolean).join(" ");
    return {
      place: Number.isFinite(place) ? place : null, bib: Number.isFinite(bib) ? bib : null, name,
      gender: get(r, "gender"), category: get(r, "category"), chip_time: get(r, "chip_time"), gun_time: get(r, "gun_time"), race: get(r, "race"),
    };
  });
  return { rows };
}

/**
 * Saves results for an event. Rows go to `raceId` if given, otherwise to the race named in the row,
 * otherwise to the race the bib is registered in. Replaces earlier results for each race touched.
 */
export function saveResults(eventId: string, rows: ParsedResult[], raceId = "") {
  const e = eventById(eventId)!;
  const races = all<{ id: string; name: string }>("SELECT id, name FROM races WHERE event_id=?", eventId);
  const byName = new Map(races.map((r) => [r.name.toLowerCase(), r.id]));
  const touched = new Set<string>();
  let saved = 0, skipped = 0;
  db.transaction(() => {
    const prepared = rows.map((row) => {
      const reg = row.bib != null
        ? one<{ race_id: string; first_name: string; last_name: string; gender: string; birth_year: number | null }>(
            "SELECT race_id, first_name, last_name, gender, birth_year FROM registrations WHERE event_id=? AND bib=? AND status!='cancelled'", eventId, row.bib)
        : undefined;
      const target = raceId || (row.race && byName.get(row.race.toLowerCase())) || reg?.race_id || "";
      return { row, reg, target };
    });
    for (const p of prepared) if (p.target) touched.add(p.target);
    for (const id of touched) run("DELETE FROM results WHERE race_id=?", id);
    for (const { row, reg, target } of prepared) {
      if (!target) { skipped++; continue; }
      const gender = row.gender || reg?.gender || "";
      const name = row.name || (reg ? `${reg.first_name} ${reg.last_name}` : "Unknown");
      const category = row.category || (reg ? ageCategory(gender, ageOnRaceDay(reg.birth_year, e.start_date)) : "");
      run("INSERT INTO results (id, race_id, bib, name, gender, category, chip_time, gun_time, place) VALUES (?,?,?,?,?,?,?,?,?)",
        newId(), target, row.bib, name, gender, category, row.chip_time, row.gun_time, row.place);
      saved++;
    }
  })();
  return { saved, skipped, races: touched.size };
}

// ---------- Private timer link ----------

export function timingToken(eventId: string, rotate = false) {
  const cur = one<{ timing_token: string | null }>("SELECT timing_token FROM events WHERE id=?", eventId)?.timing_token;
  if (cur && !rotate) return cur;
  const t = crypto.randomBytes(24).toString("base64url");
  run("UPDATE events SET timing_token=? WHERE id=?", t, eventId);
  return t;
}

export function eventByTimingToken(token: string) {
  if (!token || token.length < 20) return undefined;
  return one<{ id: string; name: string }>("SELECT id, name FROM events WHERE timing_token=?", token);
}

export function startListCsv(rows: StartRow[]) {
  const esc = (v: unknown) => {
    const s = v == null ? "" : String(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [START_COLUMNS.join(","), ...rows.map((r) => START_COLUMNS.map((k) => esc(r[k])).join(","))].join("\r\n") + "\r\n";
}
