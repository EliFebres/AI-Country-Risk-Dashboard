'use client';

export type NewsSectionProps = {
  /** Country name */
  countryName?: string | null;
  /** 2-letter ISO code */
  iso2?: string | null;
};

export default function NewsSection({ countryName, iso2 }: NewsSectionProps) {
  // Normalize ISO for downstream usage
  const iso = (iso2 ?? undefined)?.toUpperCase();

  return (
    <section
      className="card"
      // Data attributes make the props available for future scripts/styles without rendering visible text
      data-country={countryName ?? ''}
      data-iso2={iso ?? ''}
    >
      <h3>News</h3>
      {/* Intentionally blank for now; we'll populate later */}
      <div className="newsList" />
      <style jsx>{`
        .card {
          margin-bottom: 16px;
          padding: 10px 12px;
        }
        .card h3 {
          margin: 0 0 8px;
          font-size: 18px;
          opacity: 0.9;
          font-weight: bold;
        }
        .newsList {
          min-height: 8px; /* keeps the section from collapsing while empty */
        }
      `}</style>
    </section>
  );
}
