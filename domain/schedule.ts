import { addDays, type DayHours, formatTime, hoursOn } from './hours';
import { HUBS, trainMinutes } from './hubs';
import type { Place } from './model/place';
import type { Catalog, HubId, Issue, Trip } from './model/trip';
import { type Leg, travel } from './travel';

export const DAY_END = 1350; // 22:30, back at the station

// `sights` is how many non-restaurant stops the planner gives a day.
export const PACES = {
  relaxed: { start: 600, buffer: 30, sights: 3 },
  balanced: { start: 540, buffer: 15, sights: 4 },
  packed: { start: 510, buffer: 0, sights: 6 },
};

export const MEALS = [
  { name: 'lunch', start: 720, end: 900 },
  { name: 'dinner', start: 1140, end: 1320 },
];

export interface ScheduledStop {
  place: Place;
  legIn: Leg;
  arrive: number;
  start: number;
  end: number;
  hours: DayHours;
}

export interface ScheduledDay {
  date: string;
  hub: HubId;
  transferMinutes: number | null;
  stops: ScheduledStop[];
  legOut: Leg | null;
  endsAt: number;
  totals: { travel: number; visiting: number; waiting: number };
  issues: Issue[];
}

export function scheduleTrip(trip: Trip, catalog: Catalog): ScheduledDay[] {
  return trip.days.map((_, i) => scheduleDay(trip, i, catalog));
}

export function scheduleDay(trip: Trip, day: number, catalog: Catalog): ScheduledDay {
  const { hub } = trip.days[day];
  const date = addDays(trip.startDate, day);
  const pace = PACES[trip.prefs.pace];
  const prev = trip.days[day - 1]?.hub;
  const transferMinutes = prev && prev !== hub ? 30 + trainMinutes(prev, hub) : null;
  const dayStart = pace.start + (transferMinutes ?? 0);

  const stops: ScheduledStop[] = [];
  const issues: Issue[] = [];
  const usedMeals = new Set<string>();
  let t = dayStart;
  let pos: { lat: number; lng: number } = HUBS[hub];

  for (const id of trip.days[day].stops) {
    const place = catalog.get(id);
    if (!place) {
      continue;
    }

    const restaurant = place.type === 'restaurant';
    const legIn = travel(pos, place);
    const arrive = t + legIn.minutes;
    let earliest = arrive;

    // A restaurant waits for the next meal window that no earlier restaurant has used.
    if (restaurant) {
      const meal = MEALS.find((m) => !usedMeals.has(m.name) && arrive < m.end);
      if (meal) {
        earliest = Math.max(arrive, meal.start);
      }
    }

    const hours = hoursOn(place, date);
    let start = earliest;
    if (hours.status === 'open') {
      const slot = hours.intervals.find(
        (i) => Math.max(i.open, earliest) + place.durationMin <= i.close,
      );
      if (slot) {
        start = Math.max(slot.open, earliest);
      } else {
        issues.push({
          code: 'CLOSES_DURING_VISIT',
          severity: 'error',
          placeId: id,
          message: `Not open long enough for a ${place.durationMin}-min visit after ${formatTime(earliest)}`,
        });
      }
    } else if (hours.status === 'closed') {
      issues.push({
        code: 'CLOSED',
        severity: 'error',
        placeId: id,
        message: hours.reason ?? 'Closed',
      });
    } else {
      issues.push({
        code: 'HOURS_UNKNOWN',
        severity: 'warning',
        placeId: id,
        message: 'Hours unavailable; check before going',
      });
    }

    if (restaurant) {
      const meal = MEALS.find((m) => start >= m.start && start < m.end);
      if (meal) {
        usedMeals.add(meal.name);
      }
    }
    if (start - arrive > 45) {
      issues.push({
        code: 'LONG_WAIT',
        severity: 'info',
        placeId: id,
        message: `${start - arrive} min free before this stop`,
      });
    }

    const end = start + place.durationMin;
    stops.push({ place, legIn, arrive, start, end, hours });
    t = end + pace.buffer;
    pos = place;
  }

  const last = stops.at(-1);
  const legOut = last ? travel(last.place, HUBS[hub]) : null;
  const endsAt = (last?.end ?? dayStart) + (legOut?.minutes ?? 0);

  if (endsAt > DAY_END) {
    issues.push({
      code: 'DAY_OVERRUN',
      severity: 'warning',
      message: `Back at the station at ${formatTime(endsAt)}, after ${formatTime(DAY_END)}`,
    });
  }
  if (stops.length > 0) {
    for (const meal of MEALS.filter((m) => !usedMeals.has(m.name))) {
      issues.push({
        code: 'NO_MEAL',
        severity: 'info',
        message: `No restaurant at ${meal.name} time`,
      });
    }
  }

  return {
    date,
    hub,
    transferMinutes,
    stops,
    legOut,
    endsAt,
    totals: {
      travel: stops.reduce((sum, s) => sum + s.legIn.minutes, legOut?.minutes ?? 0),
      visiting: stops.reduce((sum, s) => sum + s.place.durationMin, 0),
      waiting: stops.reduce((sum, s) => sum + s.start - s.arrive, 0),
    },
    issues,
  };
}
