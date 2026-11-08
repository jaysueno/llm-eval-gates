// JSONL in and out. One JSON object per line; blank lines are skipped.
import { readFileSync } from 'node:fs';

export function readJsonl(path) {
  const rows = [];
  const lines = readFileSync(path, 'utf8').split('\n');
  lines.forEach((line, i) => {
    if (!line.trim()) return;
    try {
      rows.push(JSON.parse(line));
    } catch (e) {
      throw new Error(`${path} line ${i + 1} is not valid JSON (${e.message})`);
    }
  });
  return rows;
}

export const toJsonl = (rows) => rows.map((r) => JSON.stringify(r)).join('\n') + '\n';

// Index a list of reads by an id field. A duplicate id is an error: two reads for one case
// would make the score depend on which one wins.
export function indexBy(rows, key, label) {
  const out = new Map();
  for (const r of rows) {
    const id = r && r[key];
    if (typeof id !== 'string' || !id) throw new Error(`${label}: a row has no "${key}"`);
    if (out.has(id)) throw new Error(`${label}: "${key}" ${id} appears twice`);
    out.set(id, r);
  }
  return out;
}

export const get = (obj, path) =>
  path.split('.').reduce((o, k) => (o != null && typeof o === 'object' ? o[k] : undefined), obj);
