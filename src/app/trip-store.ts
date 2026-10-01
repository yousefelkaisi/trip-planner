import { computed, effect, Injectable, signal } from '@angular/core';
import { applyAll } from '@domain/commands';
import { type Command, type Trip, TripSchema } from '@domain/model/trip';
import { scheduleTrip } from '@domain/schedule';
import { CATALOG } from './catalog';

export const STORAGE_KEY = 'italy-planner:trip:v1';
const MAX_HISTORY = 50;

interface History {
  past: Trip[];
  present: Trip | null;
  future: Trip[];
}

@Injectable({ providedIn: 'root' })
export class TripStore {
  private readonly history = signal<History>({ past: [], present: load(), future: [] });

  readonly trip = computed(() => this.history().present);
  readonly days = computed(() => {
    const trip = this.trip();
    return trip ? scheduleTrip(trip, CATALOG) : [];
  });
  readonly error = signal<string | null>(null);
  readonly canUndo = computed(() => this.history().past.length > 0);
  readonly canRedo = computed(() => this.history().future.length > 0);

  constructor() {
    effect(() => {
      const trip = this.trip();
      if (trip) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(trip));
      }
    });
  }

  // All-or-nothing: the commands become one undo step, or nothing changes.
  dispatch(...cmds: Command[]): boolean {
    const result = applyAll(this.trip(), cmds, CATALOG);
    if (!result.ok) {
      this.error.set(result.error);
      return false;
    }

    this.history.update(({ past, present }) => ({
      past: present ? [...past, present].slice(-MAX_HISTORY) : past,
      present: result.trip,
      future: [],
    }));
    this.error.set(null);
    return true;
  }

  undo(): void {
    const { past, present, future } = this.history();
    if (past.length > 0 && present) {
      this.history.set({
        past: past.slice(0, -1),
        present: past.at(-1)!,
        future: [present, ...future],
      });
      this.error.set(null);
    }
  }

  redo(): void {
    const { past, present, future } = this.history();
    if (future.length > 0 && present) {
      this.history.set({ past: [...past, present], present: future[0], future: future.slice(1) });
      this.error.set(null);
    }
  }
}

function load(): Trip | null {
  try {
    const trip = TripSchema.parse(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null'));
    for (const day of trip.days) {
      day.stops = day.stops.filter((id) => CATALOG.has(id));
    }
    return trip;
  } catch {
    return null;
  }
}
