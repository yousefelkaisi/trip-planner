import { describe, expect, it } from 'vitest';
import { HUBS } from './hubs';
import { scheduleDay } from './schedule';
import { catalogOf, everyDay, makePlace, makeTrip } from './testing';
import { travel } from './travel';

const allDay = everyDay([{ open: '00:00', close: '24:00' }]);
const restaurant = (id: string, open = '11:00', close = '23:00') =>
  makePlace({ id, type: 'restaurant', durationMin: 90, hours: everyDay([{ open, close }]) });

function schedule(...places: ReturnType<typeof makePlace>[]) {
  const trip = makeTrip([{ hub: 'rome', stops: places.map((p) => p.id) }]);
  return scheduleDay(trip, 0, catalogOf(...places));
}

const codes = (day: ReturnType<typeof schedule>) => day.issues.map((i) => i.code);

describe('scheduleDay', () => {
  it('waits for opening and reports a long wait', () => {
    const day = schedule(makePlace({ hours: everyDay([{ open: '10:00', close: '18:00' }]) }));
    expect(day.stops[0]).toMatchObject({ arrive: 540, start: 600, end: 660 });
    expect(day.issues).toContainEqual(
      expect.objectContaining({ code: 'LONG_WAIT', message: '60 min free before this stop' }),
    );
  });

  it('puts a restaurant at lunch and the next one at dinner', () => {
    const day = schedule(restaurant('r1'), restaurant('r2'));
    expect(day.stops.map((s) => s.start)).toEqual([720, 1140]);
    expect(codes(day)).not.toContain('NO_MEAL');
  });

  it('lets a dinner-only restaurant use up dinner', () => {
    const day = schedule(restaurant('r1', '19:30', '23:00'), restaurant('r2'));
    expect(day.stops.map((s) => s.start)).toEqual([1170, 1275]);
    expect(day.issues.filter((i) => i.code === 'NO_MEAL').map((i) => i.message)).toEqual([
      'No restaurant at lunch time',
    ]);
  });

  it('starts a transfer day 30 minutes plus the train later', () => {
    const florence = makePlace({ city: 'Florence', region: 'Tuscany', ...HUBS.florence });
    const trip = makeTrip([
      { hub: 'rome', stops: [] },
      { hub: 'florence', stops: [florence.id] },
    ]);
    const day = scheduleDay(trip, 1, catalogOf(florence));
    expect(day.transferMinutes).toBe(125);
    expect(day.stops[0].start).toBe(540 + 125);
  });

  it('ends the day back at the station', () => {
    const colosseum = makePlace({ lat: 41.8902, lng: 12.4922 });
    const day = schedule(colosseum);
    const legOut = travel(colosseum, HUBS.rome);
    expect(day.legOut).toEqual(legOut);
    expect(day.endsAt).toBe(day.stops[0].end + legOut.minutes);
    expect(day.totals.travel).toBe(day.stops[0].legIn.minutes + legOut.minutes);
  });

  it('reports a place closed that weekday', () => {
    const day = schedule(makePlace({ hours: { ...allDay, fri: [] } }));
    expect(day.issues[0]).toEqual({
      code: 'CLOSED',
      severity: 'error',
      placeId: 'p1',
      message: 'Closed on Fridays',
    });
  });

  it('reports a visit that does not fit the opening hours', () => {
    const day = schedule(
      makePlace({ durationMin: 120, hours: everyDay([{ open: '09:00', close: '10:00' }]) }),
    );
    expect(day.issues[0]).toMatchObject({
      code: 'CLOSES_DURING_VISIT',
      message: 'Not open long enough for a 120-min visit after 09:00',
    });
  });

  it('reports a day that overruns', () => {
    const day = schedule(
      makePlace({ id: 'long', durationMin: 720, hours: allDay }),
      makePlace({ id: 'more', durationMin: 120, hours: allDay }),
    );
    expect(day.issues).toContainEqual({
      code: 'DAY_OVERRUN',
      severity: 'warning',
      message: 'Back at the station at 23:15, after 22:30',
    });
  });

  it('times a place with unknown hours on arrival', () => {
    const day = schedule(makePlace({ openMonths: null }));
    expect(day.stops[0].start).toBe(540);
    expect(codes(day)).toContain('HOURS_UNKNOWN');
  });

  it("waits for a stop's bestTime", () => {
    const day = schedule(makePlace({ bestTime: 'evening', hours: allDay }));
    expect(day.stops[0].start).toBe(1080);
    expect(codes(day)).toContain('LONG_WAIT');
    expect(codes(day)).not.toContain('AFTER_BEST_TIME');
  });

  it('warns about a stop that starts after its bestTime', () => {
    const day = schedule(
      makePlace({ id: 'a', durationMin: 240 }),
      makePlace({ id: 'b', bestTime: 'morning' }),
    );
    expect(day.issues).toContainEqual(
      expect.objectContaining({
        code: 'AFTER_BEST_TIME',
        message: 'Starts at 13:15, after its best time (morning)',
      }),
    );
  });

  it('reports missing meals only on a day with stops', () => {
    expect(codes(schedule(makePlace()))).toEqual(['NO_MEAL', 'NO_MEAL']);
    expect(schedule().issues).toEqual([]);
  });
});
