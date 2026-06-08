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

  return (
    <div ref={wrapRef} className="rs-trend">
      <ResponsiveContainer key={`${width}-${Math.round(height)}`} width="100%" height={height}>
        <AreaChart data={data} margin={{ left: 4, right: 4, top: 8, bottom: 0 }}>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.45} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>

          <CartesianGrid stroke="rgba(255,255,255,0.12)" vertical={false} strokeDasharray="3 5" />
          <XAxis dataKey="idx" hide />
          <YAxis domain={[0, 1]} hide />

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
