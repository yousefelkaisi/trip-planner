import { TestBed } from '@angular/core/testing';
import { addDays } from '@domain/hours';
import type { Command } from '@domain/model/trip';
import { STORAGE_KEY, TripStore } from './trip-store';

const newTrip: Command = {
  type: 'newTrip',
  startDate: '2026-10-16',
  prefs: { interests: [], avoid: [], maxPrice: 4, pace: 'balanced', dayTrips: false },
  hubs: ['rome', 'rome', 'rome'],
};
const addColosseum: Command = { type: 'addStop', day: 0, placeId: 'place_001' };

describe('TripStore', () => {
  beforeEach(() => localStorage.clear());

  it('applies all commands or none', () => {
    const store = TestBed.inject(TripStore);

    expect(store.dispatch(newTrip, { type: 'clearDay', day: 9 })).toBe(false);
    expect(store.trip()).toBeNull();
    expect(store.error()).toBe('There is no day 10');

    expect(store.dispatch(newTrip, addColosseum)).toBe(true);
    expect(store.trip()?.days[0].stops).toEqual(['place_001']);
    expect(store.error()).toBeNull();
    expect(store.days()).toHaveLength(3);
  });

  it('undoes and redoes whole steps in order', () => {
    const store = TestBed.inject(TripStore);
    const stops = () => store.trip()?.days.map((d) => d.stops);
    store.dispatch(newTrip);
    store.dispatch(addColosseum);
    store.dispatch(
      { type: 'removeStop', placeId: 'place_001' },
      { type: 'addStop', day: 1, placeId: 'place_001' },
    );

    store.undo();
    expect(stops()).toEqual([['place_001'], [], []]);
    store.undo();
    expect(stops()).toEqual([[], [], []]);
    expect(store.canUndo()).toBe(false);

    store.redo();
    expect(stops()).toEqual([['place_001'], [], []]);
    store.redo();
    expect(stops()).toEqual([[], ['place_001'], []]);
    expect(store.canRedo()).toBe(false);
  });

  it('drops the redo steps on a new edit', () => {
    const store = TestBed.inject(TripStore);
    store.dispatch(newTrip);
    store.dispatch(addColosseum);
    store.undo();

    store.dispatch({ type: 'addStop', day: 0, placeId: 'place_005' });
    expect(store.canRedo()).toBe(false);
  });

  it('clears the error on undo and redo', () => {
    const store = TestBed.inject(TripStore);
    store.dispatch(newTrip);
    store.dispatch(addColosseum);

    store.dispatch({ type: 'clearDay', day: 9 });
    store.undo();
    expect(store.error()).toBeNull();

    store.dispatch({ type: 'clearDay', day: 9 });
    store.redo();
    expect(store.error()).toBeNull();
  });

  it('keeps the last 50 steps', () => {
    const store = TestBed.inject(TripStore);
    store.dispatch(newTrip);
    for (let i = 1; i <= 60; i++) {
      store.dispatch({ type: 'setStartDate', date: addDays('2026-10-16', i) });
    }

    let undos = 0;
    while (store.canUndo()) {
      store.undo();
      undos++;
    }
    expect(undos).toBe(50);
  });

  it('saves the trip and loads it back without unknown places', () => {
    TestBed.inject(TripStore).dispatch(newTrip, addColosseum);
    TestBed.tick();

    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY)!);
    saved.days[0].stops.push('place_999');
    localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));

    TestBed.resetTestingModule();
    expect(TestBed.inject(TripStore).trip()?.days[0].stops).toEqual(['place_001']);
  });

  it('starts with no trip when the saved one is invalid', () => {
    localStorage.setItem(STORAGE_KEY, '{not json');
    expect(TestBed.inject(TripStore).trip()).toBeNull();

    TestBed.resetTestingModule();
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 2 }));
    expect(TestBed.inject(TripStore).trip()).toBeNull();
  });
});
