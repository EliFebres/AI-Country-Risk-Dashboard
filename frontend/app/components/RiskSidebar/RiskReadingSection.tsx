'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts';
import { getRiskCache, primeRiskCache, type CountryRisk } from '../../lib/risk-client';

/** risk.json entry */
type RiskEntry = CountryRisk;

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

  // --- Robust width detection for ResponsiveContainer (prevents zero-width charts)
  const rowRef = useRef<HTMLDivElement>(null);
  const [rowWidth, setRowWidth] = useState(0);
  useEffect(() => {
    const el = rowRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect?.width ?? 0;
      setRowWidth(w);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

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

        let cache = getRiskCache();
        if (!cache) {
          cache = await fetchRiskJson(false);
          primeRiskCache(cache);
        }

        const isoU = iso2?.toUpperCase() || '';
        const norm = (s: string) => s.trim().toLowerCase();

        const findEntry = () => {
          let e: RiskEntry | undefined;
          if (isoU) e = cache!.find((c) => (c.iso2 || '').toUpperCase() === isoU);
          if (!e && countryName) e = cache!.find((c) => norm(c.name) === norm(countryName));
          return e;
        };

        let entry = findEntry();

        // If cached JSON is stale and missing prevRiskSeries, re-fetch fresh once
        if (entry && (!entry.prevRiskSeries || entry.prevRiskSeries.length === 0)) {
          cache = await fetchRiskJson(true);
          primeRiskCache(cache);
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
        const values = (cache ?? [])
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
      <div className="statsRow" aria-label="Risk stats" ref={rowRef}>
        {/* LEFT: Current + Avg with superscript delta */}
        <div className="statsCol leftCol">
          <div className="bigTitle">Risk Rating</div>
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
              {/* Keyed by measured width so ResponsiveContainer recalculates */}
              <ResponsiveContainer key={rowWidth} width="100%" height={120}>
                <AreaChart data={chartData} margin={{ left: 4, right: 4, top: 8, bottom: 0 }}>
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
        .muted { color: var(--amber-dim); }

        .statsRow {
          display: flex;
          width: 100%;
          justify-content: space-between;
          align-items: flex-start;
          gap: 8px;
        }
        .statsCol {
          flex: 1 1 0;
          padding: 0 12px 6px;
          display: flex;
          flex-direction: column;
          min-width: 0; /* allow flex children to shrink (fixes chart invisibility) */
        }
        .leftCol { align-items: flex-start; text-align: left; padding-left: 0; }
        .rightCol { align-items: stretch; text-align: right; padding-right: 0; }
        .chartWrap { width: 100%; min-width: 0; }

        /* MOBILE: stack into two rows and center content */
        @media (max-width: 680px) {
          .statsRow {
            flex-direction: column;
            align-items: center;
            gap: 12px;
          }
          .statsCol {
            width: 100%;
            align-items: center;
            text-align: center;
            padding-left: 0;
            padding-right: 0;
          }
          .rightCol { align-items: center; text-align: center; }
          .chartWrap { width: 100%; max-width: 460px; margin: 4px auto 0; }
        }

        .bigTitle {
          font-size: 11px;
          line-height: 1;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          font-weight: 700;
          color: var(--amber);
          margin-bottom: 10px;
        }
        .bigValue {
          display: inline-flex;
          align-items: baseline;
          gap: 6px;
          font-size: 2.5em;
          font-weight: 800;
          line-height: 1.05;
          margin: 2px 0 8px 0;
          color: #e7e3d6;
          font-variant-numeric: tabular-nums;
        }
        .delta {
          font-size: 0.32em;     /* superscript scale */
          font-weight: 800;
          vertical-align: super; /* ensure superscript position */
          line-height: 1;
          transform: translateY(-1.1em);
        }
        .delta.up   { color: var(--up); }   /* risk worse (up) = red */
        .delta.down { color: var(--down); } /* risk better (down) = green */
        .delta.flat { color: var(--amber-dim); }
        .pill {
          display: inline-block;
          padding: 3px 0;
          font-size: 10px;
          line-height: 1;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: var(--amber-dim);
        }
        .pill :global(strong) { color: #e7e3d6; }
      `}</style>
    </>
  );
}
