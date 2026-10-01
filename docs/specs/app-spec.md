# App: Implementation Spec

Low-level companion to [`app-architecture.md`](../app-architecture.md). That file owns the rules; this one owns the code.
Goal: the least code that meets those rules.

---

## 1. Files

```
domain/                     pure TS: no Angular, DOM or I/O
  model/place.ts            WEEKDAYS, BEST_TIMES, Time, PlaceSchema, Place (shared with the pipeline)
  model/trip.ts             HUB_IDS, PrefsSchema, TripSchema, Trip, Prefs, HubId, Catalog, Command, Issue
  hours.ts                  DayHours, toMin, formatTime, addDays, weekday, hoursOn
  hubs.ts                   HUBS, trainMinutes
  travel.ts                 Leg, travel
  schedule.ts               DAY_END, PACES, BEST_TIME_WINDOWS, MEALS, ScheduledStop, ScheduledDay, scheduleDay, scheduleTrip
  commands.ts               Result, apply, applyAll
  planner.ts                score, eligible, bestInsertion, fill, hasSightLeft
  testing.ts                spec fixtures: makePlace, makeTrip, catalogOf, everyDay
  *.spec.ts
src/app/
  catalog.ts                PLACES, CATALOG, TAGS, MAX_PRICE
  labels.ts                 FLAG_LABELS, FLAG_HINT, MODE_LABELS, SEVERITY_CLASSES, DAY_COLORS
  trip-store.ts             TripStore, STORAGE_KEY
  drop-to-command.ts        Drop, dropToCommand
  app.ts · app.html         shell
  wizard/ header/ browser/ day-column/ stop-card/ place-detail/ overview/ trip-map/
```

