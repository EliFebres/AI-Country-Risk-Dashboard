// /components/Sidebar/RiskSidebar/NewsArticleSection.tsx
'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

type Article = {
  url: string;
  title: string;
  source?: string;
  published_at: string; // ISO
  img_url?: string;     // hero image from JSON (note: img_url)
};

type CountryNews = {
  iso2: string;
  name: string;
  as_of: string; // YYYY-MM-DD
  articles: Article[];
};

const NEWS_JSON_PUBLIC_PATH = '/api/articles_latest.json';

// Cache with 1-hour expiration to ensure fresh data
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour
let NEWS_CACHE: { data: CountryNews[]; timestamp: number } | null = null;

async function loadAllNews(signal?: AbortSignal): Promise<CountryNews[]> {
  // Check if cache exists and is still valid (less than 1 hour old)
  if (NEWS_CACHE && Date.now() - NEWS_CACHE.timestamp < CACHE_TTL_MS) {
    return NEWS_CACHE.data;
  }
  const res = await fetch(NEWS_JSON_PUBLIC_PATH, { cache: 'no-store', signal });
  if (!res.ok) throw new Error(`Failed to load news: ${res.status} ${res.statusText}`);
  const data = (await res.json()) as CountryNews[];
  NEWS_CACHE = { data, timestamp: Date.now() };
  return data;
}

/* ---------- Formatting helpers ---------- */

function daysAgoLabel(iso?: string | null): string {
  if (!iso) return '';
  const pub = new Date(iso);
  if (isNaN(pub.getTime())) return '';

  const DAY_MS = 24 * 60 * 60 * 1000;

  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startOfPub = new Date(pub.getFullYear(), pub.getMonth(), pub.getDate()).getTime();

  // Calendar-day difference (round guards against 23/25h DST days). Clamp future to 0.
  const days = Math.max(0, Math.round((startOfToday - startOfPub) / DAY_MS));

  if (days === 0) return 'today';
  if (days === 1) return '1 day ago';
  return `${days} days ago`;
}

const PUBLISHER_ALIASES: Record<string, string> = {
  'peterson institute for international economics': 'PIIE',
  'bloomberg': 'Bloomberg',
  'bloomberg.com': 'Bloomberg',
  'global banking | finance | review': 'GB&F Review',
  'u.s. department of state (.gov)': 'U.S. DoS',
  'https-//www.semafor.com': 'Semafor',
  'finews.com': 'Finews',
  'international monetary fund (imf)': 'IMF',
  'u.s. immigration and customs enforcement (.gov)': 'U.S. ICE',
  'harvard kennedy school': 'HKS',
  'upi.com': 'UPI',
  'ing think economic and financial analysis | ing think': 'ING Bank',
  '- essential business': 'Essential Business',
  'streetwisereports.com': 'StreetWise Reports',
  'le monde.fr': 'Le Monde',
};

const STOPWORDS = new Set(['the', 'a', 'an', 'of', 'for', 'and', 'to', 'in', 'on', 'at', 'by', 'with']);

function stripCompanySuffixes(s: string): string {
  return s
    .replace(/\b(incorporated|inc|corp|corporation|company|co|ltd|llc|llp|plc|gmbh|ag|sa|limited|holdings|group)\b\.?,?/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}
function hostToBrand(host: string): string {
  const h = host.replace(/^www\./i, '');
  const brand = h.replace(/\.[a-z]{2,}(\.[a-z]{2,})*$/i, '');
  return brand.replace(/[-_]+/g, ' ').trim();
}
function titleCase(s: string): string {
  return s.replace(/\w\S*/g, (w) => w[0].toUpperCase() + w.slice(1).toLowerCase());
}
function toAcronym(name: string): string {
  const parts = name.split(/\s+/).filter(Boolean);
  const letters = parts
    .filter((w) => !STOPWORDS.has(w.toLowerCase()))
    .map((w) => w[0].toUpperCase());
  const ac = letters.join('');
  return ac.length >= 2 ? ac : titleCase(name);
}
function normalizePublisher(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/^www\./, '')
    .replace(/\.[a-z]{2,}(\.[a-z]{2,})*$/i, '')
    .replace(/\s+/g, ' ');
}
function canonicalPublisherName(a: Article): string {
  let base = (a.source ?? '').trim();
  if (!base) {
    try { base = hostToBrand(new URL(a.url).hostname); } catch { }
  }
  base = stripCompanySuffixes(base);
  const key = base.toLowerCase();
  if (PUBLISHER_ALIASES[key]) return PUBLISHER_ALIASES[key];
  return base;
}
function shortenForDisplay(full: string): string {
  const key = full.toLowerCase();
  if (PUBLISHER_ALIASES[key]) return PUBLISHER_ALIASES[key];
  const cleaned = stripCompanySuffixes(full);
  if (cleaned.length > 22) return toAcronym(cleaned);
  return cleaned;
}
function sourceLabels(a: Article): { full: string; short: string } {
  let full = canonicalPublisherName(a);
  if (!full) {
    try { full = titleCase(hostToBrand(new URL(a.url).hostname)); } catch { full = 'Source'; }
  }
  const short = shortenForDisplay(full);
  return { full, short };
}

