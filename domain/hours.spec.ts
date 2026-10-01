import { afterEach, describe, expect, it } from 'vitest';
import { addDays, formatTime, hoursOn, toMin, weekday } from './hours';
import { everyDay, makePlace } from './testing';

const TZ = process.env['TZ'];
afterEach(() => {
  // Assigning undefined would set TZ to the string "undefined".
  if (TZ === undefined) {
    delete process.env['TZ'];
  } else {
    process.env['TZ'] = TZ;
  }
});

describe('dates and times', () => {
  it('converts times to minutes and back', () => {
    expect(toMin('09:30')).toBe(570);
    expect(toMin('24:00')).toBe(1440);
    expect(formatTime(570)).toBe('09:30');
    expect(formatTime(1500)).toBe('01:00');
  });

  it('reads the weekday the same in every timezone', () => {
    for (const tz of ['UTC', 'America/Los_Angeles', 'Pacific/Auckland']) {
      process.env['TZ'] = tz;
      expect(weekday('2026-10-05')).toBe('mon');
      expect(weekday('2026-10-11')).toBe('sun');
    }
  });

  it('adds days across a month end', () => {
    process.env['TZ'] = 'America/Los_Angeles';
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
    expect(addDays('2026-12-31', 2)).toBe('2027-01-02');
  });
});

describe('hoursOn', () => {
  const monday = '2026-10-05';

  it('is unknown when the months are unknown', () => {
    expect(hoursOn(makePlace({ openMonths: null }), monday).status).toBe('unknown');
  });

  it('is closed out of season, naming the month', () => {
    expect(hoursOn(makePlace({ openMonths: [4, 5, 6] }), monday)).toEqual({
      status: 'closed',
      intervals: [],
      reason: 'Closed in October',
    });
  });

  it('is unknown when the weekday is not stated', () => {
    const place = makePlace({ hours: { ...everyDay([]), mon: null } });
    expect(hoursOn(place, monday).status).toBe('unknown');
  });

  it('is closed on a closed weekday, naming it', () => {
    const place = makePlace({
      hours: { ...everyDay([{ open: '09:00', close: '18:00' }]), mon: [] },
    });
    expect(hoursOn(place, monday)).toEqual({
      status: 'closed',
      intervals: [],
      reason: 'Closed on Mondays',
    });
  });

  it('returns intervals in minutes, past midnight above 1440', () => {
    const split = makePlace({
      hours: everyDay([
        { open: '12:00', close: '15:00' },
        { open: '19:00', close: '23:00' },
      ]),
    });
    const late = makePlace({ hours: everyDay([{ open: '08:00', close: '01:00' }]) });
    const allDay = makePlace({ hours: everyDay([{ open: '00:00', close: '24:00' }]) });

    expect(hoursOn(split, monday).intervals).toEqual([
      { open: 720, close: 900 },
      { open: 1140, close: 1380 },
    ]);
    expect(hoursOn(late, monday).intervals).toEqual([{ open: 480, close: 1500 }]);
    expect(hoursOn(allDay, monday).intervals).toEqual([{ open: 0, close: 1440 }]);
  });
});
