'use client';

import { useEffect } from 'react';

type Props = {
  open: boolean;
  onClose: () => void;
  country: { name: string; risk: number } | null;
};

function colorForRisk(r: number) {
  if (r > 0.7) return '#ff2d55';   // red
  if (r >= 0.5) return '#ffd60a';  // yellow
  return '#39ff14';                // green
}

export default function RiskSidebar({ open, onClose, country }: Props) {
  // Close on ESC
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const panelWidth = 'min(420px, 25vw)';

  return (
    <aside
      aria-hidden={!open}
      aria-label="Country risk details"
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        height: '100dvh',
        width: panelWidth,
        transform: open ? 'translateX(0)' : 'translateX(-100%)',
        transition: 'transform 260ms ease',
        background: 'rgba(14,14,14,0.96)',
        color: '#fff',
        borderRight: '1px solid rgba(255,255,255,0.08)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        zIndex: 10,
        display: 'flex',
        flexDirection: 'column',
        boxShadow: '0 0 24px rgba(0,0,0,0.35)',
      }}
    >
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '14px 16px',
          borderBottom: '1px solid rgba(255,255,255,0.08)',
        }}
      >
        <button
          onClick={onClose}
          aria-label="Close panel"
          style={{
            width: 36,
            height: 36,
            borderRadius: 12,
            border: '1px solid rgba(255,255,255,0.15)',
            background: 'rgba(255,255,255,0.06)',
            color: '#fff',
            cursor: 'pointer',
            fontSize: 18,
            lineHeight: '36px',
          }}
        >
          ×
        </button>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <strong style={{ fontSize: 18, lineHeight: 1.2 }}>
            {country?.name ?? '—'}
          </strong>
          <span style={{ opacity: 0.7, fontSize: 12 }}>Country risk overview</span>
        </div>
        {country && (
          <span
            title={`Risk ${country.risk.toFixed(2)}`}
            style={{
              marginLeft: 'auto',
              padding: '6px 10px',
              borderRadius: 999,
              border: '1px solid rgba(255,255,255,0.15)',
              background: 'rgba(255,255,255,0.06)',
              fontWeight: 700,
              letterSpacing: 0.2,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <span
              aria-hidden
              style={{
                display: 'inline-block',
                width: 10,
                height: 10,
                borderRadius: '50%',
                background: colorForRisk(country.risk),
              }}
            />
            {country.risk.toFixed(2)}
          </span>
        )}
      </header>

      <div style={{ padding: 16, overflowY: 'auto' }}>
        {!country ? (
          <p style={{ opacity: 0.7 }}>Click a country marker to see details.</p>
        ) : (
          <>
            {/* Stub sections — replace with your real data as you wire it up */}
            <section style={{ marginBottom: 16 }}>
              <h3 style={{ margin: '0 0 8px', fontSize: 14, opacity: 0.9 }}>Summary</h3>
              <p style={{ margin: 0, opacity: 0.85 }}>
                This is where your monthly AI summary for <b>{country.name}</b> will go.
                You can fetch it alongside <code>risk.json</code> or via another API route.
              </p>
            </section>

            <section style={{ marginBottom: 16 }}>
              <h3 style={{ margin: '0 0 8px', fontSize: 14, opacity: 0.9 }}>Signals</h3>
              <ul style={{ margin: 0, paddingLeft: 18, opacity: 0.9 }}>
                <li>Conflict / war</li>
                <li>Political stability</li>
                <li>Governance / corruption</li>
                <li>Macro volatility</li>
                <li>Regulatory uncertainty</li>
              </ul>
            </section>

            <section>
              <h3 style={{ margin: '0 0 8px', fontSize: 14, opacity: 0.9 }}>Last updated</h3>
              <p style={{ margin: 0, opacity: 0.85 }}>End of last month (scheduled run).</p>
            </section>
          </>
        )}
      </div>
    </aside>
  );
}
