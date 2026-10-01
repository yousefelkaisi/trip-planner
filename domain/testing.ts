import type { Place } from './model/place';
import type { Trip } from './model/trip';

type Day = Place['hours']['mon'];

export const ALL_MONTHS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
export const TERMINI = { lat: 41.9009, lng: 12.5018 };

export function everyDay(day: Day): Place['hours'] {
  return { mon: day, tue: day, wed: day, thu: day, fri: day, sat: day, sun: day };
}

// A Rome museum at Termini station, so travel from the station takes 0 minutes.
export function makePlace(fields: Partial<Place> = {}): Place {
  return {
    id: 'p1',
    name: 'Place',
    type: 'museum',
    city: 'Rome',
    region: 'Lazio',
    neighborhood: null,
    description: null,
    ...TERMINI,
    rating: 4.5,
    tags: [],
    priceLevel: 1,
    bookingRequired: false,
    hours: everyDay([{ open: '09:00', close: '18:00' }]),
    openMonths: ALL_MONTHS,
    durationMin: 60,
    bestTime: null,
    flags: [],
    source: { hours: null, seasonalNotes: null },
    ...fields,
  };
}

// 2026-10-16 is a Friday.
export function makeTrip(days: Trip['days'], prefs: Partial<Trip['prefs']> = {}): Trip {
  return {
    version: 1,
    startDate: '2026-10-16',
    prefs: { interests: [], avoid: [], maxPrice: 4, pace: 'balanced', dayTrips: false, ...prefs },
    days,
  };
}

export function catalogOf(...places: Place[]): Map<string, Place> {
  return new Map(places.map((p) => [p.id, p]));
}
