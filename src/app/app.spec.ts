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
  beforeEach(() => {
    localStorage.clear();
    // The wizard's start date follows today, and the planned trip follows the start date.
    vi.setSystemTime('2026-10-01');
  });
  afterEach(() => vi.useRealTimers());

  async function render() {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    const click = async (label: string) => {
      [...el.querySelectorAll('button')].find((b) => b.textContent?.trim() === label)!.click();
      await fixture.whenStable();
    };
    const build = async () => {
      await click('Next');
      await click('Next');
      await click('Build my trip');
    };
    // The first stop's ⋯ menu opens in an overlay outside the component.
    const chooseFromMenu = async (item: string) => {
      el.querySelector<HTMLButtonElement>('[aria-label="Stop actions"]')!.click();
      await fixture.whenStable();
      [...document.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')]
        .find((b) => b.textContent?.trim() === item)!
        .click();
      await fixture.whenStable();
    };
    return { fixture, el, click, build, chooseFromMenu };
  }

  it('opens the wizard when there is no saved trip', async () => {
    const { el } = await render();
    expect(el.textContent).toContain('Step 1 of 3');
  });

  it('builds a trip from the wizard and shows the board', async () => {
    const { el, build } = await render();
    await build();

    expect(el.querySelectorAll('[aria-label="Days"] button')).toHaveLength(4);
    expect(el.querySelectorAll('app-day-column')).toHaveLength(1);
    expect(el.querySelectorAll('app-stop-card').length).toBeGreaterThan(0);
    expect(localStorage.getItem(STORAGE_KEY)).not.toBeNull();
  });

  it('warns about a city that runs out of places before building', async () => {
    const { fixture, el, click } = await render();
    await click('Next');
    await click('Next');
    expect(el.textContent).not.toContain('has no more places');

    for (const select of el.querySelectorAll('select')) {
      select.value = 'bologna';
      select.dispatchEvent(new Event('change'));
      await fixture.whenStable();
    }
    expect(el.textContent).toMatch(/Bologna has no more places for Day 1\.\s+Turn on day trips/);
  });

  it('ignores unfinished start dates and puts the last good one back on blur', async () => {
    const { fixture, el, build } = await render();
    const typeDates = async () => {
      const input = el.querySelector<HTMLInputElement>('input[type="date"]')!;
      const start = input.value;
      for (const value of ['', '0002-10-16']) {
        input.value = value;
        input.dispatchEvent(new Event('change'));
        input.dispatchEvent(new Event('blur'));
        await fixture.whenStable();
        expect(input.value).toBe(start);
        expect(el.querySelector('[role="alert"]')).toBeNull();
      }
    };

    await typeDates();
    await build();
    await typeDates();
    expect(TestBed.inject(TripStore).trip()?.startDate).toBe('2026-10-16');
  });

  it('keeps the chosen place filter when the trip changes', async () => {
    const { fixture, el, click, build } = await render();
    await build();

    const region = el.querySelector<HTMLSelectElement>('app-place-browser select')!;
    region.value = '';
    region.dispatchEvent(new Event('change'));
    await fixture.whenStable();
    await click('Clear');

    expect(region.value).toBe('');
  });

  it('clears errors when switching between the board and the wizard', async () => {
    const { fixture, el, click, build } = await render();
    await build();

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

    const historic = [...el.querySelectorAll('button')].find(
      (b) => b.textContent?.trim() === 'historic',
    )!;
    expect(historic.getAttribute('aria-pressed')).toBe('false');
  });

  it('shows the whole trip in the overview, then goes back to a day', async () => {
    const { fixture, el, click, build } = await render();
    await build();

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
    const { el, build, chooseFromMenu } = await render();
    await build();
    const names = () => [...el.querySelectorAll('app-stop-card h3')].map((h) => h.textContent);
    const [, ...rest] = names();

    await chooseFromMenu('Remove');

    expect(names()).toEqual(rest);
  });

  it('moves a stop to another day from its menu, as one undo step', async () => {
    const { fixture, el, click, build, chooseFromMenu } = await render();
    await build();
    const names = () => [...el.querySelectorAll('app-stop-card h3')].map((h) => h.textContent);
    const showDay = async (i: number) => {
      el.querySelectorAll<HTMLButtonElement>('[aria-label="Days"] button')[i].click();
      await fixture.whenStable();
    };
    const [moved] = names();

    await chooseFromMenu('Move to Day 2');
    expect(names()).not.toContain(moved);
    await showDay(1);
    expect(names()).toContain(moved);

    await click('Undo');
    expect(names()).not.toContain(moved);
    await showDay(0);
    expect(names()).toContain(moved);
  });

  it('lists places you can still add first, and searches only stated fields', async () => {
    const { fixture, el, build } = await render();
    await build();
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
