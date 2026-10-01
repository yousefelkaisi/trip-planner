# `italy.json` — Data Audit

Audited 2026-09-30. Covers all 103 records (`place_001` – `place_103`).

- **Part 1** lists the problems that affect many records.
- **Part 2** covers every record: its specific problems, the fix, and codes pointing back to Part 1.
- **Part 3** lists facts that can only be checked against the real world.

Nothing here has been fixed. This file only records what's wrong.

---

## 0. Summary

| Check | Result |
|---|---|
| JSON validity | Valid UTF‑8 JSON array with no BOM |
| Records | 103. No duplicate `id` and no duplicate `name`. IDs run from `place_001` to `place_103` with no gaps |
| Key set | All 103 records have the same 16 keys. No missing or extra keys |
| Types | `id, name, type, city, region, description, price_range, tags` are always strings (or a list for `tags`). `latitude, longitude, rating` are always floats |
| Nullable fields | `neighborhood` 19 null, `hours` 33 null, `duration_minutes` 9 null, `seasonal_notes` 87 null, `booking_required` 1 null |
| Encoding | **All 103 records** contain mojibake (UTF‑8 bytes decoded as Windows‑1252) |
| Coordinates | All are inside Italy. **One is 156 km off** (`place_059`). Two pairs are exact duplicates |
| `hours` | **19 different formats**, including 7 free‑text or 12‑hour values that don't parse |
| `seasonal_notes` | 16 filled in. **Only 2–3 are really about seasons**; the rest are weekly schedules, booking tips or monthly rules |
| Real contradictions | About 25 records where two fields disagree, or a field disagrees with the description |

### Top fixes by impact on a generated plan

| # | Record | Problem | What goes wrong if left |
|---|---|---|---|
| 1 | 059 Brera Antique Market | Longitude `11.191` should be about `9.19` | The stop is placed 156 km from Milan |
| 2 | 059 Brera Antique Market | `hours` says `Sat-Sun`, but it only runs on the **third weekend** of each month | It gets scheduled on weekends when it isn't there |
| 3 | 053 Parma tour | Its schedule ("weekday mornings only") is in `seasonal_notes`, and `hours` is null | It gets scheduled on weekends or afternoons |
| 4 | 010 Vatican Museums | The last‑Sunday‑open exception is in `seasonal_notes` | That exception is never shown to the user |
| 5 | 034 Boboli Gardens | `hours` has only the winter closing time; the summer time is in the notes | Closing time is wrong in summer |
| 6 | 021 Appian Way | "Road closed to cars on Sundays" | An extractor could read this as the place being closed on Sundays, the opposite of the advice |
| 7 | 063, 085 | "Open April‑October only" on a **town** and a **public lakefront** | Whole towns vanish from October to March |
| 8 | 056 Last Supper | `duration_minutes: 30`, but the description says "strictly 15 minutes" | The visit is over‑allocated |
| 9 | 018/077, 030/031 | Duplicate places (same coordinates) | The same place can appear twice in one day |
| 10 | 096 Al Quadri | One record describes two venues: a café and a Michelin restaurant | Its hours, price and booking fields each describe a different venue |
| 11 | 055, 001, 017 | The description recommends a visit time outside `hours` (sunset, evening) | The app suggests a visit that can't happen |
| 12 | 043 Francescana | `duration 240` is longer than the dinner window (20:00–22:00) | Validation fails, or the close time is misread |

---

## 1. Problems across the dataset

### E — Encoding

**E1. `price_range` is garbled in all 103 records.** `€` appears as `â‚¬`, the result of reading UTF‑8 bytes `E2 82 AC` as cp1252. Counts: `€` 42, `€€` 46, `€€€` 10, `€€€€` 5.
→ Fix: `s.encode('cp1252').decode('utf-8')`, or count occurrences of `â‚¬`.

**E2. The em dash `—` appears as `â€”`.** There are 101 occurrences, in 94 descriptions and 3 `seasonal_notes` (001, 053, 090).
→ Same repair as E1.

**E3. Accented letters and euro amounts are garbled.**

| Record | Field | Raw | Should be |
|---|---|---|---|
| 012 | name | `VeritÃ )` | `Verità)` |
| 084 | description | `TrinitÃ .` | `Trinità.` |
| 015 | description | `supplÃ¬` | `supplì` |
| 047 | name | `RagÃ¹` | `Ragù` |
| 069 | description | `DalÃ<U+00AD>` (soft hyphen, invisible) | `Dalí` |
| 091 | name | `CaffÃ¨` | `Caffè` |
| 037 | description | `â‚¬8` | `€8` |
| 043 | description | `â‚¬350+` | `€350+` |
| 091 | description | `â‚¬25` | `€25` |

⚠ **In `à`, the second byte (`A0`, a non‑breaking space) was lost.** `à` is `C3 A0`, and the `A0` became an ordinary space (`0x20`), so `"Ã "` no longer decodes with a plain cp1252 round trip. It needs its own rule: `"Ã "` → `"à"`, which also removes the space. This affects 012 and 084.

**E4. `supplì` is spelled two ways.** 015 has `supplì` (garbled); 042 has `suppli` with no accent. Only matters for search and glossary features.

### H — Hours (`hours`)

There are **19 formats** in 70 non‑null values:

| Count | Format | Example |
|---|---|---|
| 23 | `H:MM-H:MM` with no days | `9:00-19:00` |
| 10 | `Tues-Sun H:MM-H:MM` | 007 |
| 8 | `Mon-Sat H:MM-H:MM` | 015 |
| 4 | `Mon-Sat …, …` (two intervals) | 003 |
| 4 | `Tues-Sun …, …` | 033 |
| 3 | `Tues-Sat …, …` | 042 |
| 4 | `Evenings` | 037, 068, 079, 100 |
| 2 | `Daily H:MM-H:MM` | 031, 096 |
| 2 | `Mon-Sat …, Sun …` | 036, 074 |
| 2 | `Wed-Mon …` (range wraps past Sunday) | 062, 069 |
| 1 each | `Morning only`; `H:MM-H:MM, H:MM-H:MM` with no days; `Mon-Fri …, Sat …`; `8am-7pm`; `9am-12:30pm`; `Sat-Sun …`; `Tues, Thurs-Sun …`; `Wed-Sun …` | 006, 029, 030, 040, 087, 059, 064, 065 |

