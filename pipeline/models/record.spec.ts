import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { parseAll, RecordSchema } from './record';

const base = { id: 'p1', name: 'Place', city: 'Rome', latitude: 41.9, longitude: 12.5 };

describe('RecordSchema', () => {
  const parse = (fields: object) => RecordSchema.parse({ ...base, ...fields });

  it('counts € symbols as the price level', () => {
    expect(parse({ price_range: '€€€€€' }).price_range).toBe(5);
    expect(parse({ price_range: 'â‚¬â‚¬' }).price_range).toBe(2);
    expect(parse({ price_range: '' }).price_range).toBeNull();
    expect(parse({ price_range: 'cheap' }).price_range).toBeNull();
  });

  it('normalizes tags', () => {
    expect(parse({ tags: ['Hidden_Gem', 'foodie', 'hidden-gem'] }).tags).toEqual([
      'hidden-gem',
      'foodie',
    ]);
    expect(parse({}).tags).toEqual([]);
  });

  it('turns missing optional fields into null', () => {
    expect(parse({})).toMatchObject({ hours: null, rating: null, booking_required: null });
  });
});

describe('parseAll', () => {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  beforeEach(() => warn.mockClear());

  it('drops invalid records and repeated ids, saying why', () => {
    const recs = parseAll([
      base,
      { ...base, id: undefined },
      { ...base, id: 'p2', latitude: '41.9' },
      { ...base, name: 'Duplicate' },
    ]);
    expect(recs.map((r) => r.name)).toEqual(['Place']);
    expect(warn.mock.calls).toEqual([
      ['record 1: dropped, invalid id'],
      ['record 2: dropped, invalid latitude'],
      ['p1: dropped, duplicate id'],
    ]);
  });

  it('parses and cleans every real record', () => {
    const raw = JSON.parse(readFileSync('data/italy.json', 'utf8'));
    const recs = parseAll(raw);
    expect(recs).toHaveLength(raw.length);
    expect(JSON.stringify(recs)).not.toMatch(/Ã|â€/);
    expect(recs.find((r) => r.id === 'place_012')?.name).toContain('Verità)');
    expect(recs.find((r) => r.id === 'place_084')?.description).toContain('Trinità.');
  });
});
