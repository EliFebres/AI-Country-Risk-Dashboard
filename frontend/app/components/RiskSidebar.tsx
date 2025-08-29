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
      <div className={`backdrop ${open ? 'open' : ''}`} onClick={onClose} aria-hidden={!open} />

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
        }
        .sidebar.closed { clip-path: inset(0 100% 0 0); opacity: 0; }
        .sidebar.open   { clip-path: inset(0 0 0 0);   opacity: 1; }

        .bar { display: flex; align-items: center; gap: 12px; padding: 14px 16px;
               border-bottom: 1px solid rgba(255, 255, 255, 0.08); }
        .closeBtn {
          width: 36px; height: 36px; border-radius: 12px;
          border: 1px solid rgba(255, 255, 255, 0.15);
          background: rgba(255, 255, 255, 0.06); color: #fff;
          cursor: pointer; font-size: 18px; line-height: 36px;
        }

        .titleRow { display: flex; align-items: center; justify-content: space-between;
                    gap: 8px; flex: 1 1 auto; min-width: 0; }
        .countryName { font-size: 28px; line-height: 1.2; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .flag { width: 65px; height: 65px; display: block; border-radius: 2px; object-fit: contain; flex: 0 0 auto; }

        .content { padding: 16px; overflow-y: auto; }
        .muted { opacity: 0.7; }

        .card { margin-bottom: 16px; padding: 10px 12px; }
        .card h3 { margin: 0 0 8px; font-size: 18px; opacity: 0.9; font-weight: bold; }

        .custom-divider {
          width: 95%; height: 1px; background: rgba(255, 255, 255, 0.18); margin: 16px auto;
        }
      `}</style>
    </>
  );
}