- **H1. No days given (26 records).** 001 004 005 011 012 016 017 020 025 029 034 040 045 048 054 055 067 082 087 088 091 094 095 099 101 103. It isn't clear whether this means "daily" or "days unknown". Most of these museums and sites are closed one day a week in reality.
  → Pick a rule (treat as daily) and store it explicitly.
- **H2. `null` has four meanings (33 records):**
  - *Always accessible* (piazza, bridge, fountain, neighborhood, open viewpoint, park): 002 008 013 014 018 019 023 027 028 052 057 060 066 072 075 077 080 084 085 093 097 102
  - *By appointment or tour:* 021 035 044 053 071
  - *Day trip or town:* 038 063 070 089
  - *Event:* 090
  - *Route:* 049

  → Add an explicit access mode (`always_open | scheduled | by_appointment | event | unknown`) instead of overloading `null`.
- **H3. Free text or 12‑hour time (7 records).** `Morning only` (006), `Evenings` (037 068 079 100), `8am-7pm` (040), `9am-12:30pm` (087). None of these parse as `HH:MM`. The descriptions give more detail: 006 "before 11am", 037 "7pm", 079 "until 2am".
- **H4. `24:00` and closes after midnight.** `24:00` appears in 011 025 031 099. 020 has `8:00-01:00`. Normalize to an end of `24:00`/`00:00`, or allow a close time earlier than the open time.
- **H5. The comma means two different things.** In `Mon-Sat 12:30-14:30, 19:30-22:30` it separates two intervals on the same days. In `Mon-Fri 7:00-14:00, Sat 7:00-17:00` (030) and `Mon-Sat …, Sun …` it separates groups of days. A split on commas alone gets this wrong.
- **H6. Day abbreviations are inconsistent.** `Mon Wed Fri Sat Sun` are 3 letters, but `Tues` and `Thurs` are 4–5. Leading zeros are also missing (`9:00`, not `09:00`).
- **H7. Days that aren't listed are closed, but only by implication.** For example, `Mon-Sat` implies closed on Sunday. This has to be the stated rule, not a guess.
- **H8. The close time has no stated meaning** (doors close, last entry or last seating). 043 shows the problem: the dinner window is 20:00–22:00, but `duration_minutes` is 240. The 22:00 must be the last seating.
- **H9. Seasonal hours can't be expressed.** Examples: 034 (summer close 19:30), 065 (rooftop only May–Sep), 010 (last‑Sunday exception), 059 (third weekend only).

### S — `seasonal_notes` is a catch‑all field

Only a few of the 16 non‑null notes are about seasons:

| Record | What the note actually contains | Where it belongs |
|---|---|---|
| 001 | Booking and queue advice | booking policy + caveat |
| 010 | Weekly closure with an exception, a free‑entry price change and crowd level | hours exception + caveat |
| 021 | "Best" season (a recommendation) + a traffic rule for the road | caveat (**not** a closure) |
| 026 | Booking required only in some months | seasonal booking policy |
| 034 | Summer hours + heat warning | seasonal hours + caveat |
| 035 | **Real closure** Apr–Oct + best month | `openMonths` [4–10] + caveat |
| 053 | **Weekly schedule** ("weekday mornings only") | `hours` |
| 056 | How far ahead to book | booking lead time |
| 057 | "Best" season | caveat |
| 059 | **Monthly recurrence** (third weekend) | recurrence rule |
| 063 | "Open Apr–Oct" for a *town* + crowd warning | ambiguous; probably ferry season, so a caveat |
| 064 | **Real closure** Apr–Oct | `openMonths` [4–10] |
| 065 | **Partial closure** (rooftop May–Sep) | caveat, or a separate rooftop record |
| 085 | "Open Apr–Oct" for a *public lakefront* | ambiguous; can't be a real closure, so a caveat |
| 090 | Event window (October) whose dates vary | event dates |
| 095 | "Best" season | caveat |

"Best in X" is a recommendation, not a closure. "Open X only" is a closure, except for 063 and 085, where it can't literally be true.

### P — Price (`price_range`)

- **P1. The scale is never defined.** It doesn't say whether it means per person, entry fee or a typical spend. It mixes food cost (043 €€€€ ≈ "€350+ pp"), entry fees and shopping (102 €€€€ for window‑shopping). For 071 (gondola) the cost is per boat ("split the cost four ways").
- **P2. Free has no level.** Free places are all `€`: 002 008 013 014 018 019 023 027 028 049 052 066 075 077 080 084 093 097. Only 023 and 093 have a `free` tag, and 014's description says "Free" without the tag. The price should allow 0.
- **P3. The price reflects an optional extra, not entry.** 060 Galleria is €€€ (for the Camparino bar; entry is free). 045 "test track laps are expensive". 074 and 001 mention premium or extra tickets.
- **P4. Exact amounts are only in descriptions:** 037 €8, 043 €350+, 091 €25.

### B — Booking (`booking_required`)

- **B1. One boolean covers several different rules:**
  - required: 043, 056, 007
  - recommended only: 010 ("go the moment they open"), 074 ("pre‑book *to skip the queue*"), 022 ("eat at the bar **or** book a table"), 073 ("book a canal table")
  - seasonal: 026 ("essential April–October")
  - some services only: 061 ("reserve for dinner"), 096 (the restaurant upstairs, not the café)
- **B2. How far ahead to book is only in free text:** 007 "months ahead", 026 "weeks", 032 "before you come to Florence", 043 "2+ months", 047 "a week minimum", 056 "2 months" / "weeks" (the two disagree).
- **B3. A required ticket isn't the same as a required booking.** 005 Pantheon ("now requires a ticket") and 018 Trevi ("ticket pilot") both have `booking_required: false`.
- **B4. 020 is the only `null`.**

