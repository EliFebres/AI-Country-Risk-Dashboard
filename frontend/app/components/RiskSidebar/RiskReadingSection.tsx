'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { getRiskCache, primeRiskCache, type CountryRisk } from '../../lib/risk-client';
import { colorForRisk } from '../../lib/risk';
import { shortDate } from '../../lib/format';
import RiskTrendChart from '../RiskTrendChart';

/** risk.json entry */
type RiskEntry = CountryRisk;

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
    historyDates: string[]; // snapshot date per history point (parallel to history)
    delta: number | null; // current - previous
  } | null>(null);

  // unique gradient id to avoid collisions if multiple sidebars mount
  const gradId = useMemo(() => {
    const base = (iso2 || countryName || 'risk').toString().replace(/\s+/g, '-').toUpperCase();
    return `riskGrad-${base}`;
  }, [iso2, countryName]);

  // --- Track the left column (title + value) height so the chart matches it
  const leftColRef = useRef<HTMLDivElement>(null);
  const [leftColHeight, setLeftColHeight] = useState(0);
  useEffect(() => {
    const el = leftColRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const h = entries[0]?.contentRect?.height ?? 0;
      setLeftColHeight(h);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [stats, statsLoading, statsError]);

  useEffect(() => {
    let cancelled = false;

    async function fetchRiskJson(preferFresh: boolean) {
      const res = await fetch('/api/risk', {
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

        // Build history: [...prevRiskSeries reversed, risk] with snapshot dates
        // kept parallel (so the chart tooltip can show each reading's date).
        let history: number[] = [];
        let historyDates: string[] = [];
        let currentRisk: number | null = null;
        let delta: number | null = null;

        if (entry) {
          const prior = (entry.prevRiskSeries ?? []).slice().reverse(); // oldest→newest
          const priorDates = (entry.prevAsOfs ?? []).slice().reverse(); // parallel to prior
          const latest = entry.risk;
          prior.forEach((v, i) => {
            if (typeof v === 'number' && Number.isFinite(v)) {
              history.push(v);
              historyDates.push(priorDates[i] ?? '');
            }
          });
          if (typeof latest === 'number' && Number.isFinite(latest)) {
            history.push(latest);
            historyDates.push(entry.asOf ?? '');
          }
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
          setStats({ currentRisk, avgCurrent, history, historyDates, delta });
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

  const history = stats?.history ?? [];

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
        <div className="statsCol leftCol" ref={leftColRef}>
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
            </>
          )}
        </div>

        {/* RIGHT: Modern area chart (no labels/legend) */}
        <div className="statsCol rightCol">
          {statsLoading ? (
            <div className="bigValue muted">Loading…</div>
          ) : statsError ? (
            <div className="bigValue muted">—</div>
          ) : history.length > 0 ? (
            <div className="chartWrap">
              <RiskTrendChart
                series={history}
                labels={(stats?.historyDates ?? []).map((d) => shortDate(d))}
                color={currentColor}
                height={leftColHeight || 120}
                gradientId={gradId}
                tooltip
                activeDot
              />
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
