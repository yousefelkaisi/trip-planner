import { addDays, hoursOn } from './hours';
import { HUBS } from './hubs';
import type { Place } from './model/place';
import type { Catalog, Prefs, Trip } from './model/trip';
import { DAY_END, PACES, type ScheduledDay, scheduleDay } from './schedule';

const UNPLANNABLE = ['check-dates', 'check-location', 'not-interpreted'];
// When a stop with each bestTime should start, in minutes after midnight.
const BEST_TIME_WINDOWS = {
  morning: { from: 0, to: 720 }, // before 12:00
  afternoon: { from: 720, to: 1080 }, // 12:00–18:00
  evening: { from: 1080, to: 1440 }, // from 18:00
  night: { from: 1260, to: 1440 }, // from 21:00
};

export function score(place: Place, prefs: Prefs): { score: number; reasons: string[] } {
  const matches = place.tags.filter((t) => prefs.interests.includes(t));
  const avoided = place.tags.filter((t) => prefs.avoid.includes(t));
  const over = place.priceLevel !== null && place.priceLevel > prefs.maxPrice;
  const score = 2 * matches.length - 3 * avoided.length + 2 * ((place.rating ?? 4.5) - 4.5) - (over ? 5 : 0);

  const reasons = [
    matches.length > 0 ? `matches ${matches.join(', ')}` : '',
    avoided.join(', '),
    place.rating !== null ? `${place.rating}★` : '',
    over ? 'over budget' : '',
  ].filter(Boolean);

  return { score, reasons };
}

export function eligible(place: Place, trip: Trip, day: number): boolean {
  const { hub } = trip.days[day];
  const { prefs } = trip;

  return (
    place.region === HUBS[hub].region &&
    (prefs.dayTrips || place.city === HUBS[hub].name) &&
    !trip.days.some((d) => d.stops.includes(place.id)) &&
    hoursOn(place, addDays(trip.startDate, day)).status !== 'closed' &&
    !place.flags.some((f) => UNPLANNABLE.includes(f)) &&
    (place.rating ?? 5) >= 3.5 &&
    !place.tags.some((t) => prefs.avoid.includes(t)) &&
    (place.priceLevel === null || place.priceLevel <= prefs.maxPrice)
  );
}

export function bestInsertion(trip: Trip, day: number, placeId: string, catalog: Catalog): number {
  let best = 0;
  let bestCost = Infinity;

  for (let i = 0; i <= trip.days[day].stops.length; i++) {
    const s = scheduleDay(withStop(trip, day, placeId, i), day, catalog);

    // Minutes each stop starts outside its bestTime, weighed like travel and waiting.
    let offTime = 0;
    for (const { place, start } of s.stops) {
      if (place.bestTime) {
        const { from, to } = BEST_TIME_WINDOWS[place.bestTime];
        offTime += Math.max(0, from - start, start - to);
      }
    }

    const cost = 1000 * errorCount(s) + s.totals.travel + s.totals.waiting + Math.max(0, s.endsAt - DAY_END) + offTime;

    if (cost < bestCost) {
      best = i;
      bestCost = cost;
    }
  }

  return best;
}

export function fill(trip: Trip, days: number[], catalog: Catalog): Trip {
  const places = [...catalog.values()];
  const scores = new Map(places.map((p) => [p.id, score(p, trip.prefs).score]));
  const ranked = places.sort((a, b) => scores.get(b.id)! - scores.get(a.id)! || (a.id < b.id ? -1 : 1));

  const passes = [
    { restaurant: true, limit: 2 },
    { restaurant: false, limit: PACES[trip.prefs.pace].sights },
  ];

  // Days take turns adding one place per round, so a small city spreads across all its days.
  for (const { restaurant, limit } of passes) {
    const candidates = ranked.filter((p) => (p.type === 'restaurant') === restaurant);

    let added = true;
    while (added) {
      added = false;
      for (const day of days) {
        const stops = trip.days[day].stops;
        const count = stops.filter((id) => (catalog.get(id)?.type === 'restaurant') === restaurant).length;

        if (count >= limit) {
          continue;
        }

        const errors = errorCount(scheduleDay(trip, day, catalog));

        for (const place of candidates.filter((p) => eligible(p, trip, day))) {
          const next = withStop(trip, day, place.id, bestInsertion(trip, day, place.id, catalog));
          const s = scheduleDay(next, day, catalog);

          if (errorCount(s) <= errors && s.endsAt <= DAY_END) {
            trip = next;
            added = true;
            break;
          }
        }
      }
    }
  }

  return trip;
}

// Whether an eligible sight could still go on the day without adding an error, ignoring the 22:30
// end. When fill() leaves a day short, this tells a full day (true) from a city that ran out (false).
export function hasSightLeft(trip: Trip, day: number, catalog: Catalog): boolean {
  const errors = errorCount(scheduleDay(trip, day, catalog));

  return [...catalog.values()].some((place) => {
    if (place.type === 'restaurant' || !eligible(place, trip, day)) {
      return false;
    }
    const next = withStop(trip, day, place.id, bestInsertion(trip, day, place.id, catalog));
    return errorCount(scheduleDay(next, day, catalog)) <= errors;
  });
}

function withStop(trip: Trip, day: number, placeId: string, index: number): Trip {
  const days = trip.days.map((d, i) =>
    i === day ? { ...d, stops: [...d.stops.slice(0, index), placeId, ...d.stops.slice(index)] } : d
  );
  return { ...trip, days };
}

function errorCount(s: ScheduledDay): number {
  return s.issues.filter((i) => i.severity === 'error').length;
}
