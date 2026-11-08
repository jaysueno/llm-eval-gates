#!/usr/bin/env node
// Writes the synthetic golden sets, their reference reads and their planted reads.
//   node scripts/generate-golden.mjs                       seed 7, into eval/
//   node scripts/generate-golden.mjs --seed 12 --out /tmp/set
// Output per domain: <out>/<domain>/golden.jsonl, reference-read.jsonl, planted-halluc.jsonl,
// plus receipt and form images (SVG) and meeting transcripts beside them.
// It never writes self-test.json or baseline.json: pinned numbers are pinned by a person.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateAll } from '../lib/generate.mjs';
import { toJsonl } from '../lib/jsonl.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
let seed = 7;
let out = join(ROOT, 'eval');
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--seed') seed = Number(args[++i]);
  else if (args[i] === '--out') out = resolve(args[++i]);
  else {
    console.error(`unknown argument ${args[i]}`);
    process.exit(2);
  }
}
if (!Number.isInteger(seed) || seed < 0) {
  console.error('--seed must be a whole number, 0 or more');
  process.exit(2);
}

const write = (path, text) => {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, text);
};
const sets = generateAll(seed);
for (const [domain, s] of Object.entries(sets)) {
  const dir = join(out, domain);
  write(join(dir, 'golden.jsonl'), toJsonl(s.golden));
  write(join(dir, 'reference-read.jsonl'), toJsonl(s.reference));
  write(join(dir, 'planted-halluc.jsonl'), toJsonl(s.planted));
  for (const [rel, text] of Object.entries(s.extras)) write(join(dir, rel), text);
  console.log(`${domain}: ${s.golden.length} cases, ${Object.keys(s.extras).length} extra file(s)`);
}
console.log(`seed ${seed}, written under ${out}`);
