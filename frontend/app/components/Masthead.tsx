'use client';

import { useEffect, useMemo, useState } from 'react';

type Props = {
  /** Number of covered sovereigns (derived from the live dataset, never hardcoded). */
  coverage: number | null;
  dataTimestamp?: Date | string | number | null;
  /** Whether the idle auto-tour is currently armed. */
  idleEnabled: boolean;
  onToggleIdle: () => void;
};

const pad = (n: number) => String(n).padStart(2, '0');

export default function Masthead({
  coverage,
  dataTimestamp,
  idleEnabled,
  onToggleIdle,
}: Props) {
  // Live UTC clock — initialized in an effect to avoid SSR/hydration mismatch.
  const [clock, setClock] = useState<string>('--:--:--');
  useEffect(() => {
    const tick = () => {
      const d = new Date();
      setClock(`${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  const dataAsOf = useMemo(() => {
    if (dataTimestamp == null) return '—';
    const dt = dataTimestamp instanceof Date ? dataTimestamp : new Date(dataTimestamp);
    if (isNaN(dt.getTime())) return '—';
    return dt.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  }, [dataTimestamp]);

  const coverageLabel = coverage == null ? '— Sovereigns' : `${coverage} Sovereigns`;

  return (
    <header className="topbar" aria-label="Masthead">
      <div className="tb-left">
        <span className="tb-mark">◆</span>
        <span className="tb-title">Global Sovereign Risk</span>
        <span className="tb-sub">Terminal</span>
      </div>
      <div className="tb-right">
        <span className="tb-live">
          <span className="live-dot" />
          LIVE
        </span>
        <span className="tb-clock">
          <span className="clk">{clock}</span>&nbsp;UTC
        </span>
        <span className="tb-stat">
          <span className="tb-k">Coverage</span>
          <span className="tb-v">{coverageLabel}</span>
        </span>
        <span className="tb-stat">
          <span className="tb-k">Data As Of</span>
          <span className="tb-v">{dataAsOf}</span>
        </span>
        <button
          className={`idle-toggle ${idleEnabled ? 'on' : ''}`}
          aria-label="Toggle World Tour auto-cycle"
          aria-pressed={idleEnabled}
          title={idleEnabled ? 'World Tour: On' : 'World Tour: Off'}
          onClick={onToggleIdle}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="9" />
            <path d="M10 9l5 3-5 3V9z" fill="currentColor" stroke="none" />
          </svg>
          <span className="idle-label">World Tour:</span>
          <span className="idle-state">{idleEnabled ? 'On' : 'Off'}</span>
        </button>
      </div>

      <style jsx>{`
        .topbar {
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          height: var(--top-h);
          z-index: 15;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
          padding: 0 16px;
          background: var(--term-bg);
          border-bottom: 1px solid var(--amber-border);
          box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5);
          font-family: var(--term-font);
        }
        .tb-left {
          display: flex;
          align-items: baseline;
          gap: 11px;
          min-width: 0;
          overflow: hidden;
        }
        .tb-mark {
          color: var(--amber);
          font-size: 13px;
          line-height: 1;
        }
        .tb-title {
          color: var(--amber);
          font-weight: 800;
          letter-spacing: 0.16em;
          text-transform: uppercase;
          font-size: 14px;
          white-space: nowrap;
        }
        .tb-sub {
          color: var(--amber-dim);
          letter-spacing: 0.26em;
          text-transform: uppercase;
          font-size: 10px;
          white-space: nowrap;
        }
        .tb-right {
          display: flex;
          align-items: center;
          gap: 18px;
          flex: 0 0 auto;
        }
        .tb-live {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          color: var(--crit);
          font-weight: 800;
          letter-spacing: 0.1em;
          font-size: 11px;
        }
        .live-dot {
          width: 7px;
          height: 7px;
          border-radius: 50%;
          background: var(--crit);
          box-shadow: 0 0 6px rgba(255, 59, 48, 0.65);
          animation: dotPulse 2200ms ease-in-out infinite;
        }
        .tb-clock {
          color: var(--amber);
          font-size: 11px;
          letter-spacing: 0.06em;
          font-variant-numeric: tabular-nums;
        }
        .clk {
          font-variant-numeric: tabular-nums;
        }
        .tb-stat {
          display: flex;
          flex-direction: column;
          line-height: 1.15;
          text-align: right;
        }
        .tb-k {
          color: var(--amber-dim);
          font-size: 8.5px;
          letter-spacing: 0.16em;
          text-transform: uppercase;
        }
        .tb-v {
          color: #e7e3d6;
          font-size: 11px;
          letter-spacing: 0.04em;
        }
        .idle-toggle {
          flex: 0 0 auto;
          height: 32px;
          padding: 0 11px;
          border-radius: 8px;
          border: 1px solid rgba(255, 180, 60, 0.3);
          background: rgba(255, 180, 60, 0.06);
          color: var(--amber-dim);
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          gap: 6px;
          line-height: 1;
          font-family: var(--term-font);
          letter-spacing: 0.04em;
          transition: background 120ms ease, color 120ms ease, border-color 120ms ease;
        }
        .idle-toggle:hover {
          background: rgba(255, 180, 60, 0.14);
        }
        .idle-toggle.on {
          color: var(--amber);
          border-color: rgba(255, 180, 60, 0.55);
          background: rgba(255, 180, 60, 0.16);
        }
        .idle-toggle svg {
          width: 16px;
          height: 16px;
          flex: 0 0 auto;
          display: block;
        }
        .idle-label {
          display: inline-flex;
          align-items: center;
          line-height: 1;
          font-size: 10px;
          letter-spacing: 0.16em;
          text-transform: uppercase;
        }
        .idle-state {
          display: inline-flex;
          align-items: center;
          line-height: 1;
          font-size: 11px;
          font-weight: 700;
          font-variant-numeric: tabular-nums;
        }

        @media (max-width: 768px) {
          .idle-label {
            display: none;
          }
        }

        @keyframes dotPulse {
          0%,
          100% {
            opacity: 0.55;
          }
          50% {
            opacity: 1;
          }
        }
        @media (prefers-reduced-motion: reduce) {
          .live-dot {
            animation: none;
          }
        }

        @media (max-width: 768px) {
          .tb-right {
            gap: 12px;
          }
          .tb-stat {
            display: none;
          }
        }
      `}</style>
    </header>
  );
}
