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

-- Global "AI Alerts": each run pools every country's Top-3 articles, the LLM
-- ranks them by importance to the global economy, tags one topic + severity,
-- and only the top-N (ALERTS_TOP_N) are stored. Replace-per-day semantics.
CREATE TABLE news_alert (
    id           BIGSERIAL PRIMARY KEY,
    as_of        DATE         NOT NULL,
    global_rank  SMALLINT     NOT NULL,
    country_iso2 CHAR(2)      NOT NULL,
    country_name TEXT,

    url          TEXT         NOT NULL,
    title        TEXT,
    source       TEXT,
    published_at TIMESTAMPTZ,
    summary      TEXT,
    image_url    TEXT,

    topic        TEXT         NOT NULL,  -- Conflict|Sanctions|Macro|Politics|Trade|Energy|Security|Markets
    severity     TEXT         NOT NULL CHECK (severity IN ('Critical','Caution','Watch')),
    importance   DOUBLE PRECISION,       -- global-economy importance (0-1)
    rationale    TEXT,

    created_at   TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ  NOT NULL DEFAULT now(),

    UNIQUE (as_of, global_rank)
);

CREATE INDEX idx_news_alert_as_of ON news_alert (as_of);

-- Live "Prices" pane. Maintained by the standalone prices_daemon.py (NOT main.py):
-- one row per tracked asset, upserted in place every few minutes. Stocks/crypto/
-- commodities come from FMP batch-quote; US Treasury yields from FMP treasury-
-- rates. is_yield rows carry POINT changes (shown as %); others carry % moves.
CREATE TABLE market_price (
    symbol        TEXT PRIMARY KEY,      -- stable internal id, e.g. 'SP500','US10Y'
    label         TEXT    NOT NULL,      -- display label (MSCI rows relabeled to ETF)
    asset_class   TEXT    NOT NULL CHECK (asset_class IN ('stocks','bonds','crypto','commodities')),
    source_symbol TEXT,                  -- FMP quote symbol / treasury-rates tenor
    is_yield      BOOLEAN NOT NULL DEFAULT FALSE,

    px            DOUBLE PRECISION,      -- last price / yield
    chg           DOUBLE PRECISION,      -- 1D  (% for prices, points for yields)
    q             DOUBLE PRECISION,      -- 1Q
    ytd           DOUBLE PRECISION,      -- YTD
    sort_order    INTEGER NOT NULL DEFAULT 0,

    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Quarter-/year-start reference closes for the 1Q/YTD calc. Refreshed at most
-- once per day so each live tick computes q/ytd in-process with zero extra calls.
CREATE TABLE price_reference (
    symbol                 TEXT PRIMARY KEY,
    ref_q                  DOUBLE PRECISION,
    ref_q_date             DATE,
    ref_ytd                DOUBLE PRECISION,
    ref_ytd_date           DATE,
    reference_refreshed_on DATE,
    updated_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

---

## Live prices feed (`prices_daemon.py`)

A standalone, long-running daemon — **separate from the daily `main.py` ETL** — keeps
the bottom-bar "Prices" pane fresh. It polls every `PRICES_POLL_SECONDS` (default 300)
and upserts the latest snapshot into `market_price`.

* **Sources.** Equity indices, the MSCI ETF proxies (ACWI/ACWX/EEM, relabeled), crypto,
  and commodities come from **FMP batch-quote** in one call per tick. US Treasury yields
  (2Y/10Y/30Y) come from **FMP treasury-rates** (FMP has no non-US yield feed, so the
  Bonds pane tracks US tenors only). The tracked universe + symbol map lives in
  `constants.PRICE_ASSETS`.
* **Cost control.** FMP quote classes are fetched only while their market is open
  (`utils/market_hours.py`: crypto 24/7, US equities on the NYSE session, commodities on
  the Globex window). The yields and the 1Q/YTD reference closes refresh at most once per
  ET day.

```bash
# One-shot tick (verification): fetch once, upsert, exit
python backend/prices_daemon.py --once

# Continuous loop (what the launcher runs)
python backend/prices_daemon.py
```

On Windows, `run_prices_daemon.bat` (repo root) activates the venv and runs the daemon in
an auto-restart loop; point a boot-time Task Scheduler entry at it so the feed runs
alongside the `main.py` cron. Reuses `FMP_API_KEY` + `DATABASE_URL` — no other secret needed.

---

## License

MIT — see `LICENSE` at repo root.