### D — Duration (`duration_minutes`)

- **D1. Missing in 9 records:** 014 023 027 052 066 077 085 093 097, mostly viewpoints. 014's description gives "5 minutes".
- **D2. The meaning is undefined.** It isn't clear whether it includes queues (012: "queue is always long; the experience takes 30 seconds", duration 15) or travel for day trips (038, 063, 089 include travel of 90 min to 2 h each way).
- **D3. The description contradicts the field:** 056 (30 vs "15 minutes"), 087 (210 vs "3‑hour").
- **D4. Maximum stay limits aren't modeled:** 007 "strict 2‑hour limit", 056 "strictly 15 minutes".

### L — Location (`latitude`, `longitude`, `city`, `region`, `neighborhood`)

- **L1.** 059's coordinates are 156 km from Milan's median point (see Part 2).
- **L2. Exact duplicates:** 018 = 077 (Trevi), 030 = 031 (Mercato Centrale).
- **L3. Placeholder points that aren't the real site:**
  - 044 is 55 m from Osteria Francescana, in the city center; the producers named are outside town.
  - 053 is 97 m from 092, in Parma's center; the "production facilities" are rural.
  - 087 is a generic point ("home kitchen").
  - 071 is an arbitrary point, though the description says Cannaregio or Dorsoduro.
  - 049's point is Piazza Maggiore, but its name and neighborhood say the university quarter.
  - 023's point is the piazza, but the viewpoint described is the Pincio terrace above it.
- **L4. Routes and areas are stored as single points.** Routes: 021 Appian Way, 049 porticoes, 068 bar crawl, 100 aperitivo walk (Corso Como → Navigli, about 4 km). Areas: 002 013 028 057 072 075 102.
- **L5. `city` means different things.**
  - It's usually the destination (038 Siena, 089 Pienza, 063 Bellagio).
  - **035 Chianti is the exception:** it uses `Florence` while its point is in Greve, 21 km away.
  - 070 `Burano` is part of the comune of Venice.
  - Nothing distinguishes a *base city* from a *day‑trip destination*. 11 of the 16 city values have 1–3 records.
