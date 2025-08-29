'use client';

import { useEffect, useState } from 'react';

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

/** Clamp to [0,1] */
const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

/** Map-style color thresholds (higher = riskier) */
function colorForRisk(r: number) {
  if (r > 0.7) return '#ff2d55';
  if (r >= 0.5) return '#ffd60a';
  return '#39ff14';
}

/** Heuristic normalization → progress in [0..1] (higher = worse) */
function progressForIndicator(name: IndicatorName, val: number): number {
  switch (name) {
    case 'Rule of law (z-score)':
      // Better when higher; normalize roughly from [-2.5, +2.5]
      return clamp01((2.5 - val) / 5);
    case 'Inflation (% y/y)':
      // 20% ~ max risk
      return clamp01(val / 20);
    case 'Interest payments (% revenue)':
      // 25% of revenue ~ max risk
      return clamp01(val / 25);
    case 'GDP per-capita growth (% y/y)':
      // Better when higher; 4% OK, -6% bad
      return clamp01((4 - val) / 10);
    default:
      return 0.5;
  }
}

/** Value formatting */
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

/** Short labels for aria/titles */
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

const GAUGE_SIZE = 60;

function MiniGauge(props: {
  title: string;
  caption: string;
  valueText: string;
  progress: number;
  size?: number;
  trackAlpha?: number;
  aria?: string;
}) {
  const {
    title, caption, valueText, progress,
    size = GAUGE_SIZE, trackAlpha = 0.15, aria
  } = props;

  const stroke = 5;
  const r = (size - stroke) / 2;
  const cx = size / 2;
  const cy = size / 2;
  const circumference = 2 * Math.PI * r;
  const offset = circumference * (1 - clamp01(progress));
  const ringColor = colorForRisk(progress);
  const fontSize = Math.max(11, Math.round(size * 0.22));

  return (
    <div
      className="gaugeItem"
      title={title}
      aria-label={aria || title}
      style={{ width: 'max-content', minWidth: size, margin: '0 auto' }}
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
          cx={cx} cy={cy} r={r} fill="none" stroke={ringColor} strokeWidth={stroke}
          strokeLinecap="round" strokeDasharray={`${circumference} ${circumference}`}
          strokeDashoffset={offset} transform={`rotate(-90 ${cx} ${cy})`}
        />
        <circle cx={cx} cy={cy} r={r - stroke / 2} fill="#4a4a4a" stroke="rgba(255,255,255,0.25)" strokeWidth={1} />
        <text
          x={cx} y={cy} textAnchor="middle" dominantBaseline="middle" fontSize={fontSize}
          fontFamily='system-ui, -apple-system, Segoe UI, Roboto, Arial, "Noto Sans", sans-serif'
          fontWeight={700} fill="#ffffff" stroke="rgba(0,0,0,0.6)" strokeWidth={0.9}
          style={{ paintOrder: 'stroke fill' } as any}
        >
          {valueText}
        </text>
      </svg>

      <div
        className="gaugeCaption"
        style={{
          width: '100%', textAlign: 'center', fontSize: 11, opacity: 0.7,
          letterSpacing: '0.2px', whiteSpace: 'nowrap', lineHeight: 1.05, overflow: 'hidden', marginTop: 8,
        }}
        aria-hidden="true"
      >
        {caption}
      </div>

      <style jsx>{`
        .gaugeItem { display: flex; flex-direction: column; align-items: center; gap: 6px; }
        .gaugeSvg { display: block; }
      `}</style>
    </div>
  );
}

const ORDER: IndicatorName[] = [
  'Rule of law (z-score)',
  'Inflation (% y/y)',
  'Interest payments (% revenue)',
  'GDP per-capita growth (% y/y)',
];

type Props = {
  /** Country display name (fallback if iso2 not matched) */
  countryName?: string | null;
  /** ISO2 code like 'US' (recommended) */
  iso2?: string | null;
  /** If false, component will not fetch (use to pause when sidebar closed) */
  active?: boolean;
};

export default function RiskReadingSection({ countryName, iso2, active = true }: Props) {
  const [indicators, setIndicators] = useState<CountryIndicatorLatest | null>(null);
  const [indLoading, setIndLoading] = useState(false);
  const [indError, setIndError] = useState<string | null>(null);

  // Load indicator_latest.json (cache once), then select the country
  useEffect(() => {
    let cancelled = false;

    async function ensureIndicatorsLoaded() {
      setIndError(null);
      setIndicators(null);

      if (!active) return;
      if (!countryName && !iso2) return;

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

        const isoU = iso2?.toUpperCase() || '';
        const norm = (s: string) => s.trim().toLowerCase();

        let hit: CountryIndicatorLatest | undefined;
        if (isoU) hit = INDICATOR_CACHE.find((c) => (c.iso2 || '').toUpperCase() === isoU);
        if (!hit && countryName) hit = INDICATOR_CACHE.find((c) => norm(c.name) === norm(countryName));

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
    return () => { cancelled = true; };
  }, [active, countryName, iso2]);

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

      <style jsx>{`
        .muted { opacity: 0.7; }

        .gaugeGrid {
          width: 100%;
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 20px;
          justify-items: center;
          align-items: center;
          margin-top: 10px;
        }
        @media (min-width: 680px) {
          .gaugeGrid { grid-template-columns: repeat(4, 1fr); }
        }
        .gaugeCell {
          width: 100%;
          display: flex;
          justify-content: center;
          align-items: center;
        }
        .gaugeCaption { text-align: center; }
      `}</style>
    </>
  );
}
