import { describe, expect, it } from 'vitest';
import { fixMojibake } from './clean';

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
