# AGENTS.md

Instructions for an AI agent working in this repo.

## Install

```bash
npm ci
```

Node 20 or newer (CI tests 20 and 22). There are no dependencies; `npm ci` only checks the
lockfile.

## Run

```bash
npm run self-test                                              # every harness proves itself
node scripts/receipts-eval.mjs --results <reads.jsonl>         # score recorded reads
node scripts/generate-golden.mjs --seed 7 --out <dir>          # write a golden set
```

## Test

```bash
npm test
```

CI runs `npm run self-test` and the same `npm test` (`.github/workflows/ci.yml`). Every test is
offline. The judge test stubs `fetch`; nothing calls a model.

## Where you may edit

- `lib/`, `scripts/`, `test/`: code and its tests. A new behavior needs a new test.
- `eval/`: only by running `npm run golden`. Never hand-edit a golden file, a reference read or
  a planted read.
- `eval/<domain>/baseline.json`: only through `scripts/rebaseline.mjs`, in the same change as the
  improvement it records. `--init` writes a first baseline for a new domain and refuses when one
  exists. Never delete a baseline: a missing one fails every run.
- `eval/<domain>/self-test.json`: only when a deliberate change to the scorer or the set moves the
  numbers, and the change says why.
- `README.md`, `AGENTS.md`: plain technical prose.

## Where you may not edit

- The first section of `README.md` (the story under the title) is the owner's words. Leave it.
- `LICENSE`.

## Never

- Never raise a gate to make a run pass. Fix the read or record the regression.
- Never put a hard-zero key in a baseline file, read a gate limit from the environment, or add a
  flag that changes a gate.
- Never weaken a self-test, a planted read or an empty-room check.
- Never add real data: no real receipts, forms, transcripts, names, emails, phone numbers or
  addresses, not even in a test. The generator invents everything from a seed.
- Never write a numeric loopback address; use `localhost`.
- Never use em dashes in prose.

## Before each commit

Run `npm run self-test` and `npm test`. Both must pass.
