import { describe, expect, it, vi } from 'vitest';
import type { AiExtraction } from './models/ai-extraction';
import { RecordSchema } from './models/record';
import { cityRefs, validate } from './validate';

vi.spyOn(console, 'warn').mockImplementation(() => {});

type Day = AiExtraction['hours']['mon'];
const everyDay = (d: Day) => ({ mon: d, tue: d, wed: d, thu: d, fri: d, sat: d, sun: d });
const ALL_MONTHS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
const day = [{ open: '09:00', close: '18:00' }];

const baseRec = {
  id: 'p1',
  name: 'Place',
  type: 'museum',
  city: 'Rome',
  latitude: 41.9,
  longitude: 12.5,
  hours: '9:00-18:00',
  duration_minutes: 60,
  rating: 4.5,
};
const baseExtraction: AiExtraction = {
  hours: everyDay(day),
  openMonths: ALL_MONTHS,
  durationMin: null,
  checkDates: false,
  bestTime: null,
};
const refs = new Map([
  ['rome', { lat: 41.9, lng: 12.5 }],
  ['milan', { lat: 45.47, lng: 9.19 }],
]);

function run(rec: object = {}, extraction: Partial<AiExtraction> | null = {}) {
  const parsed = RecordSchema.parse({ ...baseRec, ...rec });
  return validate(parsed, extraction && { ...baseExtraction, ...extraction }, refs);
}

describe('validate', () => {
  it('passes a clean record through', () => {
    expect(run()).toMatchObject({
      hours: everyDay(day),
      openMonths: ALL_MONTHS,
      durationMin: 60,
      flags: [],
    });
  });

  it('1. nulls a day with an invalid interval', () => {
    const hours = {
      mon: [{ open: '08:00', close: '01:00' }],
      tue: [{ open: '08:00', close: '07:00' }],
      wed: [{ open: '24:00', close: '24:00' }],
      thu: [{ open: '9:00', close: '18:00' }],
      fri: [{ open: '00:00', close: '24:00' }],
      sat: [...day, { open: '19:00', close: '25:00' }],
      sun: [],
    };
    expect(run({}, { hours })?.hours).toEqual({
      mon: hours.mon,
      tue: null,
      wed: null,
      thu: null,
      fri: hours.fri,
      sat: null,
      sun: [],
    });
  });

  it("1. ignores the model's hours when the raw hours are null", () => {
    expect(run({ hours: null })).toMatchObject({ hours: everyDay(null), flags: [] });
  });

  it('2. makes the months unknown when one is out of range', () => {
    expect(run({}, { openMonths: [4, 13] })?.openMonths).toBeNull();
  });

  it('3. flags check-dates', () => {
    expect(run({}, { checkDates: true })?.flags).toEqual(['check-dates']);
  });

  it('4. flags not-interpreted and clears hours and months', () => {
    expect(run({}, null)).toMatchObject({
      hours: everyDay(null),
      openMonths: null,
      flags: ['not-interpreted'],
    });
    expect(run({}, { hours: everyDay(null) })?.flags).toEqual(['not-interpreted']);
  });

  it('5. flags hours-approximate when the raw hours have no times', () => {
    expect(run({ hours: 'Evenings' })?.flags).toEqual(['hours-approximate']);
  });

  it('6. takes the duration from the field, then the text, then the type', () => {
    expect(run({ duration_minutes: null }, { durationMin: 20 })).toMatchObject({
      durationMin: 20,
      flags: [],
    });
    expect(run({ duration_minutes: null })).toMatchObject({
      durationMin: 120,
      flags: ['duration-estimated'],
    });
    expect(run({ duration_minutes: 1000 })?.durationMin).toBe(120);
    expect(run({ duration_minutes: null, type: 'boat' })?.durationMin).toBe(60);
  });

  it('7. flags far-off coordinates and keeps them as given', () => {
    expect(run({ city: 'Milan', latitude: 45.4724, longitude: 11.191 })).toMatchObject({
      lat: 45.4724,
      lng: 11.191,
      flags: ['check-location'],
    });
    expect(run({ city: 'London', latitude: 51.5, longitude: -0.1 })).toMatchObject({
      lat: 51.5,
      lng: -0.1,
      flags: ['check-location'],
    });
    expect(run({ latitude: 41.8, longitude: 12.7 })?.flags).toEqual([]);
    expect(run({ city: 'Chianti', latitude: 43.58, longitude: 11.32 })?.flags).toEqual([]);
  });

  it('8. nulls a rating outside 0–5', () => {
    expect(run({ rating: 7 })?.rating).toBeNull();
    expect(run({ rating: 2.1 })?.rating).toBe(2.1);
  });

  it("9. passes the model's bestTime through", () => {
    expect(run({}, { bestTime: 'evening' })?.bestTime).toBe('evening');
    expect(run({}, null)?.bestTime).toBeNull();
  });

  it('9. drops a record that fails the final schema', () => {
    expect(run({ duration_minutes: 90.5 })).toBeNull();
  });
});

describe('cityRefs', () => {
  it('uses the median point of cities with 3 or more records', () => {
    const points = [
      ['Milan', 45.46, 9.18],
      ['milan', 45.47, 9.19],
      ['Milan', 45.4724, 11.191],
      ['Rome', 41.9, 12.5],
    ] as const;
    const recs = points.map(([city, latitude, longitude], i) =>
      RecordSchema.parse({ ...baseRec, id: `p${i}`, city, latitude, longitude }),
    );
    expect(cityRefs(recs)).toEqual(new Map([['milan', { lat: 45.47, lng: 9.19 }]]));
  });
});
