import { CdkDrag, CdkDropList } from '@angular/cdk/drag-drop';
import { Component, computed, inject, input, linkedSignal, output, signal } from '@angular/core';
import { HUBS } from '@domain/hubs';
import { HUB_IDS } from '@domain/model/trip';
import { score } from '@domain/planner';
import { PLACES, TAGS } from '../catalog';
import { TripStore } from '../trip-store';

@Component({
  selector: 'app-place-browser',
  imports: [CdkDrag, CdkDropList],
  templateUrl: './browser.html',
})
export class PlaceBrowser {
  private readonly store = inject(TripStore);

  readonly day = input.required<number>();
  readonly details = output<string>();

  protected readonly hubIds = HUB_IDS;
  protected readonly hubs = HUBS;
  protected readonly tags = TAGS;
  protected readonly types = [...new Set(PLACES.map((p) => p.type ?? 'other'))].sort();
  protected readonly noEnter = () => false;

  protected readonly query = signal('');
  protected readonly type = signal('');
  protected readonly tag = signal('');
  // '' = all regions; follows the selected day's city until the user picks another. Going through
  // a computed means trip edits that leave the day's region alone don't reset the user's pick.
  private readonly dayRegion = computed(() => {
    const hub = this.store.trip()?.days[this.day()]?.hub;
    return hub ? HUBS[hub].region : '';
  });
  protected readonly region = linkedSignal(() => this.dayRegion());

  protected readonly places = computed(() => {
    const trip = this.store.trip();
    if (!trip) {
      return [];
    }

    const query = this.query().trim().toLowerCase();
    const inTrip = new Set(trip.days.flatMap((d) => d.stops));
    // Places already in the trip go last, so the ones you can still add come first.
    return PLACES.filter(
      (p) =>
        (!query || `${p.name} ${p.city} ${p.neighborhood ?? ''}`.toLowerCase().includes(query)) &&
        (!this.type() || (p.type ?? 'other') === this.type()) &&
        (!this.tag() || p.tags.includes(this.tag())) &&
        (!this.region() || p.region === this.region()),
    )
      .map((place) => ({
        place,
        ...score(place, trip.prefs),
        inTrip: inTrip.has(place.id),
        days: [...trip.days.keys()].filter((i) => HUBS[trip.days[i].hub].region === place.region),
      }))
      .sort(
        (a, b) =>
          Number(a.inTrip) - Number(b.inTrip) ||
          b.score - a.score ||
          (a.place.id < b.place.id ? -1 : 1),
      );
  });

  protected add(day: number, placeId: string): void {
    this.store.dispatch({ type: 'addStop', day, placeId });
  }
}
