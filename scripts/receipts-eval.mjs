#!/usr/bin/env node
// Receipt extraction eval. No arguments: self-test only.
//   node scripts/receipts-eval.mjs --results reads.jsonl        score recorded reads
//   node scripts/receipts-eval.mjs --golden set.jsonl --dry     check a golden set loads
// A read is one JSON line: {"receipt_id": "...", "draft": {"vendor": "...", "total": "...", ...}}
import { main } from '../lib/harness.mjs';
import { receipts } from '../lib/domains/receipts.mjs';

await main(receipts);
