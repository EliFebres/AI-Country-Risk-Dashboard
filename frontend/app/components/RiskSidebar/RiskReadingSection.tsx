'use client';

import { useEffect, useState } from 'react';

/** risk.json entry */
type RiskEntry = {
  name: string;
  lngLat: [number, number];
  risk: number;
  prevRisk?: number;
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

/** Top stats row only: Current Risk, Avg Risk Rating, Change, Avg Delta */
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
    prevRisk: number | null;
    avgCurrent: number | null;
    avgChange: number | null;
  } | null>(null);

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
            cache: 'force-cache',
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
        const values = (RISK_CACHE ?? [])
          .map(r => r.risk)
          .filter(v => Number.isFinite(v)) as number[];
        const avgCurrent = values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;

        const diffs = (RISK_CACHE ?? [])
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

  return (
    <>
      {/* --- Top Stats Row --- */}
      <div className="statsRow" aria-label="Risk stats">
        <div className="statsCol">
          <div className="bigTitle">Current Risk</div>
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
                Avg Risk Rating:&nbsp;
                <strong>{typeof stats?.avgCurrent === 'number' ? stats.avgCurrent.toFixed(2) : '—'}</strong>
              </div>
            </>
          )}
        </div>

        <div className="statsCol">
          <div className="smallTitle">Change</div>
          {statsLoading ? (
            <div className="bigValue muted">Loading…</div>
          ) : statsError ? (
            <div className="bigValue muted">—</div>
          ) : (
            <>
              <div className="bigValue" style={{ color: deltaColor }}>
                {delta == null ? '—' : `${delta >= 0 ? '+' : ''}${delta.toFixed(2)}`}
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

      <style jsx>{`
        .muted { opacity: 0.7; }

        /* Top stats row — FLEX to pin left/right edges  */
        .statsRow {
          display: flex;
          width: 100%;
          justify-content: space-between;
          align-items: flex-start;
        }
        .statsCol {
          flex: 1 1 0;
          padding: 15px 20px;
          padding-top: 0px;
          display: flex;
          flex-direction: column;
        }
        .statsCol:last-child {
          text-align: right;
          align-items: flex-end;
        }

        /* Stack on small screens */
        @media (max-width: 520px) {
          .statsRow { flex-direction: column; }
          .statsCol:last-child {
            text-align: left;
            align-items: flex-start;
          }
        }

        /* Optional: remove side padding so columns sit truly flush to container edges */
        .statsCol:first-child { padding-left: 0; }
        .statsCol:last-child  { padding-right: 0; }

        .bigTitle {
          font-size: 1.95em;
          line-height: 1;
          letter-spacing: 0.4px;
          color: rgba(255, 255, 255, 0.9);
          margin-bottom: 0.1em;
        }

        .smallTitle {
          font-size: 12px;
          line-height: 1;
          letter-spacing: 0.4px;
          color: rgba(255,255,255,0.7);
          margin-bottom: 6px;
        }

        .bigValue {
          font-size: 3em;
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
          color: rgba(255,255,255,0.9);
        }
      `}</style>
    </>
  );
}
