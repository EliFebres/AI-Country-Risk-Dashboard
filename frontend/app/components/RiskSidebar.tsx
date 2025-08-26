'use client';

import { useEffect, useState } from 'react';

type Props = {
  open: boolean;
  onClose: () => void;
  country: { name: string; risk: number; iso2?: string } | null;
  /** Total duration (ms) for the clip-path reveal. Default 360. */
  durationMs?: number;
  /** CSS easing for both clip-path and opacity transitions. Default 'ease'. */
  easing?: string;
};

type SummaryEntry = { country_iso2: string; bullet_summary: string };

/** Indicator names as written in indicator_latest.json */
type IndicatorName =
  | 'Rule of law (z-score)'
  | 'Inflation (% y/y)'
  | 'Interest payments (% revenue)'
  | 'GDP per-capita growth (% y/y)';

type IndicatorSnapshot = { year: number; value: number; unit?: string };

type CountryIndicatorLatest = {
  iso2: string;
  name: string;
  values: Partial<Record<IndicatorName, IndicatorSnapshot>>;
};

/** Cache indicator_latest.json in-module to avoid re-fetching repeatedly */
let INDICATOR_CACHE: CountryIndicatorLatest[] | null = null;

/** Map-style color thresholds (higher = riskier) */
function colorForRisk(r: number) {
  if (r > 0.7) return '#ff2d55';   // red
  if (r >= 0.5) return '#ffd60a';  // yellow
  return '#39ff14';                // green
}

/** Clamp to [0,1] */
const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

/** Heuristic normalization → “risk-like” progress in [0..1] (higher = worse) */
function progressForIndicator(name: IndicatorName, val: number): number {
  switch (name) {
    case 'Rule of law (z-score)':
      // Typical z range ≈ [-2.5, +2.5]; lower is worse (risk ↑).
      return clamp01((2.5 - val) / 5);
    case 'Inflation (% y/y)':
      // 0–20% maps to 0–1; >20% clamps at 1 (severe).
      return clamp01(val / 20);
    case 'Interest payments (% revenue)':
      // ~25%+ considered severe.
      return clamp01(val / 25);
    case 'GDP per-capita growth (% y/y)':
      // Strong growth better; contraction worse. 4% green, -6% red.
      return clamp01((4 - val) / 10);
    default:
      return 0.5;
  }
}

/** Formatting for the inner text value shown in the gauge (add % where appropriate) */
function formatValue(name: IndicatorName, snap?: IndicatorSnapshot): string {
  if (!snap) return '—';
  const v = snap.value;
  switch (name) {
    case 'Rule of law (z-score)':
      return v.toFixed(2);
    case 'Inflation (% y/y)':
    case 'Interest payments (% revenue)':
    case 'GDP per-capita growth (% y/y)':
      return `${v.toFixed(1)}%`;
    default:
      return String(v);
  }
}

/** Short labels for aria/titles (may be multi-word) */
function shortLabel(name: IndicatorName): string {
  switch (name) {
    case 'Rule of law (z-score)': return 'Rule of Law';
    case 'Inflation (% y/y)': return 'Inflation';
    case 'Interest payments (% revenue)': return 'Interest Burden';
    case 'GDP per-capita growth (% y/y)': return 'GDP per Capita';
  }
}

/** Captions under markers */
function oneWordLabel(name: IndicatorName): string {
  switch (name) {
    case 'Rule of law (z-score)': return 'Rule of Law';
    case 'Inflation (% y/y)': return 'Inflation';
    case 'Interest payments (% revenue)': return 'Interest Burden';
    case 'GDP per-capita growth (% y/y)': return 'GDP';
  }
}

/** Consistent gauge size for ALL circles */
const GAUGE_SIZE = 60;

