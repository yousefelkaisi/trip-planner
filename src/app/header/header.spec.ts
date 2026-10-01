import { TestBed } from '@angular/core/testing';
import { makeTrip } from '@domain/testing';
import { TripStore } from '../trip-store';
import { TripHeader } from './header';

describe('TripHeader', () => {
  beforeEach(() => localStorage.clear());

  it('names each city once per visit, in order', async () => {
    const { startDate, prefs } = makeTrip([]);
    TestBed.inject(TripStore).dispatch({
      type: 'newTrip',
      startDate,
      prefs,
      hubs: ['rome', 'rome', 'florence'],
    });

    const fixture = TestBed.createComponent(TripHeader);
    await fixture.whenStable();
    const cities = (fixture.nativeElement as HTMLElement).querySelector('header p')!;
    expect(cities.textContent!.trim()).toBe('Rome → Florence');
  });
});
