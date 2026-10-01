import type { Place } from '@domain/model/place';
import type { Issue } from '@domain/model/trip';
import type { Leg } from '@domain/travel';

export const FLAG_LABELS: Record<Place['flags'][number], string> = {
  'hours-approximate': 'Hours approximate',
  'check-dates': 'Check dates',
  'check-location': 'Check location',
  'duration-estimated': 'Duration estimated',
  'not-interpreted': 'Hours not interpreted',
};

export const FLAG_HINT =
  'Estimated from incomplete listing data, partly by AI, so it may be inaccurate. Check before going.';

export const MODE_LABELS: Record<Leg['mode'], string> = {
  walk: 'walk',
  transit: 'by transit',
  regional: 'by regional train or bus',
};

export const SEVERITY_CLASSES: Record<Issue['severity'], string> = {
  error: 'bg-red-50 text-red-800',
  warning: 'bg-amber-50 text-amber-800',
  info: 'bg-sky-50 text-sky-800',
};

// One colour per day, shared by the map's routes and markers and the overview's day headings.
export const DAY_COLORS = [
  { bg: 'bg-emerald-700', stroke: 'stroke-emerald-700' },
  { bg: 'bg-sky-700', stroke: 'stroke-sky-700' },
  { bg: 'bg-amber-700', stroke: 'stroke-amber-700' },
];