Each component is `<name>/<name>.ts` + `.html` (`TripMap`'s one-element template is inline), styled with Tailwind
classes. `src/styles.css` adds the shared `btn`, `btn-primary`, `select` and `badge` utilities and a `data-tooltip`
attribute. Braces on every `if`.

## 2. `model/trip.ts`

Zod only for what's parsed from untrusted input (localStorage). Commands and issues are plain types. The domain
uses `zod/mini`, which keeps the browser bundle small.

```ts
export const HUB_IDS = ['rome', 'florence', 'bologna', 'milan', 'venice'] as const;

export const PrefsSchema = z.object({
  interests: z.array(z.string()),
  avoid: z.array(z.string()),
  maxPrice: z.int().check(z.minimum(1)),
  pace: z.enum(['relaxed', 'balanced', 'packed']),
  dayTrips: z.boolean(),
});

export const TripSchema = z.object({
  version: z.literal(1),
  startDate: z.iso.date(),
  prefs: PrefsSchema,
  days: z.array(z.object({ hub: z.enum(HUB_IDS), stops: z.array(z.string()) })).check(z.minLength(1)),
});

export type Catalog = ReadonlyMap<string, Place>;

export type Command =
  | { type: 'newTrip'; startDate: string; prefs: Prefs; hubs: HubId[] }
  | { type: 'setStartDate'; date: string }
  | { type: 'setHub'; day: number; hub: HubId }
  | { type: 'addStop'; day: number; placeId: string; index?: number }
  | { type: 'moveStop'; placeId: string; day: number; index: number }
  | { type: 'removeStop'; placeId: string }
  | { type: 'fill'; days: number[] }
  | { type: 'clearDay'; day: number };

export type IssueCode = 'CLOSED' | 'CLOSES_DURING_VISIT' | 'DAY_OVERRUN' | 'LONG_WAIT' | 'HOURS_UNKNOWN' | 'AFTER_BEST_TIME' | 'NO_MEAL';
export interface Issue { code: IssueCode; severity: 'error' | 'warning' | 'info'; placeId?: string; message: string }
```

## 3. `hours.ts`

```ts
toMin('09:30') → 570          toMin('24:00') → 1440
formatTime(570) → '09:30'     formatTime(1500) → '01:00'    // wraps past midnight
addDays('2026-10-31', 1) → '2026-11-01'                     // setUTCDate on a date-only string, which parses as UTC
weekday('2026-10-05') → 'mon'                               // getUTCDay(), never getDay()

interface DayHours { status: 'open' | 'closed' | 'unknown'; intervals: { open: number; close: number }[]; reason: string | null }
hoursOn(place: Place, date: string): DayHours
```

`hoursOn` checks in order:

| # | Condition | Result |
|---|---|---|
| 1 | `openMonths === null` | `unknown` |
| 2 | month not in `openMonths` | `closed`, reason `Closed in November` |
| 3 | `hours[weekday] === null` | `unknown` |
| 4 | `hours[weekday]` is `[]` | `closed`, reason `Closed on Mondays` |
| 5 | otherwise | `open`; intervals in minutes, `close += 1440` when `close <= open` |

## 4. `hubs.ts` and `travel.ts`

```ts
// Coordinates are each hub's main station, where its days start and end.
export const HUBS: Record<HubId, { name: string; region: string; lat: number; lng: number }> = {
  rome:     { name: 'Rome',     region: 'Lazio',          lat: 41.9009, lng: 12.5018 },  // Termini
  florence: { name: 'Florence', region: 'Tuscany',        lat: 43.7765, lng: 11.2481 },  // Santa Maria Novella
  bologna:  { name: 'Bologna',  region: 'Emilia-Romagna', lat: 44.5056, lng: 11.3433 },  // Centrale
  milan:    { name: 'Milan',    region: 'Lombardy',       lat: 45.4861, lng: 9.2045 },   // Centrale
  venice:   { name: 'Venice',   region: 'Veneto',         lat: 45.4410, lng: 12.3208 },  // Santa Lucia
};
const TRAIN_MIN: Record<string, number> = {
  'rome-florence': 95, 'florence-bologna': 40, 'bologna-milan': 65, 'bologna-venice': 90, 'florence-venice': 130,
  'florence-milan': 115, 'milan-venice': 145, 'rome-bologna': 135, 'rome-milan': 190, 'rome-venice': 235,
};
trainMinutes(a, b) → TRAIN_MIN[`${a}-${b}`] ?? TRAIN_MIN[`${b}-${a}`]
```

Every hub is in a different region, so a place belongs to a hub when `place.region === HUBS[hub].region`.
`commands.ts`, `planner.ts` and the app check that inline; there's no `hubOf` helper.

```ts
export interface Leg { minutes: number; km: number; mode: 'walk' | 'transit' | 'regional' }

export function travel(a: { lat: number; lng: number }, b: { lat: number; lng: number }): Leg {
  const km = 1.3 * /* haversine distance, R = 6371, inlined */;
  if (km <= 2) { return { mode: 'walk', km, minutes: Math.round((km / 4.5) * 60) }; }
  if (km <= 20) { return { mode: 'transit', km, minutes: Math.round(10 + (km / 18) * 60) }; }
  return { mode: 'regional', km, minutes: Math.round(20 + km) };
}
```

## 5. `schedule.ts`

```ts
export const DAY_END = 1350;                         // 22:30, back at the station, every pace
export const PACES = {
  relaxed:  { start: 600, buffer: 30, sights: 3 },   // 10:00
  balanced: { start: 540, buffer: 15, sights: 4 },   // 09:00
  packed:   { start: 510, buffer: 0,  sights: 6 },   // 08:30
};                                                   // sights: non-restaurant stops `fill` gives a day
export const BEST_TIME_WINDOWS = {
  morning:   { from: 0,    to: 720 },                // before 12:00
  afternoon: { from: 720,  to: 1080 },               // 12:00–18:00
  evening:   { from: 1080, to: 1440 },               // from 18:00
  night:     { from: 1260, to: 1440 },               // from 21:00
};
export const MEALS = [
  { name: 'lunch',  start: 720,  end: 900 },         // 12:00–15:00
  { name: 'dinner', start: 1140, end: 1320 },        // 19:00–22:00
];

export interface ScheduledStop { place: Place; legIn: Leg; arrive: number; start: number; end: number; hours: DayHours }
export interface ScheduledDay {
  date: string; hub: HubId; transferMinutes: number | null;
  stops: ScheduledStop[]; legOut: Leg | null; endsAt: number;
  totals: { travel: number; visiting: number; waiting: number };
  issues: Issue[];
}

scheduleDay(trip: Trip, day: number, catalog: Catalog): ScheduledDay
scheduleTrip(trip, catalog) = trip.days.map((_, i) => scheduleDay(trip, i, catalog))
```

```
date = addDays(startDate, day);  pace = PACES[prefs.pace];  prev = days[day - 1]?.hub
transferMinutes = prev && prev !== hub ? 30 + trainMinutes(prev, hub) : null
t = pace.start + (transferMinutes ?? 0);  pos = HUBS[hub];  usedMeals = []

for each id in stops (skip ids not in catalog):
  legIn = travel(pos, place);  arrive = t + legIn.minutes;  earliest = arrive
  if restaurant:  meal = first meal not in usedMeals with arrive < meal.end
                  if meal: earliest = max(arrive, meal.start)
  if bestTime:    earliest = max(earliest, BEST_TIME_WINDOWS[bestTime].from)
  hours = hoursOn(place, date);  start = earliest
  open:     slot = first interval where max(open, earliest) + durationMin <= close
            if slot: start = max(slot.open, earliest)  else: CLOSES_DURING_VISIT
  closed:   CLOSED
  unknown:  HOURS_UNKNOWN
  if restaurant: add the meal whose window contains start to usedMeals
  if bestTime and start > BEST_TIME_WINDOWS[bestTime].to: AFTER_BEST_TIME
  if start − arrive > 45: LONG_WAIT
  end = start + durationMin;  t = end + pace.buffer;  pos = place

legOut = any stops ? travel(pos, HUBS[hub]) : null
endsAt = any stops ? last end + legOut.minutes : pace.start + (transferMinutes ?? 0)
if endsAt > DAY_END: DAY_OVERRUN
if any stops: NO_MEAL for each meal not in usedMeals
totals: travel = Σ legIn.minutes + (legOut?.minutes ?? 0) · visiting = Σ durationMin · waiting = Σ (start − arrive)
```

`restaurant` means `place.type === 'restaurant'`.

| Code | Severity | On a stop | Message |
|---|---|---|---|
| `CLOSED` | error | ✓ | `hours.reason` |
| `CLOSES_DURING_VISIT` | error | ✓ | `Not open long enough for a 120-min visit after 17:10` |
| `DAY_OVERRUN` | warning | | `Back at the station at 23:10, after 22:30` |
| `HOURS_UNKNOWN` | warning | ✓ | `Hours unavailable; check before going` |
| `AFTER_BEST_TIME` | warning | ✓ | `Starts at 13:15, after its best time (morning)` |
| `LONG_WAIT` | info | ✓ | `75 min free before this stop` |
| `NO_MEAL` | info | | `No restaurant at lunch time` |

## 6. `commands.ts`

```ts
export type Result = { ok: true; trip: Trip } | { ok: false; error: string };
apply(trip: Trip | null, cmd: Command, catalog: Catalog): Result
applyAll(trip: Trip | null, cmds: Command[], catalog: Catalog): Result   // in order; stops at the first error
```

`apply` edits a `structuredClone(trip)`, so the input is never mutated. Every command except `newTrip` fails with
`No trip yet` when `trip` is `null`. `applyAll` is what the store and the wizard call.

| Command | Effect | Fails when |
|---|---|---|
| `newTrip` | `{ version: 1, startDate, prefs, days: hubs.map(hub => ({ hub, stops: [] })) }` | not a valid `YYYY-MM-DD` · `hubs` is empty |
| `setStartDate` | replaces `startDate` | not a valid `YYYY-MM-DD` |
| `setHub` | sets `hub`; removes stops outside the new hub's region | no such day |
| `addStop` | inserts at `index ?? bestInsertion(…)` | no such day · unknown place · already in the trip · place not in the day's region · bad index |
| `moveStop` | removes the stop, then inserts it at `index` in `day` | not in the trip · no such day · place not in the day's region · bad index |
| `removeStop` | removes the stop | not in the trip |
| `fill` | `fill(trip, days, catalog)` | `days` is empty · any of them doesn't exist |
| `clearDay` | `stops = []` | no such day |

- A day only holds places from its hub's region. That makes cross-city drags fail cleanly.
- `moveStop.index` is the position after the stop is taken out, which matches CDK's `currentIndex`.
- Errors are short sentences: `Uffizi Gallery is already in the trip`, `Colosseum isn't in the Florence area`,
  `There is no day 4`.

## 7. `planner.ts`

```
score(place, prefs) → { score, reasons }
  matches = tags ∩ interests;  avoided = tags ∩ avoid
  over    = priceLevel !== null && priceLevel > maxPrice
  score   = 2·|matches| − 3·|avoided| + 2·((rating ?? 4.5) − 4.5) − (over ? 5 : 0)
  reasons = only those that apply: 'matches wine, scenic' · 'tourist-heavy' · '4.8★' · 'over budget'
  the penalties only rank the place browser; eligible keeps those places out of the planner

eligible(place, trip, day) → boolean
  place.region === HUBS[hub].region
  && (prefs.dayTrips || place.city === HUBS[hub].name)
  && the place isn't in any day
  && hoursOn(place, date).status !== 'closed'
  && no 'check-dates', 'check-location' or 'not-interpreted' flag
  && (rating ?? 5) >= 3.5
  && no tag in prefs.avoid
  && (priceLevel === null || priceLevel <= prefs.maxPrice)

cost(s: ScheduledDay) = 100000·errors + travel + waiting + max(0, endsAt − DAY_END) + 3·late
  late = Σ over stops with a bestTime: max(0, start − to)     (the schedule already waits for `from`)

bestInsertion(trip, day, placeId, catalog) → index
  schedule the day with the place at each index 0…stops.length; lowest cost wins; ties → lowest index

fill(trip, days, catalog) → Trip
  sorted = all places, by score desc, then id
  two passes: restaurants (limit 2 per day), then everything else (limit PACES[pace].sights per day)
  each pass repeats rounds until a round adds nothing:
    for each day in days still under the pass's limit:
      take the first place in sorted of the pass's kind that is eligible for the day and fits
      fits = at bestInsertion, errors don't increase and endsAt <= DAY_END

hasSightLeft(trip, day, catalog) → boolean
  some non-restaurant place is eligible for the day and adds no error at bestInsertion (endsAt is ignored)
```

`fill` edits the stops arrays directly; it doesn't call `apply`, which avoids a circular import. Limits count the
stops already in the day, so a full day gets nothing more. Days take turns, one place per round, so a small city
spreads across all its days. A three-day build costs about 3 ms.

When `fill` leaves a day short, `hasSightLeft` tells a day that's full of time (`true`) from a city that ran out
(`false`). Only the wizard uses it.

## 8. App

### `catalog.ts` and `labels.ts`

```ts
import data from '../../data/places.json';
export const PLACES = data.places as Place[];
export const CATALOG: Catalog = new Map(PLACES.map((p) => [p.id, p]));
export const TAGS: string[];          // every tag in PLACES, most common first, then A–Z
export const MAX_PRICE: number;       // highest priceLevel in PLACES
```

```ts
export const FLAG_LABELS: Record<Flag, string>;                       // 'check-dates' → 'Check dates', 'not-interpreted' → 'Hours not interpreted', …
export const FLAG_HINT: string;                                       // tooltip on every flag badge: partly AI-estimated, check before going
export const MODE_LABELS: Record<Leg['mode'], string>;                // 'walk' · 'by transit' · 'by regional train or bus'
export const SEVERITY_CLASSES: Record<Issue['severity'], string>;     // red · amber · sky
export const DAY_COLORS: { bg: string; stroke: string }[];            // one per day, shared by the map and the overview
```

### `trip-store.ts`

```ts
export const STORAGE_KEY = 'italy-planner:trip:v1';
const MAX_HISTORY = 50;

@Injectable({ providedIn: 'root' })
export class TripStore {
  private readonly history = signal<History>({ past: [], present: load(), future: [] });
  readonly trip = computed(() => this.history().present);                // null until the first build
  readonly days = computed(() => { const t = this.trip(); return t ? scheduleTrip(t, CATALOG) : []; });
  readonly error = signal<string | null>(null);
  readonly canUndo = computed(() => this.history().past.length > 0);
  readonly canRedo = computed(() => this.history().future.length > 0);
  dispatch(...cmds: Command[]): boolean;
  undo(): void;
  redo(): void;
}
```

- **`dispatch`** runs `applyAll(trip(), cmds, CATALOG)`, so the commands are one undo step.
  - On an error: sets `error`, returns `false`, leaves the store unchanged.
  - Otherwise: pushes the old `present` (if any) onto `past`, keeping the last 50. Sets the new trip, clears
    `future` and `error`, returns `true`.
- **`undo` / `redo`** move one snapshot between `past`, `present` and `future`, and clear `error`.
- **An `effect`** writes `trip()` to `localStorage[STORAGE_KEY]` whenever it isn't `null`.
- **`load()`**: `JSON.parse` → `TripSchema.parse` → keep only stop IDs that are in `CATALOG`. Any exception (no
  saved trip, bad JSON, a failed parse) returns `null`.

### `drop-to-command.ts`

```ts
export interface Drop {
  item: { data: string };                           // placeId
  container: { data: number };                      // target day
  previousContainer: { data: number | 'browser' };
  previousIndex: number;
  currentIndex: number;
}
export function dropToCommand(e: Drop): Command | null
```

| Drop | Command |
|---|---|
| from `'browser'` | `addStop { day, placeId, index: currentIndex }` |
| same day, same index | `null` |
| otherwise | `moveStop { placeId, day, index: currentIndex }` |

`Drop` is a structural subset of `CdkDragDrop`, so tests pass plain objects.

### Components

Containers inject `TripStore`; `StopCard`, `PlaceDetail`, `TripOverview` and `TripMap` are presentational
(`input()`/`output()`). Anything that shows a place name emits `details` with its ID, and `App` opens `PlaceDetail`.

| Component | Inputs → outputs | Behaviour |
|---|---|---|
| `App` | | Shows `TripWizard` while `wizardOpen` (initially `trip() === null`). Otherwise: `TripHeader`, `store.error` as a dismissible banner, then a `cdkDropListGroup` holding `PlaceBrowser`, the day panel and `TripMap`. The day panel has tabs `Day 1 · Rome` … `Overview` and shows one `DayColumn`, or `TripOverview`. Owns the `selectedDay`, `overview` and `detailId` signals. `PlaceDetail` gets the date of the day holding the place, else the selected day's. Opening or closing the wizard clears `error` and goes back to Day 1 |
| `TripWizard` | → `done` | 3 steps, answers in local signals. A new trip always starts from the defaults, never the current trip. Build → `dispatch(newTrip, fill { days: [0, 1, 2] })`, then emits `done`; a failure shows `store.error` in the wizard. Cancel only when a trip exists |
| `TripHeader` | → `newTrip` | Start date input → `setStartDate` · the route (`Rome → Florence`) · Undo / Redo · New trip (opens the wizard) |
| `PlaceBrowser` | `day` → `details` | Search over name, city and neighbourhood, plus area, type and tag filters. The area follows the selected day's region (`linkedSignal`) until the user picks another; trip edits that leave that region alone keep the pick. Places not yet in the trip come first, then by `score`, then ID; each shows its `reasons`. Places in the trip are faded, not draggable, and say `In your trip`. Source-only `cdkDropList` (`'browser'`, no sorting, nothing enters). `+ Day n` for each day in the place's region → `addStop` with no index |
| `DayColumn` | `index`, `day: ScheduledDay` → `details` | Header `Day 1 · Fri 16 Oct` with a city select → `setHub`, after a `confirm()` when the day has stops (they'd be cleared). Transfer banner (`Morning train to Florence · ~125 min, station to station`). `cdkDropList` of `StopCard`s; drop → `dropToCommand`. `legOut` below the last card (`~15 min walk back to the station · back at 21:40`). Fill day → `fill { days: [index] }`, disabled with a tooltip when a dry-run `fill` adds nothing · Clear, disabled on an empty day. Day issues and totals. Card actions: move up/down → `moveStop` at index ± 1 · move to day n → `removeStop` + `addStop` (no index) in one dispatch · remove → `removeStop` |
| `StopCard` | `stop`, `issues`, `first`, `last`, `moveTargets` → `moveBy`, `moveTo`, `remove`, `details` | Leg header (`~12 min walk`), `09:00–11:00` (`(next day)` past midnight), name, badges (booking required, then flags with `FLAG_HINT`), issues. A CDK menu on `⋯`: Details · Move up (unless `first`) · Move down (unless `last`) · Move to Day n for each of `moveTargets` (the other days in the same region) · Remove |
| `PlaceDetail` | `place`, `date` → `closed` | Native `<dialog closedby="any">`, opened with `showModal()` after render. Neighbourhood, city, rating, price, duration · description · badges · `hoursOn` that date · weekly hours (`Unavailable` when no day is stated) · months (`All year`, a list, or `Not stated`) · best time · `source.seasonalNotes` as Notes |
| `TripOverview` | `days: ScheduledDay[]` → `details` | Shown instead of the day column on the Overview tab. Trip totals (stops, visiting, travel incl. trains, free time), then each day under its `DAY_COLORS` dot: the morning train, stops with times, back at the station |
| `TripMap` | `days: ScheduledDay[]`, `day: number \| null` | See below |

From the `lg` breakpoint the three panels sit side by side (browser 20rem · day panel · map) and fill the
viewport, each scrolling on its own. Below it they stack: day panel, map, browser.

**Wizard steps**

| Step | Fields | Default |
|---|---|---|
| 1 · When | start date (`min` today) · pace (`From 09:00 · 4 sights a day`) · budget (`Up to €` … `Up to €€€€ (no limit)`) | first Friday on or after today + 14 days · balanced · `MAX_PRICE` |
| 2 · Interests | `TAGS` as chips, once for like and once for avoid; a tag picked in one list is disabled in the other | none |
| 3 · Cities | a city per day · day trips | best hub for every day · off |

- **Match count** per hub: places `eligible` for a one-day trip to that hub on the start date (so region, day
  trips, closures, flags, rating, avoided tags and budget all count) that have at least one interest tag. With no
  interests, every eligible place. Label: `Florence · 9 matches` (`1 match`).
- **Best hub:** highest match count, ties in `HUB_IDS` order. It shows until the user picks a city
  (`chosenHubs` is `null` until then).
- **Preview:** a `computed` runs `applyAll(null, [newTrip, fill { days: [0, 1, 2] }])` on the current answers,
  the same commands Build dispatches. Under each day's city select: `5 stops: Colosseum · …`. A day with fewer
  sights than `PACES[pace].sights` and no `hasSightLeft` adds `Bologna has no more places for Day 3. Turn on day
  trips or choose another city.` (just `Choose another city.` when day trips are on). A day that is only full of
  time gets no hint.
- **Start date inputs** (here and in `TripHeader`) ignore input that isn't a valid date yet (`validity.valid`), and
  blur puts the last good date back.
- **Today** comes from local `new Date()` / `Date.now()` in the wizard and header, never in `domain/`.

**`TripMap`**
- Tiles: CARTO Positron (`https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png?key=…`,
  `© OpenStreetMap contributors © CARTO`) when the build defines `CARTO_KEY`. Without a key CARTO serves
  placeholder tiles, so it falls back to `https://tile.openstreetmap.org/{z}/{x}/{y}.png` (`© OpenStreetMap
  contributors`).
- In `afterNextRender`: `const L = (await import('leaflet')).default`; stop if the component was destroyed while
  it loaded; then `L.map(el)`, the tiles, a layer group, and a `ResizeObserver` that calls `invalidateSize()`
  (Leaflet only notices window resizes). `map.remove()` on destroy.
- An `effect` on `days`, `day` and the loaded map clears the layer group and redraws each shown day: a polyline
  per leg from the station through the stops and back (solid for walk, dashed otherwise) and a numbered
  `L.divIcon` marker per stop, in the day's `DAY_COLORS` Tailwind classes, plus one `S` marker per station. With
  `day: null` (the Overview tab) it draws every day and a dotted line for each train between cities. Then
  `fitBounds` with no animation (`setView` at zoom 13 for a single point).

## 9. Setup

- Dependencies: `@angular/cdk`, `leaflet`, `zod`. Dev: `@types/leaflet`.
- `tsconfig.json`: `"paths": { "@domain/*": ["./domain/*"] }`, `"resolveJsonModule": true`.
- `angular.json` build options: `styles` adds `node_modules/leaflet/dist/leaflet.css`; `define: { "CARTO_KEY": "''" }`.
- `npm start` and `npm run build` load `.env` if present and pass `--define "CARTO_KEY='$CARTO_KEY'"`, so the key
  stays out of the repo. It's still sent with every tile request, so restrict it to the app's domains in CARTO.
- Remove the scaffold's router (`app.routes.ts`, `provideRouter`). It's one page; `app.config.ts` only has
  `provideBrowserGlobalErrorListeners()`.
- `vercel.json`: `{ "outputDirectory": "dist/italy-planner/browser" }`. `.nvmrc`: `24` (`engines.node`: `>=24`).

## 10. Tests

| File | Cases |
|---|---|
| `hours.spec.ts` | `weekday('2026-10-05') === 'mon'` with `process.env.TZ` set to `UTC`, `America/Los_Angeles`, `Pacific/Auckland` · `addDays` across a month end and a year end · each `hoursOn` row · `08:00–01:00` → 480–1500 · `00:00–24:00` → 0–1440 |
| `travel.spec.ts` | same point → 0 min walk · one case per band |
| `schedule.spec.ts` | waits for opening · restaurant waits for lunch · second restaurant waits for dinner · a dinner-only restaurant uses up dinner · a stop waits for its `bestTime` · transfer = 30 + train · `endsAt` includes `legOut` · unknown hours are timed on arrival · each issue code · `NO_MEAL` only on a day with stops |
| `commands.spec.ts` | each effect and failure in §6 · the input trip is unchanged · `applyAll` applies in order and stops at the first error |
| `planner.spec.ts` | `score` and `reasons` · `eligible` drops avoided tags and known prices over `maxPrice`, drops places closed that day but keeps unknown hours, drops day trips unless they're on · `bestInsertion` tie → lowest index, moves a stop toward its `bestTime`, keeps an afternoon stop out of the morning, puts a night stop after an evening one, never trades an error for it (a morning stop goes late rather than make another close during its visit) · `hasSightLeft` finds a sight that only runs past the end of the day, and ignores sights that would add an error and restaurants · `fill` adds nothing to a day already at its limits · **property:** for 5 hubs × 3 paces × start dates `2026-10-16` and `2027-01-11`, `newTrip` + `fill { days: [0, 1, 2] }` gives no errors, no duplicate stops, no day trips, at most 2 restaurants and `sights` other stops per day, and the same trip on a second run · Bologna × 3, balanced, `2026-10-16`: every day has a stop |
| `trip-store.spec.ts` | dispatch is all-or-nothing · undo/redo whole steps · undo and redo clear the error · history capped at 50 · saves the trip and loads it back without unknown IDs · bad JSON or a failed parse loads as `null` |
| `drop-to-command.spec.ts` | the three rows in §8 |
| `place-detail.spec.ts` | seasonal notes next to the interpreted hours · the best time · no Notes or best time when the place has none |
| `app.spec.ts` | the wizard opens with no saved trip · Build shows the board (3 day tabs + Overview, one day column) and saves the trip · unfinished start dates are ignored and blur restores the last good one · the browser keeps a picked area when the trip changes · errors clear when switching between board and wizard · New trip starts from the defaults · Overview, then back to a day · remove a stop from its menu · places you can still add come first, and search only matches stated fields |

Domain and pipeline specs run in Node with `npm run test:domain`; app specs with `npm test` (`ng test`, jsdom).

## 11. Build order

1. `model/trip.ts`, `hours.ts`, `hubs.ts`, `travel.ts` + specs.
2. `schedule.ts` + spec.
3. `commands.ts` and `planner.ts` + specs; the property test passes.
4. Setup (§9), `catalog.ts`, `trip-store.ts`, `App`, `TripWizard`, `DayColumn`, `StopCard`, `PlaceBrowser` (buttons
   only) → deploy to Vercel.
5. `dropToCommand` + CDK drag and drop, `TripHeader` with undo/redo.
6. `PlaceDetail`, `TripOverview` and the Overview tab, `TripMap`.
