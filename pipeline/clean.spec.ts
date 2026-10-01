import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { fixMojibake } from './clean';
import { parseAll, RecordSchema } from './models/record';

const base = { id: 'p1', name: 'Place', city: 'Rome', latitude: 41.9, longitude: 12.5 };

describe('fixMojibake', () => {
  it('reverses cp1252 mojibake', () => {
    expect(fixMojibake('â‚¬â‚¬')).toBe('€€');
    expect(fixMojibake('DalÃ­')).toBe('Dalí');
    expect(fixMojibake('crowds â€” go early')).toBe('crowds — go early');
  });

  it('restores the lost A0 byte', () => {
    expect(fixMojibake('Bocca della VeritÃ )')).toBe('Bocca della Verità)');
    expect(fixMojibake('Santa TrinitÃ .')).toBe('Santa Trinità.');
  });

  it('restores an A0 byte trimmed off the end', () => {
    expect(fixMojibake('Piazza della LibertÃ')).toBe('Piazza della Libertà');
  });

  it('leaves mojibake mixed with clean text unchanged', () => {
    expect(fixMojibake('Caffè â€” go early')).toBe('Caffè â€” go early');
  });

  it('leaves clean text unchanged', () => {
    for (const s of ['Colosseum', 'Caffè Florian, €€', 'Château', '“PERCHÉ”', 'Città ']) {
      expect(fixMojibake(s)).toBe(s);
    }
  });
});

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
  vi.spyOn(console, 'warn').mockImplementation(() => {});

  it('drops invalid records and repeated ids', () => {
    const recs = parseAll([
      base,
      { ...base, id: undefined },
      { ...base, id: 'p2', latitude: '41.9' },
      { ...base, name: 'Duplicate' },
    ]);
    expect(recs.map((r) => r.name)).toEqual(['Place']);
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
