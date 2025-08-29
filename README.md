# AI Country Risk Dashboard

![AI Risk Dashboard](/assets/ai-risk-dashboard.gif)

## Overview

The **AI Country Risk Dashboard** is an open‑source web application that quantifies and visualizes geopolitical investment risk using artificial intelligence. It combines macro‑economic indicators from the World Bank with recent news and produces a **0–1 risk score** and an explanatory bullet summary for each country. Scores and summaries are stored in a PostgreSQL database and rendered on an interactive world map.

### Features

* **Data ingestion** – Downloads and formats World‑Bank macro‑economic indicators such as inflation, unemployment, political stability and other factors and stores them in per‑country panel datasets. The coverage universe currently includes 50 countries (25 developed and 25 emerging).
* **Risk scoring** – Uses a large‑language model (via LangChain and OpenAI) to combine macro data and recent headlines into a single 0–1 risk score and a bullet‑point explanation. The AI prompt enforces hard rules around war, political stability and macro floors to ensure consistent scoring.
* **Persistence** – Persists macro series and risk snapshots into a Neon‑hosted PostgreSQL database using a transactional upsert strategy.
* **Interactive frontend** – A Next.js frontend renders a world map with clickable markers. Risk values are read from `public/api/risk.json`, and a server‑side function updates the file no more than once per week. Clicking a marker opens a sidebar with the country name, risk score and explanation.
* **Extensible architecture** – The backend is pure Python and uses modular utilities for metric fetching, news scraping and LLM calls. The frontend uses modern React/Next.js and is ready to deploy to Vercel or your own server.

## My Ai Prompt
```bash
You are a senior geopolitical risk analyst. Rate investor risk for {country} over the next 12 months using ONLY the evidence provided.

EVIDENCE_JSON
{evidence_json}

ARTICLES_JSON
# exactly these items only
# [{{"id":"a1","source":"...","published_at":"YYYY-MM-DD","title":"...","summary":"..."}}]
{articles_json}

Scoring bands (guidance; use full 0-1 range):
  • 0.05-0.20 = Low   • 0.20-0.40 = Low-Moderate   • 0.40-0.70 = Moderate
  • 0.70-0.90 = High  • 0.90-0.98 = Extreme (active war / nationwide shutdowns)

Sub-factors to score (diagnostic only):
  conflict_war, political_stability, governance_corruption, macroeconomic_volatility, regulatory_uncertainty.

# --- Localization & Materiality ---
Do NOT raise risk due to indirect foreign tensions or rhetoric. Elevate risk ONLY for {country} when evidence shows kinetic activity on its territory, imminent hostilities, or economically binding policy affecting {country}. Indirect disputes, UN votes, or rhetoric without domestic transmission = low impact.

# --- Hard Rules the model must apply (no post-processing will alter your score) ---
• War Reality: If a sustained interstate war or regular long-range strikes hit {country}'s cities/critical infrastructure → set conflict_war ≥ 0.90 AND overall score ≥ 0.90.
• Internal Conflict:
   - Level A (Severe): recurring mass-casualty attacks (≥20 killed) or mass kidnappings in the last 90 days across ≥3 regions → conflict_war ≥ 0.80 AND overall score ≥ 0.70.
   - Level B (Very severe): Level A + repeated attacks on critical infrastructure (pipelines/power grid) or major-city attacks → conflict_war ≥ 0.88 AND overall score ≥ 0.80.
   - Level C (Extreme): Level B + nationwide emergency effects (large displacement, prolonged curfews, export shut-ins) → overall score ≥ 0.90.
• Parliamentary Guardrail: Cabinet resignations, caretaker phases, coalition talks, or scheduled/snap elections remain **moderate** unless there is unconstitutional dissolution, emergency/martial law, week-long widespread violent unrest disrupting essential services, bank runs, capital controls, or sovereign default. Otherwise **political_stability should not exceed 0.45**.
• Macro floors (numeric): If CPI inflation ≥ 25% → macroeconomic_volatility ≥ 0.70 AND overall score ≥ 0.55. If ≥ 40% → ≥ 0.80 AND overall ≥ 0.65. If ≥ 80% → overall ≥ 0.80.

# --- Per-article impact labels (for diagnostics; caller won't re-score) ---
Impact ∈ [0,1]:
  • 0.85-1.00 Severe - kinetic activity in/against {country}, mass kidnappings, binding economic measures, or major infrastructure sabotage.
  • 0.60-0.75 Moderate - credible mobilization/preparations, high-probability sanctions.
  • 0.40-0.55 Mixed/unclear - indirect third-country events with uncertain transmission.
  • 0.05-0.25 Low/benign - rhetoric/symbolic acts.

Return ONLY valid JSON (no prose) exactly:

{{
  "subscores": {{
    "conflict_war": <float 0..1 or null>,
    "political_stability": <float 0..1 or null>,
    "governance_corruption": <float 0..1 or null>,
    "macroeconomic_volatility": <float 0..1 or null>,
    "regulatory_uncertainty": <float 0..1 or null>
  }},
  "news_article_scores": [
    {{"id": "<id from ARTICLES_JSON>", "impact": <float 0..1>}}
  ],
  "score": <float 0..1>,  # your single calibrated investor-risk score AFTER applying the hard rules above
  "bullet_summary": "<<=120 words explaining primary drivers and meaningful mitigants>"
}}
```

