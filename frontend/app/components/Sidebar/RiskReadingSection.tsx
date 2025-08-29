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

/** risk.json entry */
type RiskEntry = {
  name: string;
  lngLat: [number, number];
  risk: number;
  prevRisk?: number;
  iso2?: string;
};

/** Caches to avoid refetch storms */
let INDICATOR_CACHE: CountryIndicatorLatest[] | null = null;
let RISK_CACHE: RiskEntry[] | null = null;

/** utils */
const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

function colorForRisk(r: number) {
  if (r > 0.7) return '#ff2d55';
  if (r >= 0.5) return '#ffd60a';
  return '#39ff14';
}

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

const GAUGE_SIZE = 60;

function MiniGauge(props: {
  title: string;
  caption: string;
  valueText: string;
  progress: number;
  size?: number;
  trackAlpha?: number;
  aria?: string;
  ringColor?: string; // optional override for the ring color
}) {
  const {
    title, caption, valueText, progress,
    size = GAUGE_SIZE, trackAlpha = 0.15, aria,
    ringColor: ringColorOverride,
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

  /** Plumbed from parent (optional; we can also look up from risk.json) */
  currentRisk?: number | null;
  prevRisk?: number | null;
};

export default function RiskReadingSection({
  countryName,
  iso2,
  active = true,
  currentRisk: currentRiskProp,
  prevRisk: prevRiskProp,
}: Props) {
  const [indicators, setIndicators] = useState<CountryIndicatorLatest | null>(null);
  const [indLoading, setIndLoading] = useState(false);
  const [indError, setIndError] = useState<string | null>(null);

  const [statsLoading, setStatsLoading] = useState(false);
  const [statsError, setStatsError] = useState<string | null>(null);
  const [stats, setStats] = useState<{
    currentRisk: number | null;
    prevRisk: number | null;
    avgCurrent: number | null;
    avgChange: number | null;
  } | null>(null);

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

  // Load risk.json (for averages, and to fill prevRisk/currentRisk if not passed)
  useEffect(() => {
    let cancelled = false;

    async function ensureRiskStats() {
      setStatsError(null);
      setStats(null);

      if (!active) return;
      if (!countryName && !iso2) return;

      try {
        setStatsLoading(true);

        if (!RISK_CACHE) {
          const res = await fetch('/api/risk.json', {
            cache: 'force-cache', // okay to cache; markers already forced a fresh write/bust
            headers: { accept: 'application/json' },
          });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const payload = (await res.json()) as RiskEntry[] | RiskEntry;
          RISK_CACHE = Array.isArray(payload) ? payload : [payload];
        }

        const isoU = iso2?.toUpperCase() || '';
        const norm = (s: string) => s.trim().toLowerCase();

        let entry: RiskEntry | undefined;
        if (isoU) entry = RISK_CACHE.find((c) => (c.iso2 || '').toUpperCase() === isoU);
        if (!entry && countryName) entry = RISK_CACHE.find((c) => norm(c.name) === norm(countryName));

        const currentRisk = (currentRiskProp ?? undefined) !== undefined
          ? (currentRiskProp as number | null)
          : (entry?.risk ?? null);

        const prevRisk = (prevRiskProp ?? undefined) !== undefined
          ? (prevRiskProp as number | null)
          : (entry?.prevRisk ?? null);

        // Averages
        const values = RISK_CACHE.map(r => r.risk).filter(v => Number.isFinite(v)) as number[];
        const avgCurrent = values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;

        const diffs = RISK_CACHE
          .filter(r => typeof r.prevRisk === 'number')
          .map(r => r.risk - (r.prevRisk as number));
        const avgChange = diffs.length ? diffs.reduce((a, b) => a + b, 0) / diffs.length : null;

        if (!cancelled) {
          setStats({ currentRisk, prevRisk, avgCurrent, avgChange });
        }
      } catch {
        if (!cancelled) setStatsError('Failed to load risk stats');
      } finally {
        if (!cancelled) setStatsLoading(false);
      }
    }

    ensureRiskStats();
    return () => { cancelled = true; };
  }, [active, countryName, iso2, currentRiskProp, prevRiskProp]);

  // --- Build gauge items (unchanged) ---
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
          };
        })
      : [];

  // --- Helpers for the top stats row ---
  const currentColor =
    typeof stats?.currentRisk === 'number' ? colorForRisk(stats.currentRisk) : 'rgba(255,255,255,0.85)';

  const delta =
    typeof stats?.currentRisk === 'number' && typeof stats?.prevRisk === 'number'
      ? stats.currentRisk - stats.prevRisk
      : null;

  const deltaColor =
    delta == null
      ? 'rgba(255,255,255,0.85)'
      : delta > 0
        ? '#ff2d55'   // worse (up)
        : delta < 0
          ? '#39ff14' // better (down)
          : 'rgba(255,255,255,0.85)';

  const arrow =
    delta == null
      ? ''
      : delta > 0
        ? '▲'
        : delta < 0
          ? '▼'
          : '■';

  return (
    <>
      {/* --- New Top Stats Row --- */}
      <div className="statsRow" aria-label="Risk stats">
        <div className="statsCol">
          <div className="smallTitle">Current Ai Risk Rating</div>
          {statsLoading ? (
            <div className="bigValue muted">Loading…</div>
          ) : statsError ? (
            <div className="bigValue muted">—</div>
          ) : (
            <>
              <div className="bigValue" style={{ color: currentColor }}>
                {typeof stats?.currentRisk === 'number' ? stats.currentRisk.toFixed(2) : '—'}
              </div>
              <div className="pill" aria-label="Average current risk">
                Avg Ai Risk Rating:&nbsp;
                <strong>{typeof stats?.avgCurrent === 'number' ? stats.avgCurrent.toFixed(2) : '—'}</strong>
              </div>
            </>
          )}
        </div>

        <div className="statsCol">
          <div className="smallTitle">Change in Ai Risk Rating</div>
          {statsLoading ? (
            <div className="bigValue muted">Loading…</div>
          ) : statsError ? (
            <div className="bigValue muted">—</div>
          ) : (
            <>
              <div className="bigValue" style={{ color: deltaColor }}>
                {delta == null ? '—' : `${arrow} ${delta >= 0 ? '+' : ''}${delta.toFixed(2)}`}
              </div>
              <div className="pill" aria-label="Average change in risk">
                Avg Delta:&nbsp;
                <strong>
                  {typeof stats?.avgChange === 'number'
                    ? `${stats.avgChange >= 0 ? '+' : ''}${stats.avgChange.toFixed(2)}`
                    : '—'}
                </strong>
              </div>
            </>
          )}
        </div>
      </div>

      {/* --- Existing Indicators Grid --- */}
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
                ringColor={g.ringColor}
              />
            </div>
          ))}
        </div>
      ) : (
        <p className="muted">No indicator data yet.</p>
      )}

      <style jsx>{`
        .muted { opacity: 0.7; }

        /* Top stats row */
        .statsRow {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px;
          align-items: start;
          margin: 6px 0 12px 0;
        }
        @media (max-width: 520px) {
          .statsRow { grid-template-columns: 1fr; }
        }
        .statsCol {
          padding: 15px 15px;
          padding-top: 0px;
        }
        .smallTitle {
          font-size: 12px;
          line-height: 1;
          letter-spacing: 0.4px;
          color: rgba(255,255,255,0.7);
          margin-bottom: 6px;
        }
        .bigValue {
          font-size: 34px;
          font-weight: 800;
          line-height: 1.1;
          margin: 2px 0 8px 0;
          color: rgba(255,255,255,0.95);
          text-shadow: 0 0 6px rgba(0,0,0,0.3);
        }
        .pill {
          display: inline-block;
          padding: 4px 5px;
          font-size: 12px;
          line-height: 1;
          // background: rgba(255,255,255,0.10);
          // border: 1px solid rgba(255,255,255,0.12);
          color: rgba(255,255,255,0.9);
        }

        /* Gauges */
        .gaugeGrid {
          width: 100%;
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 20px;
          justify-items: center;
          align-items: center;
          margin-top: 14px;
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
