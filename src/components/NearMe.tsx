"use client";
// Asks the browser for the runner's location and reloads the event list sorted by distance.
// The position is rounded to about 1 km and only travels in the page URL; it is never saved.
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

export default function NearMe() {
  const router = useRouter();
  const sp = useSearchParams();
  const [state, setState] = useState("");
  const active = sp.get("lat") && sp.get("lng");

  function go() {
    if (!("geolocation" in navigator)) { setState("Your browser can't share its location."); return; }
    setState("Finding you…");
    navigator.geolocation.getCurrentPosition(
      (p) => {
        const q = new URLSearchParams(sp.toString());
        q.set("lat", p.coords.latitude.toFixed(2));
        q.set("lng", p.coords.longitude.toFixed(2));
        if (!q.get("within")) q.set("within", "50");
        setState("");
        router.push(`/?${q.toString()}`);
      },
      () => setState("Location is off. Allow location for this site, or search by place instead."),
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 600000 },
    );
  }

  function clear() {
    const q = new URLSearchParams(sp.toString());
    ["lat", "lng", "within"].forEach((k) => q.delete(k));
    router.push(q.toString() ? `/?${q}` : "/");
  }

  return (
    <span className="row" style={{ alignItems: "center", gap: 8 }}>
      {active
        ? <button type="button" className="secondary" onClick={clear}>Clear location</button>
        : <button type="button" className="secondary" onClick={go}>📍 Near me</button>}
      {state && <span className="small muted">{state}</span>}
    </span>
  );
}
