// Shared test helpers: run a script, and make a throwaway copy of the repo to break things in.
import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

export function run(args, { cwd = ROOT, env = {} } = {}) {
  const r = spawnSync(process.execPath, args, { cwd, env: { ...process.env, ...env }, encoding: 'utf8', timeout: 60000 });
  return { code: r.status, out: `${r.stdout}${r.stderr}` };
}

export function scratchCopy() {
  const dir = mkdtempSync(join(tmpdir(), 'llm-eval-gates-test-'));
  for (const sub of ['lib', 'scripts', 'eval']) cpSync(join(ROOT, sub), join(dir, sub), { recursive: true });
  return { dir, done: () => rmSync(dir, { recursive: true, force: true }) };
}

export function scratchDir() {
  const dir = mkdtempSync(join(tmpdir(), 'llm-eval-gates-tmp-'));
  return { dir, done: () => rmSync(dir, { recursive: true, force: true }) };
}
