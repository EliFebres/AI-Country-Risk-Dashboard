'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';

type SummaryEntry = { country_iso2: string; bullet_summary: string };

type Props = {
  /** ISO2 code like 'US' (required to match the summary file) */
  iso2?: string | null;
  /** If false, component will not fetch (useful when sidebar is closed) */
  active?: boolean;
};

// Bounds for the auto-fit summary text. The text grows toward MAX when short
// and shrinks toward MIN when long, so it always fills its flexed card.
const MIN_FONT = 10.5;
const MAX_FONT = 20;

/**
 * Scales the summary paragraph so it fills `boxRef`'s height without
 * overflowing: a binary search for the largest font in [MIN, MAX] whose
 * wrapped height still fits. Re-runs whenever the text or box size changes.
 */
function useFitText(text: string | null) {
  const boxRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLParagraphElement>(null);
  const [fontSize, setFontSize] = useState(MAX_FONT);

  useLayoutEffect(() => {
    const box = boxRef.current;
    const node = textRef.current;
    if (!box || !node || !text) return;

    const fit = () => {
      const avail = box.clientHeight;
      if (avail <= 0) return;
      let lo = MIN_FONT;
      let hi = MAX_FONT;
      for (let i = 0; i < 14 && hi - lo > 0.25; i++) {
        const mid = (lo + hi) / 2;
        node.style.fontSize = `${mid}px`;
        if (node.scrollHeight <= avail) lo = mid;
        else hi = mid;
      }
      node.style.fontSize = `${lo}px`;
      setFontSize(lo);
    };

    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(box);
    return () => ro.disconnect();
  }, [text]);

  return { boxRef, textRef, fontSize };
}

export default function AiSummary({ iso2, active = true }: Props) {
  const [summary, setSummary] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const { boxRef, textRef, fontSize } = useFitText(summary);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setErr(null);
      setSummary(null);

      const code = iso2?.toUpperCase();
      if (!active || !code) return;

      setLoading(true);
      try {
        const res = await fetch(`/api/risk_summary.json`, {
          cache: 'no-store',
          headers: { accept: 'application/json' },
        });
        if (!res.ok) {
          if (!cancelled) setErr(`Summary not available (${res.status})`);
          return;
        }
        const data = (await res.json()) as SummaryEntry[] | SummaryEntry;
        const list = Array.isArray(data) ? data : [data];
        const hit = list.find(
          (e) => e.country_iso2?.toUpperCase() === code && typeof e.bullet_summary === 'string'
        );
        if (!cancelled) setSummary(hit?.bullet_summary?.trim() || null);
      } catch {
        if (!cancelled) setErr('Failed to load summary');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [active, iso2]);

  if (loading) return <p className="muted">Loading summary…</p>;
  if (summary)
    return (
      <div className="ai-fit" ref={boxRef}>
        <p ref={textRef} style={{ fontSize: `${fontSize}px` }}>
          {summary}
        </p>

        <style jsx>{`
          .ai-fit {
            flex: 1 1 auto;
            min-height: 0;
            overflow: hidden;
          }
          .ai-fit :global(p) {
            margin: 0;
          }
        `}</style>
      </div>
    );
  return <p className="muted">{err ? err : 'No summary available for this country.'}</p>;
}
