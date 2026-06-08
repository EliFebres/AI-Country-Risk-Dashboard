// /components/Sidebar/EconomicGaugeSection.tsx
'use client';

import {
  getIndicatorsFor,
  type CountryIndicatorLatest,
} from '../../lib/dashboard-client';
import { useDashboardEntry } from '../../lib/hooks';
import { colorForRisk } from '../../lib/risk';
import { clamp01 } from '../../lib/format';

/** Indicator names as written in indicator_latest.json */
type IndicatorName =
  | 'Rule of law (z-score)'
  | 'Inflation (% y/y)'
  | 'Interest payments (% revenue)'
  | 'GDP per-capita growth (% y/y)';

type IndicatorSnapshot = { year: number; value: number; unit?: string };

/** ------------------------------------------------------------------------ */
/** HOVER TEXT DICTIONARY — edit here to change tooltip copy for each gauge. */
/** ------------------------------------------------------------------------ */
type IndicatorHoverText = Record<IndicatorName, string>;

const INDICATOR_TOOLTIPS: IndicatorHoverText = {
  'Rule of law (z-score)':
    'Measures quality of contract enforcement, property rights, police, and courts. World Bank estimate (≈ −2.5 to +2.5). Higher is better.',
  'Inflation (% y/y)':
    'Year-over-year consumer price inflation. Lower is generally better (2-3% is typical target).',
  'Interest payments (% revenue)':
    'Government interest costs as % of revenue. Higher indicates greater debt burden.',
  'GDP per-capita growth (% y/y)':
    'Real GDP per person (y/y). Negative growth implies economic contraction.',
};
/** ------------------------------------------------------------------------ */


function colorForGDP(val?: number): string | undefined {
  if (typeof val !== 'number') return undefined;
  if (val > 2) return '#39ff14';
  if (val >= 0) return '#ffd60a';
  return '#ff2d55';
}

/** Heuristic normalization → progress in [0..1] (higher = worse) */
function progressForIndicator(name: IndicatorName, val: number): number {
  switch (name) {
    case 'Rule of law (z-score)':
      return clamp01((2.5 - val) / 5);
    case 'Inflation (% y/y)':
      return clamp01(val / 20);
    case 'Interest payments (% revenue)':
      return clamp01(val / 25);
    case 'GDP per-capita growth (% y/y)':
      // Map +25% -> 0, 0% -> 0.5, -25% -> 1 (clamped)
      return clamp01((25 - val) / 50);
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

const ORDER: IndicatorName[] = [
  'Rule of law (z-score)',
  'Inflation (% y/y)',
  'Interest payments (% revenue)',
  'GDP per-capita growth (% y/y)',
];

const GAUGE_SIZE = 52;

function MiniGauge(props: {
  title: string;
  caption: string;
  valueText: string;
  progress: number;
  size?: number;
  trackAlpha?: number;
  aria?: string;
  ringColor?: string; // optional override for the ring color
  tooltip?: string;   // ← dictionary-provided hover text
}) {
  const {
    title, caption, valueText, progress,
    size = GAUGE_SIZE, trackAlpha = 0.15, aria,
    ringColor: ringColorOverride,
    tooltip,
  } = props;

  const stroke = 5;
  const r = (size - stroke) / 2;
  const cx = size / 2;
  const cy = size / 2;
  const circumference = 2 * Math.PI * r;
  const offset = circumference * (1 - clamp01(progress));
  const ringColor = ringColorOverride ?? colorForRisk(progress);
  const fontSize = Math.max(11, Math.round(size * 0.22));

  return (
    <div
      className="gaugeItem"
      title={tooltip ?? title}
      aria-label={aria || title}
      style={{ width: 'auto', minWidth: size, maxWidth: '100%', margin: '0 auto' }}
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
          width: '100%', textAlign: 'center', fontSize: 9.5, color: 'var(--amber-dim)',
          letterSpacing: '0.06em', textTransform: 'uppercase', whiteSpace: 'nowrap',
          lineHeight: 1.05, overflow: 'hidden', marginTop: 8, textOverflow: 'ellipsis',
        }}
        aria-hidden="true"
      >
        {caption}
      </div>

      <style jsx>{`
        .gaugeItem { display: flex; flex-direction: column; align-items: center; gap: 6px; min-width: 0; }
        .gaugeSvg { display: block; }
      `}</style>
    </div>
  );
}

type Props = {
  /** Country display name (fallback if iso2 not matched) */
  countryName?: string | null;
  /** ISO2 code like 'US' (recommended) */
  iso2?: string | null;
  /** If false, component will not fetch (use to pause when sidebar closed) */
  active?: boolean;
};

/** Sidebar section: four economic-indicator gauges for the selected country. */
export default function EconomicGaugeSection({
  countryName,
  iso2,
  active = true,
}: Props) {
  // Load the shared dashboard payload (cached once), then select this country.
  const {
    data: indicators,
    loading: indLoading,
    error: indError,
  } = useDashboardEntry<CountryIndicatorLatest>(
    active,
    !!(countryName || iso2),
    [active, countryName, iso2],
    (data) => getIndicatorsFor(data, iso2, countryName) ?? null,
    { load: 'Failed to load indicator data', notFound: 'No indicator data found for this country.' }
  );

  // --- Build gauge items ---
  const gaugeItems =
    indicators
      ? ORDER.map((name) => {
          const snap = indicators.values[name];
          const valText = formatValue(name, snap);
          const progress =
            typeof snap?.value === 'number' ? progressForIndicator(name, snap.value) : 0.0;

          const ringColor =
            name === 'GDP per-capita growth (% y/y)'
              ? colorForGDP(snap?.value)
              : undefined;

          return {
            key: name,
            title: shortLabel(name),
            caption: oneWordLabel(name),
            valueText: valText,
            progress,
            ringColor,
            aria: `${shortLabel(name)} ${valText}`,
            tooltip: INDICATOR_TOOLTIPS[name], // ← use dictionary hover text
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
                ringColor={g.ringColor}
                tooltip={g.tooltip}
              />
            </div>
          ))}
        </div>
      ) : (
        <p className="muted">No indicator data yet.</p>
      )}

      <style jsx>{`
        .muted { color: var(--amber-dim); }

        /* Desktop-first grid; use minmax(0,1fr) so children can shrink and not overflow */
        .gaugeGrid {
          width: 100%;
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 22px;
          align-items: center;
          justify-items: center; /* center items within cells */
          margin-top: 12px;
        }

        /* Laptops/tablets: 3 columns */
        @media (max-width: 1024px) {
          .gaugeGrid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
        }

        /* Phones: 2 columns */
        @media (max-width: 760px) {
          .gaugeGrid { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 18px; }
        }

        /* Very narrow phones: 1 column */
        @media (max-width: 380px) {
          .gaugeGrid { grid-template-columns: 1fr; gap: 14px; }
        }

        .gaugeCell {
          width: 100%;
          min-width: 0;  /* critical to prevent overflow */
          display: flex;
          justify-content: center;
          align-items: center;
        }
        .gaugeCaption { text-align: center; }
      `}</style>
    </>
  );
}
