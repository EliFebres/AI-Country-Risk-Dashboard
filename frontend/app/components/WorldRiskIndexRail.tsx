'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { CountryRisk } from '../lib/risk-client';
import type { SelectOpts } from './TerminalDashboard';
import { colorForRisk } from '../lib/risk';
import { shortDate } from '../lib/format';
import { loadDashboard, getIndicatorAverages, type IndicatorAverageTrends } from '../lib/dashboard-client';
import RiskTrendChart from './RiskTrendChart';

type Props = {
  rows: CountryRisk[] | null;
  onSelectCountry: (dot: CountryRisk | null, opts?: SelectOpts) => void;
  /** Reports the bar height that makes the bottom bar's top meet the rail's
   *  content end. Null while loading → caller falls back to the CSS height. */
  onMeasure?: (bottomH: number | null) => void;
};

const AMBER = '#ffb43b';

/**
 * Metrics offered by the trend dropdown. `'risk'` is the global average risk
 * series computed client-side from `rows`; the rest are cross-country
 * average-per-year trends pulled from the dashboard payload
 * (`indicatorAverages`, keyed by `indicatorName`). `domain` fixes the y-range
 * (risk only); indicators auto-scale to their own values.
 */
type Metric = {
  key: string;
  label: string;          // dropdown label, e.g. "Avg Inflation"
  kind: 'risk' | 'indicator';
  indicatorName?: string; // key into IndicatorAverageTrends (kind 'indicator')
  unit?: string;          // tooltip value suffix
  decimals: number;       // tooltip decimals
  domain?: [number, number];
};

const METRICS: Metric[] = [
  { key: 'risk',         label: 'Avg Risk',                kind: 'risk',      decimals: 2, domain: [0, 1] },
  { key: 'inflation',    label: 'Avg Inflation',           kind: 'indicator', indicatorName: 'Inflation (% y/y)',                                    unit: '%', decimals: 1 },
  { key: 'rule_of_law',  label: 'Avg Rule of Law',         kind: 'indicator', indicatorName: 'Rule of law (z-score)',                                           decimals: 2 },
  { key: 'gdp',          label: 'Avg GDP Growth',          kind: 'indicator', indicatorName: 'GDP per-capita growth (% y/y)',                        unit: '%', decimals: 1 },
  { key: 'unemployment', label: 'Avg Unemployment',        kind: 'indicator', indicatorName: 'Unemployment (% labour force)',                        unit: '%', decimals: 1 },
  { key: 'interest',     label: 'Avg Interest Burden',     kind: 'indicator', indicatorName: 'Interest payments (% revenue)',                        unit: '%', decimals: 1 },
  { key: 'corruption',   label: 'Avg Political Corruption', kind: 'indicator', indicatorName: 'Political corruption index (0–1, higher = more corrupt)',         decimals: 2 },
];

/** Padded [min,max] domain for an indicator series (falls back to [0,1] empty). */
function autoDomain(vals: number[]): [number, number] {
  if (!vals.length) return [0, 1];
  let lo = Math.min(...vals);
  let hi = Math.max(...vals);
  if (lo === hi) { lo -= 1; hi += 1; }
  const pad = (hi - lo) * 0.3;
  return [lo - pad, hi + pad];
}

/** Immediate-predecessor delta for a country (current − previous reading). */
function computeDelta(c: CountryRisk): number {
  const prev =
    c.prevRiskSeries && c.prevRiskSeries.length
      ? c.prevRiskSeries[0]
      : typeof c.prevRisk === 'number'
      ? c.prevRisk
      : null;
  if (typeof prev !== 'number') return 0;
  return Math.round((c.risk - prev) * 100) / 100;
}

/** A country's snapshot date at historical offset `k` (0 = current reading). */
function dateAt(c: CountryRisk, k: number): string | undefined {
  if (k === 0) return c.asOf;
  return c.prevAsOfs && c.prevAsOfs.length >= k ? c.prevAsOfs[k - 1] : undefined;
}

/**
 * Representative snapshot date per offset across all countries: the latest
 * (max) ISO date seen at that offset. Snapshots are generated in weekly batches,
 * so a given offset shares one date across countries; the max guards against the
 * occasional country that's missing a reading at that offset.
 */
