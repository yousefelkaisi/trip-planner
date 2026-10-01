export interface Leg {
  minutes: number;
  km: number;
  mode: 'walk' | 'transit' | 'regional';
}

type Point = { lat: number; lng: number };

// Route length is approximated as 1.3 × the straight-line (haversine) distance.
export function travel(a: Point, b: Point): Leg {
  const rad = Math.PI / 180;
  const h =
    Math.sin(((b.lat - a.lat) * rad) / 2) ** 2 +
    Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(((b.lng - a.lng) * rad) / 2) ** 2;
  const km = 1.3 * 2 * 6371 * Math.asin(Math.sqrt(h));

  if (km <= 2) {
    return { mode: 'walk', km, minutes: Math.round((km / 4.5) * 60) };
  }
  if (km <= 20) {
    return { mode: 'transit', km, minutes: Math.round(10 + (km / 18) * 60) };
  }

  return { mode: 'regional', km, minutes: Math.round(20 + km) };
}
