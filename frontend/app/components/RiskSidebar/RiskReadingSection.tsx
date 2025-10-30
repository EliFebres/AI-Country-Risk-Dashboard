'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts';

/** risk.json entry */
type RiskEntry = {
  name: string;
  lngLat: [number, number];
  risk: number;                 // latest
  prevRisk?: number;            // convenience: most-recent prior value
  prevRiskSeries?: number[];    // all prior values, newest→oldest (excludes current)
  iso2?: string;
};

/** Cache to avoid refetch storms */
let RISK_CACHE: RiskEntry[] | null = null;

/** utils */
function colorForRisk(r: number) {
  if (r > 0.7) return '#ff2d55';
  if (r >= 0.5) return '#ffd60a';
  return '#39ff14';
}
const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

type Props = {
  countryName?: string | null;
  iso2?: string | null;
  active?: boolean;
  currentRisk?: number | null;
  prevRisk?: number | null;
};

/** Top stats row: left = Current/Avg (with superscript delta); right = modern area chart */
export default function RiskReadingSection({
  countryName,
  iso2,
  active = true,
  currentRisk: currentRiskProp,
  prevRisk: prevRiskProp,
}: Props) {
  const [statsLoading, setStatsLoading] = useState(false);
  const [statsError, setStatsError] = useState<string | null>(null);
  const [stats, setStats] = useState<{
    currentRisk: number | null;
    avgCurrent: number | null;
    history: number[]; // oldest→newest inclusive of current
    delta: number | null; // current - previous
  } | null>(null);

  // unique gradient id to avoid collisions if multiple sidebars mount
  const gradId = useMemo(() => {
    const base = (iso2 || countryName || 'risk').toString().replace(/\s+/g, '-').toUpperCase();
    return `riskGrad-${base}`;
  }, [iso2, countryName]);

  useEffect(() => {
    let cancelled = false;

    async function fetchRiskJson(preferFresh: boolean) {
      const res = await fetch('/api/risk.json', {
        cache: preferFresh ? 'no-store' : 'force-cache',
        headers: { accept: 'application/json' },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const payload = (await res.json()) as RiskEntry[] | RiskEntry;
      return Array.isArray(payload) ? payload : [payload];
    }

    async function ensureRiskStats() {
      setStatsError(null);
      setStats(null);

      if (!active) return;
      if (!countryName && !iso2) return;

      try {
        setStatsLoading(true);

        if (!RISK_CACHE) {
          RISK_CACHE = await fetchRiskJson(false);
        }

        const isoU = iso2?.toUpperCase() || '';
        const norm = (s: string) => s.trim().toLowerCase();

        const findEntry = () => {
          let e: RiskEntry | undefined;
          if (isoU) e = RISK_CACHE!.find((c) => (c.iso2 || '').toUpperCase() === isoU);
          if (!e && countryName) e = RISK_CACHE!.find((c) => norm(c.name) === norm(countryName));
          return e;
        };

        let entry = findEntry();

        // If cached JSON is stale and missing prevRiskSeries, re-fetch fresh once
        if (entry && (!entry.prevRiskSeries || entry.prevRiskSeries.length === 0)) {
          RISK_CACHE = await fetchRiskJson(true);
          entry = findEntry();
        }

        // Build history: [...prevRiskSeries reversed, risk]
        let history: number[] = [];
        let currentRisk: number | null = null;
        let delta: number | null = null;

        if (entry) {
          const prior = (entry.prevRiskSeries ?? []).slice().reverse(); // oldest→newest
          const latest = entry.risk;
          history = [...prior, latest].filter((v) => typeof v === 'number' && Number.isFinite(v));
          currentRisk = typeof latest === 'number' ? latest : null;

          // delta = latest - previous (immediate predecessor)
          const prevImmediate =
            prior.length > 0
              ? prior[prior.length - 1]
              : (typeof entry.prevRisk === 'number' ? entry.prevRisk : null);
          if (typeof latest === 'number' && typeof prevImmediate === 'number') {
            delta = latest - prevImmediate;
          }
        } else {
          // fallback to props if entry not found
          const cr =
            (currentRiskProp ?? undefined) !== undefined
              ? (currentRiskProp as number | null)
              : null;
          const pr =
            (prevRiskProp ?? undefined) !== undefined
              ? (prevRiskProp as number | null)
              : null;

          currentRisk = typeof cr === 'number' ? cr : null;
          if (typeof cr === 'number') history = [cr];
          if (typeof pr === 'number') {
            history = [pr, ...history];
            if (typeof cr === 'number') delta = cr - pr;
          }
        }

        // Averages across all countries (current)
        const values = (RISK_CACHE ?? [])
          .map((r) => r.risk)
          .filter((v) => Number.isFinite(v)) as number[];
        const avgCurrent = values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;

        if (!cancelled) {
          setStats({ currentRisk, avgCurrent, history, delta });
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

  const currentColor =
    typeof stats?.currentRisk === 'number' ? colorForRisk(stats.currentRisk) : '#9cc2ff';

  // transform for Recharts
  const chartData = useMemo(
    () => (stats?.history ?? []).map((v, i) => ({ idx: i, v: clamp01(v) })),
    [stats?.history]
  );

  const deltaClass =
    stats?.delta == null
      ? 'flat'
      : stats.delta > 0
      ? 'up'
      : stats.delta < 0
      ? 'down'
      : 'flat';

  const deltaSign = stats?.delta != null && stats.delta < 0 ? '−' : '+'; // U+2212 minus for better kerning
  const deltaText =
    stats?.delta == null ? null : `${deltaSign}\u2009${Math.abs(stats.delta).toFixed(2)}`; // U+2009 thin space

  return (
    <>
      <div className="statsRow" aria-label="Risk stats">
        {/* LEFT: Current + Avg with superscript delta */}
        <div className="statsCol">
          <div className="bigTitle">Current Risk</div>
          {statsLoading ? (
            <div className="bigValue muted">Loading…</div>
          ) : statsError ? (
            <div className="bigValue muted">—</div>
          ) : (
            <>
              <div className="bigValue">
                <span style={{ color: currentColor }}>
                  {typeof stats?.currentRisk === 'number' ? stats.currentRisk.toFixed(2) : '—'}
                </span>
                {deltaText && (
                  <sup
                    className={`delta ${deltaClass}`}
                    aria-label={`Change since previous reading ${deltaText}`}
                    title={`Change since previous reading: ${deltaText}`}
                  >
                    {deltaText}
                  </sup>
                )}
              </div>
              <div className="pill" aria-label="Average current risk">
                World Average:&nbsp;
                <strong>{typeof stats?.avgCurrent === 'number' ? stats.avgCurrent.toFixed(2) : '—'}</strong>
              </div>
            </>
          )}
        </div>

        {/* RIGHT: Modern area chart (no labels/legend) */}
        <div className="statsCol rightCol">
          {statsLoading ? (
            <div className="bigValue muted">Loading…</div>
          ) : statsError ? (
            <div className="bigValue muted">—</div>
          ) : chartData.length > 0 ? (
            <div className="chartWrap">
              <ResponsiveContainer width="100%" height={120}>
                <AreaChart data={chartData} margin={{ left: 0, right: 0, top: 8, bottom: 0 }}>
                  <defs>
                    <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={currentColor} stopOpacity={0.45} />
                      <stop offset="100%" stopColor={currentColor} stopOpacity={0} />
                    </linearGradient>
                  </defs>

                  <CartesianGrid stroke="rgba(255,255,255,0.12)" vertical={false} strokeDasharray="3 5" />
                  <XAxis dataKey="idx" hide />
                  <YAxis domain={[0, 1]} hide />

                  <Tooltip
                    cursor={{ stroke: 'rgba(255,255,255,0.25)', strokeWidth: 1 }}
                    formatter={(val: any) => [(Number(val) as number).toFixed(2), 'Risk']}
                    labelFormatter={() => ''}
                    contentStyle={{
                      background: 'rgba(14,14,14,0.92)',
                      border: '1px solid rgba(255,255,255,0.08)',
                      borderRadius: 8,
                      padding: '6px 8px',
                      color: '#fff',
                    }}
                  />

                  <Area
                    type="monotone"
                    dataKey="v"
                    stroke={currentColor}
                    strokeWidth={2.2}
                    fill={`url(#${gradId})`}
                    dot={false}
                    activeDot={{ r: 3 }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="bigValue muted" style={{ fontSize: '1.2em' }}>
              No history
            </div>
          )}
        </div>
      </div>

      <style jsx>{`
        .muted { opacity: 0.7; }

        .statsRow {
          display: flex;
          width: 100%;
          justify-content: space-between;
          align-items: flex-start;
          gap: 8px;
        }
        .statsCol {
          flex: 1 1 0;
          padding: 15px 20px;
          padding-top: 0px;
          display: flex;
          flex-direction: column;
        }
        .rightCol {
          text-align: right;
          align-items: stretch;
        }
        .chartWrap { width: 100%; }

        @media (max-width: 520px) {
          .statsRow { flex-direction: column; }
          .rightCol { text-align: left; align-items: stretch; }
        }

        .statsCol:first-child { padding-left: 0; }
        .statsCol:last-child  { padding-right: 0; }

        .bigTitle {
          font-size: 1.95em;
          line-height: 1;
          letter-spacing: 0.4px;
          color: rgba(255, 255, 255, 0.9);
          margin-bottom: 0.1em;
        }
        .bigValue {
          display: inline-flex;
          align-items: baseline;
          gap: 6px;
          font-size: 3em;
          font-weight: 800;
          line-height: 1.1;
          margin: 2px 0 8px 0;
          color: rgba(255,255,255,0.95);
          text-shadow: 0 0 6px rgba(0,0,0,0.3);
        }
        .delta {
          font-size: 0.35em;     /* superscript scale */
          font-weight: 800;
          vertical-align: super; /* ensure superscript position */
          line-height: 1;
          opacity: 0.95;
          transform: translateY(-1em);
        }
        .delta.up   { color: #ff2d55; }  /* worse (up) */
        .delta.down { color: #39ff14; }  /* better (down) */
        .delta.flat { color: rgba(255,255,255,0.7); }
        .pill {
          display: inline-block;
          padding: 4px 5px;
          font-size: 12px;
          line-height: 1;
          color: rgba(255,255,255,0.9);
        }
      `}</style>
    </>
  );
}
