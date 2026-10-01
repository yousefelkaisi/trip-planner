import { z } from 'zod';
import { BEST_TIMES } from '../../domain/model/place';

// Loose on purpose: structured outputs can't enforce formats or ranges, so validate.ts checks them
// and gives each problem its own consequence.
const Day = z.array(z.object({ open: z.string(), close: z.string() })).nullable();

export const AiExtractionSchema = z.object({
  hours: z.object({ mon: Day, tue: Day, wed: Day, thu: Day, fri: Day, sat: Day, sun: Day }),
  openMonths: z.array(z.number().int()),
  durationMin: z.number().int().nullable(),
  checkDates: z.boolean(),
  bestTime: z.enum(BEST_TIMES).nullable(),
});

export type AiExtraction = z.infer<typeof AiExtractionSchema>;
