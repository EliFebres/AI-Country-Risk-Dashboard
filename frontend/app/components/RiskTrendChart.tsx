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
  ReferenceLine,
} from 'recharts';
import { clamp01 } from '../lib/format';

type Props = {
  /** Series oldest→newest; each value is clamped to the 0..1 domain. */
  series: number[];
  /** Stroke + gradient fill color. */
  color: string;
  /** Chart height in pixels. */
  height: number;
  /**
   * Unique `<linearGradient>` id. Required because multiple charts can mount at
   * once and SVG gradient ids are document-global.
   */
  gradientId: string;
  /** Render the hover tooltip (risk value readout). Default `false`. */
  tooltip?: boolean;
  /** Show the active dot on hover. Default `false`. */
  activeDot?: boolean;
  /**
   * Where the area fill is measured from:
   *  - `'zero'` (default): fill from the line down to the baseline (0).
   *  - `'average'`: draw a reference line at the series average and fill the
   *    band *between the line and that average* — segments above the average
   *    fill down to it, segments below fill up to it.
   */
  baseline?: 'zero' | 'average';
};

/**
 * Compact risk area-chart shared by the sidebar's "Risk Rating" trend and the
 * World Risk Index rail. Encapsulates the standard amber-on-dark styling plus
 * the zero-width-on-first-paint fix (measure width via `ResizeObserver` and key
 * the `ResponsiveContainer` so it recalculates once a real width is known).
 *
 * @param props - See {@link Props}.
 */
export default function RiskTrendChart({
  series,
  color,
  height,
  gradientId,
  tooltip = false,
  activeDot = false,
  baseline = 'zero',
}: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => setWidth(entries[0]?.contentRect?.width ?? 0));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const data = useMemo(
    () => series.map((v, i) => ({ idx: i, v: clamp01(v) })),
    [series]
  );

  const useAvg = baseline === 'average';

  // Average of the series — used as the area's baseline (when `baseline` is
  // `'average'`) so the fill is drawn *between the line and the average*:
  // segments above the average fill down to it, segments below fill up to it.
  const avg = useMemo(
    () => (data.length ? data.reduce((s, d) => s + d.v, 0) / data.length : 0.5),
    [data]
  );

  return (
    <div ref={wrapRef} className="rs-trend">
      <ResponsiveContainer key={`${width}-${Math.round(height)}`} width="100%" height={height}>
        <AreaChart data={data} margin={{ left: 4, right: 4, top: 8, bottom: 0 }}>
          <defs>
            {useAvg ? (
              /* Symmetric fade: densest at the top/bottom extremes (near the
                 trend line) and faint in the middle (near the average baseline),
                 so the fill hugs the line on both sides of the average. */
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={color} stopOpacity={0.45} />
                <stop offset="50%" stopColor={color} stopOpacity={0.04} />
                <stop offset="100%" stopColor={color} stopOpacity={0.45} />
              </linearGradient>
            ) : (
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={color} stopOpacity={0.45} />
                <stop offset="100%" stopColor={color} stopOpacity={0} />
              </linearGradient>
            )}
          </defs>

          <CartesianGrid stroke="rgba(255,255,255,0.12)" vertical={false} strokeDasharray="3 5" />
          <XAxis dataKey="idx" hide />
          <YAxis domain={[0, 1]} hide />

          {/* Average line the fill is measured against. */}
          {useAvg && (
            <ReferenceLine
              y={avg}
              stroke={color}
              strokeOpacity={0.55}
              strokeWidth={1}
              strokeDasharray="4 3"
              ifOverflow="extendDomain"
            />
          )}

          {tooltip && (
            <Tooltip
              cursor={{ stroke: 'rgba(255,255,255,0.25)', strokeWidth: 1 }}
              formatter={(val) => [(Number(val)).toFixed(2), 'Risk']}
              labelFormatter={() => ''}
              contentStyle={{
                background: 'rgba(14,14,14,0.92)',
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: 8,
                padding: '6px 8px',
                color: '#fff',
              }}
            />
          )}

          <Area
            type="monotone"
            dataKey="v"
            baseValue={useAvg ? avg : 0}
            stroke={color}
            strokeWidth={2.2}
            fill={`url(#${gradientId})`}
            dot={false}
            activeDot={activeDot ? { r: 3 } : false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
