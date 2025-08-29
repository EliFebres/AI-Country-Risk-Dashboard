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
AI PROMPT — Country Investor-Risk Scoring (0.00–1.00)

You are a senior geopolitical risk analyst advising global investors. Produce a single calibrated investor-risk score for {country} for the next 12 months.

SCORING FRAMEWORK (use full 0.00–1.00 range)
Weight each sub-factor, then renormalize if any sub-score is null:
  • conflict_war (0.30) — interstate war, civil war, insurgency, large-scale terror, mobilizations, ceasefires.
      Anchors: 0.00 none; 0.40 sporadic political violence; 0.70 sustained insurgency/low-intensity conflict;
               0.90–1.00 active interstate war on domestic territory OR regular long-range strikes on cities/critical infrastructure;
               0.95–1.00 active war PLUS broad sanctions/financial isolation.
  • political_stability (0.25) — government durability, elite cohesion, protest/coup risk, succession risk.
      Anchors: 0.10 stable democracy; 0.50 recurrent unrest/cabinet churn; 0.80 coup/constitutional crisis.
  • governance_corruption (0.20) — rule of law, corruption control, contract enforcement, expropriation risk.
      Anchors: 0.10 strong institutions; 0.50 uneven enforcement; 0.80 kleptocracy/asset seizure risk.
  • macroeconomic_volatility (0.15) — inflation/FX volatility, external balances, reserves, debt stress.
      Anchors: 0.10 low inflation & ample reserves; 0.50 twin-deficit pressure; 0.80 crisis/IMF distress.
  • regulatory_uncertainty (0.10) — policy predictability, capital controls, tax windfalls, sector bans, sanctions compliance.
      Anchors: 0.10 predictable & pro-market; 0.50 ad-hoc shifts; 0.80 abrupt controls/retroactive measures.

CALIBRATION GUIDE (illustrative, not mandatory)
  • Very-low-risk OECD democracies with no major conflict → 0.05–0.20
  • Typical emerging market with moderate uncertainty → 0.40–0.60
  • Active interstate war on domestic territory and/or sustained nationwide strikes → 0.90–0.98
  • Active war + sweeping sanctions/financial isolation → 0.95–0.99

RULES
1) Score each sub-factor in [0,1]. If insufficient evidence, set that sub-score to null.
2) Proportionally re-weight the remaining factors and compute the weighted average. If all are null, overall "score" = null.
3) Dominance & floors for severe conflict:
   • If conflict_war ≥ 0.85 AND hostilities occur on domestic territory OR there are regular long-range strikes on cities/critical infrastructure, set a risk floor of 0.90 on the overall score.
   • If conflict_war ≥ 0.90 AND the country faces broad sanctions/financial isolation, set a risk floor of 0.93 on the overall score.
   • Mitigants (e.g., reserves, aid) may not reduce the overall score below these floors.
4) Use only the provided evidence; do not infer unstated facts. Be conservative when signals conflict.
5) Think through the scoring internally. Do NOT show your reasoning or any calculations.
6) Output must be valid JSON only, exactly:
{
  "score": <float in [0,1] or null>,
  "bullet_summary": "<≤120 words, naming primary drivers and any meaningful mitigants to explain risk rating>"
}
EXAMPLE
{
  "score": 0.72,
  "bullet_summary": "Active conflict and severe sanctions elevate risk; FX reserves provide a partial buffer."
}
```
#### Now evaluate {country} considering {prompt_points}.


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