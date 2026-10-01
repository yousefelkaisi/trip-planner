import { formatDate } from '@angular/common';
import { Component, computed, inject, output } from '@angular/core';
import { HUBS } from '@domain/hubs';
import { TripStore } from '../trip-store';

@Component({
  selector: 'app-trip-header',
  templateUrl: './header.html',
})
export class TripHeader {
  protected readonly store = inject(TripStore);

  readonly newTrip = output();

  protected readonly today = formatDate(Date.now(), 'yyyy-MM-dd', 'en-US');

  protected readonly cities = computed(() => {
    const names = (this.store.trip()?.days ?? []).map((d) => HUBS[d.hub].name);
    return names.filter((name, i) => name !== names[i - 1]).join(' → ');
  });

  protected setStartDate(input: HTMLInputElement): void {
    if (input.validity.valid) {
      this.store.dispatch({ type: 'setStartDate', date: input.value });
    }
  }
}
