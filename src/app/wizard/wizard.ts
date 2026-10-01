import { DatePipe, formatDate } from '@angular/common';
import { Component, computed, inject, output, signal, type WritableSignal } from '@angular/core';
import { applyAll } from '@domain/commands';
import { addDays, formatTime } from '@domain/hours';
import { HUBS } from '@domain/hubs';
import { type Command, HUB_IDS, type HubId, type Prefs, type Trip } from '@domain/model/trip';
import { eligible, hasSightLeft } from '@domain/planner';
import { PACES } from '@domain/schedule';
import { CATALOG, MAX_PRICE, PLACES, TAGS } from '../catalog';
import { TripStore } from '../trip-store';

const DAY_COUNT = 3;

@Component({
  selector: 'app-trip-wizard',
  imports: [DatePipe],
  templateUrl: './wizard.html',
})
export class TripWizard {
  protected readonly store = inject(TripStore);

  readonly done = output();

  protected readonly hubIds = HUB_IDS;
  protected readonly hubs = HUBS;
  protected readonly tags = TAGS;
  protected readonly paces = PACES;
  protected readonly paceNames = Object.keys(PACES) as Prefs['pace'][];
  protected readonly prices = Array.from({ length: MAX_PRICE }, (_, i) => i + 1);
  protected readonly canCancel = this.store.trip() !== null;
  protected readonly formatTime = formatTime;
  protected readonly addDays = addDays;
  protected readonly today = formatDate(Date.now(), 'yyyy-MM-dd', 'en-US');

  protected readonly steps = ['When', 'Interests', 'Cities'];
  protected readonly step = signal(1);
  // A new trip always starts from the defaults; Cancel keeps the current one.
  protected readonly startDate = signal(defaultStartDate());
  protected readonly pace = signal<Prefs['pace']>('balanced');
  protected readonly maxPrice = signal(MAX_PRICE);
  protected readonly interests = signal<string[]>([]);
  protected readonly avoid = signal<string[]>([]);
  protected readonly dayTrips = signal(false);
  // null until the user picks a city; until then every day gets the best match.
  private readonly chosenHubs = signal<HubId[] | null>(null);

  private readonly prefs = computed((): Prefs => ({
    interests: this.interests(),
    avoid: this.avoid(),
    maxPrice: this.maxPrice(),
    pace: this.pace(),
    dayTrips: this.dayTrips(),
  }));

  // Places per city the planner could use (avoids, budget, rating, closures) that match an
  // interest, or all of them when none are picked. Closures are checked for the start date.
  protected readonly matches = computed(() => {
    const prefs = this.prefs();
    const counts = HUB_IDS.map((hub) => {
      const trip: Trip = {
        version: 1,
        startDate: this.startDate(),
        prefs,
        days: [{ hub, stops: [] }],
      };
      const count = PLACES.filter(
        (p) =>
          eligible(p, trip, 0) &&
          (prefs.interests.length === 0 || p.tags.some((t) => prefs.interests.includes(t))),
      ).length;
      return [hub, count];
    });
    return Object.fromEntries(counts) as Record<HubId, number>;
  });

  protected readonly dayHubs = computed(() => {
    const matches = this.matches();
    const best = HUB_IDS.reduce((a, b) => (matches[b] > matches[a] ? b : a));
    return this.chosenHubs() ?? Array<HubId>(DAY_COUNT).fill(best);
  });

  private readonly commands = computed((): Command[] => [
    {
      type: 'newTrip',
      startDate: this.startDate(),
      prefs: this.prefs(),
      hubs: this.dayHubs(),
    },
    { type: 'fill', days: this.dayHubs().map((_, i) => i) },
  ]);

  // A dry run of the build, so the hints come from the real planner.
  protected readonly preview = computed(() => {
    const result = applyAll(null, this.commands(), CATALOG);
    if (!result.ok) {
      return [];
    }
    const { trip } = result;
    return trip.days.map((day, i) => {
      const places = day.stops.map((id) => CATALOG.get(id)!);
      const sights = places.filter((p) => p.type !== 'restaurant').length;
      // Only a city that ran out gets a hint; a day that's simply full needs none.
      return {
        names: places.map((p) => p.name),
        short: sights < PACES[trip.prefs.pace].sights && !hasSightLeft(trip, i, CATALOG),
      };
    });
  });

  protected setStartDate(input: HTMLInputElement): void {
    if (input.validity.valid) {
      this.startDate.set(input.value);
    }
  }

  protected toggle(list: WritableSignal<string[]>, tag: string): void {
    list.update((tags) => (tags.includes(tag) ? tags.filter((t) => t !== tag) : [...tags, tag]));
  }

  protected setHub(day: number, hub: string): void {
    this.chosenHubs.set(this.dayHubs().map((h, i) => (i === day ? (hub as HubId) : h)));
  }

  protected build(): void {
    if (this.store.dispatch(...this.commands())) {
      this.done.emit();
    }
  }
}

// The first Friday at least two weeks from today, read in the user's local calendar.
function defaultStartDate(): string {
  const now = new Date();
  const days = 14 + ((5 - now.getDay() + 7) % 7);
  return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate() + days))
    .toISOString()
    .slice(0, 10);
}
