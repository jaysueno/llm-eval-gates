// The shared harness: one flow for every domain, so every eval behaves the same way.
//
//   1. parse flags; an unknown flag is refused, never ignored
//   2. self-test: score the shipped reference read and reproduce the pinned numbers, then
//      prove the planted read trips the domain's invented-value gate. A harness that cannot
//      do both gives no verdict at all.
//   3. load the golden set and refuse an "empty room": a set with nothing to catch
//   4. score the candidate's recorded reads
//   5. gates: hard zero from lib/gates.mjs, ratchets from eval/<domain>/baseline.json
//
// Exit codes: 0 pass, 1 a gate failed or the set was refused, 2 the self-test failed or the
// command line was wrong.
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readJsonl, indexBy } from './jsonl.mjs';
import { evaluateGates } from './gates.mjs';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const VALUE_FLAGS = ['--golden', '--results', '--candidate', '--judge-model'];
const BOOL_FLAGS = ['--dry', '--judge', '--self-test'];

export function parseArgs(argv) {
  const opts = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (VALUE_FLAGS.includes(a)) {
      const v = argv[i + 1];
      if (v === undefined || v.startsWith('--')) return { error: `${a} needs a value` };
      opts[a.slice(2).replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = v;
      i++;
    } else if (BOOL_FLAGS.includes(a)) {
      opts[a.slice(2).replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = true;
    } else {
      return { error: `unknown argument ${a}; this harness has no switch that changes a gate` };
    }
  }
  return { opts };
}

const fmt = (v) => (typeof v === 'number' ? String(v) : JSON.stringify(v));

function printMetrics(metrics, indent = '  ') {
  const w = Math.max(...Object.keys(metrics).map((k) => k.length));
  for (const [k, v] of Object.entries(metrics)) console.log(`${indent}${k.padEnd(w)} ${fmt(v)}`);
}

export function domainDir(spec) {
  return join(ROOT, 'eval', spec.name);
}

function loadCases(spec, path) {
  const cases = readJsonl(path);
  spec.validate(cases);
  return cases;
}

async function scoreFile(spec, cases, goldenPath, readsPath) {
  const reads = indexBy(readJsonl(readsPath), spec.readKey, readsPath);
  return spec.score(cases, reads, { goldenPath });
}

// Step 2. Prints "SELF-TEST PASS" or "SELF-TEST FAIL" and returns true or false.
export async function selfTest(spec) {
  const dir = domainDir(spec);
  const rel = (f) => `eval/${spec.name}/${f}`;
  const problems = [];
  let pinned = null;
  try {
    pinned = JSON.parse(readFileSync(join(dir, 'self-test.json'), 'utf8')).pinned;
  } catch {
    problems.push(`${rel('self-test.json')} is missing or not JSON`);
  }
  const nums = pinned && typeof pinned === 'object'
    ? Object.entries(pinned).filter(([, v]) => typeof v === 'number')
    : [];
  if (pinned && nums.length < 2) problems.push(`${rel('self-test.json')} pins ${nums.length} number(s); it needs at least 2`);
  console.log(`self-test: scoring ${rel('reference-read.jsonl')} against ${rel('golden.jsonl')}`);
  if (!problems.length) {
    try {
      const golden = join(dir, 'golden.jsonl');
      const cases = loadCases(spec, golden);
      const trip = spec.tripwires(cases);
      if (trip) problems.push(`the shipped golden set is an empty room: ${trip}`);
      const { metrics } = await scoreFile(spec, cases, golden, join(dir, 'reference-read.jsonl'));
      for (const [k, want] of nums) {
        const got = metrics[k];
        const ok = got === want;
        console.log(`  ${k} ${fmt(got)} (pinned ${want})${ok ? '' : '  MISMATCH'}`);
        if (!ok) problems.push(`${k} is ${fmt(got)}, pinned ${want}`);
      }
      const planted = await scoreFile(spec, cases, golden, join(dir, 'planted-halluc.jsonl'));
      const v = planted.metrics[spec.plantedKey];
      if (typeof v === 'number' && v > 0) {
        console.log(`  planted read: ${spec.plantedKey} ${v}, the detector caught it`);
      } else {
        problems.push(`the planted read did not register any ${spec.plantedKey}`);
      }
    } catch (e) {
      problems.push(e.message);
    }
  }
  if (problems.length) {
    for (const p of problems) console.log(`  problem: ${p}`);
    console.log('SELF-TEST FAIL: no verdict from a harness that cannot reproduce its own numbers');
    return false;
  }
  console.log('SELF-TEST PASS');
  return true;
}

export async function runHarness(spec, argv = process.argv.slice(2)) {
  const { opts, error } = parseArgs(argv);
  if (error) {
    console.error(`refusing: ${error}`);
    return 2;
  }
  // A run that names reads must end in a verdict. A mode flag that would stop before scoring
  // them is refused, so a stray flag in CI cannot turn a gate run into a green step.
  for (const mode of ['selfTest', 'dry']) {
    if (opts[mode] && opts.results) {
      console.error(`refusing: --${mode === 'selfTest' ? 'self-test' : 'dry'} stops before scoring, so it cannot be combined with --results`);
      return 2;
    }
  }
  if (spec.beforeSelfTest) {
    const stop = await spec.beforeSelfTest(opts);
    if (stop) {
      console.error(stop);
      return 2;
    }
  }
  if (!(await selfTest(spec))) return 2;
  if (opts.selfTest || (!opts.golden && !opts.results && !opts.dry && !opts.judge)) return 0;

  const dir = domainDir(spec);
  const goldenPath = opts.golden ? resolve(opts.golden) : join(dir, 'golden.jsonl');
  let cases;
  try {
    cases = loadCases(spec, goldenPath);
  } catch (e) {
    console.log(`refusing: the golden set does not load (${e.message})`);
    return 1;
  }
  const trip = spec.tripwires(cases);
  if (trip) {
    console.log(`refusing: ${trip}`);
    return 1;
  }
  console.log(`${spec.title}: ${cases.length} cases in ${opts.golden ? opts.golden : `eval/${spec.name}/golden.jsonl`}`);
  if (opts.dry) {
    console.log(`dry OK: ${cases.length} cases, ${spec.describe(cases)}`);
    return 0;
  }
  if (!opts.results) {
    console.error('nothing to score: pass --results <reads.jsonl>');
    return 2;
  }
  let scored;
  try {
    scored = await scoreFile(spec, cases, goldenPath, resolve(opts.results));
  } catch (e) {
    console.log(`refusing: the reads do not load or score (${e.message})`);
    return 1;
  }
  console.log(`scorecard for ${opts.results}:`);
  printMetrics(scored.metrics);
  for (const line of scored.detail || []) console.log(`  ${line}`);
  if (spec.afterScore) await spec.afterScore(opts, cases, resolve(opts.results));

  const bpath = join(dir, 'baseline.json');
  const label = `eval/${spec.name}/baseline.json`;
  let baseline = null;
  let unreadable = false;
  if (existsSync(bpath)) {
    try {
      baseline = JSON.parse(readFileSync(bpath, 'utf8'));
    } catch {
      unreadable = true;
    }
  }
  const verdict = evaluateGates(scored.metrics, {
    hardKeys: spec.hardKeys,
    ratchets: spec.ratchets,
    baseline,
    baselineLabel: label,
  });
  for (const n of verdict.notes) console.log(`note: ${n}`);
  if (unreadable) {
    console.log(`GATE FAIL baseline_integrity ${label} is not valid JSON`);
    for (const l of verdict.lines.filter((x) => x.startsWith('GATE FAIL'))) console.log(l);
    return 1;
  }
  for (const l of verdict.lines) console.log(l);
  return verdict.failed ? 1 : 0;
}

export async function main(spec) {
  try {
    process.exitCode = await runHarness(spec);
  } catch (e) {
    console.error(`error: ${e.message}`);
    process.exitCode = 2;
  }
}
