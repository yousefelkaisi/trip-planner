// zod/mini keeps the browser bundle small; the classic API is about 90 kB gzipped.
import * as z from 'zod/mini';

export const WEEKDAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;
// The part of the day the record recommends.
export const BEST_TIMES = ['morning', 'afternoon', 'evening', 'night'] as const;

export const Time = z.string().check(z.regex(/^(([01]\d|2[0-3]):[0-5]\d|24:00)$/));
// [] = closed, null = not stated.
const Day = z.nullable(z.array(z.object({ open: Time, close: Time })));

export const PlaceSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.nullable(z.string()),
  city: z.string(),
  region: z.nullable(z.string()),
  neighborhood: z.nullable(z.string()),
  description: z.nullable(z.string()),
  lat: z.number(),
  lng: z.number(),
  rating: z.nullable(z.number().check(z.minimum(0), z.maximum(5))),
  tags: z.array(z.string()),
  priceLevel: z.nullable(z.int().check(z.minimum(1))),
  bookingRequired: z.nullable(z.boolean()),
  hours: z.object({ mon: Day, tue: Day, wed: Day, thu: Day, fri: Day, sat: Day, sun: Day }),
  openMonths: z.nullable(z.array(z.int().check(z.minimum(1), z.maximum(12)))),
  durationMin: z.int().check(z.minimum(5), z.maximum(720)),
  bestTime: z.nullable(z.enum(BEST_TIMES)),
  flags: z.array(
    z.enum(['check-dates', 'check-location', 'duration-estimated', 'not-interpreted']),
  ),
  source: z.object({ hours: z.nullable(z.string()), seasonalNotes: z.nullable(z.string()) }),
});
export type Place = z.infer<typeof PlaceSchema>;
