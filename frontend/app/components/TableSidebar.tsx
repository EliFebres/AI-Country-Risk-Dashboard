'use client';

import React, { useEffect, useMemo, useState } from 'react';

type RiskDot = {
  name: string;
  lngLat: [number, number];
  risk: number;
};

type SortKey = 'risk' | 'name';
type SortDir = 'desc' | 'asc';

type TableSidebarProps = {
  open?: boolean;                 // hidden entirely when false (e.g., RiskSidebar open)
  durationMs?: number;            // reveal (clip-path) duration
  easing?: string;                // easing for reveal & fades
  title?: string;
  onSelectCountry?: (dot: RiskDot) => void;
};

function colorForRisk(r: number) {
  if (r > 0.7) return '#ff2d55';   // red
  if (r >= 0.5) return '#ffd60a';  // yellow
  return '#39ff14';                // green
}

export default function TableSidebar({
  open = true,
  durationMs = 500,
  easing = 'ease',
  title = 'Table',
  onSelectCountry,
}: TableSidebarProps) {
  const panelWidth = 'min(420px, 25vw)'; // expanded width
  const fadeMs = Math.max(120, Math.round(durationMs * 0.6));
  const collapseMs = 260; // expand/collapse slide duration

  const [rows, setRows] = useState<RiskDot[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const [sortKey, setSortKey] = useState<SortKey>('risk');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const [collapsed, setCollapsed] = useState(false);

  // Fetch risk.json (cache-busted)
  useEffect(() => {
    const ctrl = new AbortController();
    (async () => {
      try {
        setLoading(true);
        setError(null);
        const res = await fetch(`/api/risk.json?v=${Date.now()}`, {
          signal: ctrl.signal,
          cache: 'no-store',
          headers: { accept: 'application/json' },
        });
        if (!res.ok) throw new Error(`Failed to load risk.json: ${res.status}`);
        const data: RiskDot[] = await res.json();
        setRows(data);
      } catch (e: any) {
        if (e?.name !== 'AbortError') setError(e?.message || 'Unknown error');
      } finally {
        setLoading(false);
      }
    })();
    return () => ctrl.abort();
  }, []);

  const sorted = useMemo(() => {
    const arr = [...rows].sort((a, b) => {
      if (sortKey === 'risk') {
        return sortDir === 'desc' ? b.risk - a.risk : a.risk - b.risk;
      } else {
        const cmp = a.name.localeCompare(b.name);
        return sortDir === 'desc' ? -cmp : cmp;
      }
    });
    return arr;
  }, [rows, sortKey, sortDir]);

  const toggleSort = (key: SortKey) => {
    if (key === sortKey) setSortDir(d => (d === 'desc' ? 'asc' : 'desc'));
    else {
      setSortKey(key);
      setSortDir(key === 'name' ? 'asc' : 'desc');
    }
  };

  const sortArrow = (key: SortKey) =>
    sortKey !== key ? '↕' : sortDir === 'asc' ? '↑' : '↓';

  return (
    <>
      {/* Floating expander (only when sidebar is open but collapsed) */}
      {open && collapsed && (
        <button
          className="expander"
          aria-label="Expand table"
          title="Expand"
          onClick={() => setCollapsed(false)}
        >
          ❯
        </button>
      )}

      <aside
        aria-hidden={!open}
        aria-label="Persistent table sidebar"
        className={`sidebar ${open ? 'open' : 'closed'} ${collapsed ? 'isCollapsed' : ''}`}
        style={
          {
            ['--w' as any]: panelWidth,
            ['--revealMs' as any]: `${durationMs}ms`,
            ['--fadeMs' as any]: `${fadeMs}ms`,
            ['--collapseMs' as any]: `${collapseMs}ms`,
            ['--easing' as any]: easing,
          } as React.CSSProperties
        }
      >
        {/* Collapse control (only visible when expanded) */}
        <button
          className="collapseBtn"
          aria-label="Collapse table"
          title="Collapse"
          onClick={() => setCollapsed(true)}
        >
          ❮
        </button>

        <header className="bar">
          <div className="title">
            <strong>{title}</strong>
            <span className="subtitle">{loading ? 'Loading…' : 'All Countries'}</span>
          </div>
        </header>

        <div className="content">
          {error ? (
            <section className="card">
              <h3>Error</h3>
              <p className="muted">{error}</p>
            </section>
          ) : (
            <div className="tableWrap">
              <table className="tbl" role="grid">
                <thead>
                  <tr>
                    <th style={{ width: 44, textAlign: 'right' }}>#</th>

                    {/* Clickable Name header */}
                    <th
                      aria-sort={
                        sortKey === 'name'
                          ? sortDir === 'asc'
                            ? 'ascending'
                            : 'descending'
                          : 'none'
                      }
                      className="sortable"
                    >
                      <button
                        className="thBtn"
                        onClick={() => toggleSort('name')}
                        title={`Sort by name (${sortKey === 'name' ? sortDir : 'asc'})`}
                      >
                        <span>Name</span>
                        <span className="sortGlyph">{sortArrow('name')}</span>
                      </button>
                    </th>

                    {/* Clickable Risk header */}
                    <th
                      style={{ width: 92 }}
                      aria-sort={
                        sortKey === 'risk'
                          ? sortDir === 'asc'
                            ? 'ascending'
                            : 'descending'
                          : 'none'
                      }
                      className="sortable right"
                    >
                      <button
                        className="thBtn right"
                        onClick={() => toggleSort('risk')}
                        title={`Sort by risk (${sortKey === 'risk' ? sortDir : 'desc'})`}
                      >
                        <span className="sortGlyph">{sortArrow('risk')}</span>
                        <span>Risk</span>
                      </button>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    [...Array(8)].map((_, i) => (
                      <tr key={`skeleton-${i}`} className="skeleton">
                        <td />
                        <td />
                        <td />
                      </tr>
                    ))
                  ) : (
                    sorted.map((r, i) => (
                      <tr
                        key={r.name}
                        tabIndex={0}
                        className="row"
                        onClick={() => onSelectCountry?.(r)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            onSelectCountry?.(r);
                          }
                        }}
                      >
                        <td className="num">{i + 1}</td>
                        <td className="nameCell">
                          <span
                            className="dot"
                            style={{ background: colorForRisk(r.risk) }}
                            aria-hidden
                          />
                          <span className="name">{r.name}</span>
                        </td>
                        <td className="riskCell">
                          <span
                            className="riskPill"
                            style={{
                              borderColor: `${colorForRisk(r.risk)}80`,
                              boxShadow: `inset 0 0 0 1px ${colorForRisk(r.risk)}30`,
                            }}
                            title={r.risk.toFixed(2)}
                          >
                            {r.risk.toFixed(2)}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </aside>

      <style jsx>{`
        :global(*) { box-sizing: border-box; }

        /* Floating expander button (only when collapsed) */
        .expander {
          position: absolute;
          top: 10px;
          left: 8px;
          z-index: 12;
          width: 32px;
          height: 32px;
          border-radius: 10px;
          border: 1px solid rgba(255,255,255,0.15);
          background: rgba(14,14,14,0.96);
          color: #fff;
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          box-shadow: 0 0 16px rgba(0,0,0,0.35);
          backdrop-filter: blur(8px);
          -webkit-backdrop-filter: blur(8px);
        }
        .expander:hover { background: rgba(255,255,255,0.12); }

        .sidebar {
          position: absolute;
          top: 0;
          left: 0;
          height: 100dvh;
          width: var(--w);
          background: rgba(14,14,14,0.96);
          color: #fff;
          border-right: 1px solid rgba(255,255,255,0.08);
          backdrop-filter: blur(8px);
          -webkit-backdrop-filter: blur(8px);
          z-index: 11;
          display: flex;
          flex-direction: column;
          box-shadow: 0 0 24px rgba(0,0,0,0.35);
          will-change: clip-path, opacity, transform;
          transition:
            clip-path var(--revealMs, 500ms) var(--easing, ease),
            opacity   var(--fadeMs,   300ms) var(--easing, ease),
            transform var(--collapseMs, 260ms) var(--easing, ease);
          transform: translateX(0);
          overflow: hidden;
        }
        .sidebar.closed { clip-path: inset(0 100% 0 0); opacity: 0; pointer-events: none; }
        .sidebar.open   { clip-path: inset(0 0 0 0);     opacity: 1; pointer-events: auto; }

        /* When collapsed, slide the entire panel fully offscreen (no rail left behind) */
        .sidebar.isCollapsed {
          transform: translateX(calc(-1 * var(--w)));
          pointer-events: none; /* clicks go to map; expander handles reopening */
        }

        /* Collapse button (only visible while expanded) */
        .collapseBtn {
          position: absolute;
          top: 10px;
          right: 8px;
          width: 28px;
          height: 28px;
          border-radius: 8px;
          border: 1px solid rgba(255,255,255,0.15);
          background: rgba(255,255,255,0.06);
          color: #fff;
          cursor: pointer;
          line-height: 26px;
          font-size: 16px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          z-index: 2;
        }
        .collapseBtn:hover { background: rgba(255,255,255,0.1); }

        .bar {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 14px 16px;
          border-bottom: 1px solid rgba(255,255,255,0.08);
        }
        .title { display: flex; flex-direction: column; }
        .title strong { font-size: 18px; line-height: 1.2; }
        .subtitle { opacity: 0.7; font-size: 12px; }

        .content { padding: 8px 0 12px; overflow: hidden; flex: 1; }

        .tableWrap {
          height: 100%;
          overflow: auto;
          padding: 0 8px 0 12px;
        }

        .tbl { width: 100%; border-collapse: separate; border-spacing: 0; font-size: 13px; }
        thead th {
          position: sticky; top: 0; z-index: 1;
          background: rgba(20,20,20,0.98);
          text-align: left; padding: 0;
          border-bottom: 1px solid rgba(255,255,255,0.08);
          font-weight: 700; letter-spacing: 0.2px;
        }
        th.sortable .thBtn {
          width: 100%; display: flex; align-items: center; gap: 8px;
          padding: 10px; border: none; outline: none; background: transparent;
          color: inherit; cursor: pointer; text-align: left; font: inherit; font-weight: 700;
        }
        th.sortable .thBtn:hover { background: rgba(255,255,255,0.06); }
        th.sortable.right .thBtn { justify-content: flex-end; text-align: right; }
        .sortGlyph { opacity: 0.75; font-size: 12px; }

        tbody tr.row {
          border-bottom: 1px solid rgba(255,255,255,0.06);
          transition: background 160ms ease;
          cursor: ${onSelectCountry ? 'pointer' : 'default'};
        }
        tbody tr.row:hover { background: rgba(255,255,255,0.04); }
        tbody tr.skeleton td {
          height: 34px;
          background: linear-gradient(90deg, rgba(255,255,255,0.04), rgba(255,255,255,0.10), rgba(255,255,255,0.04));
          background-size: 200% 100%;
          animation: shimmer 1.1s infinite;
          border-bottom: 1px solid rgba(255,255,255,0.06);
        }
        @keyframes shimmer {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }

        td { padding: 8px 10px; vertical-align: middle; }
        .num { color: rgba(255,255,255,0.7); width: 44px; text-align: right; }
        .nameCell { display: flex; align-items: center; gap: 8px; }
        .name { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

        .dot { width: 10px; height: 10px; border-radius: 50%; display: inline-block; box-shadow: 0 0 0 1px rgba(0,0,0,0.4); }

        .riskCell { text-align: right; }
        .riskPill {
          display: inline-block; min-width: 54px; text-align: center;
          padding: 4px 8px; border-radius: 999px;
          border: 1px solid rgba(255,255,255,0.15); background: rgba(255,255,255,0.06);
          font-weight: 700;
        }
      `}</style>
    </>
  );
}