/** Strip trailing “ - Source” / “— Source” / “| Source” / “: Source” when it matches the article’s source/domain. */
function cleanTitle(a: Article): string {
  const raw = (a.title || '').trim();
  if (!raw) return '';

  const canonical = canonicalPublisherName(a);
  const candidates = new Set<string>([normalizePublisher(canonical)]);

  // Also consider raw host forms (helps when title uses domain)
  try {
    const host = new URL(a.url).hostname;
    candidates.add(normalizePublisher(host));
    candidates.add(normalizePublisher(hostToBrand(host)));
  } catch { }

  let t = raw;
  for (let i = 0; i < 2; i++) {
    const m = t.match(/[ \t]*[-–—|:·][ \t]*([^-–—|:·]+)$/);
    if (!m) break;
    const tail = m[1].trim();
    const normTail = normalizePublisher(tail);
    if (candidates.has(normTail)) {
      t = t.slice(0, m.index).trim();
      t = t.replace(/[ \t]*[-–—|:·]+[ \t]*$/, '').trim();
    } else {
      break;
    }
  }
  return t;
}

/* ---------- Image helpers (JSON-only) ---------- */

function hasHttpImage(url?: string): boolean {
  return !!url && /^https?:\/\//i.test(url.trim());
}

/* ---------- Component ---------- */

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

  const lastIsoRef = useRef<string | null>(null);
  const normIso = useMemo(() => (iso2 ? iso2.toUpperCase() : null), [iso2]);

  useEffect(() => {
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
        const match = all.find((c) => (c.iso2 || '').toUpperCase() === normIso);
        if (!match) {
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

  // Up to 3 cards; fill with skeletons
  const top3: (Article | null)[] = useMemo(() => {
    const arr: (Article | null)[] = [...(articles ?? []).slice(0, 3)];
    while (arr.length < 3) arr.push(null);
    return arr;
  }, [articles]);

  return (
    <div
      className={`${className} newsRow`}
      data-iso2={normIso ?? ''}
      data-country-name={countryName ?? ''}
      data-as-of={asOf ?? ''}
      data-articles-count={articles?.length ?? 0}
      data-loading={loading ? '1' : '0'}
      data-error={error ? '1' : '0'}
      aria-label="Country news previews"
    >
      {top3.map((a, i) =>
        a && a.url ? (
          (() => {
            const src = sourceLabels(a);
            const title = cleanTitle(a);
            const hasImg = hasHttpImage(a.img_url);

            return (
              <a
                key={`newsCard-${i}`}
                className="newsCard clickable"
                href={a.url}
                target="_blank"
                rel="noopener noreferrer"
                title={`${title} — ${src.full}`}
                aria-label={title ? `Open article: ${title}` : 'Open article'}
              >
                {/* Top 50% hero image or SVG placeholder */}
                <div className={`thumbWrap ${hasImg ? '' : 'noimg'}`}>
                  {hasImg ? (
                    <img
                      className="thumb"
                      src={a.img_url!}
                      alt={title ? `Image for: ${title}` : 'Article image'}
                      loading="lazy"
                      decoding="async"
                      referrerPolicy="no-referrer"
                      onError={(e) => {
                        // Hide broken image and reveal the placeholder; no external fallbacks.
                        const wrap = (e.currentTarget.parentElement as HTMLElement) || null;
                        e.currentTarget.style.display = 'none';
                        if (wrap) wrap.classList.add('noimg');
                      }}
                    />
                  ) : null}

                  {/* Inline newspaper SVG placeholder */}
                  <div className="thumbPlaceholder" aria-hidden="true">
                    <svg
                      className="newspaperSvg"
                      viewBox="0 0 64 64"
                      role="img"
                      aria-label="Newspaper"
                    >
                      <defs>
                        <linearGradient id="paperGrad" x1="0" x2="0" y1="0" y2="1">
                          <stop offset="0" stopOpacity="0.16" />
                          <stop offset="1" stopOpacity="0.32" />
                        </linearGradient>
                      </defs>
                      <rect x="6" y="10" width="52" height="44" rx="4" fill="url(#paperGrad)" />
                      <rect x="10" y="14" width="22" height="6" rx="1.5" fill="currentColor" opacity="0.8" />
                      <rect x="10" y="24" width="44" height="6" rx="1" fill="currentColor" opacity="0.55" />
                      <rect x="10" y="32" width="44" height="6" rx="1" fill="currentColor" opacity="0.5" />
                      <rect x="10" y="40" width="28" height="6" rx="1" fill="currentColor" opacity="0.45" />
                    </svg>
                  </div>
                </div>

                {/* Bottom 50% text (starts at top of bottom half) */}
                <div className="overlay">
                  <div className="newsSource" title={src.full} aria-label={`Source: ${src.full}`}>
                    {src.short}
                  </div>
                  <h4 className="newsTitle">{title}</h4>
                  <div className="newsMeta">{daysAgoLabel(a.published_at)}</div>
                </div>
              </a>
            );
          })()
        ) : (
          <div key={`newsCard-skel-${i}`} className="newsCard skeleton" aria-hidden="true">
            <div className="thumbWrap noimg">
              <div className="thumbPlaceholder" aria-hidden="true">
                <svg className="newspaperSvg" viewBox="0 0 64 64" role="img" aria-label="Newspaper">
                  <defs>
                    <linearGradient id="paperGrad2" x1="0" x2="0" y1="0" y2="1">
                      <stop offset="0" stopOpacity="0.16" />
                      <stop offset="1" stopOpacity="0.32" />
                    </linearGradient>
                  </defs>
                  <rect x="6" y="10" width="52" height="44" rx="4" fill="url(#paperGrad2)" />
                  <rect x="10" y="14" width="22" height="6" rx="1.5" fill="currentColor" opacity="0.8" />
                  <rect x="10" y="24" width="44" height="6" rx="1" fill="currentColor" opacity="0.55" />
                  <rect x="10" y="32" width="44" height="6" rx="1" fill="currentColor" opacity="0.5" />
                  <rect x="10" y="40" width="28" height="6" rx="1" fill="currentColor" opacity="0.45" />
                </svg>
              </div>
            </div>
            <div className="overlay skeletonOverlay">
              <div className="skel skel-source" />
              <div className="skel skel-title" />
              <div className="skel skel-meta" />
            </div>
          </div>
        )
      )}

      <style jsx>{`
        .newsRow {
          --gap: 10px;
          display: flex;
          flex-direction: row;
          align-items: stretch;
          gap: var(--gap);
          width: 100%;
          flex-wrap: nowrap;
        }

        .newsCard {
          display: block;
          text-decoration: none;
          color: inherit;
          cursor: default;
          flex: 1 1 0;
          min-width: calc((100% - 2 * var(--gap)) / 3);
          max-width: calc((100% - 2 * var(--gap)) / 3);
          height: 20em; /* tall */
          border-radius: 10px;
          background: linear-gradient(
            180deg,
            rgba(255, 255, 255, 0.06) 0%,
            rgba(255, 255, 255, 0.03) 60%,
            rgba(255, 255, 255, 0.02) 100%
          );
          box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.06), 0 2px 8px rgba(0, 0, 0, 0.25);
          backdrop-filter: blur(2px);
          -webkit-backdrop-filter: blur(2px);
          transition: transform 180ms var(--easing, ease), box-shadow 180ms var(--easing, ease);
          position: relative;
          overflow: hidden;
        }

        .newsCard:hover {
          transform: translateY(-2px) scale(1.03);
          box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.08), 0 6px 18px rgba(0, 0, 0, 0.35);
        }

        .newsCard.clickable { cursor: pointer; }
        .newsCard.clickable:focus-visible {
          outline: 2px solid rgba(255, 255, 255, 0.7);
          outline-offset: 2px;
        }

        /* Top 50% hero area */
        .thumbWrap {
          position: absolute;
          left: 0; right: 0; top: 0;
          height: 50%;
          overflow: hidden;
          background: radial-gradient(100% 100% at 50% 0%, rgba(255,255,255,0.06), rgba(255,255,255,0.02));
        }
        .thumb {
          width: 100%;
          height: 100%;
          display: block;
          object-fit: cover;
          object-position: center;
          filter: saturate(1) contrast(1.02) brightness(0.95);
          transform: scale(1.001); /* avoid hairline gaps on some GPUs */
        }

        /* Placeholder (visible when .noimg is set or when no <img> rendered) */
        .thumbPlaceholder {
          position: absolute;
          inset: 0;
          display: none;
          align-items: center;
          justify-content: center;
          background: rgba(0, 0, 0, 0.28);
          color: rgba(255, 255, 255, 0.85);
          text-shadow: 0 2px 6px rgba(0,0,0,0.45);
          user-select: none;
        }
        .thumbWrap.noimg .thumbPlaceholder { display: flex; }

        .newspaperSvg {
          width: clamp(28px, 9cqw, 56px);
          height: auto;
          opacity: 0.9;
        }

        /* Bottom 50% text (starts at top of bottom half) */
        .overlay {
          position: absolute;
          left: 0; right: 0; bottom: 0;
          height: 50%;
          padding: 10px 12px;
          background: linear-gradient(
            180deg,
            rgba(0, 0, 0, 0.0) 0%,
            rgba(0, 0, 0, 0.45) 35%,
            rgba(0, 0, 0, 0.65) 100%
          );
          color: #fff;
          display: flex;
          flex-direction: column;
          justify-content: flex-start; /* top of bottom half */
          align-items: flex-start;
          overflow: hidden;
        }

        /* Source & time — same size & weight */
        .newsSource,
        .newsMeta {
          font-size: 0.8rem;
          font-weight: 500;
          color: #fff;
          opacity: 0.95;
          line-height: 1.15;
          text-shadow: 0 1px 2px rgba(0, 0, 0, 0.35);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .newsSource { margin: 0 0 6px 0; }

        .newsTitle {
          margin: 0 0 6px 0;
          font-size: 0.95rem;
          font-weight: 650;
          line-height: 1.2;
          color: #fff;
          text-shadow: 0 1px 2px rgba(0, 0, 0, 0.35);
          display: -webkit-box;
          -webkit-line-clamp: 5; /* within bottom half */
          -webkit-box-orient: vertical;
          overflow: hidden;
        }

        /* Skeleton shimmer + placeholders */
        .newsCard.skeleton::after {
          content: '';
          position: absolute;
          inset: 0;
          background: linear-gradient(
            100deg,
            transparent 0%,
            rgba(255, 255, 255, 0.06) 40%,
            rgba(255, 255, 255, 0.12) 50%,
            rgba(255, 255, 255, 0.06) 60%,
            transparent 100%
          );
          transform: translateX(-100%);
          animation: shimmer 2.2s ease-in-out infinite;
          opacity: 0.35;
          pointer-events: none;
        }

        .skeletonOverlay {
          height: 50%;
          position: absolute;
          left: 0; right: 0; bottom: 0;
          padding: 10px 12px;
          background: linear-gradient(
            180deg,
            rgba(0, 0, 0, 0) 0%,
            rgba(0, 0, 0, 0.35) 35%,
            rgba(0, 0, 0, 0.55) 100%
          );
          display: flex;
          flex-direction: column;
          justify-content: flex-start; /* match real cards */
          align-items: flex-start;     /* match real cards */
          overflow: hidden;
        }

        .skel { border-radius: 4px; background: rgba(255, 255, 255, 0.15); }
        .skel-source { height: 0.9em; width: 55%; margin-bottom: 6px; }
        .skel-title  { height: 2.2em; width: 90%; margin-bottom: 6px; }
        .skel-meta   { height: 0.9em; width: 40%; }

        @keyframes shimmer { 0% { transform: translateX(-100%); } 100% { transform: translateX(100%); } }

        @media (prefers-reduced-motion: reduce) {
          .newsCard { transition: none; }
          .newsCard.skeleton::after { animation: none; opacity: 0.15; }
        }
      `}</style>
    </div>
  );
}
