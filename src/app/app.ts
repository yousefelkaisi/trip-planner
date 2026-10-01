import { CdkDropListGroup } from '@angular/cdk/drag-drop';
import { Component, computed, inject, signal } from '@angular/core';
import { HUBS } from '@domain/hubs';
import { PlaceBrowser } from './browser/browser';
import { CATALOG } from './catalog';
import { DayColumn } from './day-column/day-column';
import { TripHeader } from './header/header';
import { TripOverview } from './overview/overview';
import { PlaceDetail } from './place-detail/place-detail';
import { TripMap } from './trip-map/trip-map';
import { TripStore } from './trip-store';
import { TripWizard } from './wizard/wizard';

@Component({
  selector: 'app-root',
  imports: [
    CdkDropListGroup,
    DayColumn,
    PlaceBrowser,
    PlaceDetail,
    TripHeader,
    TripMap,
    TripOverview,
    TripWizard,
  ],
  templateUrl: './app.html',
})
export class App {
  protected readonly store = inject(TripStore);
  protected readonly hubs = HUBS;

  protected readonly wizardOpen = signal(this.store.trip() === null);
  protected readonly selectedDay = signal(0);
  protected readonly overview = signal(false);
  protected readonly detailId = signal<string | null>(null);

  protected readonly detail = computed(() => {
    const id = this.detailId();
    const place = id ? CATALOG.get(id) : undefined;
    if (!place) {
      return null;
    }
    const days = this.store.days();
    const day =
      days.find((d) => d.stops.some((s) => s.place.id === id)) ?? days[this.selectedDay()];
    return { place, date: day.date };
  });

  protected showWizard(open: boolean): void {
    this.store.error.set(null);
    this.wizardOpen.set(open);
    this.selectedDay.set(0);
    this.overview.set(false);
  }
}