- **L6. Travel time from a base is only in free text,** sometimes measured from somewhere that isn't a base:
  - 045 "15 min from Modena" (Modena isn't a base)
  - 090 "30 min from Verona" (Verona isn't in the dataset)
  - 063 "ferry from Como 2 h"
  - Also 038, 053, 085, 089, 095, 070, 088, 021, 042 ("worth the taxi").
- **L7. `neighborhood` has no consistent vocabulary.**
  - It mixes Roman *rioni* (Pigna, Parione, Ripa, Trevi, Colonna, Borgo, Celio), *quartieri* (Parioli, Flaminio, Ostiense, Prati) and informal areas (Pigneto, Testaccio, Isola, Navigli). In Florence it mixes quartieri (San Giovanni) with areas (Oltrarno, San Lorenzo), and in Venice it has sestieri plus an island (San Giorgio Maggiore).
  - Some values are **squares, not neighborhoods:** `Piazza di Porta Ravegnana` (048), `Piazza della Signoria` (103), `Campo de' Fiori` (022), `Centro Storico` (052).
  - Some values repeat the record's own name: 002 013 028 057 072 102.
  - English and Italian are mixed: `University Quarter` (049).
  - **Names repeat across cities:** `San Marco` (Florence 032 and Venice ×6), `Quadrilatero` (Bologna 046) and `Quadrilatero della Moda` (Milan 102). Neighborhoods must be keyed by (city, neighborhood).
  - **The same area has two labels:** 006 Campo de' Fiori Market → `Parione`, 022 Roscioli → `Campo de' Fiori`.
- **L8. 19 records have a null neighborhood.** Most are out of town, but these are inside a city and have a known area: 042 (name says *Casaletto*), 043, 044, 083 (Modena centro), 071 (Cannaregio/Dorsoduro per the description), 087 (Bologna), 092 (Parma).
- **L9. Mixed languages:** `city` is English (Florence, Padua, Rome), while names use Italian (`Mercato Centrale Firenze`, `Orto Botanico di Padova`, `Eataly Roma Ostiense`).

### T — `type` categories

The ten values are: historic_site 19, restaurant 19, experience 17, museum 15, viewpoint 10, cafe 7, neighborhood 6, market 6, park 3, shop 1. Problems:

- **No bar or wine‑bar type.** Wine bars are split between `cafe` (037, 065, 078, 079) and `restaurant` (050).
- **No day‑trip type.** Day trips and towns are `experience` (035, 038, 063, 070, 089) or `viewpoint` (085 Como town).
- **Food halls:** 031 is `experience`, and 094 (a department‑store roof bar/food hall) is `viewpoint`.
- **Time‑of‑day versions of one place get different types:** 018 is `historic_site`, 077 is `viewpoint`.
- **Two venues in one record:** 096 (café + restaurant).
- **`experience` is a catch‑all** for tours, walks, events, classes and neighborhoods at a time of day (075).

### G — Tags

- **G1. Some tags repeat the type:** `market` on all 6 markets, `experience` on 5 experiences, `shop` on 099.
  - Type‑like tags also appear on other types: `market` on 031 (experience) and 099 (shop), `shop` on 060 and 102, `experience` on 091 (cafe).
- **G2. Wrong format:** `local_favorite` (100) should be `local-favorite`.
- **G3. Tags contradict the price:**
  - `splurge` on €€: 007, 035. 035's description also says wine "for almost nothing".
  - `budget` on €€: 082.
  - `free` on €: 023, 093.
- **G4. Tags are applied unevenly:**
  - `free` 2 (should be about 18)
  - `seasonal` 1 (090 only; 035 063 064 065 085 are also seasonal)
  - `family-friendly` 5
  - `modern` 2, `lively` 1
- **G5. Questionable tags:**
  - `active` on 045 (museum) and 100 (bar walk)
  - `hidden-gem` on 103 Palazzo Vecchio and 094
  - `morning` on 040 (the description praises the *afternoon* sun)
  - `outdoors` on 053 (a factory tour)
- **G6. `scenic` and `views` overlap:** they appear together on 17 records.

### X — Names

- **X1. Names mix the venue name with the activity or dish:**
  - Dish + venue: 047, 061, 073, 079, 092, and `Gelato at …` (011, 054)
  - Activity: `… Climb` 048, `… Walk` 049, `… Bike Ride` 021, `… Day Trip` 035 038 089, `… Tour` 053, `… Trip` 070, `Aperitivo at …` 037 065
  - Time of day: `at Dawn` 023, `at Night` 052, `by Night` 077, `at Aperitivo Hour` 057, `Early Morning in` 075
  - Type suffix: `… Neighborhood` 002 013 028 072
  - Parenthetical: 012 032 056 080 093
  - City suffix, used on some records only: 044 045 046 049 050 053 078 082 083 086 091 093 094 096 097 098 100 101 102

  → Split into a plain venue name and a display title.
- **X2. 044 is a generic activity with no venue.** Its description points to 083.
- **X3. "Open since YYYY" means *founded*, not opening hours** (011, 078, 091). An extractor could take it as hours.

### R — Relationships between records

These aren't modeled and are only visible in the text:

| Records | Relationship |
|---|---|
| 001 · 004 · 016 | One shared ticket (stated in 004). Their price is counted three times |
| 018 · 077 | Same place, different times of day |
| 030 · 031 | Same building. 030's description already covers 031's upstairs food hall |
| 044 · 083 | 044 recommends 083's producer |
| 053 · 092 | Same Parma trip, 97 m apart |
| 057 · 100 | Both are Navigli aperitivo; 100 ends in Navigli |
| 027 · 040 | San Miniato is "up past Piazzale Michelangelo" |
| 002 · 097 | The Gianicolo walk starts in Trastevere |
| 091 · 096 | 096's description compares itself to Florian |
| 026 · 103 | "the Uffizi next door" |
| 023 · 080 | The Pincio terrace is part of Villa Borghese |

### Q — Ratings

- All ratings are 0–5 with one decimal. There's no source and no review count.
- 025 has **2.1**, an outlier. Its description is pure editorial with no facts ("Why would you eat here…"). It's effectively a decoy or "don't go" record and should be marked as such, not recommended.
- 043 has **5.0**, the maximum.
- Low ratings match negative descriptions: 012 3.8, 019 3.9, 082 3.9.

---

## 2. Every record

Codes refer to Part 1. Nearly every record also has **E1** and **E2**, so they're listed as codes rather than repeated in the text.

**Labels:**

| Label | Meaning |
|---|---|
| ERROR | The value is wrong |
| CONFLICT | Two sources in the record disagree |
| BURIED | A structured fact exists only in free text |
| AMBIG | The value can be read more than one way |
| MISSING | The value is absent |
| DUP | The record duplicates or overlaps another |
| MODEL | The schema can't represent the fact |

### Rome (Lazio)

**001 · Colosseum** — codes: E1 E2 H1
- CONFLICT: the description says "book the evening experience", but `hours` ends at 19:00. Evening access isn't represented.
- AMBIG: `seasonal_notes` contains booking and queue advice, not a season → move it to booking and caveats.
- BURIED: "underground and arena floor … premium ticket" → an optional ticket tier.
- DUP/R: shares a ticket with 004 and 016.

**002 · Trastevere Neighborhood** — codes: E1 E2 H2
- H2 → always accessible. P2 → free to walk; it's unclear what `€` measures.
- BURIED: "Come at dusk and stay for dinner" → best time is evening.
- X1: `Neighborhood` suffix. L7: the neighborhood value is the record's own name. L4: an area stored as a point.

**003 · Da Enzo al 29** — codes: E1 E2
- Two intervals, Monday–Saturday. Sunday is closed by implication (H7). The close time is unclear (H8).
- No other problems.

**004 · Roman Forum** — codes: E1 E2 H1
- AMBIG/ERROR (see Part 3): neighborhood `Celio`. The Forum is in Campitelli/Monti.
- BURIED: "Combine with the Colosseum on the same ticket" → shared ticket (R).
- BURIED: "quiet early morning" (the `morning` tag already covers this).

**005 · Pantheon** — codes: E1 H1
- CONFLICT/B3: "Now requires a ticket" while `booking_required: false`. A ticket and a booking should be separate fields.

**006 · Campo de' Fiori Market** — codes: E1 H3 G1
- H3: `hours: "Morning only"` doesn't parse. The description gives "Go before 11am" and "By afternoon it clears out", but no days and no opening time.
- L7: the neighborhood is `Parione`, while 022 uses `Campo de' Fiori` for the same area.

**007 · Borghese Gallery** — codes: E1 E2 H6
- G3: the `splurge` tag contradicts `€€`.
- D4: a "strict 2‑hour limit" is a maximum stay, which isn't modeled.
- B2: "Booking months ahead."
- Minor editorial conflict: "most underrated museum" alongside the `iconic` tag and a 4.9 rating.

**008 · Piazza Navona** — codes: E1 E2 H2
- H2 → always accessible. P2 → free.
- BURIED: "especially at night" (the `evening` tag covers this).

**009 · Osteria Fernanda** — codes: E1 H6
- Dinner only, Tuesday–Sunday. H8 applies.
- No record‑specific problems.

**010 · Vatican Museums** — codes: E1 E2
- S: `seasonal_notes` holds a weekly closure, a last‑Sunday exception, a price change (free) and a crowd warning. The Sunday closure already follows from `Mon-Sat`, so only the exception needs structure (as a caveat).
- B1: "Go the moment they open or you'll spend an hour in entrance queues" means walk‑ups are possible, so booking is recommended, not strictly required.
- L5: the Museums are in Vatican City, not Italy or Lazio (Part 3). `Borgo` is next to it.

**011 · Gelato at Giolitti** — codes: E1 H1 H4
- H4: `24:00`.
- X1: the venue is "Giolitti". X3: "open since 1900" means founded.

**012 · Mouth of Truth (Bocca della Verità)** — codes: E1 E3 H1
- E3: the name is garbled and lost its NBSP byte (`VeritÃ )`).
- D2: duration is 15, while the description says "the actual experience takes 30 seconds; the queue is always long". It's unclear whether 15 includes the queue.
- Editorial: "not worth a special trip", rating 3.8 → a low‑priority signal that isn't structured.

**013 · Pigneto Neighborhood** — codes: E1 E2 H2
- BURIED: "Come Thursday or Friday evening" → best days.
- X1 and L7 as for 002.

**014 · Aventine Keyhole** — codes: E1 E2 H2
- MISSING/BURIED: `duration_minutes: null`, but the description says "takes 5 minutes" → 5.
- CONFLICT/P2: the description says "Free", but the price is `€` and there's no `free` tag.

**015 · Mercato Testaccio** — codes: E1 E2 E3 G1
- E3/E4: `supplì` is garbled and spelled differently from 042.
- No other problems.

**016 · Palatine Hill** — codes: E1 H1
- AMBIG/ERROR (Part 3): neighborhood `Celio`. The Palatine is in Campitelli.
- R: shares a ticket with 001 and 004. That's only stated in 004.

**017 · Castel Sant'Angelo** — codes: E1 E2 H1
- CONFLICT: "rooftop terrace … at golden hour", but it closes at 19:30. Golden hour is after closing for most of the summer.

**018 · Trevi Fountain** — codes: E1 E2 H2
- DUP/L2: identical coordinates to 077.
- BURIED: "Go at 6am" (best time); "recent ticket pilot … during peak hours" (a possible fee or timed access; B3, P1).

**019 · Spanish Steps** — codes: E1 E2 H2
- AMBIG/ERROR (Part 3): neighborhood `Trevi`. The Steps are in Campo Marzio.
- P2: free. The description is negative ("tourist-trap", "not to linger"); rating 3.9.

**020 · Il Sorpasso** — codes: E1 E2 H1 H4
- MISSING: `booking_required: null`, the only one in the file.
- H4: closes after midnight (`8:00-01:00`). H1: no days.
- BURIED: "aperitivo, lunch, and dinner" → meal services.

**021 · Appian Way Bike Ride** — codes: E1 E2 H2
- AMBIG (trap): "Road closed to cars on Sundays" is a road rule and must **not** close the place. Sunday morning is actually the recommended time (per the description).
- S: "Best April-October" is a recommendation, not a closure.
- L4: a route stored as one point; the neighborhood is null. L6: "20 minutes from the city center".
- BURIED: requires renting a bike, yet `booking_required: false`.

**022 · Roscioli Salumeria** — codes: E1 E2
- B1: "eat at the bar … **or** book a table" means booking is optional, but `booking_required: true`.
- L7: the neighborhood is a square (`Campo de' Fiori`) and differs from 006's label for the same area.

**023 · Piazza del Popolo at Dawn** — codes: E1 H2
- L3: the description is about the **Pincio terrace above** the piazza, but the coordinates are the piazza itself.
- G3: the `free` tag contradicts `€`. D1: no duration.
- X1: the name includes a time of day.
- Part 3: the neighborhood `Flaminio` is really Campo Marzio; Flaminio starts outside the gate.

**024 · Fontanella Borghese Book Market** — codes: E1 E2 G1
- Part 3: the neighborhood `Colonna` should be checked; Largo della Fontanella di Borghese is in Campo Marzio.

**025 · Hard Rock Cafe Rome** — codes: E1 H1 H4
- Q: the rating of 2.1 is an outlier, and the description has no facts. This is a decoy or "don't go" record → mark it (for example `recommend: false`) rather than treat it as a normal place.
- Only 1 tag.
- Part 3: the real address is Via Veneto, about 500 m from these coordinates.

### Florence (Tuscany)

**026 · Uffizi Gallery** — codes: E1 E2 H6
- **ERROR:** neighborhood `Oltrarno`. The Uffizi is on the **north** bank; its own coordinates are north of the Arno, 100 m from Palazzo Vecchio.
- S/B1: "Booking essential April-October" makes booking seasonal. The description adds "book weeks in advance in high season" (B2).

**027 · Piazzale Michelangelo** — codes: E1 E2 H2
- D1: no duration. P2: free.
- BURIED: "Crowded at sunset; try instead at 7am" → best time.

**028 · Oltrarno Neighborhood** — codes: E1 E2 H2
- X1 and L7 as for 002. P1: `€€`, while Trastevere is `€`, so what price means for a neighborhood isn't defined.

**029 · Buca Mario** — codes: E1 E2 H1
- H1: two intervals with no days.
- Part 3: the neighborhood `Santa Croce` and coordinates 111 m from the Bargello should be checked. The restaurant is at Piazza degli Ottaviani, near Santa Maria Novella.

**030 · Mercato Centrale Firenze** — codes: E1 E2 G1
- DUP/L2: identical coordinates to 031, and the description already covers the upstairs food hall.
- H5: in `Mon-Fri 7:00-14:00, Sat 7:00-17:00` the comma separates groups of days, not intervals. Sunday is closed by implication.

**031 · Mercato Centrale** — codes: E1 E2 H4
- DUP: the same building as 030. The name is ambiguous without the city.
- T: typed `experience`; it's a food hall. G1: `market` tag.

**032 · Accademia Gallery (Michelangelo's David)** — codes: E1 E2 H6
- B2: "Book before you come to Florence." X1: parenthetical in the name.

**033 · Buca dell'Orafo** — codes: E1 E2 H6
- Part 3 (likely ERROR): neighborhood `Oltrarno`. The description says "near the Ponte Vecchio", and the restaurant is on the north bank (Volta dei Girolami). The coordinates are 34 m from the Ponte Vecchio point.

**034 · Boboli Gardens** — codes: E1 E2 H1
- **CONFLICT/H9:** `hours` ends at 16:30, which is the winter time. The notes say "Summer hours extend to 19:30", without defining which months count as summer.
- S: "brutally hot July-August" → a caveat.

**035 · Chianti Day Trip by Bike** — codes: E1 E2 H2
- L5: `city: Florence`, but the point is in Greve, 21 km away. Other day trips use the destination as the city.
- S: "Open April-October only" → `openMonths` [4–10]. "Best in September" → a caveat.
- G3: the `splurge` tag contradicts `€€` and "drink for almost nothing".
- D2: 480 minutes includes travel.
- Part 3: Greve has no train station.

**036 · Santa Croce Basilica** — codes: E1 E2
- Clean. Per‑day hours with a separate Sunday interval (H5).

**037 · Aperitivo at Rasputin** — codes: E1 E2 E3 H3
- H3: `hours: "Evenings"`. The description gives "show up at 7pm".
- P4: "€8" is garbled (E3). X1/T: the venue is Rasputin, and it's a bar typed `cafe`.

**038 · Siena Day Trip** — codes: E1 E2 H2
- L5/L6: `city: Siena`, the origin is Florence ("90 minutes by bus"), and D2 applies (360 minutes includes about 3 h of travel).

**039 · Il Latini** — codes: E1 E2 H6
- L7: `San Giovanni` is a whole Florence quartiere, much coarser than other Florence values.

**040 · San Miniato al Monte** — codes: E1 E2 H1 H3
- H3: `8am-7pm` is 12‑hour format.
- G5: the `morning` tag conflicts with "glitters in afternoon sun".

**041 · Osteria dell'Enoteca** — codes: E1 E2
- Dinner only, Monday–Saturday. No record‑specific problems.

### Rome (continued)

**042 · Trattoria da Cesare al Casaletto** — codes: E1 E2 H6
- L8: neighborhood is null, although the name says Casaletto. E4: `suppli` has no accent.
- L6: "Worth the taxi" (5.2 km out).

### Emilia‑Romagna

**043 · Osteria Francescana** — codes: E1 E2 E3 H6
- **CONFLICT/H8:** `duration 240` is longer than the 20:00–22:00 dinner window. The 22:00 must be the last seating.
- B2: "Book 2+ months in advance". P4: "€350+ per person" (garbled).
- L8: neighborhood null (it's in Modena's center). Q: 5.0.

**044 · Traditional Balsamic Vinegar Tasting, Modena** — codes: E1 E2 H2 G1
- X2/DUP: a generic activity. It names "Acetaia Malpighi or Acetaia Giusti", and Giusti is 083.
- L3: the coordinates are a placeholder 55 m from 043; the producers are outside the center.
- H2: by appointment, but `hours: null`.

**045 · Ferrari Museum, Maranello** — codes: E1 E2 H1
- L6: "15 minutes from Modena by bus". Modena isn't a base; the nearest base is Bologna, 38 km away.
- G5: the `active` tag doesn't fit a museum. P3: "test track laps are expensive" is an optional extra.

**046 · Via Drapperie, Bologna** — codes: E1 E2 G1
- T: a street of shops typed `market`. Its `hours` are uniform, which a whole street can't really have.
- L7: `Quadrilatero` could be confused with Milan's `Quadrilatero della Moda`.
- BURIED: "Come before noon".

**047 · Tagliatelle al Ragù at Trattoria Anna Maria** — codes: E1 E2 E3 H6
- E3: the name is garbled. X1: dish + venue. B2: "Book a week ahead minimum."

**048 · Torre degli Asinelli Climb** — codes: E1 E2 H1
- L7: the neighborhood is a square. X1: activity in the name.
- Part 3: the tower has been closed to climbers since late 2023. The hours may be out of date.

**049 · University of Bologna Porticoes Walk** — codes: E1 E2 H2
- **CONFLICT:** the name says university porticoes and the neighborhood says `University Quarter`. The description describes the **Piazza Maggiore → San Luca** route, which runs about 4 km southwest. The coordinates are at Piazza Maggiore, 123 m from 052.
- L4: a route stored as a point. L7: an English neighborhood name.

**050 · Enoteca Italiana, Bologna** — codes: E1 E2 H6
- T: described as "A wine bar" but typed `restaurant`; other wine bars are `cafe`.
- Part 3: the location (Saragozza) should be checked; the venue is believed to be on Via Marsala in the center.

**051 · Pinacoteca Nazionale di Bologna** — codes: E1 E2 H6
- Clean.

**052 · Piazza Maggiore at Night** — codes: E1 E2 H2
- X1: time of day in the name. D1: no duration.
- L7: `Centro Storico` is generic. P2: free.

**053 · Cheese and Prosciutto Tour, Parma** — codes: E1 E2 H2 G1
- **S/H2:** "Tours run weekday mornings only" is a weekly schedule stored in `seasonal_notes`, while `hours` is null → Monday–Friday mornings, times unknown.
- L3: the point is Parma's center; the facilities are rural.
- L6: "35 min by train" from Bologna (see Part 3). D2: 360 minutes includes travel.
- G5: the `outdoors` tag is questionable.

**054 · Gelato at La Sorbetteria Castiglione** — codes: E1 E2 H1
- X1: activity + venue in the name. No other problems.

### Milan (Lombardy)

**055 · Duomo di Milano** — codes: E1 E2 H1
- **CONFLICT:** "Go at sunset when the marble turns orange", but it closes at 18:00. Sunset is after 18:00 for most of the year.
- MODEL: the rooftop terrace has its own ticket and hours, which aren't modeled. `booking_required: false`.

**056 · The Last Supper (Cenacolo Vinciano)** — codes: E1 E2 H6
- **CONFLICT:** `duration_minutes: 30`, but the description says "access is strictly 15 minutes" (D3/D4).
- **CONFLICT:** the notes say "sell out 2 months in advance", but the description says "sell out weeks in advance".
- S: the note is about booking, not seasons.

**057 · Navigli Canals at Aperitivo Hour** — codes: E1 E2 H2
- S: "Best May-September when canal-side seating is open" is a recommendation. An extractor might read "open" as a closure.
- X1: time of day in the name. DUP/R: overlaps 100.
- "Let the free food happen" contains the word "free", which could be misread as a price.

**058 · Pinacoteca di Brera** — codes: E1 E2 H6
- Clean.

**059 · Brera Antique Market** — codes: E1 E2 G1
- **ERROR:** longitude `11.191` puts it 156 km east of Milan, near Vicenza. The expected value is about `9.19`, probably a 9 → 11 typo.
- **CONFLICT/H9:** `hours: "Sat-Sun"`, but it runs on the third weekend of each month only (notes and description).
  - "Third weekend" and "third Saturday **and** Sunday" differ when a month starts on a Sunday.
  - A recurrence rule is needed.

**060 · Galleria Vittorio Emanuele II** — codes: E1 E2 H2
- P3: `€€€` for a free public arcade; the price reflects the Camparino.
- G1: `shop` tag on a historic_site.

**061 · Risotto alla Milanese at Trattoria Milanese** — codes: E1 E2 H6
- B1: "Reserve for dinner" means booking applies to dinner only. X1: dish + venue.

**062 · Fondazione Prada** — codes: E1 E2
- H: `Wed-Mon` wraps past Sunday (Tuesday closed).

**063 · Bellagio, Lake Como** — codes: E1 E2 H2
- **AMBIG:** "Open April-October only" for a *town*. It can't literally close; this is probably ferry or tourist season → a caveat, not `openMonths`.
- L6: the ferry takes 2 h and the hydrofoil 45 min, both from Como, not from Milan. T: a town typed `experience`.

**064 · Villa del Balbianello, Lake Como** — codes: E1 E2 H6
- H: `Tues, Thurs-Sun` combines a list with a range (Monday and Wednesday closed).
- S: a real closure → `openMonths` [4–10].
- BURIED: "Only reachable by boat or a steep hike."
- Typo: "A 18th-century" should be "An".

**065 · Aperitivo at Ceresio 7** — codes: E1 E2
- **CONFLICT/S:** the venue is open Wednesday–Sunday all year, but the record's point is the rooftop pool bar, which is only open May–September. That's a partial closure.
- T/X1: a bar typed `cafe`, with an activity in the name.

**082 · Rossopomodoro, Milan** — codes: E1 E2 H1
- G3: the `budget` tag contradicts `€€`.

**086 · Museo del Novecento, Milan** — codes: E1 E2 H6
- Clean.

**094 · Roof Garden at the Rinascente, Milan** — codes: E1 E2 H1
- T: a department‑store rooftop bar/food hall typed `viewpoint`. Its hours are the store's hours.

**098 · Basilica di Sant'Ambrogio, Milan** — codes: E1 E2
- Sunday is closed by implication (H7), which is unusual for a church.
- Minor text inconsistency: "4th-century Romanesque" (founded in the 4th century, rebuilt in the Romanesque style in the 11th–12th).

**100 · Aperitivo Culture Walk, Milan** — codes: E1 E2 H3
- **G2:** the `local_favorite` tag uses an underscore.
- H3: `Evenings`.
- L4: the neighborhood is `Isola`, but the route spans Isola → Corso Como → Porta Ticinese → Navigli.
- DUP/R: overlaps 057. G5: the `active` tag.

**102 · Quadrilatero della Moda, Milan** — codes: E1 E2 H2
- L7: the neighborhood is the record's own name. P1: `€€€€` for window‑shopping.
- H2: shops have hours, but it's listed as "always open".

### Lake Como / Lombardy (outside Milan)

**085 · Como Town Lakefront** — codes: E1 E2 H2
- **AMBIG:** "Open April-October only" for a public lakefront. It can't close; treat this as a caveat.
- T: a town typed `viewpoint`. D1: no duration. L6: "45 min by train" from Milan.

### Venice (Veneto)

**066 · Rialto Bridge** — codes: E1 E2 H2
- D1: no duration. P2: free.
- BURIED: "Go at 7am; by 10am it's a wall of selfie sticks."

**067 · Doge's Palace** — codes: E1 E2 H1
- Clean apart from H1.

**068 · Cicchetti Bar Crawl, Cannaregio** — codes: E1 E2 H3
- H3: `Evenings`. L4: several bars stored as one point.

**069 · Peggy Guggenheim Collection** — codes: E1 E2 E3
- E3: `DalÃ­` contains a hidden soft hyphen. H: `Wed-Mon` wraps.

**070 · Burano Island Trip** — codes: E1 E2 H2
- L5: `city: Burano` is part of the comune of Venice.
- L6: "45 minutes" by vaporetto. BURIED: "quiet on weekday mornings".

**071 · Gondola on a Back Canal** — codes: E1 E2 H2
- L3/L8: an arbitrary point with a null neighborhood; the description says Cannaregio or Dorsoduro.
- P1: priced per boat ("split the cost four ways").

**072 · Dorsoduro Neighborhood** — codes: E1 E2 H2
- X1 and L7 as for 002.

**073 · Spaghetti alle Vongole at Osteria da Rioba** — codes: E1 E2 H6
- X1: dish + venue. B1: "Book a canal table" is a recommendation.

**074 · St. Mark's Basilica** — codes: E1 E2
- B1: "Pre-book to skip the queue" is optional, but `booking_required: true`.
- P3: "the upstairs gallery … extra ticket".

**075 · Early Morning in Cannaregio** — codes: E1 E2 H2
- BURIED: "Before 8am" is its whole time window, but `hours` is null.
- X1/T: a time of day plus a neighborhood, typed `experience`.

**076 · Osteria Alla Staffa** — codes: E1 E2
- No record‑specific problems.

**078 · Enoteca al Volto, Venice** — codes: E1 E2
- T: a wine bar typed `cafe`. X3: "open since 1936" means founded. BURIED: "late morning".

**079 · Prosciutto e Melone at Cremeria Mascareta** — codes: E1 E2 H3
- **CONFLICT:** the name says "Cremeria" (an ice‑cream shop) plus a prosciutto‑and‑melon dish, but the description is a "late-night wine bar" that recommends the cheese plate. The name looks garbled (Part 3).
- H3/CONFLICT: `hours: "Evenings"`, while the description says "Open until 2am".
- T: typed `cafe`.

**088 · San Giorgio Maggiore Campanile** — codes: E1 E2 H1
- L6: "5-minute vaporetto". No other problems.

**091 · Caffè Florian, Venice** — codes: E1 E2 E3 H1
- E3: the name is garbled. P4: "€25". X3: "Open since 1720".
- G1: `experience` tag on a cafe.

**096 · Al Quadri, Venice** — codes: E1 E2
- **CONFLICT/DUP:** one record describes two venues.
  - The type (`restaurant`), `€€€€`, `booking_required: true` and "two-Michelin-star" all describe the **upstairs restaurant**.
  - `hours "Daily 9:00-23:00"` and "a glass of wine at the downstairs cafe" describe the **café**.

### Veneto (outside Venice)

**090 · Isola della Scala Risotto Festival** — codes: E1 E2 H2 G1
- S: "October only — check exact festival dates" → an event with dates that change each year, not `openMonths`.
- L6: "30 minutes from Verona". Verona isn't a base or in the dataset.
- Part 3: the festival usually runs mid‑September to early October.

**095 · Orto Botanico di Padova** — codes: E1 E2 H1
- S: "Best April-October" is a recommendation. L9: city `Padua` vs name `Padova`.
- L6: "30 minutes from Venice".

### Rome (continued)

**077 · Trevi Fountain by Night** — codes: E1 E2 H2
- DUP/L2: identical coordinates to 018. T: `viewpoint` here, `historic_site` there.
- D1: no duration. X1: time of day in the name.

**080 · Borghese Park (Villa Borghese)** — codes: E1 E2 H2
- R: 89 m from 007; contains the Pincio (023). X1: parenthetical in the name.

**097 · Passeggiata del Gianicolo, Rome** — codes: E1 E2 H2
- D1: no duration.
- BURIED: "noon cannon fired every day" is a daily 12:00 event, and "Walk here from Trastevere" makes it a route (L4). G: the `morning` tag.

**099 · Eataly Roma Ostiense** — codes: E1 E2 H1 H4 G1
- H4: `24:00`. L9: `Roma` vs `Rome`.

### Florence (continued)

**081 · Pitti Palace** — codes: E1 E2 H6
- MODEL: "multiple museums" are one record with one set of hours and one price. Next to 034.

**084 · Ponte Vecchio** — codes: E1 E2 E3 H2
- E3: `TrinitÃ ` lost its NBSP byte. P2: free. 34 m from 033.

**093 · Piazza del Duomo, Florence (Exterior)** — codes: E1 E2 H2
- G3: the `free` tag contradicts `€`. D1: no duration.
- X1: "(Exterior)" implies the interior is a separate place that isn't in the dataset.

**101 · Museo Nazionale del Bargello, Florence** — codes: E1 H1
- Morning‑only hours (`8:15-13:50`) with no days (H1).

**103 · Palazzo Vecchio** — codes: E1 E2 H1
- L7: the neighborhood is a square (`Piazza della Signoria`).
- G5: the `hidden-gem` tag on a major landmark.
- H9: `9:00-23:00` looks like summer late opening; the tower has its own hours.

### Emilia‑Romagna (continued)

**083 · Acetaia Giusti, Modena** — codes: E1 E2 G1
- DUP/R: overlaps 044. L8: neighborhood null.

**087 · Flavors of Bologna Cooking Class** — codes: E1 E2 H1 H3 G1
- H3: `9am-12:30pm` is 12‑hour format.
- CONFLICT (D3): duration 210 matches the hours, but the description says "3-hour".
- L3/L8: a generic point with a null neighborhood.

**092 · Prosciutto di Parma at Cantina di Parma** — codes: E1 E2
- X1: dish + venue. The description lists culatello and other foods, not specifically prosciutto.
- Lunch only. L8: neighborhood null. R: 97 m from 053.

### Tuscany (outside Florence)

**089 · Pienza Village Day Trip** — codes: E1 E2 H2
- L6/D2: "90 minutes from Florence or Siena", and the 360‑minute duration includes travel. T: a town typed `experience`.

---

## 3. Real‑world facts to check (not visible in the file)

These can't be proven from the data. Check them before acting on them.

| Record | Claim in data | Likely reality |
|---|---|---|
| 026 | Uffizi `neighborhood: Oltrarno` | North bank, historic center. The file's own coordinates agree |
| 004, 016 | Forum and Palatine `Celio` | Rione Campitelli (Forum is partly Monti) |
| 019 | Spanish Steps `Trevi` | Rione Campo Marzio |
| 033 | Buca dell'Orafo `Oltrarno` | North bank, Volta dei Girolami |
| 029 | Buca Mario in Santa Croce, near the Bargello | Piazza degli Ottaviani, near Santa Maria Novella |
| 025 | Hard Rock coordinates near Trevi | Via Veneto (Ludovisi) |
| 010 | Vatican Museums in Rome/Lazio | Vatican City State |
| 048 | Asinelli tower open 9:00–18:00 | Closed to climbers since late 2023 because of work on the Garisenda tower |
| 035 | "Take the train to Greve in Chianti" | Greve has no railway station (it's reached by bus) |
| 053 | Bologna → Parma "35 min by train" | Usually about 50–60 min |
| 079 | "Cremeria Mascareta" | The wine bar is Enoteca Mascareta (Castello) |
| 090 | Risotto festival "October only" | Usually mid‑September to early October |
| 059 | Longitude 11.191 | Brera is at about 9.19 |
