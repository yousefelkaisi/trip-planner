import {
  afterNextRender,
  Component,
  DestroyRef,
  type ElementRef,
  effect,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { HUBS } from '@domain/hubs';
import type { ScheduledDay } from '@domain/schedule';
import type * as Leaflet from 'leaflet';
import { DAY_COLORS } from '../labels';

// Injected at build time from the CARTO_KEY env var (see package.json), so it stays out of the repo. It's still
// sent with every tile request, so restrict it to the app's domains in CARTO.
declare const CARTO_KEY: string;
// Without a key CARTO serves "API key required" placeholder tiles, so fall back to OpenStreetMap's own.
const TILES = CARTO_KEY
  ? `https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png?key=${CARTO_KEY}`
  : 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const OSM =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
const ATTRIBUTION = CARTO_KEY
  ? `${OSM} &copy; <a href="https://carto.com/attributions">CARTO</a>`
  : OSM;

type Point = { lat: number; lng: number };

interface MapState {
  L: typeof Leaflet;
  map: Leaflet.Map;
  layer: Leaflet.LayerGroup;
}

@Component({
  selector: 'app-trip-map',
  template: `<div #map class="h-full rounded-xl border border-stone-200"></div>`,
})
export class TripMap {
  readonly days = input.required<ScheduledDay[]>();
  // The day to show, or null for the whole trip.
  readonly day = input.required<number | null>();

  private readonly container = viewChild.required<ElementRef<HTMLElement>>('map');
  private readonly state = signal<MapState | null>(null);

  constructor() {
    const destroyRef = inject(DestroyRef);

    afterNextRender(async () => {
      const L = (await import('leaflet')).default;
      // The board may have closed (e.g. "New trip") while Leaflet was loading.
      if (destroyRef.destroyed) {
        return;
      }
      const container = this.container().nativeElement;
      const map = L.map(container);
      L.tileLayer(TILES, { attribution: ATTRIBUTION }).addTo(map);

      // Leaflet only notices window resizes, not layout shifts like the error banner closing.
      const resize = new ResizeObserver(() => map.invalidateSize());
      resize.observe(container);
      map.on('unload', () => resize.disconnect());

      this.state.set({ L, map, layer: L.layerGroup().addTo(map) });
    });

    effect(() => {
      const state = this.state();
      if (state) {
        draw(state, this.days(), this.day());
      }
    });

    destroyRef.onDestroy(() => this.state()?.map.remove());
  }
}

function draw({ L, map, layer }: MapState, days: ScheduledDay[], only: number | null): void {
  const shown = only === null ? [...days.keys()] : [only];

  const marker = (point: Point, label: string, title: string, classes: string) =>
    L.marker([point.lat, point.lng], {
      title,
      icon: L.divIcon({
        className: '',
        iconSize: [24, 24],
        html: `<span class="flex size-6 items-center justify-center rounded-full text-xs font-semibold text-white shadow ${classes}">${label}</span>`,
      }),
    }).addTo(layer);

  layer.clearLayers();
  for (const i of shown) {
    const day = days[i];
    const color = DAY_COLORS[i];
    const station = HUBS[day.hub];
    const stops = day.stops.map((s) => s.place);
    const path = stops.length > 0 ? [station, ...stops, station] : [station];
    const modes = [...day.stops.map((s) => s.legIn.mode), day.legOut?.mode];

    // Line colours are Tailwind stroke classes, which override Leaflet's stroke attribute.
    for (let j = 0; j < path.length - 1; j++) {
      const line = [path[j], path[j + 1]].map((p): [number, number] => [p.lat, p.lng]);
      L.polyline(line, {
        className: color.stroke,
        weight: 3,
        dashArray: modes[j] === 'walk' ? undefined : '6 6',
      }).addTo(layer);
    }
    stops.forEach((p, j) => marker(p, String(j + 1), p.name, color.bg));

    // The whole trip also shows the morning train from the previous day's city.
    const prev = days[i - 1];
    if (only === null && prev && prev.hub !== day.hub) {
      const line = [HUBS[prev.hub], station].map((p): [number, number] => [p.lat, p.lng]);
      L.polyline(line, { className: 'stroke-stone-500', weight: 3, dashArray: '2 8' }).addTo(layer);
    }
  }

  // Days in the same city share a station, so it gets one marker.
  const stations = [...new Set(shown.map((i) => days[i].hub))].map((hub) => HUBS[hub]);
  for (const station of stations) {
    marker(station, 'S', `${station.name} station`, 'bg-stone-700');
  }

  // No animation: a redraw that lands mid-zoom leaves the lines out of line with the markers.
  const points = [...stations, ...shown.flatMap((i) => days[i].stops.map((s) => s.place))];
  if (points.length > 1) {
    const bounds = L.latLngBounds(points.map((p) => [p.lat, p.lng]));
    map.fitBounds(bounds, { padding: [24, 24], animate: false });
  } else {
    map.setView([points[0].lat, points[0].lng], 13, { animate: false });
  }
}
