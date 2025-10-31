// /components/Sidebar/RiskSidebar/NewsArticleSection.tsx
'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

type Article = {
  url: string;
  title: string;
  source: string;
  published_at: string; // ISO string
};

type CountryNews = {
  iso2: string;
  name: string;
  as_of: string; // YYYY-MM-DD
  articles: Article[];
};

const NEWS_JSON_PUBLIC_PATH = '/api/articles_latest.json'; // ← change if needed

// Optional module-level cache to avoid re-fetch storms within a session.
let NEWS_CACHE: CountryNews[] | null = null;

async function loadAllNews(signal?: AbortSignal): Promise<CountryNews[]> {
  if (NEWS_CACHE) return NEWS_CACHE;
  const res = await fetch(NEWS_JSON_PUBLIC_PATH, {
    cache: 'no-store', // prefer freshest; switch to 'force-cache' if you want browser caching
    signal,
  });
  if (!res.ok) throw new Error(`Failed to load news: ${res.status} ${res.statusText}`);
  const data = (await res.json()) as CountryNews[];
  NEWS_CACHE = data;
  return data;
}

/**
 * NewsArticleSection
 * ------------------
 * Reads the per-country news from articles_latest.json and keeps it in state.
 * Intentionally renders nothing (blank) for now. Use DevTools to see data-* attrs.
 */
export default function NewsArticleSection({
  iso2,
  active,
  className = '',
}: {
  iso2?: string | null;
  active?: boolean;
  className?: string;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [countryName, setCountryName] = useState<string | null>(null);
  const [asOf, setAsOf] = useState<string | null>(null);
  const [articles, setArticles] = useState<Article[] | null>(null);

  // Keep last successful result so switching open/close doesn't wipe data.
  const lastIsoRef = useRef<string | null>(null);

  const normIso = useMemo(() => (iso2 ? iso2.toUpperCase() : null), [iso2]);

  useEffect(() => {
    // If sidebar isn't active or no iso2, clear display state but don't fetch.
    if (!active || !normIso) {
      setLoading(false);
      setError(null);
      setCountryName(null);
      setAsOf(null);
      setArticles(null);
      return;
    }

    const controller = new AbortController();

    (async () => {
      try {
        setLoading(true);
        setError(null);

        const all = await loadAllNews(controller.signal);
        const match =
          normIso &&
          all.find((c) => (c.iso2 || '').toUpperCase() === normIso);

        if (!match) {
          // No articles entry for this country
          setCountryName(null);
          setAsOf(null);
          setArticles([]);
          lastIsoRef.current = normIso;
          return;
        }

        setCountryName(match.name ?? null);
        setAsOf(match.as_of ?? null);
        setArticles(Array.isArray(match.articles) ? match.articles : []);
        lastIsoRef.current = normIso;
      } catch (err: any) {
        if (err?.name === 'AbortError') return;
        setError(err?.message || 'Failed to fetch news.');
        setArticles(null);
      } finally {
        setLoading(false);
      }
    })();

    return () => controller.abort();
  }, [active, normIso]);

  // Intentionally blank UI for now; expose status via data-* for quick inspection.
  return (
    <div
      className={className}
      data-iso2={normIso ?? ''}
      data-country-name={countryName ?? ''}
      data-as-of={asOf ?? ''}
      data-articles-count={articles?.length ?? 0}
      data-loading={loading ? '1' : '0'}
      data-error={error ? '1' : '0'}
    />
  );
}
