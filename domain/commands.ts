import { HUBS } from './hubs';
import { type Catalog, type Command, type Trip, TripSchema } from './model/trip';
import { bestInsertion, fill } from './planner';

export type Result = { ok: true; trip: Trip } | { ok: false; error: string };

export function apply(trip: Trip | null, cmd: Command, catalog: Catalog): Result {
  if (cmd.type === 'newTrip') {
    if (!TripSchema.shape.startDate.safeParse(cmd.startDate).success) {
      return { ok: false, error: `${cmd.startDate} isn't a valid date` };
    }
    if (cmd.hubs.length === 0) {
      return { ok: false, error: 'Choose a city for at least one day' };
    }
    const days = cmd.hubs.map((hub) => ({ hub, stops: [] }));
    return { ok: true, trip: { version: 1, startDate: cmd.startDate, prefs: cmd.prefs, days } };
  }
  if (!trip) {
    return { ok: false, error: 'No trip yet' };
  }

  const next = structuredClone(trip);
  const error = edit(next, cmd, catalog);
  return error ? { ok: false, error } : { ok: true, trip: next };
}

export function applyAll(trip: Trip | null, cmds: Command[], catalog: Catalog): Result {
  for (const cmd of cmds) {
    const result = apply(trip, cmd, catalog);
    if (!result.ok) {
      return result;
    }
    trip = result.trip;
  }

  return trip ? { ok: true, trip } : { ok: false, error: 'No trip yet' };
}

// Edits the trip in place and returns an error message, or null on success.
function edit(
  trip: Trip,
  cmd: Exclude<Command, { type: 'newTrip' }>,
  catalog: Catalog,
): string | null {
  switch (cmd.type) {
    case 'setStartDate': {
      if (!TripSchema.shape.startDate.safeParse(cmd.date).success) {
        return `${cmd.date} isn't a valid date`;
      }
      trip.startDate = cmd.date;
      return null;
    }

    case 'setHub': {
      const day = trip.days[cmd.day];
      if (!day) {
        return `There is no day ${cmd.day + 1}`;
      }
      day.hub = cmd.hub;
      day.stops = day.stops.filter((id) => catalog.get(id)?.region === HUBS[cmd.hub].region);
      return null;
    }

    case 'addStop': {
      const day = trip.days[cmd.day];
      const place = catalog.get(cmd.placeId);
      if (!day) {
        return `There is no day ${cmd.day + 1}`;
      }
      if (!place) {
        return `Unknown place ${cmd.placeId}`;
      }
      if (trip.days.some((d) => d.stops.includes(place.id))) {
        return `${place.name} is already in the trip`;
      }
      if (place.region !== HUBS[day.hub].region) {
        return `${place.name} isn't in the ${HUBS[day.hub].name} area`;
      }
      const index = cmd.index ?? bestInsertion(trip, cmd.day, place.id, catalog);
      if (!Number.isInteger(index) || index < 0 || index > day.stops.length) {
        return `Can't add at position ${index + 1}`;
      }
      day.stops.splice(index, 0, place.id);
      return null;
    }

    // `index` is the position after the stop is taken out, which matches CDK's currentIndex.
    case 'moveStop': {
      const from = trip.days.find((d) => d.stops.includes(cmd.placeId));
      const day = trip.days[cmd.day];
      const place = catalog.get(cmd.placeId);
      if (!from || !place) {
        return `${place?.name ?? cmd.placeId} isn't in the trip`;
      }
      if (!day) {
        return `There is no day ${cmd.day + 1}`;
      }
      if (place.region !== HUBS[day.hub].region) {
        return `${place.name} isn't in the ${HUBS[day.hub].name} area`;
      }
      from.stops = from.stops.filter((id) => id !== place.id);
      if (!Number.isInteger(cmd.index) || cmd.index < 0 || cmd.index > day.stops.length) {
        return `Can't move to position ${cmd.index + 1}`;
      }
      day.stops.splice(cmd.index, 0, place.id);
      return null;
    }

    case 'removeStop': {
      const day = trip.days.find((d) => d.stops.includes(cmd.placeId));
      if (!day) {
        return `${catalog.get(cmd.placeId)?.name ?? cmd.placeId} isn't in the trip`;
      }
      day.stops = day.stops.filter((id) => id !== cmd.placeId);
      return null;
    }

    case 'fill': {
      if (cmd.days.length === 0) {
        return 'Choose a day to fill';
      }
      const missing = cmd.days.find((d) => !trip.days[d]);
      if (missing !== undefined) {
        return `There is no day ${missing + 1}`;
      }
      trip.days = fill(trip, cmd.days, catalog).days;
      return null;
    }

    case 'clearDay': {
      const day = trip.days[cmd.day];
      if (!day) {
        return `There is no day ${cmd.day + 1}`;
      }
      day.stops = [];
      return null;
    }
  }
}
