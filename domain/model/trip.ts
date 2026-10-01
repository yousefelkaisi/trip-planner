import * as z from 'zod/mini';
import type { Place } from './place';

export const HUB_IDS = ['rome', 'florence', 'bologna', 'milan', 'venice'] as const;
export type HubId = (typeof HUB_IDS)[number];

export const PrefsSchema = z.object({
  interests: z.array(z.string()),
  avoid: z.array(z.string()),
  maxPrice: z.int().check(z.minimum(1)),
  pace: z.enum(['relaxed', 'balanced', 'packed']),
  dayTrips: z.boolean(),
});
export type Prefs = z.infer<typeof PrefsSchema>;

export const TripSchema = z.object({
  version: z.literal(1),
  startDate: z.iso.date(),
  prefs: PrefsSchema,
  days: z
    .array(z.object({ hub: z.enum(HUB_IDS), stops: z.array(z.string()) }))
    .check(z.minLength(1)),
});
export type Trip = z.infer<typeof TripSchema>;

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

export type IssueCode =
  | 'CLOSED'
  | 'CLOSES_DURING_VISIT'
  | 'DAY_OVERRUN'
  | 'LONG_WAIT'
  | 'HOURS_UNKNOWN'
  | 'AFTER_BEST_TIME'
  | 'NO_MEAL';

export interface Issue {
  code: IssueCode;
  severity: 'error' | 'warning' | 'info';
  placeId?: string;
  message: string;
}
