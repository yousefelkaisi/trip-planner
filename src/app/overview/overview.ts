import { DatePipe } from '@angular/common';
import { Component, computed, input, output } from '@angular/core';
import { formatTime } from '@domain/hours';
import { HUBS } from '@domain/hubs';
import type { ScheduledDay } from '@domain/schedule';
import { DAY_COLORS } from '../labels';

@Component({
  selector: 'app-trip-overview',
  imports: [DatePipe],
  templateUrl: './overview.html',
})
export class TripOverview {
  readonly days = input.required<ScheduledDay[]>();
  readonly details = output<string>();

  protected readonly hubs = HUBS;
  protected readonly dayColors = DAY_COLORS;
  protected readonly formatTime = formatTime;

  protected readonly stats = computed(() => {
    let stops = 0;
    let visiting = 0;
    let travel = 0;
    let free = 0;
    for (const day of this.days()) {
      stops += day.stops.length;
      visiting += day.totals.visiting;
      travel += day.totals.travel + (day.transferMinutes ?? 0);
      free += day.totals.waiting;
    }
    return [
      { label: 'Stops', value: String(stops) },
      { label: 'Visiting', value: duration(visiting) },
      { label: 'Travel, incl. trains', value: duration(travel) },
      { label: 'Free time', value: duration(free) },
    ];
  });
}

/** Formats minutes as "45 min", "3 h" or "3 h 20 min". */
function duration(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h === 0) {
    return `${m} min`;
  }
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}
