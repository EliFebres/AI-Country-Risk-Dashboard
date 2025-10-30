// /components/Sidebar/RiskSidebar.tsx
'use client';

import { useEffect } from 'react';
import RiskReadingSection from './Sidebar/RiskReadingSection';
import AiSummary from './Sidebar/AiSummary';

type Props = {
  open: boolean;
  onClose: () => void;
  country: { name: string; risk: number; prevRisk?: number; iso2?: string } | null;
  durationMs?: number;
  easing?: string;
};

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

  const panelWidth = 'min(600px, 40vw)';
  const fadeMs = Math.max(120, Math.round(durationMs * 0.6));
  const flagSrc = country?.iso2 ? `/flags/${country.iso2.toUpperCase()}.svg` : null;

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
                <h3></h3>
                <RiskReadingSection
                  countryName={country?.name}
                  iso2={country?.iso2}
                  currentRisk={country?.risk}
                  prevRisk={country?.prevRisk}
                  active={open}
                />
              </section>

              <div className="custom-divider" />

              <section className="card">
                <h3>Ai Summary (GPT 4o)</h3>
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
          /* Enable container queries so sizes respond to sidebar width */
          container-type: inline-size;
        }
        .sidebar.closed { clip-path: inset(0 100% 0 0); opacity: 0; }
        .sidebar.open   { clip-path: inset(0 0 0 0);   opacity: 1; }

        /* Align header content's left edge with the text inside sections:
           16px (.content) + 12px (.card horizontal padding) = 28px */
        .bar {
          display: flex; align-items: center;
          padding: 14px 16px 14px calc(16px + 12px);
          /* divider handled by .header-divider below */
        }

        /* Shared responsive scale for title/flag; 1cqw = 1% of sidebar width */
        .titleRow {
          display: inline-flex; align-items: center; gap: 10px;
          min-width: 0;                 /* allow text ellipsis */
          font-size: clamp(20px, 2.4cqw, 34px);
          line-height: 1;               /* 1em line box */
          padding: 0.6em 0;             /* vertical padding as requested */
        }

        /* Country name matches requested size */
        .countryName {
          font-size: 1.3em;
          line-height: 1;
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        }

        /* Square flag box at the same height as the title (1.3em) */
        .flagBox {
          width: 2.1em;
          height: 1.3em;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          border-radius: 3px;
          overflow: hidden;
          background: rgba(255,255,255,0.06);
          box-shadow: inset 0 0 0 1px rgba(255,255,255,0.08);
          flex: 0 0 auto;
          margin-inline-end: 0.4em;
        }

        /* Image fits the square without distortion */
        .flag {
          width: 100%;
          height: 100%;
          object-fit: cover;
          object-position: 50% 50%;
          display: block;
        }

        .content { padding: 16px; overflow-y: auto; }
        .muted { opacity: 0.7; }

        .card { margin-bottom: 16px; padding: 10px 12px; }
        .card h3 { margin: 0 0 8px; font-size: 18px; opacity: 0.9; font-weight: bold; }

        /* Existing section divider */
        .custom-divider {
          width: 95%;
          height: 1px;
          background: rgba(255, 255, 255, 0.18);
          margin: 16px auto;
        }

        /* Header variant: same look, aligned to content text column */
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
