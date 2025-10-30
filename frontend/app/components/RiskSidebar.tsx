// /components/Sidebar/RiskSidebar.tsx
'use client';

import { useEffect, useMemo } from 'react';
import RiskReadingSection from './RiskSidebar/RiskReadingSection';
import EconomicGaugeSection from './RiskSidebar/EconomicGaugeSection';
import AiSummary from './RiskSidebar/AiSummary';

type Props = {
  open: boolean;
  onClose: () => void;
  country: { name: string; risk: number; prevRisk?: number; iso2?: string } | null;
  /** When the current risk data was generated/pulled. Accepts Date, ISO string, or epoch ms. */
  dataTimestamp?: Date | string | number | null;
  durationMs?: number;
  easing?: string;
};

export default function RiskSidebar({
  open,
  onClose,
  country,
  dataTimestamp,
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

  const panelWidth = 'min(600px, 40vw)';
  const fadeMs = Math.max(120, Math.round(durationMs * 0.6));
  const flagSrc = country?.iso2 ? `/flags/${country.iso2.toUpperCase()}.svg` : null;

  // --- Data age (days) ---
  const { daysOld, lastUpdatedLocal } = useMemo(() => {
    if (dataTimestamp == null) return { daysOld: null as number | null, lastUpdatedLocal: null as string | null };
    const dt = dataTimestamp instanceof Date ? dataTimestamp : new Date(dataTimestamp);
    if (isNaN(dt.getTime())) return { daysOld: null, lastUpdatedLocal: null };
    const ms = Date.now() - dt.getTime();
    const d = Math.max(0, Math.floor(ms / (1000 * 60 * 60 * 24)));
    const local = dt.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
    return { daysOld: d, lastUpdatedLocal: local };
  }, [dataTimestamp]);

  const isFresh = typeof daysOld === 'number' ? daysOld < 2 : null;

  // Tooltip copy for the numeric badge
  const ageTitle =
    typeof daysOld === 'number'
      ? `This is the time since the last data refresh. Last update: ${lastUpdatedLocal ?? 'unknown'}`
      : undefined;

  return (
    <>
      {/* Click anywhere off the panel to close */}
      <div className={`backdrop ${open ? 'open' : ''}`} onClick={onClose} aria-hidden={!open} />

      <aside
        role="dialog"
        aria-modal="true"
        aria-hidden={!open}
        aria-label="Country risk details"
        className={`sidebar ${open ? 'open' : 'closed'}`}
        style={
          {
            ['--w' as any]: panelWidth,
            ['--revealMs' as any]: `${durationMs}ms`,
            ['--fadeMs' as any]: `${fadeMs}ms`,
            ['--easing' as any]: easing,
            ['--livePulseMs' as any]: '2200ms', // tweak to speed up / slow down the LIVE blink
          } as React.CSSProperties
        }
      >
        <header className="bar">
          <div className="titleRow">
            {flagSrc && (
              <span className="flagBox" aria-hidden="true">
                <img className="flag" src={flagSrc} alt="" loading="eager" />
              </span>
            )}
            <strong className="countryName">{country?.name ?? '—'}</strong>

            {typeof daysOld === 'number' && (
              <span
                className="dataTracker"
                title={ageTitle}
                aria-label={`Data age ${daysOld} day${daysOld === 1 ? '' : 's'}`}
              >
                {/* PERFECT CIRCLE VIA SVG */}
                <svg
                  className={`statusDot ${isFresh ? 'fresh' : 'stale'}`}
                  viewBox="0 0 10 10"
                  aria-hidden="true"
                  focusable="false"
                >
                  <circle cx="5" cy="5" r="5" />
                </svg>
                <span className="liveLabel">LIVE</span>
                <span className="ageBox" title={ageTitle} aria-label={ageTitle}>
                  {daysOld}d
                </span>
              </span>
            )}
          </div>
        </header>

        {/* Header divider aligned with content column, same look as .custom-divider */}
        <div className="custom-divider header-divider" role="separator" aria-hidden="true" />

        <div className="content">
          {!country ? (
            <p className="muted">Click a country marker to see details.</p>
          ) : (
            <>
              <section className="card">
                {/* Top stats */}
                <RiskReadingSection
                  countryName={country?.name}
                  iso2={country?.iso2}
                  currentRisk={country?.risk}
                  prevRisk={country?.prevRisk}
                  active={open}
                />

                {/* Economic Indicators */}
                <div className="economicSection">
                  {/* <h4 className="sectionTitle">Economic Indicators</h4> */}
                  <EconomicGaugeSection
                    countryName={country?.name}
                    iso2={country?.iso2}
                    active={open}
                  />
                </div>
              </section>

              <div className="custom-divider" />

              <section className="card">
                <h3>AI Summary</h3>
                <AiSummary iso2={country?.iso2} active={open} />
              </section>
            </>
          )}
        </div>
      </aside>

      <style jsx>{`
        :global(*) { box-sizing: border-box; }

        .backdrop {
          position: absolute; inset: 0;
          background: rgba(0, 0, 0, 0.0); opacity: 0;
          transition: opacity var(--fadeMs, 220ms) var(--easing, ease);
          pointer-events: none; z-index: 8;
        }
        .backdrop.open { background: rgba(0, 0, 0, 0.35); opacity: 1; pointer-events: auto; }

        .sidebar {
          position: absolute; top: 0; left: 0; height: 100dvh; width: var(--w);
          background: rgba(14, 14, 14, 0.96); color: #fff;
          border-right: 1px solid rgba(255, 255, 255, 0.08);
          backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px);
          z-index: 10; display: flex; flex-direction: column;
          box-shadow: 0 0 24px rgba(0, 0, 0, 0.35);
          will-change: clip-path, opacity;
          transition: clip-path var(--revealMs, 360ms) var(--easing, ease),
                      opacity var(--fadeMs, 220ms) var(--easing, ease);
          container-type: inline-size;
        }
        .sidebar.closed { clip-path: inset(0 100% 0 0); opacity: 0; }
        .sidebar.open   { clip-path: inset(0 0 0 0);   opacity: 1; }

        .bar {
          display: flex; align-items: center;
          padding: 14px 16px 14px calc(16px + 12px);
        }

        .titleRow {
          display: flex; align-items: center; gap: 10px;
          min-width: 0; width: 100%;
          font-size: clamp(20px, 2.4cqw, 34px);
          line-height: 1;
          padding: 0.8em 0;
        }

        .countryName {
          font-size: 1.3em;
          line-height: 1;
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
          flex: 1 1 auto; min-width: 0;
        }

        .dataTracker {
          display: inline-flex; align-items: center; gap: 6px;
          font-size: 0.75em; opacity: 0.85; letter-spacing: 0.02em;
          flex: 0 0 auto; margin-inline-start: auto;
        }
        .statusDot { width: 8px; height: 8px; flex: 0 0 10px; display: inline-block; }
        .statusDot circle { fill: rgba(255, 255, 255, 0.28); }

        /* ON (fresh) — red with a slow pulse */
        .statusDot.fresh circle { fill: #ff2d55; animation: dotPulse var(--livePulseMs, 2200ms) ease-in-out infinite; }
        .statusDot.fresh { filter: drop-shadow(0 0 6px rgba(255, 45, 85, 0.55)); }

        /* OFF (stale) — muted gray, no animation */
        .statusDot.stale circle { fill: rgba(255, 255, 255, 0.28); }

        /* Respect reduced motion */
        @media (prefers-reduced-motion: reduce) {
          .statusDot.fresh circle { animation: none; }
        }

        /* Keyframes for a gentle blink / breathing effect */
        @keyframes dotPulse {
          0%, 100% { opacity: 0.55; }
          50%      { opacity: 1; }
        }

        .liveLabel { text-transform: uppercase; font-weight: 700; opacity: 0.9; }
        .ageBox {
          display: inline-flex; align-items: center; justify-content: center;
          padding: 0.15em 0.4em; border-radius: 4px;
          background: rgba(0, 0, 0, 0.28);
          border: 1px solid rgba(255, 255, 255, 0.06);
          font-weight: 600; line-height: 1; min-width: 2.1em; text-align: center;
        }

        .flagBox {
          width: 2.1em; height: 1.2em; display: inline-flex; align-items: center; justify-content: center;
          border-radius: 3px; overflow: hidden; background: rgba(255,255,255,0.06);
          box-shadow: inset 0 0 0 1px rgba(255,255,255,0.08);
          flex: 0 0 auto; margin-inline-end: 0.3em;
        }
        .flag { width: 100%; height: 100%; object-fit: cover; object-position: 50% 50%; display: block; }

        .content { padding: 16px; overflow-y: auto; }
        .muted { opacity: 0.7; }

        .card { margin-bottom: 16px; padding: 10px 12px; }
        .card h3 { margin: 0 0 8px; font-size: 18px; opacity: 0.9; font-weight: bold; }

        /* ⬇️ Subtle spacing + sub-title styling for Economic Gauges */
        .economicSection { margin-top: 1.5em; }
        .sectionTitle {
          margin: 10px 0 6px;
          font-size: 15px;
          font-weight: 700;
          letter-spacing: 0.02em;
          opacity: 0.9;
        }

        .custom-divider {
          width: 95%;
          height: 1px;
          background: rgba(255, 255, 255, 0.18);
          margin: 16px auto;
        }

        .custom-divider.header-divider {
          background: rgba(255, 255, 255, 0.18);
          height: 1px;
          width: calc(100% - (16px + 12px) - 16px); /* left: 28px, right: 16px */
          margin: 0 16px 0 calc(16px + 12px);
        }
      `}</style>
    </>
  );
}
