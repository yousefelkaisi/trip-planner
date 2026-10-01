import { z } from 'zod';

export const WEEKDAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;

export const Time = z.string().regex(/^(([01]\d|2[0-3]):[0-5]\d|24:00)$/);
// [] = closed, null = not stated.
const Day = z.array(z.object({ open: Time, close: Time })).nullable();

export const PlaceSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.string().nullable(),
  city: z.string(),
  region: z.string().nullable(),
  neighborhood: z.string().nullable(),
  description: z.string().nullable(),
  lat: z.number(),
  lng: z.number(),
  rating: z.number().min(0).max(5).nullable(),
  tags: z.array(z.string()),
  priceLevel: z.number().int().min(1).nullable(),
  bookingRequired: z.boolean().nullable(),
  hours: z.object({ mon: Day, tue: Day, wed: Day, thu: Day, fri: Day, sat: Day, sun: Day }),
  openMonths: z.array(z.number().int().min(1).max(12)).nullable(),
  durationMin: z.number().int().min(5).max(720),
  flags: z.array(
    z.enum([
      'hours-approximate',
      'check-dates',
      'check-location',
      'duration-estimated',
      'not-interpreted',
    ]),
  ),
  source: z.object({ hours: z.string().nullable(), seasonalNotes: z.string().nullable() }),
});
export type Place = z.infer<typeof PlaceSchema>;