## Getting Started

### Prerequisites

To run the dashboard you will need the following components:

| Component | Version/Requirement |
|-------------|---------------------------------------|
| Python | 3.10 or newer |
| Node & npm | Node 18+ |
| PostgreSQL | 15+ (Neon Serverless recommended) |
| OpenAI key | For LLM risk scoring |

### Clone the repository

```bash
git clone https://github.com/EliFebres/AI-Country-Risk-Dashboard.git
cd AI-Country-Risk-Dashboard
```

### Configure environment variables

Create the following `.env` files before running:

| Location | File | Keys & purpose |
|------------|--------------|---------------------------------------------------------------------|
| `backend` | `.env` | `DATABASE_URL` – PostgreSQL connection string; `OPENAI_API_KEY` – OpenAI API key |
| `frontend` | `.env.local` | `DATABASE_URL` – Postgres URL with `sslmode=require` |

The `backend/.env` file is read by the ETL pipeline and the database upsert routines. The `frontend/.env.local` is used by the Next.js server‑side function that refreshes `public/api/risk.json`.

### Backend setup

1. **Activate a virtual environment and install dependencies:**

 ```bash
 python -m venv venv && source venv/bin/activate
 pip install -r backend/requirements.txt
 ```

2. **Seed macro data (optional):** The first run of the ETL will automatically download World Bank panels for all configured countries. If you wish to pre‑download, run:

 ```bash
 python backend/utils/country_data_fetch.py
 ```

3. **Run the end‑to‑end ETL:** This computes risk scores and persists them to the database.

 ```bash
 python backend/main.py
 ```

 The script loops over each country, builds the macro payload, fetches relevant news, calls the LLM to generate a risk score and bullet summary, and upserts the results into Postgres. Running the ETL for around 200 countries can take several minutes because the news fetcher throttles requests to stay under Google’s anonymous quota.

### Frontend setup

1. **Install dependencies:**
 ```bash
cd frontend
npm install
 ```

2. **Seed risk data:**
Ensure there is an initial `public/api/risk.json` file populated with objects of the form `{name, lngLat, risk}`. You can create a simple seed manually or export from the database.

3. **Run the development server:**
 ```bash
npm run dev
 ```

On first load the client calls `POST /api/refresh-risk`. The server checks when the last refresh was run and either skips the update or queries Neon for fresh risk scores and writes them to `public/api/risk`.json. The client then fetches the JSON with a cache‑busting query to avoid stale data.

### Updating risk values
The front‑end includes a server‑only route `/api/refresh-risk` that automatically updates risk scores if more than seven days have passed since the last run. To trigger an update manually, send:
 ```bash
curl -X POST http://localhost:3000/api/refresh-risk
 ```

### Directory Structure
```bash
AI-Country-Risk-Dashboard/
├── backend/               # Python ETL, LLM scoring and DB interface
│   ├── ai/                # LangChain LLM wrapper and prompt templates
│   ├── data/              # Raw and processed World‑Bank panels
│   ├── notebooks/         # Jupyter notebooks for exploration
│   ├── utils/             # Helper functions for data fetching and parsing
│   ├── main.py            # Entry point for end‑to‑end ETL
│   ├── constants.py       # Indicator definitions and LLM prompt
│   ├── data_push.py       # Transactional upsert into PostgreSQL
│   └── README.md          # Detailed backend instructions
├── frontend/              # Next.js app that renders the world map
│   ├── app/               # App Router pages and API routes
│   ├── components/        # Map component and UI elements
│   ├── public/api/        # `risk.json` and metadata files
│   └── README.md          # Detailed frontend instructions
├── LICENSE                # MIT license
└── README.md              # (You are here)
```

### Database Schema
The following schema is created automatically by the ETL and used by the dashboard:

| Table | Description
|------------|--------------
|`country`      | Country ISO‑2 code and canonical name |
|`indicator`    | Indicator definitions and units |
|`yearly_value` | Yearly macro indicator values per country | 
|`risk_snapshot`| Risk score and bullet summary for a given date|

The `risk_snapshot` table stores the 0–1 risk score and the human‑readable summary produced by the LLM.

### Contributing
Contributions, bug reports and feature requests are welcome! Please open an issue or submit a pull request on GitHub. When adding new data sources or indicators, update the `constants.py` mappings and ensure your changes are reflected in both the backend and the frontend.

### License
This project is licensed under the MIT License. See the `LICENSE` file for details.

### Acknowledgements
The dashboard relies on open data from the World Bank for macro‑economic indicators, Google News for headline scraping, and OpenAI’s models for risk scoring. Thanks to the maintainers of LangChain, Next.js and the open‑source community for their tools and libraries.