'use client';

import { useEffect, useMemo, useRef } from 'react';
import type { CountryRisk } from '../lib/risk-client';
import type { SelectOpts } from './TerminalDashboard';
import { colorForRisk } from '../lib/risk';
import RiskTrendChart from './RiskTrendChart';

type Props = {
  rows: CountryRisk[] | null;
  onSelectCountry: (dot: CountryRisk | null, opts?: SelectOpts) => void;
  /** Reports the bar height that makes the bottom bar's top meet the rail's
   *  content end. Null while loading → caller falls back to the CSS height. */
  onMeasure?: (bottomH: number | null) => void;
};

const AMBER = '#ffb43b';

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

    const series = byOffset.filter((v): v is number => v != null).slice().reverse(); // oldest→newest

    return { byOffset, avg, delta, high, elev, low, total: rows.length, deteriorating, improving, series };
  }, [rows]);

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
                Avg Risk · Trend<span className="sub">{model.byOffset.length} periods</span>
              </div>
              <RiskTrendChart
                series={model.series}
                color={AMBER}
                height={92}
                gradientId="railTrendGrad"
              />
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
