// Small, dependency-free charts. Single series, one brand hue, values printed in text ink.

export function BarList({ title, rows, format = (n: number) => String(n) }: { title: string; rows: [string, number][]; format?: (n: number) => string }) {
  const max = Math.max(1, ...rows.map(([, v]) => v));
  const total = rows.reduce((s, [, v]) => s + v, 0);
  return (
    <div className="card">
      <h3>{title}</h3>
      {rows.length === 0 && <p className="muted small">No data yet.</p>}
      <div style={{ display: "grid", gap: 6, marginTop: 8 }}>
        {rows.map(([label, v]) => (
          <div key={label} className="row small" style={{ gap: 8, flexWrap: "nowrap" }} title={`${label}: ${format(v)} (${total ? Math.round((v / total) * 100) : 0}%)`}>
            <span style={{ width: 110, flexShrink: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</span>
            <div className="bar-track"><div className="bar" style={{ width: `${(v / max) * 100}%`, borderRadius: "0 4px 4px 0" }} /></div>
            <span style={{ width: 70, textAlign: "right", flexShrink: 0 }}>{format(v)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Daily registrations as columns, with a native hover tooltip per day and a table view. */
export function Columns({ title, rows }: { title: string; rows: [string, number][] }) {
  const max = Math.max(1, ...rows.map(([, v]) => v));
  const W = 640, H = 140, gap = 2;
  const bw = rows.length ? Math.max(2, Math.min(40, W / rows.length - gap)) : 0;
  return (
    <div className="card">
      <h3>{title}</h3>
      {rows.length === 0 ? <p className="muted small">No registrations yet.</p> : (
        <>
          <svg viewBox={`0 0 ${W} ${H + 18}`} width="100%" role="img" aria-label={title}>
            <line x1={0} x2={W} y1={H} y2={H} stroke="var(--line)" />
            {rows.map(([d, v], i) => {
              const h = (v / max) * (H - 10);
              const x = i * (bw + gap);
              return (
                <g key={d}>
                  <rect x={x} y={0} width={bw + gap} height={H} fill="transparent"><title>{`${d}: ${v}`}</title></rect>
                  <rect x={x} y={H - h} width={bw} height={h} rx={Math.min(4, bw / 2)} fill="var(--brand)" pointerEvents="none" />
                </g>
              );
            })}
            <text x={0} y={H + 14} fontSize="11" fill="var(--muted)">{rows[0][0]}</text>
            <text x={W} y={H + 14} fontSize="11" fill="var(--muted)" textAnchor="end">{rows[rows.length - 1][0]}</text>
          </svg>
          <details className="small"><summary>Show as table</summary>
            <table><tbody>{rows.map(([d, v]) => <tr key={d}><td>{d}</td><td>{v}</td></tr>)}</tbody></table>
          </details>
        </>
      )}
    </div>
  );
}

export function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="card">
      <div className="muted small">{label}</div>
      <div className="stat">{value}</div>
      {sub && <div className="small muted">{sub}</div>}
    </div>
  );
}
