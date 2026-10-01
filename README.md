# 3 Days in Italy

An interactive trip planner that builds a 3-day Italy itinerary from a fixed dataset of 103 places, then lets
you edit it freely while it keeps times, travel and opening hours honest.

**Live app:** https://trip-planner-five-cyan.vercel.app

- **Wizard:** pick a start date, pace, budget, interests and a city for each day. It builds a plan.
- **Board:** add, remove, drag and reorder stops, move them between days, refill a day, and undo or redo. Every
  change reschedules the day and flags problems: closed that day, a visit that doesn't fit the opening hours,
  missing meals, a late night.
- **Map and overview:** each day's route on a map, plus a whole-trip summary.

## How it works

```
data/italy.json ──► pipeline (build time, AI + checks) ──► data/places.json ──► app (browser, no backend)
   raw, messy                                              clean, committed
```

### 1. Data pipeline (`pipeline/`)

The raw data is messy: mojibake in every record, about 19 different hours formats, contradictions between
fields. The pipeline cleans it once, at build time:

- **Code** fixes encoding, normalises tags and turns `€€` into a price level.
- **LLM** reads each record's free text into structured hours, open months, visit length and best time of
  day (one request per record, with structured output).
- **Validation in code** gives every problem an automatic consequence. A bad field becomes `null` (unknown),
  and anything uncertain gets a flag such as `check-dates` or `check-location`. A broken record is dropped.
- **The build fails** if more than 10% of records fail, so a bad run never deploys.
- **The output is committed.** It's regenerated only when `italy.json` changes, so normal builds need no API
  key.

### 2. Planner app (`domain/` + `src/app/`)

- **`domain/`:** all planning logic in plain TypeScript, with no Angular. It covers opening hours, travel time,
  the day scheduler, commands and the auto-planner.
- **`src/app/`:** an Angular UI on top: a signal store with undo/redo and localStorage, the wizard, the board,
  CDK drag and drop, and a Leaflet map.
  

## Running locally

Requires Node 24 (`.nvmrc`).

```bash
npm install
npm start            # http://localhost:4200
```

Optional `.env` in the project root:

```bash
CARTO_KEY=...           # nicer map tiles; without it the map uses OpenStreetMap
ANTHROPIC_API_KEY=...   # only needed to regenerate data/places.json
```

| Command | What it does |
|---|---|
| `npm start` | Serve the app (runs the pipeline first; it's skipped when `italy.json` is unchanged) |
| `npm run build` | Production build into `dist/italy-planner/browser` |
| `npm run test:domain` | Domain and pipeline unit tests (Vitest, Node) |
| `npm test` | Angular app tests |
| `npm run data` | Run the pipeline on its own |
| `npm run data:eval` | Check the model's output against a golden set of tricky records (calls the API) |

To regenerate the data after changing the prompt or pipeline code, delete `data/places.json` and run
`npm run data`.

## Project layout

```
data/        italy.json (raw input) · places.json (generated, committed)
pipeline/    build-time data pipeline: parse · AI extract · validate · prompt · evals
domain/      framework-free planning logic + tests
src/app/     Angular UI
docs/        architecture and specs
```

## Docs

- [App architecture](docs/app-architecture.md) · [spec](docs/specs/app-spec.md)
- [Pipeline architecture](docs/pipeline-architecture.md) · [spec](docs/specs/pipeline-spec.md)
- [Data audit of `italy.json`](docs/italy-json-audit.md)

**Stack:** Angular 22 (signals, zoneless), Tailwind 4, Vitest, TypeScript 6, Zod, Leaflet, the Anthropic SDK,
deployed on Vercel.
