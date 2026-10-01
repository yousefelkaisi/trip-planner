import { describe, expect, it } from 'vitest';
import { apply, applyAll } from './commands';
import type { Command, Trip } from './model/trip';
import { catalogOf, makePlace, makeTrip } from './testing';

const a = makePlace({ id: 'a', name: 'A' });
const b = makePlace({ id: 'b', name: 'B' });
const c = makePlace({ id: 'c', name: 'C' });
const uffizi = makePlace({ id: 'u', name: 'Uffizi', city: 'Florence', region: 'Tuscany' });
const catalog = catalogOf(a, b, c, uffizi);

const base = () =>
  makeTrip([
    { hub: 'rome', stops: ['a', 'b'] },
    { hub: 'rome', stops: ['c'] },
    { hub: 'florence', stops: ['u'] },
  ]);

function run(cmd: Command, trip: Trip | null = base()) {
  const result = apply(trip, cmd, catalog);
  return result.ok ? result.trip.days.map((d) => d.stops) : result.error;
}

describe('apply', () => {
  it('creates a trip with empty days', () => {
    const prefs = base().prefs;
    const result = apply(
      null,
      { type: 'newTrip', startDate: '2026-10-16', prefs, hubs: ['rome', 'venice'] },
      catalog,
    );
    expect(result).toEqual({
      ok: true,
      trip: {
        version: 1,
        startDate: '2026-10-16',
        prefs,
        days: [
          { hub: 'rome', stops: [] },
          { hub: 'venice', stops: [] },
        ],
      },
    });
  });

  it('rejects a new trip without a valid date or any city', () => {
    const prefs = base().prefs;
    expect(run({ type: 'newTrip', startDate: '2026-13-01', prefs, hubs: ['rome'] }, null)).toBe(
      "2026-13-01 isn't a valid date",
    );
    expect(run({ type: 'newTrip', startDate: '2026-10-16', prefs, hubs: [] }, null)).toBe(
      'Choose a city for at least one day',
    );
  });

  it('needs a trip for every other command', () => {
    expect(run({ type: 'clearDay', day: 0 }, null)).toBe('No trip yet');
  });

  it('sets the start date', () => {
    const result = apply(base(), { type: 'setStartDate', date: '2026-11-02' }, catalog);
    expect(result.ok && result.trip.startDate).toBe('2026-11-02');
    expect(run({ type: 'setStartDate', date: '2026-13-01' })).toBe("2026-13-01 isn't a valid date");
  });

  it('changes a day’s city and drops stops from other regions', () => {
    expect(run({ type: 'setHub', day: 2, hub: 'rome' })).toEqual([['a', 'b'], ['c'], []]);
    expect(run({ type: 'setHub', day: 0, hub: 'rome' })).toEqual([['a', 'b'], ['c'], ['u']]);
    expect(run({ type: 'setHub', day: 3, hub: 'rome' })).toBe('There is no day 4');
  });

  it('adds a stop at an index', () => {
    const trip = makeTrip([{ hub: 'rome', stops: ['a', 'b'] }]);
    expect(run({ type: 'addStop', day: 0, placeId: 'c', index: 1 }, trip)).toEqual([
      ['a', 'c', 'b'],
    ]);
  });

  it('adds a stop at its best position when no index is given', () => {
    // The places are identical, so every position ties and the earliest wins.
    const trip = makeTrip([{ hub: 'rome', stops: ['a', 'b'] }]);
    expect(run({ type: 'addStop', day: 0, placeId: 'c' }, trip)).toEqual([['c', 'a', 'b']]);
  });

  it('rejects a bad stop', () => {
    expect(run({ type: 'addStop', day: 5, placeId: 'c' })).toBe('There is no day 6');
    expect(run({ type: 'addStop', day: 0, placeId: 'x' })).toBe('Unknown place x');
    expect(run({ type: 'addStop', day: 0, placeId: 'c' })).toBe('C is already in the trip');
    expect(
      run(
        { type: 'addStop', day: 2, placeId: 'a' },
        makeTrip([
          { hub: 'rome', stops: [] },
          { hub: 'rome', stops: [] },
          { hub: 'florence', stops: [] },
        ]),
      ),
    ).toBe("A isn't in the Florence area");
    expect(
      run(
        { type: 'addStop', day: 0, placeId: 'c', index: 3 },
        makeTrip([{ hub: 'rome', stops: [] }]),
      ),
    ).toBe("Can't add at position 4");
  });

  it('moves a stop within and between days', () => {
    expect(run({ type: 'moveStop', placeId: 'a', day: 0, index: 1 })).toEqual([
      ['b', 'a'],
      ['c'],
      ['u'],
    ]);
    expect(run({ type: 'moveStop', placeId: 'a', day: 1, index: 1 })).toEqual([
      ['b'],
      ['c', 'a'],
      ['u'],
    ]);
  });

  it('rejects a bad move', () => {
    expect(run({ type: 'moveStop', placeId: 'x', day: 0, index: 0 })).toBe("x isn't in the trip");
    expect(run({ type: 'moveStop', placeId: 'a', day: 5, index: 0 })).toBe('There is no day 6');
    expect(run({ type: 'moveStop', placeId: 'a', day: 2, index: 0 })).toBe(
      "A isn't in the Florence area",
    );
    expect(run({ type: 'moveStop', placeId: 'a', day: 0, index: 2 })).toBe(
      "Can't move to position 3",
    );
  });

  it('removes a stop', () => {
    expect(run({ type: 'removeStop', placeId: 'b' })).toEqual([['a'], ['c'], ['u']]);
    expect(run({ type: 'removeStop', placeId: 'b' }, makeTrip([{ hub: 'rome', stops: [] }]))).toBe(
      "B isn't in the trip",
    );
  });

  it('clears a day', () => {
    expect(run({ type: 'clearDay', day: 0 })).toEqual([[], ['c'], ['u']]);
  });

  it('rejects filling no days or a missing day', () => {
    expect(run({ type: 'fill', days: [] })).toBe('Choose a day to fill');
    expect(run({ type: 'fill', days: [0, 7] })).toBe('There is no day 8');
  });

  it('never changes the input trip', () => {
    const trip = base();
    const copy = structuredClone(trip);
    apply(trip, { type: 'moveStop', placeId: 'a', day: 1, index: 0 }, catalog);
    apply(trip, { type: 'clearDay', day: 0 }, catalog);
    expect(trip).toEqual(copy);
  });

  it('applies commands in order and stops at the first error', () => {
    const trip = base();
    const ok = applyAll(
      trip,
      [
        { type: 'clearDay', day: 0 },
        { type: 'addStop', day: 0, placeId: 'a', index: 0 },
      ],
      catalog,
    );
    expect(ok.ok && ok.trip.days[0].stops).toEqual(['a']);
    const failed = applyAll(
      trip,
      [
        { type: 'clearDay', day: 0 },
        { type: 'clearDay', day: 9 },
      ],
      catalog,
    );
    expect(failed).toEqual({ ok: false, error: 'There is no day 10' });
  });
});
