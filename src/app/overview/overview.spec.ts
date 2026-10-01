import { TestBed } from '@angular/core/testing';
import { HUBS } from '@domain/hubs';
import { scheduleTrip } from '@domain/schedule';
import { catalogOf, everyDay, makePlace, makeTrip } from '@domain/testing';
import { TripOverview } from './overview';

describe('TripOverview', () => {
  it('totals the trip, counting the train between cities as travel', async () => {
    // Rome: 60 min visit after a 45-min wait. Florence: 120 min visit after a 125-min transfer.
    const rome = makePlace({ id: 'a', hours: everyDay([{ open: '09:45', close: '18:00' }]) });
    const florence = makePlace({
      id: 'b',
      city: 'Florence',
      region: 'Tuscany',
      lat: HUBS.florence.lat,
      lng: HUBS.florence.lng,
      durationMin: 120,
    });
    const trip = makeTrip([
      { hub: 'rome', stops: ['a'] },
      { hub: 'florence', stops: ['b'] },
    ]);

    const fixture = TestBed.createComponent(TripOverview);
    fixture.componentRef.setInput('days', scheduleTrip(trip, catalogOf(rome, florence)));
    await fixture.whenStable();

    const stats = [...(fixture.nativeElement as HTMLElement).querySelectorAll('dl > div')].map(
      (stat) => [
        stat.querySelector('dt')!.textContent!.trim(),
        stat.querySelector('dd')!.textContent!.trim(),
      ],
    );
    expect(Object.fromEntries(stats)).toEqual({
      Stops: '2',
      Visiting: '3 h',
      'Travel, incl. trains': '2 h 5 min',
      'Free time': '45 min',
    });
  });
});