/** Mini circular gauge (map-marker style) with a caption below */
function MiniGauge(props: {
  title: string;        // e.g., "Rule of Law" (for tooltip/aria)
  caption: string;      // text under the circle
  valueText: string;
  progress: number;     // 0..1
  size?: number;        // px
  trackAlpha?: number;
  aria?: string;
}) {
  const {
    title,
    caption,
    valueText,
    progress,
    size = GAUGE_SIZE,
    trackAlpha = 0.15,
    aria
  } = props;

  const stroke = 5;
  const r = (size - stroke) / 2;
  const cx = size / 2;
  const cy = size / 2;
  const circumference = 2 * Math.PI * r;
  const offset = circumference * (1 - clamp01(progress));
  const ringColor = colorForRisk(progress);
  const fontSize = Math.max(11, Math.round(size * 0.22)); // scales with size

  return (
    <div
      className="gaugeItem"
      title={title}
      aria-label={aria || title}
      style={{
        width: 'max-content', // grow to fit caption
        minWidth: size,       // never smaller than the circle
        margin: '0 auto',
      }}
    >
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="gaugeSvg"
        style={{ display: 'block', margin: '0 auto' }}
      >
        <circle cx={cx} cy={cy} r={r} fill="none" stroke={`rgba(255,255,255,${trackAlpha})`} strokeWidth={stroke} />
        <circle
          cx={cx}
          cy={cy}
          r={r}
          fill="none"
          stroke={ringColor}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${circumference} ${circumference}`}
          strokeDashoffset={offset}
          transform={`rotate(-90 ${cx} ${cy})`}
        />
        <circle cx={cx} cy={cy} r={r - stroke / 2} fill="#4a4a4a" stroke="rgba(255,255,255,0.25)" strokeWidth={1} />
        <text
          x={cx}
          y={cy}
          textAnchor="middle"
          dominantBaseline="middle"
          fontSize={fontSize}
          fontFamily='system-ui, -apple-system, Segoe UI, Roboto, Arial, "Noto Sans", sans-serif'
          fontWeight={700}
          fill="#ffffff"
          stroke="rgba(0,0,0,0.6)"
          strokeWidth={0.9}
          style={{ paintOrder: 'stroke fill' } as any}
        >
          {valueText}
        </text>
      </svg>

      {/* Caption centered and confined to the same width as the circle */}
      <div
        className="gaugeCaption"
        style={{
          width: '100%',
          textAlign: 'center',
          fontSize: 11,
          opacity: 0.7,
          letterSpacing: '0.2px',
          whiteSpace: 'nowrap',          // allow wrap so long labels don't shift visual center
          lineHeight: 1.05,
          overflow: 'hidden',
          marginTop: 8,
        }}
        aria-hidden="true"
      >
        {caption}
      </div>
    </div>
  );
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

  // Indicator state for selected country
  const [indicators, setIndicators] = useState<CountryIndicatorLatest | null>(null);
  const [indLoading, setIndLoading] = useState(false);
  const [indError, setIndError] = useState<string | null>(null);

  // Load AI summary (risk_summary.json)
  useEffect(() => {
    let cancelled = false;

    async function load() {
      setSumError(null);
      setSummary(null);
      if (!open || !country?.iso2) return;

      setSumLoading(true);
      try {
        const res = await fetch(`/api/risk_summary.json`, {
          cache: 'no-store',
          headers: { accept: 'application/json' },
        });
        if (!res.ok) {
          if (!cancelled) setSumError(`Summary not available (${res.status})`);
          return;
        }
        const data = (await res.json()) as SummaryEntry[] | SummaryEntry;
        const list = Array.isArray(data) ? data : [data];
        const iso = country.iso2.toUpperCase();

        const hit = list.find(
          (e) => e.country_iso2?.toUpperCase() === iso && typeof e.bullet_summary === 'string'
        );
        if (!cancelled) setSummary(hit?.bullet_summary?.trim() || null);
      } catch {
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

  // Load indicator_latest.json (cache once), then select the country
  useEffect(() => {
    let cancelled = false;

    async function ensureIndicatorsLoaded() {
      setIndError(null);
      setIndicators(null);
      if (!open || !country) return;

      try {
        setIndLoading(true);

        if (!INDICATOR_CACHE) {
          const res = await fetch('/api/indicator_latest.json', {
            cache: 'no-store',
            headers: { accept: 'application/json' },
          });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const payload = (await res.json()) as CountryIndicatorLatest[] | CountryIndicatorLatest;
          INDICATOR_CACHE = Array.isArray(payload) ? payload : [payload];
        }

        const iso = country.iso2?.toUpperCase();
        const norm = (s: string) => s.trim().toLowerCase();

        let hit: CountryIndicatorLatest | undefined;
        if (iso) {
          hit = INDICATOR_CACHE.find((c) => (c.iso2 || '').toUpperCase() === iso);
        }
        if (!hit) {
          hit = INDICATOR_CACHE.find((c) => norm(c.name) === norm(country.name));
        }

        if (!cancelled) {
          if (hit) setIndicators(hit);
          else setIndError('No indicator data found for this country.');
        }
      } catch {
        if (!cancelled) setIndError('Failed to load indicator data');
      } finally {
        if (!cancelled) setIndLoading(false);
      }
    }

    ensureIndicatorsLoaded();
    return () => {
      cancelled = true;
    };
  }, [open, country?.iso2, country?.name]);

  const panelWidth = 'min(600px, 40vw)';
  const fadeMs = Math.max(120, Math.round(durationMs * 0.6));
  const flagSrc = country?.iso2 ? `/flags/${country.iso2.toUpperCase()}.svg` : null;

  // Desired display order
  const ORDER: IndicatorName[] = [
    'Rule of law (z-score)',
    'Inflation (% y/y)',
    'Interest payments (% revenue)',
    'GDP per-capita growth (% y/y)',
  ];

  // Build gauge items (if we have data)
  const gaugeItems =
    indicators
      ? ORDER.map((name) => {
          const snap = indicators.values[name];
          const valText = formatValue(name, snap);
          const progress =
            typeof snap?.value === 'number' ? progressForIndicator(name, snap.value) : 0.0;
          return {
            key: name,
            title: shortLabel(name),
            caption: oneWordLabel(name),
            valueText: valText,
            progress,
            aria: `${shortLabel(name)} ${valText}`,
          };
        })
      : [];

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

          {/* TITLE: country name (left) + flag (right). */}
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
              {/* RISK READING — even spacing, full width, same circle size, captions centered */}
              <section className="card">
                <h3>Risk Reading</h3>

                {indLoading ? (
                  <p className="muted">Loading indicators…</p>
                ) : indError ? (
                  <p className="muted">{indError}</p>
                ) : indicators ? (
                  <div className="gaugeGrid" role="list">
                    {gaugeItems.map((g) => (
                      <div role="listitem" key={g.key} className="gaugeCell">
                        <MiniGauge
                          title={g.title}
                          caption={g.caption}
                          valueText={g.valueText}
                          progress={g.progress}
                          aria={g.aria}
                          size={GAUGE_SIZE}
                        />
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="muted">No indicator data yet.</p>
                )}
              </section>

              <div className="custom-divider"></div>

              <section className="card">
                <h3>Ai Summary (GPT 4o)</h3>
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
          flex: 1 1 auto;
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
          width: 65px;
          height: 65px;
          display: block;
          border-radius: 2px;
          object-fit: contain;
          flex: 0 0 auto;
        }

        .content { padding: 16px; overflow-y: auto; }
        .muted { opacity: 0.7; }

        .card {
          margin-bottom: 16px;
          padding: 10px 12px;
        }
        .card h3 { margin: 0 0 8px; font-size: 18px; opacity: 0.9; font-weight: bold; }
        .card p, .card ul { margin: 0; opacity: 0.9; }

        .custom-divider {
          width: 95%;
          height: 1px;
          background: rgba(255,255,255,0.18);
          margin: 16px auto;
        }

        /* Full-width, even-spaced grid for markers */
        .gaugeGrid {
          width: 100%;
          display: grid;
          grid-template-columns: repeat(2, 1fr); /* even columns on small screens */
          gap: 20px;                              /* even spacing between markers */
          justify-items: center;                  /* center markers within their cells */
          align-items: center;                    /* vertical centering */
          margin-top: 10px;
        }
        @media (min-width: 680px) {
          .gaugeGrid { grid-template-columns: repeat(4, 1fr); } /* four even columns on wider screens */
        }

        /* Each cell stretches to fill its grid track; marker centered inside */
        .gaugeCell {
          width: 100%;
          display: flex;
          justify-content: center;
          align-items: center;
        }

        .gaugeItem {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 6px; /* base space between circle and caption; inline caption margin adds a touch more */
        }
        .gaugeSvg {
          display: block;
        }
        .gaugeCaption {
          text-align: center; /* retained for specificity, main styles are inline */
        }
      `}</style>
    </>
  );
}
