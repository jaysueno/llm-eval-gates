#!/usr/bin/env node
// Voice summary eval. No arguments: self-test only.
//   node scripts/voice-eval.mjs --results summaries.jsonl
//   node scripts/voice-eval.mjs --golden set.jsonl --dry
// A read is one JSON line: {"id": "...", "summary": {"title": "...", "summary_short": "...",
// "key_takeaways": [...], "action_items": [{"text": "..."}]}}
import { main } from '../lib/harness.mjs';
import { voice } from '../lib/domains/voice.mjs';

await main(voice);
