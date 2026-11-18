# UIUC Housing Search Platform

A housing search tool for UIUC students who want one place to compare real listings from Champaign-Urbana landlords.

The platform collects listings directly from property management sites, normalizes them into one dataset, and lets students filter by beds, price, availability, property type, source, and location.

IlliniRent has two parts.

- **Website (Online)** — [illinirent.com](https://illinirent.com)
- **App (Waiting to Launch)** — native iOS and Android app

## Product

UIUC students do not need another place to chat about housing. They need one reliable dataset they can filter quickly.

The core workflow is:

- filter listings by beds, budget, move-in date, property type, company, and location
- scan results in Card view with photos, prices, availability, and source links
- switch to Map view when distance to campus matters
- see which companies are included, excluded, or blocked by source limitations

Website views:

- **About** (`/about`) — editorial product page and entry point
- **Card** (`/card`) — filter-driven listing browse
- **Map** (`/map`) — the same filtered listings plotted around campus
- **Login** (`/login`) — Supabase sign-in

Access is gated with Supabase Auth so listing access stays limited to approved users. There is no standalone account page now; the header user menu owns the signed-in state, shows the current user, and provides Log out.

Archived code:

- Chat, Table, and RAG code lives under `archive/legacy-chat-rag/` and is not imported by the active app.
- The former `Rate & Report` page lives under `archive/retired-feedback-page/`.
- A complete pre-redesign frontend snapshot lives under `archive/ui-snapshots/`.

## System Flow

1. **Scrape** — one Playwright scraper per landlord writes `data/<company>_raw.json`.
2. **Normalize** — `pipeline.normalize` merges raw files into a dated SQLite snapshot.
3. **Geocode** — `pipeline.geocode` fills missing coordinates and keeps verified coordinates.
4. **Serve** — FastAPI reads the latest snapshot and applies SQL filters.
5. **Browse** — Next.js renders Card and Map views from `/api/listings`.

Active backend endpoints:

- `GET /api/status`
- `GET /api/listings`

Local ports:

- backend: `http://localhost:3101`
- frontend: `http://localhost:3102`
- Expo Metro: `http://localhost:3103`

## Tech Stack

### Website (Online)

| Layer | Technology |
|---|---|
| Scraping | Playwright |
| Database | SQLite snapshots |
| Backend | FastAPI + Uvicorn |
| Frontend | Next.js 16, React 19, TypeScript 5, Tailwind CSS 4 |
| Auth | Supabase Auth |
| Maps | react-map-gl, MapLibre GL, OpenFreeMap, OpenRouteService |
| Deployment | Railway backend, Vercel frontend |
| Backend language | Python 3.14 |

### App (Waiting to Launch)

The iOS and Android apps use the same FastAPI backend and listing data as the web app.

| Layer | Technology |
|---|---|
| App framework | Expo SDK 57, React Native 0.86, React 19, TypeScript 6 |
| Navigation | Expo Router |
| Server state | TanStack Query |
| Auth | Supabase Auth (email OTP), Expo SecureStore |
| Maps | MapLibre React Native, OpenFreeMap |
| Crash reporting | Sentry |
| Build tooling | Expo development builds, EAS Build profiles |

## Project Structure

```text
uiuc-housing-serach-website/
├── frontend/                   # Website (Next.js)
│   ├── app/                    # About, Card, Map, Login, and API routes
│   ├── components/
│   └── lib/
├── mobile/                     # App (Expo / React Native for iOS and Android)
│   ├── app/                    # Expo Router: sign-in, Home, Browse, Map, and details
│   ├── src/                    # Auth, listing and map features, and UI components
│   ├── assets/
│   ├── app.config.ts           # Expo app configuration
│   └── eas.json                # EAS build profiles
├── packages/                   # Shared Web and App workspaces
│   ├── core/                   # Listing types, filters, and domain logic
│   ├── api-client/             # Listing API client and query parameters
│   ├── search-state/           # Shared search filter state
│   └── design-tokens/          # Shared colors and design tokens
├── backend/                    # Shared FastAPI service
│   └── main.py                 # Listing and status endpoints
├── scrapers/                   # One scraper per landlord
├── pipeline/
│   ├── refresh.py              # Orchestrates and publishes listing refreshes
│   ├── normalize.py            # Raw JSON -> SQLite snapshot
│   └── geocode.py              # Batch geocoding
├── snapshots/                  # Versioned SQLite + raw JSON snapshots
├── tests/                      # Mobile, shared package, and backend tests
├── archive/
│   ├── legacy-chat-rag/         # Archived Chat, Table, RAG, Chroma assets
│   ├── retired-feedback-page/   # Archived user-facing feedback page
│   └── ui-snapshots/            # Full frontend UI snapshots
├── design-docs/                # Detailed implementation notes
├── scripts/                    # Maintainer tooling
└── package.json                # npm workspace and scripts
```

## Local Commands

First setup:

JavaScript workspaces use Node 24 LTS (`.nvmrc`); Node 22.13+ is also supported.

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
playwright install chromium
npm ci
```

Env:

```bash
cp .env.example .env
```

Frontend local env should point to the backend:

```bash
BACKEND_URL=http://localhost:3101
NEXT_PUBLIC_API_URL=http://localhost:3101
```

Backend:

```bash
.venv/bin/python -m uvicorn backend.main:app --reload --port 3101
```

Frontend:

```bash
cd frontend
npm run dev
```

Open:

```bash
http://localhost:3102/card
```

Verify:

Run these while the backend command is still running:

```bash
curl http://localhost:3101/api/status
curl "http://localhost:3102/api/listings?page=1&page_size=1"
.venv/bin/python -m py_compile backend/main.py pipeline/geocode.py pipeline/normalize.py config.py
```

## Mobile App

The Expo iOS/Android foundation shares contracts and API logic with the website.
See [mobile setup](mobile/README.md) for email login, secure sessions, local-device
backend configuration, development builds, and checks.

## Data Pipeline

Refresh data:

```bash
source .venv/bin/activate
.venv/bin/python -m pipeline.refresh
```

The managed refresh stages all nine sources, retries temporary failures, validates
completeness and counts, and publishes an accepted dataset with real check
timestamps. Failed candidates preserve the previous data. For individual scraper
repairs, the underlying commands are:

```bash
.venv/bin/python scrapers/bankier.py
.venv/bin/python scrapers/green_street.py --fresh
.venv/bin/python scrapers/jsj.py
.venv/bin/python scrapers/mhm.py
.venv/bin/python scrapers/octave.py
.venv/bin/python scrapers/roland.py
.venv/bin/python scrapers/seven07.py
.venv/bin/python scrapers/smile.py
.venv/bin/python scrapers/universities_group.py
.venv/bin/python -m pipeline.normalize
.venv/bin/python -m pipeline.geocode
```

GitHub Actions can run the same refresh automatically via
`.github/workflows/refresh-listings.yml`. It is scheduled every day at
6:00 AM in `America/Chicago`, automatically accounting for daylight saving time.
GitHub may start scheduled jobs late; a delayed job still runs the full pipeline.
The workflow also supports manual runs from the Actions tab. Each successful check
commits its receipt even if listing content has not changed, then verifies that
production serves the accepted run. A separate monitor checks freshness every six
hours. Operational emails require the Resend key and operator recipient in Actions
secrets; independent scheduler-outage detection needs an external heartbeat monitor.
See [Automated Refresh Reliability and Alerting](design-docs/automated-refresh-reliability.md)
for incident findings, safeguards, and notification setup.

Snapshot files:

```text
snapshots/latest.txt
snapshots/listings_YYYY-MM-DD.db
snapshots/raw_YYYY-MM-DD_<company>.json
```

## Data Sources

Latest snapshot: **2026-10-03**

- **1,287** listings
- **618** unique properties
- **9** active scraped companies

| Company | Listings |
|---|---:|
| Green Street Realty | 493 |
| Universities Group | 387 |
| Smile Student Living | 141 |
| Roland Realty | 102 |
| JSJ Property Management | 76 |
| MHM Properties | 37 |
| Bankier Apartments | 28 |
| Seven07 | 12 |
| Octave | 11 |

Excluded companies are shown in the UI as muted chips when their terms prohibit republishing listing data or bot protection blocks automated access.

Scrapers respect each site's `robots.txt` and `Crawl-delay` directive; legality is checked before a new scraper is added.

## Build Roadmap

**1. Local Prototype**

Start with one landlord source and prove the basic loop: collect listings, clean fields, store them locally, and render them in a browsable view.

**2. Data Layer**

Research Champaign-Urbana landlord sites, check scraping permissions, build source-specific scrapers, and normalize raw JSON into one shared listing schema.

**3. Core Search Product**

Build structured filters for beds, price, availability, company, and property type, backed by SQLite and served through FastAPI.

**4. Full-Stack App**

Move into FastAPI, Next.js, Supabase auth, Card view, shared filter state, and separate Railway/Vercel deployments.

**5. Reliable Listing Pipeline**

Add snapshot versioning, repeatable refresh commands, geocoding, manual coordinate fixes, and expanded scraper coverage.

**6. Map and Comparison Experience**

Add map browsing, campus context, listing detail panels, source coverage notes, and clean comparison flows.
