import { readFileSync } from 'node:fs';
import { isDeepStrictEqual } from 'node:util';
import { type Place, WEEKDAYS } from '../../domain/model/place';
import { aiExtract } from '../ai-extract';
import { parseAll } from '../models/record';
import { cityRefs, validate } from '../validate';

type Golden = {
  id: string;
  record?: unknown; // a synthetic record, for cases italy.json doesn't have
  hours?: Partial<Place['hours']>;
  closedDays?: string[];
  alwaysOpen?: boolean;
  openMonths?: number[];
  flags?: string[];
  bestTime?: Place['bestTime'];
};

const golden: Golden[] = JSON.parse(readFileSync('pipeline/evals/golden.json', 'utf8'));
const recs = parseAll(JSON.parse(readFileSync('data/italy.json', 'utf8')));
const refs = cityRefs(recs);

// Only the fields a golden entry lists are compared.
function failures(g: Golden, p: Place): string[] {
  const out: string[] = [];
  const expect = (field: string, actual: unknown, expected: unknown) => {
    if (expected !== undefined && !isDeepStrictEqual(actual, expected)) {
      out.push(`${field} = ${JSON.stringify(actual)}`);
    }
  };
  const closedDays = WEEKDAYS.filter((d) => p.hours[d]?.length === 0);
  const alwaysOpen = WEEKDAYS.every((d) =>
    isDeepStrictEqual(p.hours[d], [{ open: '00:00', close: '24:00' }]),
  );
  for (const d of WEEKDAYS) expect(`hours.${d}`, p.hours[d], g.hours?.[d]);
  expect('closedDays', closedDays, g.closedDays);
  expect('alwaysOpen', alwaysOpen, g.alwaysOpen);
  expect('openMonths', p.openMonths, g.openMonths);
  expect('flags', p.flags, g.flags);
  expect('bestTime', p.bestTime, g.bestTime);
  return out;
}

const results = await Promise.all(
  golden.map(async (g) => {
    const rec = g.record ? parseAll([g.record])[0] : recs.find((r) => r.id === g.id);
    const place = rec && validate(rec, await aiExtract(rec), refs);
    return { id: g.id, failed: place ? failures(g, place) : ['dropped'] };
  }),
);

for (const { id, failed } of results) {
  console.log(failed.length ? failed.map((f) => `✗ ${id} ${f}`).join('\n') : `✓ ${id}`);
}
const failedCount = results.filter((r) => r.failed.length).length;
console.log(`${results.length - failedCount}/${results.length} passed`);
process.exit(failedCount ? 1 : 0);
