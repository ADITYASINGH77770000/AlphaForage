<div align="center">

<!-- Animated header banner -->
<img src="https://capsule-render.vercel.app/api?type=waving&color=0:0E1117,50:00C2FF,100:0E1117&height=200&section=header&text=AlphaForge&fontSize=80&fontColor=00C2FF&fontAlignY=38&desc=Institutional-Grade%20Quantitative%20Trading%20Platform&descAlignY=60&descSize=18&descColor=FFFFFF&animation=fadeIn" width="100%"/>

<br/>

[![Python](https://img.shields.io/badge/Python-3.9%2B-3776AB?style=for-the-badge&logo=python&logoColor=white)](https://python.org)
[![Next.js](https://img.shields.io/badge/Next.js-14-000000?style=for-the-badge&logo=nextdotjs&logoColor=white)](https://nextjs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.6-3178C6?style=for-the-badge&logo=typescript&logoColor=white)](https://typescriptlang.org)
[![Streamlit](https://img.shields.io/badge/Streamlit-1.35%2B-FF4B4B?style=for-the-badge&logo=streamlit&logoColor=white)](https://streamlit.io)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.115%2B-009688?style=for-the-badge&logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com)
[![Tests](https://img.shields.io/badge/Tests-176%20passing-00f5a0?style=for-the-badge&logo=pytest&logoColor=white)](tests/)
[![License](https://img.shields.io/badge/License-MIT-00C2FF?style=for-the-badge)](LICENSE)
[![Demo](https://img.shields.io/badge/Demo%20Mode-Enabled%20by%20Default-success?style=for-the-badge&logo=rocket)](README.md)

<br/>

> **AlphaForge is the quant platform that tells you the truth.**
>
> Most backtests lie. Tune a strategy long enough against the same history and you will always find a beautiful equity curve — one that evaporates the moment real money touches it. AlphaForge exists to catch that before you do: it tests strategies with real costs and unseen data, then delivers a blunt verdict on whether the edge is real or an overfit illusion.
>
> Underneath is a research-grade engine — alpha signals, ML forecasting, factor investing, regime detection, portfolio optimisation and risk analytics — served through **two front ends** that share one Python core: a **Next.js 14 web portal** and the original **Streamlit dashboard**.

<br/>

```
🎯 Honesty Engine       •   📡 Live Alpha Signals  •   🧠 ML Forecasting
🔁 Walk-Forward Tests   •   📊 Factor Attribution  •   🌐 Regime Detection
⚠️ Risk Management      •   💼 Portfolio Optimiser •   🔐 Account Portal
```

</div>

---

## 📽️ Demo Preview

<div align="center">

<!-- Architecture animated GIF placeholder — replace with real screen recording -->
```
┌──────────────────────────────────────────────────────────────────┐
│                                                                  │
│   📡 Command Center        📊 Dashboard         📈 Graphs        │
│   ─────────────────        ────────────         ──────────       │
│   Live watchlist metrics   Factor heatmaps      OHLCV + RSI      │
│   Rolling Sharpe chart     Regime overlays      Volume profile   │
│   Beta / CAGR / VaR        Correlation matrix   Seasonality      │
│                                                                  │
│   🧠 Prediction           🔁 Backtest           🌐 Regime        │
│   ─────────────           ──────────           ──────────       │
│   XGBoost / LSTM / TF     Vectorised engine     HMM 5-feature    │
│   Walk-forward OOS        Monte Carlo fan       Rolling refit    │
│   Confidence bands        Cost-aware P&L        CSD early warn   │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

*Run locally and explore — no API keys required in Demo Mode.*

</div>

---

## 🎯 The Honesty Engine

The feature the whole platform is named for. Every backtest is put through checks that most retail tools quietly skip, then reduced to one of three verdicts you cannot argue with.

| Check | What it answers | Reference |
|-------|-----------------|-----------|
| **Probabilistic Sharpe (PSR)** | Is this Sharpe distinguishable from zero, given skew and kurtosis? | Bailey & López de Prado (2012) |
| **Deflated Sharpe (DSR)** | Does it survive the fact that you tried many configurations? | Bailey & López de Prado (2014) |
| **PBO via CSCV** | If you picked the best in-sample, how often is it below median out-of-sample? | Bailey et al. (2017) |
| **Blow-up check** | Does the equity curve contain a ruinous drawdown? | — |
| **Beats buy & hold** | Net of real costs, did it actually beat doing nothing? | — |

```
PROBABLY REAL   →  the edge survives deflation and out-of-sample testing
LIKELY OVERFIT  →  it looks good only because you searched until it did
INCONCLUSIVE    →  not enough evidence either way — keep testing
```

> The engine is deliberately additive: `core/honesty.py` reads results, it never changes how any existing metric is calculated.

---

## 🌐 The Web Portal

A **Next.js 14 + TypeScript** portal (`frontend/`) sits alongside the Streamlit app, sharing the same Python engine through a same-origin `/api/*` proxy — so no backend host is ever baked into the client bundle.

- **Account-gated** — sign up / sign in, bcrypt-hashed passwords, opaque session tokens stored only as SHA-256 digests, httpOnly cookie
- **Nine feature modules** — every one wired to the real engine, no mock data anywhere
- **Runs on demand** — modules never fetch on mount; you press Run, so a page load never triggers a 50-second computation
- **Marketing + research pages** — home, features, about, and long-form insight articles with charts generated from the engine itself
- **Forge, the guide bot** — a first-visit welcome and per-module spotlight tours
- **3D hero** — a WebGL particle field (`ForgeScene`), client-only with low-power tiers

| Module | Route | What it runs |
|--------|-------|--------------|
| 🎯 Honesty Engine | `/features/honesty-engine` | DSR, PSR, PBO and the verdict |
| 📊 Dashboard | `/features/dashboard` | Price action, momentum, full risk picture |
| 🔁 Backtester | `/features/backtester` | Costs, walk-forward, Monte Carlo, regime matrix |
| ⚡ Signals | `/features/signals` | Alpha signals, health, crowding |
| ⚠️ Risk | `/features/risk` | VaR/CVaR across methods, GARCH, Kupiec |
| 💼 Portfolio | `/features/portfolio` | Efficient frontier, risk parity, contributions |
| 🧮 Factors | `/features/factors` | IC, quintiles, attribution, crowding, decay |
| 🌐 Regime | `/features/regime` | HMM states, rolling refit, conditional Sharpe |
| 🧠 Prediction | `/features/prediction` | ARIMA, GARCH and the ML Prediction Studio |

---

## ✨ Feature Highlights

<table>
<tr>
<td width="50%">

### 📡 Command Center
Real-time watchlist with portfolio-level metrics computed on every load:
- **Sharpe / Sortino / CAGR** (1-year rolling)
- **Max Drawdown**, **VaR 95%**, **CVaR 99%**
- **Beta** vs equal-weight benchmark
- **Win Rate** and **rolling 30-day Sharpe** chart
- Market regime banner (Bull 📈 / Sideways ↔ / Bear 📉)

</td>
<td width="50%">

### ⚡ Alpha Signals (6 Research Signals)
| Signal | Source |
|--------|--------|
| Volume Pressure (OFI Proxy) | Kolm 2023 |
| Factor Crowding Detector | Hua & Sun 2024 |
| IV Skew Signal | Höfler 2024 |
| Signal Health / Alpha Decay | AlphaAgent KDD 2025 |
| Cross-Asset Macro HMM Score | Shu & Mulvey 2024 |
| IC-Weighted Combined Score | Grinold & Kahn 1999 |

</td>
</tr>
<tr>
<td width="50%">

### 🔁 Backtest Engine
- **Vectorised** signal-to-position simulation
- **India & US cost models** (STT, SEBI, GST, stamp duty, slippage)
- Strategy library: Momentum, Mean Reversion, RSI, MACD, Dual MA
- **Walk-Forward** rolling OOS with overfit detection
- **Monte Carlo** fan chart + probability of profit + risk of ruin
- **Regime-Aware** auto-strategy switching

</td>
<td width="50%">

### 🧠 ML Prediction Pipeline
| Backend | Complexity |
|---------|------------|
| XGBoost Regressor | Lightweight (default) |
| LSTM (TensorFlow) | Deep learning |
| Transformer | Attention-based |
| ARIMA / GARCH | Statistical |
- Chronological train/val split (no data leakage)
- Confidence interval bands on forecast

</td>
</tr>
<tr>
<td width="50%">

### 🌐 Regime Detection (6 Upgrades)
1. **Forward-pass probabilities** — no lookahead bias
2. **5-feature HMM** — returns, vol, trend, range ratio, volume trend
3. **Regime age scalar** — duration-aware position sizing
4. **Critical Slowing Down** — AC1 + variance early warning (10–20d lead)
5. **Strategy Router** — factor weights flip per regime
6. **Rolling Refit** — HMM retrained every 21d on 252d window

</td>
<td width="50%">

### 📊 Factor Engine (8 Professional Fixes)
1. Honest factor proxies with limitations disclosed
2. Time-series IC computed at every rebalance date
3. Cost-adjusted quintile backtest
4. Regime-conditioned factor scoring
5. IC-weighted composite scoring
6. Factor attribution via Carhart (1997) 4-factor model
7. Crowding detection (Khandani & Lo 2007)
8. Cross-sectional IC decay curve

</td>
</tr>
</table>

---

## 🗂️ Project Structure

```
AlphaForge-main/
│
├── 📁 frontend/                     # Next.js 14 web portal (TypeScript + Tailwind)
│   ├── 📁 app/                      # App Router routes
│   │   ├── page.tsx                 # Home — hero, feature rows, insights
│   │   ├── features/                # /features + /features/[slug] module routes
│   │   ├── insights/[slug]/         # Long-form research articles
│   │   ├── login/ · signup/         # The only routes reachable signed out
│   │   └── layout.tsx               # AuthProvider → SiteGate → GuideBot
│   ├── 📁 components/
│   │   ├── modules/                 # The 9 engine-backed feature modules
│   │   ├── auth/                    # AuthProvider, SiteGate, RequireAuth, AuthForm
│   │   ├── guide/                   # Forge, the onboarding guide bot
│   │   ├── Hero.tsx · ForgeScene.tsx  # Landing hero + WebGL particle field
│   │   └── Marketing.tsx · FeaturesPage.tsx · AboutPage.tsx
│   ├── 📁 lib/
│   │   ├── api.ts                   # Typed client for the Python API
│   │   └── insights.ts              # Article content
│   ├── 📁 public/shots/             # Real screenshots of the running modules
│   └── next.config.mjs              # /api/* → FastAPI rewrite (same-origin)
│
├── 📁 api/                          # FastAPI REST layer
│   ├── server.py                    # All endpoints (wraps core/ — no logic duplication)
│   ├── auth.py                      # Accounts + sessions (bcrypt, hashed tokens)
│   ├── prediction_jobs.py           # Async job+poll for long ML trains
│   └── portfolio_analytics.py       # Portfolio endpoints backing the module
│
├── 📁 app/                          # Streamlit frontend
│   ├── main.py                      # 📡 Command Center (home page)
│   ├── data_engine.py               # Cached multi-ticker data loader
│   ├── shared.py                    # Shared Streamlit helpers
│   ├── run.py                       # App launcher
│   │
│   ├── 📁 pages/                    # Streamlit multi-page nav
│   │   ├── 01_Dashboard.py          # 📊  Factor heatmaps & correlation
│   │   ├── 02_Graphs.py             # 📈  OHLCV + 7 advanced graph features
│   │   ├── 03_Auditing.py           # 🔎  Trade audit & performance attribution
│   │   ├── 04_Prediction.py         # 🧠  ML forecast (XGBoost/LSTM/Transformer)
│   │   ├── 05_Alerts.py             # 🔔  Price & regime alert engine
│   │   ├── 06_Signals.py            # ⚡  Alpha signal dashboard (+ Gemini AI)
│   │   ├── 07_Backtest.py           # 🔁  Full backtest suite
│   │   ├── 08_Portfolio.py          # 💼  Efficient frontier & risk parity
│   │   ├── 09_Risk.py               # ⚠️  VaR / CVaR / drawdown risk panel
│   │   ├── 11_Factors.py            # 📐  8-fix professional factor engine
│   │   └── 12_Regime.py             # 🌐  6-upgrade HMM regime detector
│   │
│   └── 📁 ui_pages/                 # Modular UI components
│
├── 📁 core/                         # Pure Python backend (no Streamlit dependency)
│   ├── alpha_engine.py              # 6 research-grade alpha signals
│   ├── backtest_engine.py           # Vectorised backtest + walk-forward + Monte Carlo
│   ├── data.py                      # yfinance OHLCV loader + alignment utilities
│   ├── factor_engine.py             # 8-fix professional factor engine
│   ├── graph_features.py            # 7 advanced chart analytics (shared UI + API)
│   ├── indicators.py                # RSI, MACD, Bollinger Bands, ATR, Momentum
│   ├── metrics.py                   # Sharpe, Sortino, Calmar, VaR, CVaR, CAGR, IC
│   ├── models.py                    # ARIMA / GARCH / LSTM model wrappers
│   ├── portfolio_opt.py             # Monte Carlo frontier, risk parity, CVaR opt
│   ├── regime_detector.py           # 6-upgrade HMM regime detector
│   ├── alerts.py                    # Alert engine (price, regime, risk, prediction)
│   ├── honesty.py                   # 🎯 PSR, Deflated Sharpe, PBO → honest verdict
│   │
│   └── 📁 prediction/               # Modular ML prediction pipeline
│       ├── __init__.py
│       ├── evaluation.py            # OOS evaluation & confidence metrics
│       ├── models.py                # XGBoost, LSTM, Transformer model bundles
│       ├── pipeline.py              # End-to-end train → predict pipeline
│       └── preprocessing.py         # Feature engineering & chronological split
│
├── 📁 utils/                        # Shared utilities
│   ├── charts.py                    # Plotly chart helpers
│   ├── config.py                    # .env-backed config (no hardcoded secrets)
│   ├── notifications.py             # Gmail SMTP alert dispatcher
│   ├── report.py                    # ReportLab PDF report generator
│   ├── theme.py                     # Neuroscience-driven dark UI engine
│   └── logo.svg                     # AlphaForge brand mark
│
├── 📁 tests/                        # pytest test suite — 176 passing
│   ├── test_alpha_engine.py
│   ├── test_backtest.py
│   ├── test_data_engine.py
│   ├── test_graph_features.py
│   ├── test_honesty.py
│   ├── test_indicators.py
│   ├── test_metrics.py
│   ├── test_prediction_backend.py
│   └── test_api_compat.py
│
├── 📁 scripts/                      # Dev tooling
│   ├── capture_shots.py             # Re-capture real module screenshots via CDP
│   └── make_insight_charts.py       # Generate insight article charts from the engine
│
├── 📁 data/
│   ├── auth/                        # Local account store — gitignored, never commit
│   └── exports/                     # Alert logs, PDF reports output
│
├── 📁 .streamlit/
│   └── config.toml                  # Dark theme: #00C2FF primary, #0E1117 background
│
├── .env.example                     # Environment variable template
├── requirements.txt                 # Full install (core + ML)
├── requirements-core.txt            # Lightweight install (~500 MB)
├── requirements-ml.txt              # Heavy ML deps (~4–6 GB)
├── setup.sh                         # Linux/macOS one-command setup
├── setup.bat                        # Windows one-command setup
├── start_streamlit.bat              # Windows Streamlit launcher
└── start_api.bat                    # Windows API launcher
```

---

## 🚀 Quick Start

### Option 1 — One Command (Recommended)

**Windows**
```bat
cd AlphaForge-main
setup.bat
start_streamlit.bat
```

**Linux / macOS**
```bash
cd AlphaForge-main
bash setup.sh
source venv/bin/activate
python -m streamlit run app/main.py
```

### Option 2 — Manual Setup

```bash
# 1. Create virtual environment
python -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate

# 2. Install dependencies (choose one)
pip install -r requirements-core.txt   # Lightweight (~500 MB) — recommended first
pip install -r requirements-ml.txt     # + LSTM/Transformer/XGBoost (~4–6 GB)
pip install -r requirements.txt        # Full install (both)

# 3. Configure environment
cp .env.example .env            # Windows: copy .env.example .env
# Edit .env with your API keys (all optional — Demo Mode works without any)

# 4. Create data directories
mkdir -p data/cache data/exports   # Windows: mkdir data\cache data\exports

# 5. Launch
python -m streamlit run app/main.py
```

> ⚠️ **Windows tip**: Always use `python -m streamlit run app/main.py` (not bare `streamlit run`) to ensure the correct venv interpreter is used.

### Option 3 — The Web Portal (Next.js)

The portal needs **two processes**: the Python API, and the Next dev server that proxies to it.

```bash
# Terminal 1 — the engine (must be running first)
python -m uvicorn api.server:app --host 127.0.0.1 --port 8000

# Terminal 2 — the portal
cd frontend
npm install
npm run dev
```

Then open **http://localhost:3000**. Create an account on first visit — the portal is private, and `/login` and `/signup` are the only pages reachable signed out.

| Surface | URL | Command |
|---------|-----|---------|
| Web portal | http://localhost:3000 | `cd frontend && npm run dev` |
| REST API + Swagger | http://localhost:8000/docs | `python -m uvicorn api.server:app --port 8000` |
| Streamlit dashboard | http://localhost:8501 | `python -m streamlit run app/main.py` |

> 💡 The first compile of a 3D page takes 30–50s. `npx tsc --noEmit` is the fast correctness check.

---

## 🔌 Backend API

```bash
# Start the FastAPI backend
uvicorn api.server:app --host 0.0.0.0 --port 8000

# Windows shortcut
start_api.bat
```

Interactive docs at **http://localhost:8000/docs** (Swagger UI). The API is a thin wrapper around `core/` — zero logic duplication. Every endpoint delegates to the same Python functions powering the Streamlit pages.

**Endpoint groups** (~60 routes):

| Group | Examples |
|-------|----------|
| Auth | `POST /api/auth/signup` · `login` · `logout` · `GET /api/auth/me` |
| Market data | `GET /api/ohlcv/{t}` · `returns` · `indicators` · `metrics` · `graphs` · `audit` |
| Honesty | `GET /api/honesty/{t}` |
| Backtest | `POST /api/backtest` · `full` · `walkforward` · `montecarlo` · `regime-matrix` |
| Signals | `GET /api/signals/{t}` · `POST /api/signals/alpha` · `health` · `crowding` |
| Risk | `GET /api/risk/{t}` · `methods` · `garch` · `kupiec` · `POST /api/risk/portfolio` |
| Portfolio | `POST /api/portfolio/frontier` · `full` · `frontier-analytic` · `risk-parity` |
| Factors | `POST /api/factors` · `quintile` · `regime` · `attribution` · `crowding` · `decay` |
| Regime | `POST /api/regime/{t}` · `rolling/{t}` · `GET /api/macro/regime` |
| Prediction | `POST /api/prediction/arima` · `garch` · `lstm` · `studio/train` (async job+poll) |

> ⏱️ **Long-running work uses jobs, not requests.** A Prediction Studio train takes minutes, far past any proxy or serverless timeout, so it submits a job and the client polls `GET /api/prediction/studio/jobs/{id}`.

## 🚢 Deployment

AlphaForge deploys as **three independent services**. The portal talks to the API; the API and Streamlit share the same Python core.

```
Vercel                          Render
┌──────────────────────┐        ┌────────────────────────┐
│  Next.js portal      │  /api/*│  alphaforge-api        │
│  (frontend/)         │───────▶│  FastAPI + core/       │
│  API_URL env var     │        └────────────────────────┘
└──────────────────────┘        ┌────────────────────────┐
                                │  alphaforge-streamlit  │
                                │  app/main.py           │
                                └────────────────────────┘
```

> ⚠️ **Order matters** — deploy the API first. The portal needs its URL at build time.

### 1 · API + Streamlit on Render

Both services are defined in [render.yaml](render.yaml), so one blueprint deploys them together.

1. Push the repo to GitHub.
2. In Render → **New** → **Blueprint**, select the repository.
3. Render reads `render.yaml` and proposes **alphaforge-api** and **alphaforge-streamlit**. Approve both.
4. Wait for the first build (installs `requirements-core.txt` only — the ML stack is far too heavy for a free instance).
5. Confirm the API is alive at `https://<your-api>.onrender.com/api/config`, and Swagger at `/docs`.

Chosen deliberately over Vercel for the Python side: several endpoints legitimately run 15–50 seconds (`/api/factors/regime` is the worst at ~50s), and Vercel's Hobby tier kills a function at 10 seconds. Render's web services have no such cap.

### 2 · Portal on Vercel

1. In Vercel → **Add New** → **Project**, import the same repository.
2. Set **Root Directory** to `frontend` — this is the step everything else depends on.
3. Framework preset auto-detects as **Next.js**. Leave the build settings alone.
4. Add an environment variable:

   | Key | Value |
   |-----|-------|
   | `API_URL` | `https://<your-api>.onrender.com` *(no trailing slash)* |

5. Deploy. The portal proxies `/api/*` to Render server-side, so the browser stays same-origin and the backend host never reaches the client bundle.

See [frontend/.env.example](frontend/.env.example) for the same variable documented locally.

### Free-tier realities

| | Consequence |
|---|---|
| **Instances sleep** after ~15 min idle | First request after a nap pays a cold start of 30s+ |
| **Ephemeral filesystem** | `data/auth/*.json` does not survive a restart — **accounts created on the deployed portal will disappear**. Attach a paid persistent disk or move the store to a database if they must last. |
| **No auth on data routes** | 59 of 60 API routes are reachable without a session. Anyone with the API URL can read every analytic directly. |
| **Cookie without `secure`** | The session cookie is not HTTPS-only; see `_set_session_cookie` in `api/server.py`. |

> The last two are properties of the current code, not of Render. `api/auth.py` documents its own limits in its header — read it before treating the deployed portal as private.

### Streamlit Community Cloud (alternative)

If you only want the Streamlit dashboard live, Community Cloud is the shortest path:

- Entrypoint: `app/main.py`
- Dependency file: `app/requirements.txt` (already present — Community Cloud checks the entrypoint directory before the repo root)
- Python version: `3.11` under **Advanced settings**
- Secrets: none required; demo mode boots without any

```toml
DEMO_MODE = "true"
LOG_LEVEL = "INFO"
CACHE_TTL_SECONDS = "3600"
```

Docs: [deploy](https://docs.streamlit.io/deploy/streamlit-community-cloud/deploy-your-app/deploy) · [secrets](https://docs.streamlit.io/deploy/streamlit-community-cloud/deploy-your-app/secrets-management)

---


## 🟢 Demo Mode

`DEMO_MODE=true` is the default. The entire platform — both front ends, every module and all ~60 endpoints — runs on synthetic data with **no API keys and no network access required**. Set it to `false` in `.env` to pull live data from yfinance.

---

## ⚙️ Configuration

Copy `.env.example` to `.env` and fill in the keys you need:

```env
# ── Gmail SMTP (price alert emails) ──────────────────────
GMAIL_SENDER=you@gmail.com
GMAIL_PASSWORD=your_app_password      # Use a Gmail App Password, not your login
GMAIL_RECEIVER=recipient@email.com

# ── NewsAPI (news sentiment feed) ────────────────────────
NEWS_API_KEY=your_newsapi_key         # Free tier at newsapi.org

# ── Gemini AI (explainable signal summaries) ─────────────
GEMINI_API_KEY=your_gemini_key
GEMINI_MODEL=gemini-1.5-flash

# ── Alpaca Markets (live/paper trading) ──────────────────
ALPACA_API_KEY=your_alpaca_key
ALPACA_SECRET_KEY=your_alpaca_secret
ALPACA_BASE_URL=https://paper-api.alpaca.markets

# ── App settings ─────────────────────────────────────────
DEMO_MODE=true                        # false = live yfinance data
LOG_LEVEL=INFO
CACHE_TTL_SECONDS=3600
```

> 🟢 **Demo Mode** (`DEMO_MODE=true`) is enabled by default. The full platform runs with synthetic/cached data — no API keys required.

---

## 📦 Dependency Tiers

| Tier | Command | Size | Includes |
|------|---------|------|----------|
| **Core** | `pip install -r requirements-core.txt` | ~500 MB | Streamlit, FastAPI, yfinance, PyPortfolioOpt, HMM, ARIMA, sklearn, Plotly |
| **ML** | `pip install -r requirements-ml.txt` | ~4–6 GB | Everything above + TensorFlow, PyTorch, XGBoost (for LSTM/Transformer pages) |
| **Full** | `pip install -r requirements.txt` | ~4–6 GB | Core + ML (combined) |

> 💡 Start with Core. Only install ML if you need the Prediction page (page 04).

---

## 🧪 Running Tests

```bash
source venv/bin/activate   # Windows: venv\Scripts\activate
python -m pytest tests/ -q          # 176 passing

cd frontend && npx tsc --noEmit     # frontend type check
```

> ⚠️ Always target `tests/`. Running bare `pytest` from the repo root picks up `utils/test_email.py`, a manual SMTP script that calls `sys.exit(1)`.

| Test File | Coverage |
|-----------|---------|
| `test_alpha_engine.py` | OFI, crowding, IV skew, health, macro signals |
| `test_backtest.py` | Vectorised engine, cost model, walk-forward |
| `test_data_engine.py` | OHLCV loading, alignment, caching |
| `test_graph_features.py` | All 7 graph analytics (relative strength, volume profile, etc.) |
| `test_honesty.py` | PSR, Deflated Sharpe, PBO/CSCV, verdict thresholds |
| `test_indicators.py` | RSI, MACD, Bollinger, ATR, Momentum |
| `test_metrics.py` | Sharpe, Sortino, VaR, CVaR, CAGR, IC, ICIR |
| `test_prediction_backend.py` | Chronological split, XGBoost, fallback |
| `test_api_compat.py` | FastAPI endpoint compatibility |

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         USER INTERFACES                         │
│                                                                 │
│  ┌─────────────────────────┐    ┌──────────────────────────┐    │
│  │   Next.js Web Portal    │    │   Streamlit Dashboard    │    │
│  │   (frontend/, :3000)    │    │   (app/, :8501)          │    │
│  │   9 modules · account   │    │   Command Center +       │    │
│  │   gated · runs on demand│    │   11 multi-page tabs     │    │
│  └────────────┬────────────┘    └────────────┬─────────────┘    │
│               │ /api/* rewrite               │ direct import    │
└───────────────┼──────────────────────────────┼─────────────────┘
                ▼                              │
┌─────────────────────────────────────────────┐│
│            FastAPI REST LAYER               ││
│            (api/server.py, :8000)           ││
│   auth.py · prediction_jobs.py              ││
│   portfolio_analytics.py · /docs Swagger    ││
└───────────────┬─────────────────────────────┘│
                │            calls             │
                ▼                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                        CORE ENGINE LAYER                        │
│                                                                 │
│  alpha_engine.py    backtest_engine.py    regime_detector.py    │
│  factor_engine.py   portfolio_opt.py      prediction/           │
│  metrics.py         indicators.py         graph_features.py     │
│  data.py            alerts.py             models.py             │
│  honesty.py  ← 🎯 the verdict layer, reads results only         │
└───────────────────────────────┬─────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                         DATA LAYER                              │
│                                                                 │
│  yfinance (OHLCV)   NewsAPI (sentiment)   Alpaca (live feed)    │
│  Gemini AI (NLP)    Local cache (JSON)    Gmail SMTP (alerts)   │
└─────────────────────────────────────────────────────────────────┘
```

---

## 📈 Streamlit Pages Overview

*(For the Next.js portal's nine modules, see [The Web Portal](#-the-web-portal) above.)*

| # | Page | Key Features |
|---|------|-------------|
| 🏠 | **Command Center** (`main.py`) | Portfolio metrics, regime banner, watchlist, rolling Sharpe |
| 01 | **Dashboard** | Factor heatmaps, correlation matrix, regime overlays |
| 02 | **Graphs** | OHLCV charts + 7 graph analytics: Relative Strength, Volume Profile, Gap & Session Decomposition, Seasonality Atlas, Volume Shock, Breakout Context, Candle Structure Lab |
| 03 | **Auditing** | Trade-level P&L audit, performance attribution, drawdown analysis |
| 04 | **Prediction** | XGBoost / LSTM / Transformer forecasts, confidence bands, OOS validation |
| 05 | **Alerts** | Price threshold alerts, regime-change alerts, email delivery via Gmail SMTP |
| 06 | **Signals** | 6 alpha signals, IC tracking, Gemini AI explainer summaries |
| 07 | **Backtest** | Full strategy library, India/US cost models, walk-forward, Monte Carlo |
| 08 | **Portfolio** | Efficient frontier (MC + analytical), max-Sharpe, min-vol, risk parity |
| 09 | **Risk** | VaR (historical / parametric / Student-t / GARCH), CVaR, Kupiec backtest |
| 11 | **Factors** | 8-fix factor engine: momentum, value, quality, size, low-vol, composite IC |
| 12 | **Regime** | 6-upgrade HMM: 5-feature, forward-only, rolling refit, CSD early warning |

---

## 🧬 Core Modules Deep Dive

### `core/metrics.py` — Quant Metrics Library
```python
sharpe(returns, rf=None)         # Annualised Sharpe (uses cfg.RISK_FREE_RATE)
sortino(returns, rf=None)        # Sortino (downside deviation only)
max_drawdown(returns)            # Peak-to-trough maximum drawdown
var_historical(returns, 0.95)    # Historical VaR at confidence level
cvar_historical(returns, 0.95)   # Conditional VaR (Expected Shortfall)
cagr(returns)                    # Compound Annual Growth Rate
information_coefficient(s, f)   # Spearman IC between signal and forward returns
icir(ic_series)                  # IC Information Ratio
```

### `core/indicators.py` — Technical Indicators
```python
rsi(close, period=14)            # Relative Strength Index
macd(close, 12, 26, 9)          # MACD line, signal, histogram
bollinger_bands(close, 20, 2.0)  # Mid, upper, lower, %B, bandwidth
atr(high, low, close, 14)        # Average True Range
momentum(close, period=12)       # 12-month price momentum
add_all_indicators(df)           # Attach all indicators to OHLCV DataFrame
```

### `core/portfolio_opt.py` — Portfolio Construction
```python
monte_carlo_frontier(returns, n_portfolios=1000)   # Random-sampling frontier
analytical_frontier(returns)                       # Scipy-optimised precise frontier
efficient_frontier(returns)                        # Combined: curve + MC cloud + key pts
risk_parity_weights(returns)                       # Equal Risk Contribution (Maillard 2010)
portfolio_stats(weights, returns)                  # Return / vol / Sharpe for any weights
```

---

## 🔬 Research References

| Signal / Method | Reference |
|----------------|-----------|
| Probabilistic Sharpe Ratio | Bailey & López de Prado (2012) — *The Sharpe Ratio Efficient Frontier*, Journal of Risk |
| Deflated Sharpe Ratio | Bailey & López de Prado (2014) — *The Deflated Sharpe Ratio*, Journal of Portfolio Management |
| Probability of Backtest Overfitting | Bailey, Borwein, López de Prado & Zhu (2017) — *The Probability of Backtest Overfitting*, Journal of Computational Finance |
| Order Flow Imbalance | Kolm et al. (2023) — *Deep Order Flow Imbalance*, Mathematical Finance |
| Factor Crowding | Hua & Sun (2024); Khandani & Lo (2007) |
| IV Skew Signal | Höfler (2024) |
| Alpha Decay Monitoring | AlphaAgent, KDD 2025 |
| HMM Regime Detection | Shu, Yu & Mulvey (2024) arXiv:2402.05272 |
| Critical Slowing Down | iScience (2025) PMC11976486 |
| Regime Rolling Refit | Baitinger & Hoch (2024) SSRN:4796238 |
| IC-Weighted Composite | Grinold & Kahn (1999) — *Active Portfolio Management* |
| Carhart Attribution | Carhart (1997) — *On Persistence in Mutual Fund Performance* |
| Risk Parity | Maillard, Roncalli & Teïletche (2010) |
| Regime Strategy Routing | Aydinhan, Kolm et al. (2024) SSRN:4556048 |

---

## 🤝 Contributing

1. Fork the repo and create your feature branch: `git checkout -b feature/your-idea`
2. Ensure tests pass: `python -m pytest tests/ -v`
3. Add tests for new core logic in `tests/`
4. Submit a pull request with a clear description

**Code conventions:**
- Core logic lives in `core/` only — no Streamlit imports in backend
- The API and both front ends are **thin**: they present results, they never compute them
- All config via `.env` — never hardcode credentials
- New signals must include a literature reference and limitation disclosure
- Vectorised operations preferred over Python loops
- Frontend modules **run on demand** — never fetch on mount
- Anything that can exceed ~25s must use the job+poll pattern, not a plain request

---

## 📄 License

Distributed under the **MIT License**. See `LICENSE` for details.

---

## ⭐ Star History

If AlphaForge saved you time or inspired your quant research, give it a ⭐ on GitHub — it helps other traders discover it.

---

<div align="center">

<img src="https://capsule-render.vercel.app/api?type=waving&color=0:0E1117,50:00C2FF,100:0E1117&height=120&section=footer&animation=fadeIn" width="100%"/>

**Built with 🔵 by the AlphaForge team — for quants, by quants.**

*No paid data. No black boxes. All research cited.*

</div>
