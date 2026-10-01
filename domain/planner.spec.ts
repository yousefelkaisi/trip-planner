import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { applyAll } from './commands';
import { HUBS } from './hubs';
import type { Place } from './model/place';
import { HUB_IDS, type HubId, type Prefs } from './model/trip';
import { bestInsertion, eligible, fill, hasSightLeft, score } from './planner';
import { PACES, scheduleDay, scheduleTrip } from './schedule';
import { catalogOf, everyDay, makePlace, makeTrip } from './testing';

const places: Place[] = JSON.parse(readFileSync('data/places.json', 'utf8')).places;
const CATALOG = catalogOf(...places);
const allDay = everyDay([{ open: '00:00', close: '24:00' }]);

describe('score', () => {
  it('weighs interests, avoided tags, rating and budget, and explains itself', () => {
    const place = makePlace({
      tags: ['wine', 'scenic', 'tourist-heavy'],
      rating: 4.8,
      priceLevel: 3,
    });
    const prefs = {
      ...makeTrip([]).prefs,
      interests: ['wine', 'scenic'],
      avoid: ['tourist-heavy'],
      maxPrice: 2,
    };
    const result = score(place, prefs);
    expect(result.score).toBeCloseTo(4 - 3 + 0.6 - 5);
    expect(result.reasons).toEqual([
      'matches wine, scenic',
      'tourist-heavy',
      '4.8★',
      'over budget',
    ]);
  });
});

describe('eligible', () => {
  const trip = makeTrip([{ hub: 'rome', stops: [] }], { avoid: ['tourist-heavy'], maxPrice: 2 });

  it('drops avoided tags and known prices over the budget', () => {
    expect(eligible(makePlace(), trip, 0)).toBe(true);
    expect(eligible(makePlace({ priceLevel: null }), trip, 0)).toBe(true);
    expect(eligible(makePlace({ tags: ['tourist-heavy'] }), trip, 0)).toBe(false);
    expect(eligible(makePlace({ priceLevel: 3 }), trip, 0)).toBe(false);
  });

  it('drops places closed that day but keeps unknown hours', () => {
    expect(eligible(makePlace({ hours: everyDay([]) }), trip, 0)).toBe(false);
    expect(eligible(makePlace({ hours: everyDay(null) }), trip, 0)).toBe(true);
  });

  it('drops day trips unless they are on, and other regions always', () => {
    const dayTrips = { ...trip, prefs: { ...trip.prefs, dayTrips: true } };
    const tivoli = makePlace({ city: 'Tivoli' });
    const siena = makePlace({ city: 'Siena', region: 'Tuscany' });
    expect(eligible(tivoli, trip, 0)).toBe(false);
    expect(eligible(tivoli, dayTrips, 0)).toBe(true);
    expect(eligible(siena, dayTrips, 0)).toBe(false);
  });

  it('drops places already in the trip', () => {
    const twoDays = makeTrip([
      { hub: 'rome', stops: ['p1'] },
      { hub: 'rome', stops: [] },
    ]);
    expect(eligible(makePlace(), twoDays, 1)).toBe(false);
  });

  it('drops places flagged for checking, but not an estimated duration', () => {
    expect(eligible(makePlace({ flags: ['check-dates'] }), trip, 0)).toBe(false);
    expect(eligible(makePlace({ flags: ['check-location'] }), trip, 0)).toBe(false);
    expect(eligible(makePlace({ flags: ['not-interpreted'] }), trip, 0)).toBe(false);
    expect(eligible(makePlace({ flags: ['duration-estimated'] }), trip, 0)).toBe(true);
  });

  it('drops ratings below 3.5 but keeps unrated places', () => {
    expect(eligible(makePlace({ rating: 3.4 }), trip, 0)).toBe(false);
    expect(eligible(makePlace({ rating: 3.5 }), trip, 0)).toBe(true);
    expect(eligible(makePlace({ rating: null }), trip, 0)).toBe(true);
  });
});

