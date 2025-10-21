# AI Country Risk Dashboard — Backend

## Overview

This directory contains the **data‑engineering and inference pipeline** that powers the Country‑Risk dashboard. It performs three main jobs:

1. **Data ingestion** – downloads World Bank macro‑economic indicators and stores them as tidy, per‑country panel datasets.
2. **Risk scoring** – calls an LLM (via LangChain) to transform macro data + recent headlines into a single 0‑1 risk score and an explanatory bullet summary.
3. **Persistence** – upserts the score and all underlying data into a Neon‑hosted PostgreSQL database for the frontend to consume.

## Requirements

- **Python 3.10+**  (tested on 3.11)
- PostgreSQL 15+ (Neon Serverless is used in prod)
- `pip install -r requirements.txt`  (LangChain, psycopg2‑binary, pandas …)

---

## Environment variables (`.env`)

| Variable         | Purpose                                    |
| ---------------- | ------------------------------------------ |
| `DATABASE_URL`   | postgres connection string (Neon or local) |
| `OPENAI_API_KEY` | OpenAI key used by `langchain_openai`      |

Create a `.env` inside the backend folder with the preceding values

---

## Quick start

```bash
# Activate venv & install deps
python -m venv venv && source venv/bin/activate
pip install -r backend/requirements.txt

# Run the ETL end‑to‑end (fetch headlines → LLM → DB)
python backend/main.py
```

*Running the ETL for \~200 countries will take a few minutes because **``** sleeps \~2 s per request to stay under Google’s anonymous quota.  Adjust the sleep window or switch to a paid API if you need speed.*

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
    yr           INT,       -- calendar year
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

MIT — see `LICENSE` at repo root.

