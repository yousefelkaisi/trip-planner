import type { Place } from '@domain/model/place';
import type { Catalog } from '@domain/model/trip';
import data from '../../data/places.json';

export const PLACES = data.places as Place[];
export const CATALOG: Catalog = new Map(PLACES.map((p) => [p.id, p]));

const tagCounts = new Map<string, number>();
for (const tag of PLACES.flatMap((p) => p.tags)) {
  tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);
}
export const TAGS = [...tagCounts.keys()].sort(
  (a, b) => tagCounts.get(b)! - tagCounts.get(a)! || a.localeCompare(b),
);

export const MAX_PRICE = Math.max(...PLACES.map((p) => p.priceLevel ?? 1));
