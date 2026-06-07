// /components/Sidebar/RiskSidebar.tsx
'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import RiskReadingSection from './RiskSidebar/RiskReadingSection';
import EconomicGaugeSection from './RiskSidebar/EconomicGaugeSection';
import AiSummary from './RiskSidebar/AiSummary';
import NewsArticleSection from './RiskSidebar/NewsArticleSection';

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

  const fadeMs = Math.max(120, Math.round(durationMs * 0.6));
  const flagSrc = country?.iso2 ? `/flags/${country.iso2.toUpperCase()}.svg` : null;

  // --- Data age (calendar days) ---
  const DAY_MS = 24 * 60 * 60 * 1000;
  const { daysOld, lastUpdatedLocal } = useMemo(() => {
    if (dataTimestamp == null) {
      return { daysOld: null as number | null, lastUpdatedLocal: null as string | null };
    }
    const dt = dataTimestamp instanceof Date ? dataTimestamp : new Date(dataTimestamp);
    if (isNaN(dt.getTime())) return { daysOld: null, lastUpdatedLocal: null };
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const startOfThatDay = new Date(dt.getFullYear(), dt.getMonth(), dt.getDate()).getTime();
    const d = Math.max(0, Math.round((startOfToday - startOfThatDay) / DAY_MS));
    const local = dt.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
    return { daysOld: d, lastUpdatedLocal: local };
  }, [dataTimestamp]);

  const ageTitle =
    typeof daysOld === 'number'
      ? `Data Last Updated: ${lastUpdatedLocal ?? 'unknown'}`
      : undefined;

  // --- Swipe-to-close for mobile (right → left) ---
  const [dragX, setDragX] = useState(0);
  const touchStartRef = useRef<{ x: number; y: number; t: number } | null>(null);
  const draggingRef = useRef(false);

  const resetDrag = () => setDragX(0);

  const handleTouchStart: React.TouchEventHandler<HTMLElement> = (e) => {
    if (!open) return;
    const t = e.touches[0];
    touchStartRef.current = { x: t.clientX, y: t.clientY, t: performance.now() };
    draggingRef.current = true;
  };

  const handleTouchMove: React.TouchEventHandler<HTMLElement> = (e) => {
    if (!open || !draggingRef.current || !touchStartRef.current) return;
    const t = e.touches[0];
    const dx = t.clientX - touchStartRef.current.x;
    const dy = t.clientY - touchStartRef.current.y;
    if (Math.abs(dx) > Math.abs(dy)) {
      setDragX(Math.max(-100, Math.min(0, dx)));
    }
  };

  const handleTouchEnd: React.TouchEventHandler<HTMLElement> = () => {
    if (!open || !draggingRef.current || !touchStartRef.current) {
      resetDrag();
      return;
    }
    draggingRef.current = false;
    touchStartRef.current = null;
    if (dragX <= -60) onClose();
    resetDrag();
  };

  return (
    <>
      {/* Click anywhere off the panel to close */}
      <div className={`backdrop ${open ? 'open' : ''}`} onClick={onClose} aria-hidden={!open} />

      <aside
        role="dialog"
        aria-modal="true"
        aria-hidden={!open}
        aria-label="Country risk details"
        className={`sidebar-risk ${open ? 'open' : 'closed'}`}
        style={
          {
            ['--revealMs' as string]: `${durationMs}ms`,
            ['--fadeMs' as string]: `${fadeMs}ms`,
            ['--easing' as string]: easing,
            ['--dragX' as string]: `${dragX}px`,
          } as React.CSSProperties
        }
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={() => {
          draggingRef.current = false;
          resetDrag();
        }}
      >
        <button className="risk-close" aria-label="Close details" title="Close" onClick={onClose}>
          ✕
        </button>

        <header className="bar">
          <div className="titleRow">
            {flagSrc && (
              <span className="flagBox" aria-hidden="true">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img className="flag" src={flagSrc} alt="" loading="eager" />
              </span>
            )}
            <strong className="countryName">{country?.name ?? '—'}</strong>

            {typeof daysOld === 'number' && (
              <span className="dataTracker" title={ageTitle} aria-label={ageTitle}>
                <span className="ageBox">Updated {daysOld}d ago</span>
              </span>
            )}
          </div>
        </header>

        <div className="header-divider" role="separator" aria-hidden="true" />

        <div className="content">
          {!country ? (
            <p className="muted">Click a country marker to see details.</p>
          ) : (
            <>
              <section className="card">
                <RiskReadingSection
                  countryName={country?.name}
                  iso2={country?.iso2}
                  currentRisk={country?.risk}
                  prevRisk={country?.prevRisk}
                  active={open}
                />

                <div className="economicSection">
                  <div className="econTitle">Economic Indicators</div>
                  <EconomicGaugeSection
                    countryName={country?.name}
                    iso2={country?.iso2}
                    active={open}
                  />
                </div>
              </section>

              <section className="card">
                <h3>AI Summary</h3>
                <AiSummary iso2={country?.iso2} active={open} />
              </section>

              <section className="card">
                <h3>News</h3>
                <NewsArticleSection iso2={country?.iso2} active={open} />
              </section>
            </>
          )}
        </div>
      </aside>

      <style jsx>{`
        :global(*) {
          box-sizing: border-box;
        }

        .backdrop {
          position: absolute;
          top: var(--top-h);
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0, 0, 0, 0);
          opacity: 0;
          transition: opacity var(--fadeMs, 220ms) var(--easing, ease);
          pointer-events: none;
          z-index: 8;
        }
        .backdrop.open {
          background: rgba(0, 0, 0, 0.35);
          opacity: 1;
          pointer-events: auto;
        }

        .sidebar-risk {
          position: absolute;
          top: var(--top-h);
          bottom: var(--bottom-h);
          left: 0;
          width: var(--w-risk);
          background: var(--term-bg);
          color: #e7e3d6;
          border-right: 1px solid rgba(255, 180, 60, 0.45);
          box-shadow: 12px 0 30px rgba(0, 0, 0, 0.5);
          z-index: 10;
          display: flex;
          flex-direction: column;
          font-family: var(--term-font);
          will-change: clip-path, opacity, transform;
          transition: clip-path var(--revealMs, 360ms) var(--easing, ease),
            opacity var(--fadeMs, 220ms) var(--easing, ease), transform 140ms ease-out;
          container-type: inline-size;
          touch-action: pan-y;
          overscroll-behavior-x: contain;
          transform: translateX(var(--dragX, 0));
        }
        .sidebar-risk.closed {
          clip-path: inset(0 100% 0 0);
          opacity: 0;
          pointer-events: none;
        }
        .sidebar-risk.open {
          clip-path: inset(0 0 0 0);
          opacity: 1;
          pointer-events: auto;
        }

        @media (max-width: 768px) {
          .sidebar-risk {
            width: 100vw;
          }
        }

        .risk-close {
          position: absolute;
          top: 9px;
          right: 12px;
          width: 28px;
          height: 28px;
          border-radius: 6px;
          border: 1px solid rgba(255, 180, 60, 0.3);
          background: rgba(255, 180, 60, 0.08);
          color: var(--amber);
          cursor: pointer;
          font-size: 14px;
          line-height: 1;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          z-index: 3;
          transition: background 120ms var(--easing, ease);
        }
        .risk-close:hover {
          background: rgba(255, 180, 60, 0.16);
        }

        .bar {
          display: flex;
          align-items: center;
          padding: 12px 44px 10px 16px;
          flex: 0 0 auto;
        }
        .titleRow {
          display: flex;
          align-items: center;
          gap: 10px;
          min-width: 0;
          width: 100%;
          font-size: clamp(18px, 2.1cqw, 28px);
          line-height: 1;
          padding: 0.4em 0;
        }
        .countryName {
          font-size: 1.15em;
          line-height: 1.05;
          font-weight: 800;
          letter-spacing: 0.04em;
          text-transform: uppercase;
          color: var(--amber);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          flex: 1 1 auto;
          min-width: 0;
        }
        .flagBox {
          width: 2.1em;
          height: 1.25em;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          border-radius: 2px;
          overflow: hidden;
          background: rgba(255, 180, 60, 0.06);
          box-shadow: inset 0 0 0 1px var(--rule);
          flex: 0 0 auto;
          margin-inline-end: 0.3em;
        }
        .flag {
          width: 100%;
          height: 100%;
          object-fit: cover;
          display: block;
        }
        .dataTracker {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          font-size: 0.5em;
          flex: 0 0 auto;
          margin-inline-start: auto;
        }
        .ageBox {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          padding: 0.3em 0.55em;
          border-radius: 3px;
          background: rgba(255, 180, 60, 0.08);
          border: 1px solid var(--rule);
          color: var(--amber-dim);
          font-weight: 600;
          line-height: 1;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          white-space: nowrap;
        }

        .header-divider {
          background: var(--rule);
          height: 1px;
          width: 100%;
          margin: 0;
        }

        .content {
          padding: 0;
          overflow-y: auto;
          scrollbar-width: none;
          -ms-overflow-style: none;
        }
        .content::-webkit-scrollbar {
          width: 0;
          height: 0;
          display: none;
        }
        .muted {
          color: var(--amber-dim);
        }

        .card {
          margin: 0;
          padding: 13px 14px;
          border-bottom: 1px solid var(--rule);
        }
        .card :global(h3) {
          margin: 0 0 10px;
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          color: var(--amber);
        }
        .card :global(p) {
          margin: 0;
          font-size: 12px;
          line-height: 1.55;
          color: #cfcabb;
          text-wrap: pretty;
        }
        .card :global(.muted) {
          color: var(--amber-dim);
        }

        .economicSection {
          margin-top: 1.4em;
          padding: 0;
        }
        .econTitle {
          font-size: 11px;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          font-weight: 700;
          color: var(--amber);
          margin: 0 0 4px;
        }
      `}</style>
    </>
  );
}