describe('bestInsertion', () => {
  it('breaks ties by taking the earliest position', () => {
    const catalog = catalogOf(
      makePlace({ id: 'a' }),
      makePlace({ id: 'b' }),
      makePlace({ id: 'c' }),
    );
    const trip = makeTrip([{ hub: 'rome', stops: ['a', 'b'] }]);
    expect(bestInsertion(trip, 0, 'c', catalog)).toBe(0);
  });

  it('moves a stop toward its bestTime', () => {
    const catalog = catalogOf(
      makePlace({ id: 'a', hours: allDay }),
      makePlace({ id: 'night', bestTime: 'evening', hours: allDay }),
    );
    const trip = makeTrip([{ hub: 'rome', stops: ['a'] }]);
    expect(bestInsertion(trip, 0, 'night', catalog)).toBe(1);
  });

  it('keeps an afternoon stop out of the morning', () => {
    const catalog = catalogOf(
      makePlace({ id: 'a' }),
      makePlace({ id: 'garden', bestTime: 'afternoon' }),
    );
    const trip = makeTrip([{ hub: 'rome', stops: ['a'] }]);
    expect(bestInsertion(trip, 0, 'garden', catalog)).toBe(1);
  });

  it('puts a night stop after an evening one', () => {
    const evenings = everyDay([{ open: '18:00', close: '24:00' }]);
    const catalog = catalogOf(
      makePlace({ id: 'aperitivo', bestTime: 'evening', hours: evenings }),
      makePlace({ id: 'lights', bestTime: 'night', hours: evenings }),
    );
    const trip = makeTrip([{ hub: 'rome', stops: ['aperitivo'] }]);
    expect(bestInsertion(trip, 0, 'lights', catalog)).toBe(1);
  });

  it('never trades an error for a bestTime', () => {
    // Before 'a', the morning stop is on time but 'a' then closes during its visit.
    const catalog = catalogOf(
      makePlace({
        id: 'a',
        durationMin: 240,
        hours: everyDay([{ open: '09:00', close: '13:00' }]),
      }),
      makePlace({ id: 'early', bestTime: 'morning' }),
    );
    const trip = makeTrip([{ hub: 'rome', stops: ['a'] }]);
    expect(bestInsertion(trip, 0, 'early', catalog)).toBe(1);
  });

  it('keeps another stop from starting after its bestTime', () => {
    // Every position has the same travel and waiting; 'early' only starts by noon if 'c' goes last.
    const catalog = catalogOf(
      makePlace({ id: 'a', durationMin: 120 }),
      makePlace({ id: 'early', durationMin: 120, bestTime: 'morning' }),
      makePlace({ id: 'c', durationMin: 120 }),
    );
    const trip = makeTrip([{ hub: 'rome', stops: ['a', 'early'] }]);
    expect(bestInsertion(trip, 0, 'c', catalog)).toBe(2);
  });
});

describe('hasSightLeft', () => {
  const long = makePlace({ id: 'a', durationMin: 700, hours: allDay });
  const trip = makeTrip([{ hub: 'rome', stops: ['a'] }]);

  it('finds a sight that only runs past the end of the day', () => {
    const late = makePlace({ id: 'b', durationMin: 120, hours: allDay });
    expect(hasSightLeft(trip, 0, catalogOf(long, late))).toBe(true);
  });

  it('ignores sights that would add an error, and restaurants', () => {
    const tooShort = makePlace({
      id: 'b',
      durationMin: 120,
      hours: everyDay([{ open: '09:00', close: '10:00' }]),
    });
    const restaurant = makePlace({ id: 'c', type: 'restaurant', hours: allDay });
    expect(hasSightLeft(trip, 0, catalogOf(long, tooShort, restaurant))).toBe(false);
  });
});

