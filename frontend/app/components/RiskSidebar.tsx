'use client';

import { useEffect, useState } from 'react';

type Props = {
  open: boolean;
  onClose: () => void;
  // Add iso2 if you want the flag to render: e.g., { name, risk, iso2: 'US' }
  country: { name: string; risk: number; iso2?: string } | null;
  /** Total duration (ms) for the clip-path reveal. Default 360. */
  durationMs?: number;
  /** CSS easing for both clip-path and opacity transitions. Default 'ease'. */
  easing?: string;
};

type SummaryEntry = { country_iso2: string; bullet_summary: string };

function colorForRisk(r: number) {
  if (r > 0.7) return '#ff2d55';   // red
  if (r >= 0.5) return '#ffd60a';  // yellow
  return '#39ff14';                // green
}

export default function RiskSidebar({
  open,
  onClose,
  country,
  durationMs = 500,
  easing = 'ease',
}: Props) {
  // Close on ESC
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const [summary, setSummary] = useState<string | null>(null);
  const [sumLoading, setSumLoading] = useState(false);
  const [sumError, setSumError] = useState<string | null>(null);

  // Load the country summary (from risk_summary.json) whenever the selected country changes
  useEffect(() => {
    let cancelled = false;

    async function load() {
      setSumError(null);
      setSummary(null);

      // Only fetch when panel is open and we have a country
      if (!open || !country?.iso2) return;

      setSumLoading(true);
      try {
        const res = await fetch(`/api/risk_summary.json`, {
          cache: 'no-store',
          headers: { accept: 'application/json' },
        });

        if (!res.ok) {
          // File may not exist yet or server returned 404/500 — show muted state
          if (!cancelled) setSumError(`Summary not available (${res.status})`);
          return;
        }

        const data = (await res.json()) as SummaryEntry[] | SummaryEntry;
        const list = Array.isArray(data) ? data : [data];
        const iso = country.iso2.toUpperCase();

        const hit = list.find(
          (e) => e.country_iso2?.toUpperCase() === iso && typeof e.bullet_summary === 'string'
        );

        if (!cancelled) {
          setSummary(hit?.bullet_summary?.trim() || null);
        }
      } catch (e: any) {
        if (!cancelled) setSumError('Failed to load summary');
      } finally {
        if (!cancelled) setSumLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [open, country?.iso2]);

  const panelWidth = 'min(600px, 40vw)';
  // Make opacity a bit shorter so it feels snappier
  const fadeMs = Math.max(120, Math.round(durationMs * 0.6));

  // Build flag src only if iso2 is provided
  const flagSrc = country?.iso2 ? `/flags/${country.iso2.toUpperCase()}.svg` : null;

  return (
    <>
      {/* Dim backdrop */}
      <div
        className={`backdrop ${open ? 'open' : ''}`}
        onClick={onClose}
        aria-hidden={!open}
      />

      <aside
        aria-hidden={!open}
        aria-label="Country risk details"
        className={`sidebar ${open ? 'open' : 'closed'}`}
        style={
          {
            ['--w' as any]: panelWidth,
            ['--revealMs' as any]: `${durationMs}ms`,
            ['--fadeMs' as any]: `${fadeMs}ms`,
            ['--easing' as any]: easing,
          } as React.CSSProperties
        }
      >
        <header className="bar">
          <button onClick={onClose} aria-label="Close panel" className="closeBtn">
            ×
          </button>

          {/* TITLE: country name (left) + flag (right). No risk pill. */}
          <div className="titleRow">
            <strong className="countryName">{country?.name ?? '—'}</strong>
            {flagSrc && (
              <img
                className="flag"
                src={flagSrc}
                alt={`${country?.name ?? 'Country'} flag`}
                width={10}
                height={10}
                loading="eager"
              />
            )}
          </div>
        </header>

        <div className="content">
          {!country ? (
            <p className="muted">Click a country marker to see details.</p>
          ) : (
            <>
              <section className="card">
                <h3>Ai Summary (GPT 5-mini)</h3>
                {sumLoading ? (
                  <p className="muted">Loading summary…</p>
                ) : summary ? (
                  <p>{summary}</p>
                ) : (
                  <p className="muted">
                    {sumError ? sumError : 'No summary available for this country.'}
                  </p>
                )}
              </section>

              <div className="custom-divider"></div>

              <section className="card">
                <h3>Signals</h3>
                <ul>
                  <li>Conflict / war</li>
                  <li>Political stability</li>
                  <li>Governance / corruption</li>
                  <li>Macro volatility</li>
                  <li>Regulatory uncertainty</li>
                </ul>
              </section>
            </>
          )}
        </div>
      </aside>

      <style jsx>{`
        :global(*) { box-sizing: border-box; }

        .backdrop {
          position: absolute;
          inset: 0;
          background: rgba(0,0,0,0.0);
          opacity: 0;
          transition: opacity var(--fadeMs, 220ms) var(--easing, ease);
          pointer-events: none;
          z-index: 8;
        }
        .backdrop.open {
          background: rgba(0,0,0,0.35);
          opacity: 1;
          pointer-events: auto;
        }

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
          z-index: 10;
          display: flex;
          flex-direction: column;
          box-shadow: 0 0 24px rgba(0,0,0,0.35);
          will-change: clip-path, opacity;
          transition: clip-path var(--revealMs, 360ms) var(--easing, ease),
                      opacity   var(--fadeMs, 220ms)   var(--easing, ease);
        }

        .sidebar.closed { clip-path: inset(0 100% 0 0); opacity: 0; }
        .sidebar.open   { clip-path: inset(0 0 0 0);     opacity: 1; }

        .bar {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 14px 16px;
          border-bottom: 1px solid rgba(255,255,255,0.08);
        }
        .closeBtn {
          width: 36px; height: 36px;
          border-radius: 12px;
          border: 1px solid rgba(255,255,255,0.15);
          background: rgba(255,255,255,0.06);
          color: #fff; cursor: pointer; font-size: 18px; line-height: 36px;
        }

        /* Title row: name left, flag right */
        .titleRow {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
          flex: 1 1 auto;   /* expands between close button and right edge */
          min-width: 0;
        }
        .countryName {
          font-size: 28px;
          line-height: 1.2;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .flag {
          width: 65px;  /* keep your current styling; width/height attrs ensure 10x10 intrinsic */
          height: 65px; /* adjust if you want strictly 10x10 box rendering */
          display: block;
          border-radius: 2px; /* optional */
          object-fit: contain;
          flex: 0 0 auto;
        }

        .content { padding: 16px; overflow-y: auto; }
        .muted { opacity: 0.7; }

        .card {
          margin-bottom: 16px;
          padding: 10px 12px;
          // border: 1px solid rgba(255,255,255,0.08);
          // border-radius: 12px;
          // background: rgba(255,255,255,0.03);
        }
        .card h3 { margin: 0 0 8px; font-size: 18px; opacity: 0.9; font-weight: bold;}
        .card p, .card ul { margin: 0; opacity: 0.9; }

        .custom-divider {
          width: 95%;
          height: 1px;
          background: rgba(255,255,255,0.18);
          margin: 16px auto; /* centers horizontally */
        }

      `}</style>
    </>
  );
}
