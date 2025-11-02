# AI Country Risk Dashboard — Backend

## Overview

This directory contains the **data-engineering and inference pipeline** that powers the Country-Risk dashboard. It performs four core jobs:

1. **Data ingestion** — downloads World Bank macro-economic indicators and stores them as tidy, per-country panel datasets.
2. **Headline collection** — gathers recent articles via Google News RSS and resolves publisher URLs.
3. **Risk scoring** — calls an LLM (via LangChain) to transform macro data + recent headlines into a single 0-1 risk score and an explanatory bullet summary.
4. **Persistence** — upserts the score and all underlying data into a Neon-hosted PostgreSQL database for the frontend to consume.

### How headline scraping works (fast first, then targeted enrichment)

- All links are first processed with the **simple scraper** (`backend/utils/webscraping/simple_scraper.py`) which:
  - fetches each article **once**,
  - extracts a clean **summary**, **full text** (truncated for storage), and a **thumbnail** (OG/Twitter/JSON-LD with fallbacks).
- The LLM ranks articles by impact.
- **Only the Top-3** are optionally enriched with the **advanced scraper** (`backend/utils/webscraping/advanced_scraper.py`) **when they are from Reuters or Bloomberg** and a Crawlbase token is available. This uses Crawlbase to improve metadata while respecting `robots.txt`.

---

## Requirements

- **Python 3.10+** (tested on 3.11)
- PostgreSQL 15+ (Neon Serverless used in prod)
- `pip install -r backend/requirements.txt` (LangChain, pandas, psycopg2-binary, requests, beautifulsoup4, tldextract, python-dotenv, …)

---

## Environment variables (`.env` in `backend/`)

| Variable              | Purpose                                                                 |
| --------------------- | ----------------------------------------------------------------------- |
| `DATABASE_URL`        | Postgres connection string (Neon or local)                              |
| `OPENAI_API_KEY`      | OpenAI key used by `langchain_openai`                                   |
| `CRAWLBASE_JS_TOKEN`  | *(optional)* Crawlbase JS token for advanced Reuters/Bloomberg enrichment |
| `CRAWLBASE_TOKEN`     | *(optional)* Crawlbase standard token (used if JS token not provided)   |

> If neither Crawlbase token is set, the pipeline still runs; only the Top-3 Reuters/Bloomberg enrichment step is skipped.

---

## Quick start

```bash
# Create venv & install deps
python -m venv venv && source venv/bin/activate
pip install -r backend/requirements.txt

# Add .env in backend/ with DATABASE_URL, OPENAI_API_KEY, and optional Crawlbase token(s)

# Run the end-to-end ETL (fetch headlines → rank → LLM → DB)
python backend/main.py
```

*Running the full ETL for ~200 countries can take several minutes due to polite pacing of feed resolution and per-article fetches. If you need more speed, reduce country scope, tune batch sizes, or move to higher-throughput feeds/services.*

---

## Key modules

* `backend/main.py` — orchestrates the run: data payload → news → LLM scoring → DB upsert.
* `backend/utils/webscraping/simple_scraper.py` — single-request extractor for summary, full text, and thumbnail.
* `backend/utils/webscraping/advanced_scraper.py` — Crawlbase-powered metadata for **Top-3** Reuters/Bloomberg links only.
* `backend/utils/url_resolver.py` — resolves `news.google.com` wrappers to publisher URLs.
* `backend/utils/country_data_fetch.py` — World Bank panel ingestion.
* `backend/ai/langchain_llm.py` — LLM call for risk scoring.

---

## Database schema (simplified)

```sql
CREATE TABLE country (
    iso2  CHAR(2) PRIMARY KEY,
    name  TEXT      NOT NULL  -- canonical English name
);

CREATE TABLE indicator (
    id   SERIAL PRIMARY KEY,
    name TEXT UNIQUE NOT NULL,
    unit TEXT         NOT NULL
);

CREATE TABLE yearly_value (
    country_iso2 CHAR(2) REFERENCES country(iso2),
    indicator_id INT     REFERENCES indicator(id),
    yr           INT,
    value        DOUBLE PRECISION,
    PRIMARY KEY (country_iso2, indicator_id, yr)
);

CREATE TABLE risk_snapshot (
    country_iso2   CHAR(2) REFERENCES country(iso2),
    as_of          DATE,
    score          DOUBLE PRECISION,
    bullet_summary TEXT,
    PRIMARY KEY (country_iso2, as_of)
);

CREATE TABLE risk_snapshot_article (
    id            BIGSERIAL PRIMARY KEY,
    country_iso2  CHAR(2)      NOT NULL REFERENCES country(iso2),
    as_of         DATE         NOT NULL,
    rank          SMALLINT     NOT NULL CHECK (rank BETWEEN 1 AND 3),

    url           TEXT         NOT NULL,
    title         TEXT,
    source        TEXT,
    published_at  TIMESTAMPTZ,
    impact        DOUBLE PRECISION,
    summary       TEXT,
    image_url     TEXT,

    created_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),

    UNIQUE (country_iso2, as_of, rank),
    FOREIGN KEY (country_iso2, as_of)
        REFERENCES risk_snapshot (country_iso2, as_of)
        ON DELETE CASCADE
);

CREATE INDEX idx_risk_snapshot_article_country_date
    ON risk_snapshot_article (country_iso2, as_of);
```

---

## License

MIT — see `LICENSE` at repo root.