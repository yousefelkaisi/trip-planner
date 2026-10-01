import type { HubId } from './model/trip';

// Coordinates are each hub's main station, where its days start and end.
export const HUBS: Record<HubId, { name: string; region: string; lat: number; lng: number }> = {
  rome: { name: 'Rome', region: 'Lazio', lat: 41.9009, lng: 12.5018 },
  florence: { name: 'Florence', region: 'Tuscany', lat: 43.7765, lng: 11.2481 },
  bologna: { name: 'Bologna', region: 'Emilia-Romagna', lat: 44.5056, lng: 11.3433 },
  milan: { name: 'Milan', region: 'Lombardy', lat: 45.4861, lng: 9.2045 },
  venice: { name: 'Venice', region: 'Veneto', lat: 45.441, lng: 12.3208 },
};

const TRAIN_MIN: Record<string, number> = {
  'rome-florence': 95,
  'florence-bologna': 40,
  'bologna-milan': 65,
  'bologna-venice': 90,
  'florence-venice': 130,
  'florence-milan': 115,
  'milan-venice': 145,
  'rome-bologna': 135,
  'rome-milan': 190,
  'rome-venice': 235,
};

export function trainMinutes(a: HubId, b: HubId): number {
  return TRAIN_MIN[`${a}-${b}`] ?? TRAIN_MIN[`${b}-${a}`];
}
