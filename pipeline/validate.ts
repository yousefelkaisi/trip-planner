import { type Place, PlaceSchema, Time, WEEKDAYS } from '../domain/model/place';
import type { AiExtraction } from './models/ai-extraction';
import type { Rec } from './models/record';

type Hours = Place['hours'];
type Flag = Place['flags'][number];
type Point = { lat: number; lng: number };

const DEFAULT_DURATION_MIN: Record<string, number> = {
  museum: 120,
  experience: 120,
  neighborhood: 120,
  historic_site: 90,
  restaurant: 90,
  market: 60,
  park: 60,
  shop: 45,
  cafe: 30,
  viewpoint: 30,
};

const NO_HOURS = Object.fromEntries(WEEKDAYS.map((d) => [d, null])) as Hours;

export function cityRefs(recs: Rec[]): Map<string, Point> {
  const refs = new Map<string, Point>();
  for (const city of new Set(recs.map((r) => r.city.toLowerCase()))) {
    const inCity = recs.filter((r) => r.city.toLowerCase() === city);

    if (inCity.length >= 3) {
      refs.set(city, {
        lat: median(inCity.map((r) => r.latitude)),
        lng: median(inCity.map((r) => r.longitude)),
      });
    }
  }

  return refs;
}

export function validate(rec: Rec, extraction: AiExtraction | null, refs: Map<string, Point>): Place | null {
  const flags = new Set<Flag>();

  // Hours the record doesn't state stay null, whatever the model returns.
  let hours = extraction && rec.hours ? validHours(extraction.hours) : NO_HOURS;
  let openMonths = extraction?.openMonths.every((m) => m >= 1 && m <= 12)
    ? extraction.openMonths
    : null;

  if (extraction?.checkDates) {
    flags.add('check-dates');
  }

  const noHours = WEEKDAYS.every((d) => hours[d] === null);
  if (!extraction || (rec.hours && noHours)) {
    flags.add('not-interpreted');
    hours = NO_HOURS;
    openMonths = null;
  }

  if (!/\d/.test(rec.hours ?? '') && WEEKDAYS.some((d) => hours[d]?.length)) {
    flags.add('hours-approximate');
  }

  let durationMin = rec.duration_minutes ?? extraction?.durationMin ?? null;
  if (durationMin === null || durationMin < 5 || durationMin > 720) {
    durationMin = DEFAULT_DURATION_MIN[rec.type ?? ''] ?? 60;
    flags.add('duration-estimated');
  }

  const point = { lat: rec.latitude, lng: rec.longitude };
  const ref = refs.get(rec.city.toLowerCase());
  const inItaly = point.lat >= 35.4 && point.lat <= 47.1 && point.lng >= 6.6 && point.lng <= 18.6;
  if (!inItaly || (ref && km(point, ref) > 50)) {
    flags.add('check-location');
  }

  const rating = rec.rating !== null && rec.rating >= 0 && rec.rating <= 5 ? rec.rating : null;

  const place = PlaceSchema.safeParse({
    id: rec.id,
    name: rec.name,
    type: rec.type,
    city: rec.city,
    region: rec.region,
    neighborhood: rec.neighborhood,
    description: rec.description,
    lat: point.lat,
    lng: point.lng,
    rating,
    tags: rec.tags,
    priceLevel: rec.price_range,
    bookingRequired: rec.booking_required,
    hours,
    openMonths,
    durationMin,
    bestTime: extraction?.bestTime ?? null,
    flags: [...flags],
    source: { hours: rec.hours, seasonalNotes: rec.seasonal_notes },
  });

  if (!place.success) {
    const fields = place.error.issues.map((issue) => issue.path.join('.'));
    console.warn(`${rec.id}: dropped, invalid ${fields.join(', ')}`);
    return null;
  }

  return place.data;
}

function validHours(hours: AiExtraction['hours']): Hours {
  return Object.fromEntries(WEEKDAYS.map((d) => [d, validDay(hours[d])])) as Hours;
}

// String comparison works for "HH:MM". A close at or before 06:00 is after midnight.
function validDay(day: Hours['mon']): Hours['mon'] {
  const valid = day?.every(
    ({ open, close }) =>
      Time.safeParse(open).success &&
      Time.safeParse(close).success &&
      open !== '24:00' &&
      (close > open || close <= '06:00'),
  );
  
  return valid ? day : null;
}

function median(xs: number[]): number {
  const sorted = [...xs].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

// Flat approximation, accurate enough at 50 km.
function km(a: Point, b: Point): number {
  return 111 * Math.hypot(a.lat - b.lat, (a.lng - b.lng) * Math.cos((a.lat * Math.PI) / 180));
}
