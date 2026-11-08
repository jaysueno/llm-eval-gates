#!/usr/bin/env node
// Question-answering eval. No arguments: self-test only.
//   node scripts/chatbot-eval.mjs --results answers.jsonl               Tier A, gates
//   node scripts/chatbot-eval.mjs --results answers.jsonl --judge \
//     --candidate <model id> --judge-model <model id>                   plus the advisory judge
// The judge only calls a model when JUDGE_URL is set (an OpenAI-compatible endpoint), and it
// refuses a judge from the candidate's own model family, or of a family it cannot identify.
// An answer is one JSON line: {"id": "...", "answer": "..."}
import { main } from '../lib/harness.mjs';
import { chatbot } from '../lib/domains/chatbot.mjs';

await main(chatbot);
