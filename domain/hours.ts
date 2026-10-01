import { type Place, WEEKDAYS } from './model/place';

export interface DayHours {
  status: 'open' | 'closed' | 'unknown';
  intervals: { open: number; close: number }[];
  reason: string | null;
}

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

const WEEKDAY_NAMES = {
  mon: 'Monday',
  tue: 'Tuesday',
  wed: 'Wednesday',
  thu: 'Thursday',
  fri: 'Friday',
  sat: 'Saturday',
  sun: 'Sunday',
};

export function toMin(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

export function formatTime(min: number): string {
  const m = min % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

// Date-only strings parse as UTC, so getUTC* gives the right day in any timezone.
export function addDays(date: string, n: number): string {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function weekday(date: string): (typeof WEEKDAYS)[number] {
  return WEEKDAYS[(new Date(date).getUTCDay() + 6) % 7];
}

export function hoursOn(place: Place, date: string): DayHours {
  const month = Number(date.slice(5, 7));
  const day = weekday(date);
  const hours = place.hours[day];

  if (place.openMonths === null) {
    return { status: 'unknown', intervals: [], reason: null };
  }
  if (!place.openMonths.includes(month)) {
    return { status: 'closed', intervals: [], reason: `Closed in ${MONTHS[month - 1]}` };
  }
  if (hours === null) {
    return { status: 'unknown', intervals: [], reason: null };
  }
  if (hours.length === 0) {
    return { status: 'closed', intervals: [], reason: `Closed on ${WEEKDAY_NAMES[day]}s` };
  }

  const intervals = hours.map((h) => {
    const open = toMin(h.open);
    const close = toMin(h.close);
    return { open, close: close <= open ? close + 1440 : close };
  });

  return { status: 'open', intervals, reason: null };
}