describe('fill', () => {
  it('adds nothing to a day that already holds its sights', () => {
    const sights = ['a', 'b', 'c', 'd', 'e'].map((id) =>
      makePlace({ id, durationMin: 30, hours: allDay }),
    );
    const trip = makeTrip([{ hub: 'rome', stops: ['a', 'b', 'c', 'd'] }]);
    expect(fill(trip, [0], catalogOf(...sights))).toEqual(trip);
  });

  it('takes the best-scored places first', () => {
    // A relaxed day holds 3 sights; 'd' matches an interest, so it beats 'c' despite its id.
    const catalog = catalogOf(
      makePlace({ id: 'a' }),
      makePlace({ id: 'b' }),
      makePlace({ id: 'c' }),
      makePlace({ id: 'd', tags: ['wine'] }),
    );
    const trip = makeTrip([{ hub: 'rome', stops: [] }], { pace: 'relaxed', interests: ['wine'] });
    expect([...fill(trip, [0], catalog).days[0].stops].sort()).toEqual(['a', 'b', 'd']);
  });

  it('adds up to two restaurants a day, at lunch and dinner', () => {
    const restaurants = ['r1', 'r2', 'r3'].map((id) =>
      makePlace({ id, type: 'restaurant', durationMin: 90, hours: allDay }),
    );
    const catalog = catalogOf(...restaurants);
    const trip = fill(makeTrip([{ hub: 'rome', stops: [] }]), [0], catalog);
    expect(scheduleDay(trip, 0, catalog).stops.map((s) => s.start)).toEqual([720, 1140]);
  });

  it('leaves out a sight that would end the day after 22:30', () => {
    const catalog = catalogOf(
      makePlace({ id: 'a', durationMin: 700, hours: allDay }),
      makePlace({ id: 'b', durationMin: 120, hours: allDay }),
    );
    const trip = makeTrip([{ hub: 'rome', stops: ['a'] }]);
    expect(fill(trip, [0], catalog)).toEqual(trip);
  });

  it('spreads a small city over all its days', () => {
    const catalog = catalogOf(
      makePlace({ id: 'a' }),
      makePlace({ id: 'b' }),
      makePlace({ id: 'c' }),
    );
    const trip = makeTrip([
      { hub: 'rome', stops: [] },
      { hub: 'rome', stops: [] },
      { hub: 'rome', stops: [] },
    ]);
    expect(fill(trip, [0, 1, 2], catalog).days.map((d) => d.stops)).toEqual([['a'], ['b'], ['c']]);
  });

  const prefs = (pace: Prefs['pace']): Prefs => ({
    interests: [],
    avoid: [],
    maxPrice: 4,
    pace,
    dayTrips: false,
  });
  const build = (hub: HubId, pace: Prefs['pace'], startDate: string) => {
    const result = applyAll(
      null,
      [
        { type: 'newTrip', startDate, prefs: prefs(pace), hubs: [hub, hub, hub] },
        { type: 'fill', days: [0, 1, 2] },
      ],
      CATALOG,
    );
    if (!result.ok) {
      throw new Error(result.error);
    }
    return result.trip;
  };

  for (const hub of HUB_IDS) {
    for (const pace of ['relaxed', 'balanced', 'packed'] as const) {
      for (const date of ['2026-10-16', '2027-01-11']) {
        it(`plans ${hub}, ${pace}, ${date} within the rules`, () => {
          const trip = build(hub, pace, date);
          const stops = trip.days.flatMap((d) => d.stops);
          const issues = scheduleTrip(trip, CATALOG)
            .flatMap((d) => d.issues)
            .filter((i) => i.severity === 'error' || i.code === 'DAY_OVERRUN');

          expect(issues).toEqual([]);
          expect(new Set(stops).size).toBe(stops.length);
          expect(stops.every((id) => CATALOG.get(id)!.city === HUBS[hub].name)).toBe(true);
          for (const day of trip.days) {
            const restaurants = day.stops.filter((id) => CATALOG.get(id)!.type === 'restaurant');
            const sights = day.stops.length - restaurants.length;
            expect(restaurants.length).toBeLessThanOrEqual(2);
            expect(sights).toBeGreaterThan(0);
            expect(sights).toBeLessThanOrEqual(PACES[pace].sights);
          }
          expect(build(hub, pace, date)).toEqual(trip);
        });
      }
    }
  }
});