function globalDateByOffset(rows: CountryRisk[], len: number): (string | null)[] {
  const out: (string | null)[] = [];
  for (let k = 0; k < len; k++) {
    let best: string | null = null;
    rows.forEach((c) => {
      const d = dateAt(c, k);
      if (d && (!best || d > best)) best = d;
    });
    out.push(best);
  }
  return out;
}

/** Global average risk per historical offset. [0]=current, [1]=previous, … */
function globalAvgByOffset(rows: CountryRisk[]): (number | null)[] {
  let maxK = 1;
  rows.forEach((c) => {
    const len = 1 + (c.prevRiskSeries?.length ?? 0);
    if (len > maxK) maxK = len;
  });
  maxK = Math.min(maxK, 24);

  const valAt = (c: CountryRisk, k: number): number | undefined =>
    k === 0
      ? c.risk
      : c.prevRiskSeries && c.prevRiskSeries.length >= k
      ? c.prevRiskSeries[k - 1]
      : undefined;

  const out: (number | null)[] = [];
  for (let k = 0; k < maxK; k++) {
    let s = 0;
    let n = 0;
    rows.forEach((c) => {
      const v = valAt(c, k);
      if (typeof v === 'number' && isFinite(v)) {
        s += v;
        n++;
      }
    });
    out.push(n ? s / n : null);
  }
  return out;
}

function MoverRow({
  c,
  d,
  onSelect,
}: {
  c: CountryRisk;
  d: number;
  onSelect: () => void;
}) {
  const col = colorForRisk(c.risk);
  const up = d > 0;
  return (
    <div
      className="rs-mover"
      tabIndex={0}
      role="button"
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect();
        }
      }}
    >
      <span className="nm">
        <span className="dot" style={{ background: col }} />
        <span className="name">{c.name}</span>
      </span>
      <span className="rk" style={{ color: col }}>
        {c.risk.toFixed(2)}
      </span>
      <span className={`cg ${up ? 'up' : 'down'}`}>
        {up ? '▲' : '▼'}&nbsp;{Math.abs(d).toFixed(2)}
      </span>
    </div>
  );
}

