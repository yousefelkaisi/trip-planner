import type { Command } from '@domain/model/trip';

// A structural subset of CdkDragDrop, so tests can pass plain objects.
export interface Drop {
  item: { data: string };
  container: { data: number };
  previousContainer: { data: number | 'browser' };
  previousIndex: number;
  currentIndex: number;
}

export function dropToCommand(e: Drop): Command | null {
  const placeId = e.item.data;
  const day = e.container.data;

  if (e.previousContainer.data === 'browser') {
    return { type: 'addStop', day, placeId, index: e.currentIndex };
  }
  if (e.previousContainer.data === day && e.previousIndex === e.currentIndex) {
    return null;
  }

  return { type: 'moveStop', placeId, day, index: e.currentIndex };
}
