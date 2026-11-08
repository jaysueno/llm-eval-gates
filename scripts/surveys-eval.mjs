#!/usr/bin/env node
// Survey form eval. No arguments: self-test only.
//   node scripts/surveys-eval.mjs --results reads.jsonl
//   node scripts/surveys-eval.mjs --golden set.jsonl --dry
// A read is one JSON line: {"form_id": "...", "draft": {"intake": {...}, "feedback": {...}}}
import { main } from '../lib/harness.mjs';
import { surveys } from '../lib/domains/surveys.mjs';

await main(surveys);