/** Right-hand "World Risk Index" rail: global-average trend, top movers, and per-country rows. */
export default function WorldRiskIndexRail({ rows, onSelectCountry, onMeasure }: Props) {
  const asideRef = useRef<HTMLElement>(null);
  const stripRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const onMeasureRef = useRef(onMeasure);
  onMeasureRef.current = onMeasure;

  // Drive the bottom bar's height so its top edge meets the rail's content end.
  // bottomH = viewportH − rail top − strip − natural content height.
  useEffect(() => {
    const aside = asideRef.current;
    const strip = stripRef.current;
    const content = contentRef.current;
    if (!aside || !strip || !content) return;

    const measure = () => {
      const ch = content.offsetHeight;
      // Before real content paints, defer to the CSS fallback height.
      if (ch < 120) {
        onMeasureRef.current?.(null);
        return;
      }
      const top = aside.getBoundingClientRect().top;
      const fit = window.innerHeight - top - strip.offsetHeight - ch;
      const bottomH = Math.round(Math.max(140, Math.min(window.innerHeight * 0.72, fit)));
      onMeasureRef.current?.(bottomH);
    };

    const ro = new ResizeObserver(measure);
    ro.observe(content);
    ro.observe(strip);
    window.addEventListener('resize', measure);
    measure();
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, []);

  const model = useMemo(() => {
    if (!rows || !rows.length) return null;
    const byOffset = globalAvgByOffset(rows);
    const avg = byOffset[0] ?? 0;
    const prevAvg = byOffset.length > 1 ? byOffset[1] : null;
    const delta = typeof prevAvg === 'number' ? avg - prevAvg : null;

    let high = 0;
    let elev = 0;
    let low = 0;
    rows.forEach((c) => {
      if (c.risk > 0.7) high++;
      else if (c.risk >= 0.5) elev++;
      else low++;
    });

    const withDelta = rows.map((c) => ({ c, d: computeDelta(c) }));
    const deteriorating = withDelta.filter((x) => x.d > 0).sort((a, b) => b.d - a.d).slice(0, 5);
    const improving = withDelta.filter((x) => x.d < 0).sort((a, b) => a.d - b.d).slice(0, 5);

    // Series + parallel dates, dropping null offsets together, oldest→newest.
    const datesByOffset = globalDateByOffset(rows, byOffset.length);
    const kept = byOffset
      .map((v, k) => ({ v, d: datesByOffset[k] }))
      .filter((p): p is { v: number; d: string | null } => p.v != null);
    const series = kept.map((p) => p.v).reverse();
    const seriesDates = kept.map((p) => p.d).reverse();

    return { byOffset, avg, delta, high, elev, low, total: rows.length, deteriorating, improving, series, seriesDates };
  }, [rows]);

  // --- Trend metric dropdown -------------------------------------------------
  // Indicator average-trends come from the shared dashboard payload (loaded once
  // per session); avg-risk stays client-computed from `rows`.
  const [selectedKey, setSelectedKey] = useState<string>('risk');
  const [menuOpen, setMenuOpen] = useState(false);
  // Fixed-viewport coords for the portaled menu, captured from the button rect
  // when it opens (so the menu floats above everything without shifting layout).
  const [menuPos, setMenuPos] = useState<{ top: number; left: number; minWidth: number } | null>(null);
  const [averages, setAverages] = useState<IndicatorAverageTrends | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLUListElement>(null);

  const toggleMenu = () => {
    if (menuOpen) { setMenuOpen(false); return; }
    const r = btnRef.current?.getBoundingClientRect();
    if (r) setMenuPos({ top: r.bottom + 6, left: r.left, minWidth: r.width });
    setMenuOpen(true);
  };

  useEffect(() => {
    let cancelled = false;
    loadDashboard()
      .then((data) => { if (!cancelled) setAverages(getIndicatorAverages(data)); })
      .catch(() => { if (!cancelled) setAverages({}); });
    return () => { cancelled = true; };
  }, []);

  // Dismiss on outside click / Escape; also on scroll or resize, since the
  // fixed-positioned menu can't track the button once the page moves.
  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (btnRef.current?.contains(t) || menuRef.current?.contains(t)) return;
      setMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenuOpen(false); };
    const close = () => setMenuOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
    };
  }, [menuOpen]);

  // Resolve the selected metric's chart inputs (series, domain, formatting).
  const trend = useMemo(() => {
    const metric = METRICS.find((m) => m.key === selectedKey) ?? METRICS[0];
    const tipLabel = metric.label.replace(/^Avg\s+/, '');
    const fmt = (n: number) => `${n.toFixed(metric.decimals)}${metric.unit ?? ''}`;

    if (metric.kind === 'risk') {
      const series = model?.series ?? [];
      // Fit the axis to the series (kept within risk's 0..1 bounds) rather than
      // the full [0,1] range, so the trend's variation isn't squashed flat.
      const [lo, hi] = autoDomain(series);
      return {
        metric, series,
        labels: (model?.seriesDates ?? []).map((d) => shortDate(d)),
        domain: [Math.max(0, lo), Math.min(1, hi)] as [number, number],
        clampValues: true,
        formatValue: fmt, valueLabel: tipLabel,
        noun: 'periods', count: series.length,
        ready: series.length >= 2,
      };
    }

    const pts = (averages && metric.indicatorName ? averages[metric.indicatorName] : undefined) ?? [];
    const series = pts.map((p) => p.avg);
    return {
      metric, series,
      labels: pts.map((p) => String(p.year)),
      domain: autoDomain(series),
      clampValues: false,
      formatValue: fmt, valueLabel: tipLabel,
      noun: 'years', count: series.length,
      ready: series.length >= 2,
    };
  }, [selectedKey, model, averages]);

  // Bars fill as a share of all sovereigns, so the three counts sum to 100%; the
  // raw count is shown on the right. All bars use the trend line's amber.
  const distRow = (label: string, count: number, total: number) => {
    const pct = total ? Math.round((count / total) * 100) : 0;
    return (
      <div className="bar-row">
        <span className="bar-label">{label}</span>
        <span className="bar-track">
          <span className="bar-fill" style={{ width: `${pct}%`, background: AMBER }} />
        </span>
        <span className="bar-val">{count}</span>
      </div>
    );
  };

  let deltaCls = 'flat';
  let deltaArrow = '—';
  let deltaTxt = '0.00';
  if (model && model.delta != null && Math.abs(model.delta) >= 0.005) {
    deltaCls = model.delta > 0 ? 'up' : 'down';
    deltaArrow = model.delta > 0 ? '▲' : '▼';
    deltaTxt = Math.abs(model.delta).toFixed(2);
  }

  return (
    <aside className="sidebar-right" aria-label="World risk index" ref={asideRef}>
      <div className="rs-strip" ref={stripRef}>
        <span className="rs-tag">World Risk Index</span>
      </div>
      <div className="rs-scroll">
        <div ref={contentRef}>
        {!model ? (
          <div className="rs-sec">
            <div className="rs-hero-sub">Loading…</div>
          </div>
        ) : (
          <>
            <div className="rs-sec">
              <div className="rs-sec-title">
                Global Avg Risk<span className="sub">{model.total} Sovereigns</span>
              </div>
              <div className="rs-hero">
                <span className="val" style={{ color: colorForRisk(model.avg) }}>
                  {model.avg.toFixed(2)}
                </span>
                <span className={`delta ${deltaCls}`}>
                  {deltaArrow}&nbsp;{deltaTxt}
                </span>
              </div>
              <div className="rs-hero-sub">
                vs previous reading &nbsp;·&nbsp; <b>{model.high}</b> high-risk
              </div>
            </div>

            <div className="rs-sec">
              <div className="rs-sec-title">
                <div className="metric-dd">
                  <button
                    ref={btnRef}
                    type="button"
                    className="metric-dd-btn"
                    aria-haspopup="listbox"
                    aria-expanded={menuOpen}
                    onClick={toggleMenu}
                  >
                    <span>{trend.metric.label}</span>
                    <span className="metric-dd-caret" aria-hidden="true">▾</span>
                  </button>
                  {menuOpen && menuPos &&
                    createPortal(
                      <ul
                        ref={menuRef}
                        className="metric-dd-menu"
                        role="listbox"
                        style={{
                          position: 'fixed',
                          top: menuPos.top,
                          left: menuPos.left,
                          minWidth: Math.max(menuPos.minWidth, 190),
                        }}
                      >
                        {METRICS.map((m) => (
                          <li
                            key={m.key}
                            role="option"
                            aria-selected={m.key === selectedKey}
                            className={`metric-dd-item ${m.key === selectedKey ? 'sel' : ''}`}
                            onClick={() => { setSelectedKey(m.key); setMenuOpen(false); }}
                          >
                            {m.label}
                          </li>
                        ))}
                      </ul>,
                      document.body
                    )}
                </div>
                <span className="sub">{trend.ready ? `${trend.count} ${trend.noun}` : ''}</span>
              </div>
              {trend.ready ? (
                <RiskTrendChart
                  series={trend.series}
                  labels={trend.labels}
                  color={AMBER}
                  height={130}
                  gradientId="railTrendGrad"
                  baseline="average"
                  domain={trend.domain}
                  clampValues={trend.clampValues}
                  formatValue={trend.formatValue}
                  valueLabel={trend.valueLabel}
                  tooltip
                  activeDot
                />
              ) : (
                <div className="rs-hero-sub" style={{ marginTop: 0 }}>
                  {averages === null && trend.metric.kind === 'indicator' ? 'Loading…' : 'No data'}
                </div>
              )}
            </div>

            <div className="rs-sec">
              <div className="rs-sec-title">
                Risk Distribution<span className="sub">count</span>
              </div>
              {distRow('High >0.70', model.high, model.total)}
              {distRow('Elevated', model.elev, model.total)}
              {distRow('Low <0.50', model.low, model.total)}
            </div>

            <div className="rs-sec">
              <div className="rs-sec-title">
                Deteriorating<span className="sub">risk ▲</span>
              </div>
              {model.deteriorating.length ? (
                model.deteriorating.map((x) => (
                  <MoverRow key={x.c.name} c={x.c} d={x.d} onSelect={() => onSelectCountry(x.c, { pan: true })} />
                ))
              ) : (
                <div className="rs-hero-sub">No deteriorations</div>
              )}
            </div>

            <div className="rs-sec">
              <div className="rs-sec-title">
                Improving<span className="sub">risk ▼</span>
              </div>
              {model.improving.length ? (
                model.improving.map((x) => (
                  <MoverRow key={x.c.name} c={x.c} d={x.d} onSelect={() => onSelectCountry(x.c, { pan: true })} />
                ))
              ) : (
                <div className="rs-hero-sub">No improvements</div>
              )}
            </div>
          </>
        )}
        </div>
      </div>
    </aside>
  );
}
