// app/lib/risk.ts
//
// Shared risk-scale helpers. Risk scores run 0..1 where higher is worse.

/**
 * Risk color scale. Mirrors the `--risk-*` design tokens in `globals.css`; kept
 * as literals here so non-DOM consumers (canvas markers, inline SVG) can read a
 * concrete color without resolving a CSS custom property.
 */
export const RISK_COLORS = {
  high: '#ff2d55', // > 0.70
  elev: '#ffd60a', // 0.50–0.70
  low: '#39ff14', // < 0.50
} as const;

/**
 * Map a 0..1 risk score to its terminal color.
 *
 * @param r - Risk score (0..1); higher is worse.
 * @returns The hex color matching the `--risk-*` token for that band.
 */
export function colorForRisk(r: number): string {
  if (r > 0.7) return RISK_COLORS.high;
  if (r >= 0.5) return RISK_COLORS.elev;
  return RISK_COLORS.low;
}
