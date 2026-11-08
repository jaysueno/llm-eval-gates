#!/usr/bin/env node
// Write or tighten a baseline. It never loosens one.
//   npm run rebaseline -- receipts --results better-reads.jsonl          tighten after an improvement
//   npm run rebaseline -- --init receipts --results first-reads.jsonl    write the first baseline
//   add --out <file> to write somewhere else (for a dry look)
// Both modes run the self-test first, score the reads against the shipped golden set, and
// refuse a run that fails a gate. Without --init, a domain with no baseline is refused: a
// missing file must never become a fresh, looser floor. With --init, an existing baseline is
// refused: the first floor is written once, on purpose. For every ratchet gate the new limit is
// the stricter of the old limit and the new measurement. Hard-zero gates are not in the file
// and never will be. Commit the baseline in the same change as the run it records.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { DOMAINS } from '../lib/domains/index.mjs';
import { selfTest, domainDir } from '../lib/harness.mjs';
import { readJsonl, indexBy } from '../lib/jsonl.mjs';
import { evaluateGates, ratchet } from '../lib/gates.mjs';

async function run(argv) {
  let name = null;
  let results = null;
  let out = null;
  let init = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--results') results = argv[++i];
    else if (a === '--out') out = argv[++i];
    else if (a === '--init') init = true;
    else if (!a.startsWith('--') && name === null) name = a;
    else {
      console.error(`refusing: unknown argument ${a}`);
      return 2;
    }
  }
  const spec = DOMAINS[name];
  if (!spec) {
    console.error(`usage: rebaseline.mjs [--init] <${Object.keys(DOMAINS).join('|')}> --results <reads.jsonl> [--out <file>]`);
    return 2;
  }
  if (!results) {
    console.error('refusing: --results <reads.jsonl> is required');
    return 2;
  }
  const bpath = join(domainDir(spec), 'baseline.json');
  const label = `eval/${spec.name}/baseline.json`;
  if (init && existsSync(bpath)) {
    console.error(`refusing: ${label} already exists; --init only writes a first baseline, use the command without --init to tighten it`);
    return 2;
  }
  if (!init && !existsSync(bpath)) {
    console.error(`refusing: ${label} does not exist; write the first one on purpose with --init`);
    return 2;
  }
  if (!(await selfTest(spec))) return 2;
  const dir = domainDir(spec);
  const golden = join(dir, 'golden.jsonl');
  const cases = readJsonl(golden);
  spec.validate(cases);
  const trip = spec.tripwires(cases);
  if (trip) {
    console.log(`refusing: ${trip}`);
    return 1;
  }
  const reads = indexBy(readJsonl(resolve(results)), spec.readKey, results);
  const { metrics } = await spec.score(cases, reads, { goldenPath: golden });
  const old = init ? { gates: {} } : JSON.parse(readFileSync(bpath, 'utf8'));
  const verdict = evaluateGates(metrics, { hardKeys: spec.hardKeys, ratchets: spec.ratchets, baseline: old,
    baselineLabel: label });
  if (verdict.failed) {
    for (const l of verdict.lines) console.log(l);
    console.log('refusing: a run that fails a gate is not a floor to build on');
    return 1;
  }
  const gates = ratchet(old, metrics, spec.ratchets);
  for (const r of spec.ratchets) {
    const before = old.gates ? old.gates[r.key] : undefined;
    console.log(`${r.key} ${before === undefined ? '(unset)' : before} -> ${gates[r.key]}`);
  }
  const next = init
    ? { about: 'Ratchet floor. Only ratchet gates live here; the hard-zero gates are constants in lib/gates.mjs and a key for one of them here fails the run. scripts/rebaseline.mjs only ever tightens these numbers.', gates }
    : { ...old, gates };
  next.scores_at_pin = Object.fromEntries(spec.ratchets.map((r) => [r.metric, metrics[r.metric]]));
  const target = out ? resolve(out) : bpath;
  writeFileSync(target, JSON.stringify(next, null, 2) + '\n');
  console.log(`wrote ${out ? target : label}`);
  return 0;
}

process.exitCode = await run(process.argv.slice(2));
