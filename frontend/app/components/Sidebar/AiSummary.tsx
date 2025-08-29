'use client';

import { useEffect, useState } from 'react';

type SummaryEntry = { country_iso2: string; bullet_summary: string };

type Props = {
  /** ISO2 code like 'US' (required to match the summary file) */
  iso2?: string | null;
  /** If false, component will not fetch (useful when sidebar is closed) */
  active?: boolean;
};

export default function AiSummary({ iso2, active = true }: Props) {
  const [summary, setSummary] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

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
  if (summary) return <p>{summary}</p>;
  return <p className="muted">{err ? err : 'No summary available for this country.'}</p>;
}
