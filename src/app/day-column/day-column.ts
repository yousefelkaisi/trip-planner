import { CdkDrag, type CdkDragDrop, CdkDropList } from '@angular/cdk/drag-drop';
import { DatePipe } from '@angular/common';
import { Component, computed, inject, input, output } from '@angular/core';
import { formatTime } from '@domain/hours';
import { HUBS } from '@domain/hubs';
import { HUB_IDS, type HubId, type Issue } from '@domain/model/trip';
import { fill } from '@domain/planner';
import type { ScheduledDay } from '@domain/schedule';
import { CATALOG } from '../catalog';
import { dropToCommand } from '../drop-to-command';
import { MODE_LABELS, SEVERITY_CLASSES } from '../labels';
import { StopCard } from '../stop-card/stop-card';
import { TripStore } from '../trip-store';

@Component({
  selector: 'app-day-column',
  imports: [CdkDrag, CdkDropList, DatePipe, StopCard],
  templateUrl: './day-column.html',
})
export class DayColumn {
  private readonly store = inject(TripStore);

  readonly index = input.required<number>();
  readonly day = input.required<ScheduledDay>();
  readonly details = output<string>();

  protected readonly hubIds = HUB_IDS;
  protected readonly hubs = HUBS;
  protected readonly formatTime = formatTime;
  protected readonly modeLabels = MODE_LABELS;
  protected readonly severityClasses = SEVERITY_CLASSES;
  protected readonly fullHint =
    'Nothing to add: the day is at its limit for this pace, or nothing else fits.';

  protected readonly dayIssues = computed(() => this.day().issues.filter((i) => !i.placeId));
  protected readonly stopIssues = computed(() => {
    const byPlace = new Map<string, Issue[]>();
    for (const issue of this.day().issues) {
      if (issue.placeId) {
        byPlace.set(issue.placeId, [...(byPlace.get(issue.placeId) ?? []), issue]);
      }
    }
    return byPlace;
  });
  protected readonly moveTargets = computed(() => {
    const days = this.store.trip()?.days ?? [];
    const region = HUBS[this.day().hub].region;
    return [...days.keys()].filter(
      (i) => i !== this.index() && HUBS[days[i].hub].region === region,
    );
  });

  // A dry run, so the button is disabled when the planner has nothing to add.
  protected readonly canFill = computed(() => {
    const trip = this.store.trip();
    const day = this.index();
    if (!trip) {
      return false;
    }
    const filled = fill(trip, [day], CATALOG);
    return filled.days[day].stops.length > trip.days[day].stops.length;
  });

  protected drop(event: CdkDragDrop<number, number | 'browser', string>): void {
    const cmd = dropToCommand(event);
    if (cmd) {
      this.store.dispatch(cmd);
    }
  }

  // Every hub is in a different region, so changing the city clears the day.
  protected setHub(select: HTMLSelectElement): void {
    const hub = select.value as HubId;
    const message = `Changing Day ${this.index() + 1} to ${HUBS[hub].name} will clear its stops. You can undo this.`;
    if (this.day().stops.length > 0 && !confirm(message)) {
      select.value = this.day().hub;
      return;
    }
    this.store.dispatch({ type: 'setHub', day: this.index(), hub });
  }

  protected moveBy(placeId: string, index: number, delta: number): void {
    this.store.dispatch({ type: 'moveStop', placeId, day: this.index(), index: index + delta });
  }

  protected moveTo(placeId: string, day: number): void {
    this.store.dispatch({ type: 'removeStop', placeId }, { type: 'addStop', day, placeId });
  }

  protected remove(placeId: string): void {
    this.store.dispatch({ type: 'removeStop', placeId });
  }

  protected fillDay(): void {
    this.store.dispatch({ type: 'fill', days: [this.index()] });
  }

  protected clear(): void {
    this.store.dispatch({ type: 'clearDay', day: this.index() });
  }
}
