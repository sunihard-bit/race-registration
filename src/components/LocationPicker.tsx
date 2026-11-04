"use client";
// Organizer map pin for an event. Uses OpenStreetMap tiles (free, attribution required).
import { useEffect, useRef, useState } from "react";
import type { Map as LMap, CircleMarker } from "leaflet";
import "leaflet/dist/leaflet.css";

const TT_CENTER: [number, number] = [10.65, -61.4];

export default function LocationPicker({ lat, lng }: { lat: number | null; lng: number | null }) {
  const [pos, setPos] = useState<[number, number] | null>(lat != null && lng != null ? [lat, lng] : null);
  const [msg, setMsg] = useState("");
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<LMap | null>(null);
  const marker = useRef<CircleMarker | null>(null);

  useEffect(() => {
    let cancelled = false;
    import("leaflet").then((L) => {
      if (cancelled || !el.current || map.current) return;
      const m = L.map(el.current).setView(pos ?? TT_CENTER, pos ? 14 : 9);
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      }).addTo(m);
      m.on("click", (e) => setPos([+e.latlng.lat.toFixed(5), +e.latlng.lng.toFixed(5)]));
      map.current = m;
      (window as unknown as { __L: typeof L }).__L = L;
      setPos((p) => (p ? [...p] as [number, number] : p)); // draw an existing pin
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const L = (window as unknown as { __L?: typeof import("leaflet") }).__L;
    if (!L || !map.current) return;
    if (!pos) { marker.current?.remove(); marker.current = null; return; }
    if (!marker.current) marker.current = L.circleMarker(pos, { radius: 9, color: "#0f766e", fillOpacity: 0.8 }).addTo(map.current);
    else marker.current.setLatLng(pos);
  }, [pos]);

  async function lookup() {
    const q = (document.querySelector('input[name="location"]') as HTMLInputElement | null)?.value.trim();
    if (!q) { setMsg("Type the location above first."); return; }
    setMsg("Looking up…");
    try {
      const r = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(q)}`);
      const [hit] = await r.json();
      if (!hit) { setMsg("Couldn't find that place. Click the map instead."); return; }
      const p: [number, number] = [+(+hit.lat).toFixed(5), +(+hit.lon).toFixed(5)];
      setPos(p); map.current?.setView(p, 15); setMsg("Found it. Click the map to fine-tune the pin.");
    } catch { setMsg("Lookup failed. Click the map instead."); }
  }

  return (
    <div className="field">
      <label>Map pin (lets runners find events near them)</label>
      <div ref={el} style={{ height: 280, borderRadius: 8, border: "1px solid var(--border, #ddd)" }} />
      <div className="row small" style={{ marginTop: 6, alignItems: "center" }}>
        <button type="button" className="secondary small" onClick={lookup}>Find the location on the map</button>
        {pos && <button type="button" className="secondary small" onClick={() => setPos(null)}>Remove pin</button>}
        <span className="muted">{msg || (pos ? `Pin at ${pos[0]}, ${pos[1]}` : "Click the map to drop a pin.")}</span>
      </div>
      <input type="hidden" name="lat" value={pos?.[0] ?? ""} />
      <input type="hidden" name="lng" value={pos?.[1] ?? ""} />
    </div>
  );
}
