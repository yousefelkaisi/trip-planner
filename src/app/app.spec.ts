import { TestBed } from '@angular/core/testing';
import { App } from './app';
import { STORAGE_KEY, TripStore } from './trip-store';

// jsdom has no ResizeObserver, which the map uses to track its size.
vi.stubGlobal(
  'ResizeObserver',
  class {
    observe() {}
    unobserve() {}
    disconnect() {}
  },
);

describe('App', () => {
  beforeEach(() => localStorage.clear());

  async function render() {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    const click = async (label: string) => {
      [...el.querySelectorAll('button')].find((b) => b.textContent?.trim() === label)!.click();
      await fixture.whenStable();
    };
    return { fixture, el, click };
  }

  it('opens the wizard when there is no saved trip', async () => {
    const { el } = await render();
    expect(el.textContent).toContain('Step 1 of 3');
  });

  it('builds a trip from the wizard and shows the board', async () => {
    const { el, click } = await render();
    await click('Next');
    await click('Next');
    await click('Build my trip');

    expect(el.querySelectorAll('[aria-label="Days"] button')).toHaveLength(4);
    expect(el.querySelectorAll('app-day-column')).toHaveLength(1);
    expect(el.querySelectorAll('app-stop-card').length).toBeGreaterThan(0);
    expect(localStorage.getItem(STORAGE_KEY)).not.toBeNull();
  });

  it('ignores unfinished start dates and puts the last good one back on blur', async () => {
    const { el, click } = await render();
    const typeDates = () => {
      const input = el.querySelector<HTMLInputElement>('input[type="date"]')!;
      const start = input.value;
      for (const value of ['', '0002-10-16']) {
        input.value = value;
        input.dispatchEvent(new Event('change'));
        input.dispatchEvent(new Event('blur'));
        expect(input.value).toBe(start);
      }
    };

    typeDates();
    await click('Next');
    await click('Next');
    await click('Build my trip');
    typeDates();
    expect(el.querySelector('[role="alert"]')).toBeNull();
  });

  it('keeps the chosen place filter when the trip changes', async () => {
    const { fixture, el, click } = await render();
    await click('Next');
    await click('Next');
    await click('Build my trip');

    const region = el.querySelector<HTMLSelectElement>('app-place-browser select')!;
    region.value = '';
    region.dispatchEvent(new Event('change'));
    await fixture.whenStable();
    await click('Clear');

    expect(region.value).toBe('');
  });

  it('clears errors when switching between the board and the wizard', async () => {
    const { fixture, el, click } = await render();
    await click('Next');
    await click('Next');
    await click('Build my trip');

    TestBed.inject(TripStore).error.set('Something went wrong');
    await fixture.whenStable();
    await click('New trip');

    expect(el.querySelector('[role="alert"]')).toBeNull();
  });

  it('starts a new trip from the defaults, not the current trip', async () => {
    const { el, click } = await render();
    await click('Next');
    await click('historic');
    await click('Next');
    await click('Build my trip');

    await click('New trip');
    await click('Next');

    expect(el.querySelectorAll('[aria-pressed="true"]')).toHaveLength(0);
  });

  it('shows the whole trip in the overview, then goes back to a day', async () => {
    const { fixture, el, click } = await render();
    await click('Next');
    await click('Next');
    await click('Build my trip');

    await click('Overview');
    expect(el.querySelector('app-day-column')).toBeNull();
    expect(el.querySelectorAll('app-trip-overview h2')).toHaveLength(3);
    const stops = el.querySelectorAll('app-trip-overview li button').length;
    expect(stops).toBeGreaterThan(0);
    expect(el.querySelector('app-trip-overview dd')!.textContent!.trim()).toBe(String(stops));

    el.querySelector<HTMLButtonElement>('[aria-label="Days"] button')!.click();
    await fixture.whenStable();
    expect(el.querySelector('app-trip-overview')).toBeNull();
    expect(el.querySelector('app-day-column h2')!.textContent).toContain('Day 1');
  });

  it('removes a stop from its menu', async () => {
    const { fixture, el, click } = await render();
    await click('Next');
    await click('Next');
    await click('Build my trip');
    const names = () => [...el.querySelectorAll('app-stop-card h3')].map((h) => h.textContent);
    const [, ...rest] = names();

    el.querySelector<HTMLButtonElement>('[aria-label="Stop actions"]')!.click();
    await fixture.whenStable();
    [...document.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')]
      .find((b) => b.textContent?.trim() === 'Remove')!
      .click();
    await fixture.whenStable();

    expect(names()).toEqual(rest);
  });

  it('lists places you can still add first, and searches only stated fields', async () => {
    const { fixture, el, click } = await render();
    await click('Next');
    await click('Next');
    await click('Build my trip');
    const region = el.querySelector<HTMLSelectElement>('app-place-browser select')!;
    region.value = '';
    region.dispatchEvent(new Event('change'));
    await fixture.whenStable();

    const inTrip = [...el.querySelectorAll('app-place-browser li')].map((li) =>
      li.textContent!.includes('In your trip'),
    );
    expect(inTrip).toContain(true);
    expect(inTrip).toEqual([...inTrip].sort((a, b) => Number(a) - Number(b)));

    const search = el.querySelector<HTMLInputElement>('app-place-browser input[type="search"]')!;
    search.value = 'null';
    search.dispatchEvent(new Event('input'));
    await fixture.whenStable();
    expect(el.querySelector('app-place-browser li')!.textContent).toContain('No places match.');
  });
});
