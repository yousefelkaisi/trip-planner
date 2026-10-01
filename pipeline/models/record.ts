import { z } from 'zod';
import { fixMojibake } from '../clean';

const text = z.string().min(1).transform(fixMojibake);

const optText = z
  .string()
  .nullish()
  .transform((s) => (s ? fixMojibake(s) : null));

const optNum = z
  .number()
  .nullish()
  .transform((n) => n ?? null);

export const RecordSchema = z.object({
  id: z.string().min(1),
  name: text,
  city: text,
  type: optText,
  region: optText,
  neighborhood: optText,
  description: optText,
  latitude: z.number(),
  longitude: z.number(),
  hours: optText,
  seasonal_notes: optText,
  duration_minutes: optNum,
  rating: optNum,
  booking_required: z
    .boolean()
    .nullish()
    .transform((b) => b ?? null),
  price_range: optText.transform((s) => (s && /^€+$/.test(s) ? s.length : null)),
  tags: z
    .array(z.string())
    .nullish()
    .transform((t) => [
      ...new Set((t ?? []).map((s) => fixMojibake(s).toLowerCase().replaceAll('_', '-'))),
    ]),
});

export type Rec = z.output<typeof RecordSchema>;

export function parseAll(raw: unknown[]): Rec[] {
  const recs = new Map<string, Rec>();
  raw.forEach((r, i) => {
    const res = RecordSchema.safeParse(r);
    
    if (!res.success) {
      const fields = res.error.issues.map((issue) => issue.path.join('.'));
      console.warn(`record ${i}: dropped, invalid ${fields.join(', ')}`);
    } else if (recs.has(res.data.id)) {
      console.warn(`${res.data.id}: dropped, duplicate id`);
    } else {
      recs.set(res.data.id, res.data);
    }
  });

  return [...recs.values()];
}
