import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import type { Place } from '../domain/model/place';
import { aiExtract } from './ai-extract';
import { parseAll } from './models/record';
import { cityRefs, validate } from './validate';

const INPUT = 'data/italy.json';
const OUTPUT = 'data/places.json';
const CONCURRENCY = 5;

const data = readFileSync(INPUT, 'utf8');

// Only the data is fingerprinted. After changing the prompt or code, delete places.json to regenerate.
const fingerprint = createHash('sha256').update(data).digest('hex');
const previous = existsSync(OUTPUT) ? JSON.parse(readFileSync(OUTPUT, 'utf8')) : null;
if (previous?.fingerprint === fingerprint) {
  console.log('places.json is up to date');
  process.exit(0);
}

const raw = JSON.parse(data);
if (!Array.isArray(raw) || raw.length === 0) {
  console.error('italy.json must be a non-empty array');
  process.exit(1);
}

const recs = parseAll(raw);
const refs = cityRefs(recs);
const places: Place[] = [];
for (let i = 0; i < recs.length; i += CONCURRENCY) {
  const batch = recs.slice(i, i + CONCURRENCY);
  const results = await Promise.all(batch.map(async (r) => validate(r, await aiExtract(r), refs)));
  places.push(...results.filter((p) => p !== null));
}

const notInterpreted = places.filter((p) => p.flags.includes('not-interpreted')).length;
const bad = raw.length - places.length + notInterpreted;
if (bad / raw.length > 0.1) {
  console.error(`${bad}/${raw.length} records failed: check credentials, prompt or file format`);
  process.exit(1);
}

places.sort((a, b) => (a.id < b.id ? -1 : 1));
writeFileSync(OUTPUT, JSON.stringify({ fingerprint, places }, null, 2) + '\n');

const flagCounts: Record<string, number> = {};
for (const flag of places.flatMap((p) => p.flags)) flagCounts[flag] = (flagCounts[flag] ?? 0) + 1;
console.log(`${places.length} places`, flagCounts);
