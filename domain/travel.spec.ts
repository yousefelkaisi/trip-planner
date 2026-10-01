import { describe, expect, it } from 'vitest';
import { travel } from './travel';

const termini = { lat: 41.9009, lng: 12.5018 };

describe('travel', () => {
  it('takes no time to stay put', () => {
    expect(travel(termini, termini)).toEqual({ mode: 'walk', km: 0, minutes: 0 });
  });

  it('walks up to 2 km', () => {
    const colosseum = { lat: 41.8902, lng: 12.4922 };
    expect(travel(termini, colosseum)).toMatchObject({ mode: 'walk', minutes: 25 });
  });

  it('takes transit up to 20 km', () => {
    const vatican = { lat: 41.9065, lng: 12.4536 };
    expect(travel(termini, vatican)).toMatchObject({ mode: 'transit', minutes: 27 });
  });

  it('takes a regional train or bus beyond 20 km', () => {
    const florence = { lat: 43.7765, lng: 11.2481 };
    expect(travel(florence, { lat: 43.3188, lng: 11.3308 })).toMatchObject({ mode: 'regional' });
  });
});
