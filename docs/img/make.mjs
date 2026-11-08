// Builds the two README diagrams in this folder: gates.svg and outcomes.svg.
// Node built-ins only. Same script, same bytes: no clock, no randomness, no network.
// Every number drawn here comes from the seed 7 synthetic set in eval/.
// Run from the repo root: node docs/img/make.mjs
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = dirname(fileURLToPath(import.meta.url));

// The palette and type from the visual brand guide. No other colors appear in the output.
const NAVY = '#001B3B';
const SAND = '#EDE7DC';
const TERRACOTTA = '#8C5348';
const OLIVE = '#59591D';
const HEAD = '#F2EDE2';
const SUB = '#D8D3CA';
const SERIF = "Georgia, 'Playfair Display', serif";
const SANS = "-apple-system, 'Helvetica Neue', Helvetica, Arial, sans-serif";

const W = 1200;

const esc = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const num = (v) => (Number.isInteger(v) ? String(v) : v.toFixed(1));

function text(x, y, s, o = {}) {
  const a = [`x="${num(x)}"`, `y="${num(y)}"`, `font-family="${o.serif ? SERIF : SANS}"`, `font-size="${o.size || 18}"`];
  if (o.bold) a.push('font-weight="700"');
  if (o.anchor) a.push(`text-anchor="${o.anchor}"`);
  a.push(`fill="${o.fill || SUB}"`);
  return `<text ${a.join(' ')}>${esc(s)}</text>`;
}

function rect(x, y, w, h, o = {}) {
  const a = [`x="${num(x)}"`, `y="${num(y)}"`, `width="${num(w)}"`, `height="${num(h)}"`];
  if (o.rx) a.push(`rx="${o.rx}"`);
  a.push(`fill="${o.fill || 'none'}"`);
  if (o.stroke) a.push(`stroke="${o.stroke}"`, `stroke-width="${o.sw || 1}"`);
  return `<rect ${a.join(' ')}/>`;
}

// A straight arrow drawn as two filled polygons (shaft and head), no strokes or markers, so
// every renderer draws it the same.
function arrow(x1, y1, x2, y2, o = {}) {
  const fill = o.stroke || SAND;
  const head = o.head || 12;
  const sw = o.sw || 2;
  const len = Math.hypot(x2 - x1, y2 - y1);
  const ux = (x2 - x1) / len;
  const uy = (y2 - y1) / len;
  const bx = x2 - ux * head;
  const by = y2 - uy * head;
  const nx = -uy;
  const ny = ux;
  const pts = (arr) => arr.map(([x, y]) => `${num(x)},${num(y)}`).join(' ');
  const s = sw / 2;
  return [
    `<polygon points="${pts([[x1 + nx * s, y1 + ny * s], [bx + nx * s, by + ny * s], [bx - nx * s, by - ny * s], [x1 - nx * s, y1 - ny * s]])}" fill="${fill}"/>`,
    `<polygon points="${pts([[x2, y2], [bx + nx * head * 0.5, by + ny * head * 0.5], [bx - nx * head * 0.5, by - ny * head * 0.5]])}" fill="${fill}"/>`,
  ];
}

function svg(h, title, desc, body) {
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${h}" viewBox="0 0 ${W} ${h}" role="img" aria-labelledby="title desc">`,
    `<title id="title">${esc(title)}</title>`,
    `<desc id="desc">${esc(desc)}</desc>`,
    rect(0, 0, W, h, { fill: SAND }),
    rect(1, 1, W - 2, h - 2, { fill: NAVY }),
    ...body,
    '</svg>',
    '',
  ].join('\n');
}


// An outlined box is two stacked filled rects, not a stroke, so every renderer draws the border.
function outline(x, y, w, h) {
  return [rect(x, y, w, h, { rx: 4, fill: SAND }), rect(x + 2, y + 2, w - 4, h - 4, { rx: 3, fill: NAVY })];
}

function box(x, y, w, h, lines, o = {}) {
  const out = o.fill ? [rect(x, y, w, h, { rx: 4, fill: o.fill })] : outline(x, y, w, h);
  const fg = o.fg || HEAD;
  const top = y + h / 2 - ((lines.length - 1) * 24) / 2 + 6;
  lines.forEach((l, i) => {
    out.push(text(x + w / 2, top + i * 24, l, { size: i === 0 ? 20 : 17, bold: i === 0, fill: i === 0 ? fg : o.sub || SUB, anchor: 'middle' }));
  });
  return out;
}

function gates() {
  const H = 500;
  const b = [];
  b.push(text(40, 56, 'A model or prompt change ships only if every gate holds', { serif: true, size: 30, fill: HEAD }));
  b.push(text(40, 88, 'Five steps, in this order. A refusal at any step stops the run before a verdict.', { size: 18 }));
  const steps = [
    ['golden set', 'generated from', 'a fixed seed'],
    ['self-test', 'reproduce the', 'pinned numbers'],
    ['score the read', 'recorded reads,', 'one line per case'],
    ['hard-zero gates', 'invented values: 0', 'a constant in code'],
    ['ratchet gates', 'baseline.json,', 'only tightens'],
  ];
  const refusals = [
    ['refuses a set with', 'no money in it, or', 'no blank to invent on'],
    ['SELF-TEST FAIL:', 'no verdict at all'],
    ['refuses an unknown', 'flag; no switch', 'changes a gate'],
    ['a baseline that sets', 'one fails the run'],
    ['refuses to raise a', 'floor on a failing run'],
  ];
  const W0 = 40;
  const BW = 196;
  const GAP = 35;
  steps.forEach((s, i) => {
    const x = W0 + i * (BW + GAP);
    b.push(...box(x, 120, BW, 108, s));
    if (i < steps.length - 1) b.push(...arrow(x + BW + 4, 174, x + BW + GAP - 4, 174, { stroke: TERRACOTTA, sw: 3, head: 12 }));
    for (let y = 230; y < 252; y += 8) b.push(rect(x + BW / 2 - 1, y, 2, 4, { fill: SUB }));
    const r = refusals[i];
    b.push(rect(x, 252, BW, 96, { rx: 4, fill: TERRACOTTA }));
    const top = 300 - ((r.length - 1) * 22) / 2 + 5;
    r.forEach((l, j) => b.push(text(x + BW / 2, top + j * 22, l, { size: 16, fill: HEAD, anchor: 'middle' })));
  });
  b.push(rect(40, 384, 540, 72, { rx: 4, fill: OLIVE }));
  b.push(text(310, 416, 'GATE PASS', { size: 22, bold: true, fill: HEAD, anchor: 'middle' }));
  b.push(text(310, 442, 'every hard gate at zero, every ratchet held', { size: 17, fill: HEAD, anchor: 'middle' }));
  b.push(...outline(620, 384, 540, 72));
  b.push(text(890, 416, 'GATE FAIL <key>', { size: 22, bold: true, fill: HEAD, anchor: 'middle' }));
  b.push(text(890, 442, 'one line per failed gate, exit 1, it does not ship', { size: 17, anchor: 'middle' }));
  return svg(H, 'The gate pipeline',
    'Five steps in order: a generated golden set, a self-test that must reproduce its pinned numbers, scoring the recorded reads, hard-zero gates fixed in code, and ratchet gates from a baseline that only tightens; each step can refuse, and the run ends in GATE PASS or one GATE FAIL line per failed gate.',
    b);
}

function outcomes() {
  const H = 470;
  const b = [];
  b.push(text(40, 56, 'Four outcomes for every field. Only a miss is safe.', { serif: true, size: 28, fill: HEAD }));
  b.push(text(40, 88, 'Totals in the seed 7 receipt set: 31 receipts with a total, 5 without one.', { size: 18 }));
  const X = [300, 590, 880];
  const CW = 270;
  ['read equals the truth', 'read differs', 'read is blank'].forEach((h, i) => {
    b.push(text(X[i] + CW / 2, 136, h, { size: 18, bold: true, fill: HEAD, anchor: 'middle' }));
  });
  b.push(text(270, 210, 'truth has a value', { size: 18, bold: true, fill: HEAD, anchor: 'end' }));
  b.push(text(270, 236, '31 totals', { size: 17, anchor: 'end' }));
  b.push(text(270, 340, 'truth is blank', { size: 18, bold: true, fill: HEAD, anchor: 'end' }));
  b.push(text(270, 366, '5 totals', { size: 17, anchor: 'end' }));
  b.push(...box(X[0], 156, CW, 110, ['match', '27 in the reference read'], { fill: OLIVE }));
  b.push(...box(X[1], 156, CW, 110, ['wrong', '2: a confident misread', 'ratchet: max_total_wrong'], { fill: TERRACOTTA }));
  b.push(...box(X[2], 156, CW, 110, ['miss', '2: a human fills it in', 'counted, never hidden']));
  b.push(...box(X[1], 286, CW, 110, ['invented', '0 in the reference read', '5 in the planted read'], { fill: SAND, fg: NAVY, sub: NAVY }));
  b.push(...box(X[2], 286, CW, 110, ['match', '5: blank left blank'], { fill: OLIVE }));
  b.push(text(X[0] + CW / 2, 346, 'a blank has no value to equal', { size: 16, anchor: 'middle' }));
  b.push(text(40, 438, 'The invented cell is a hard-zero gate: total_halluc must be 0, and no file, flag or setting can raise it.', { size: 18, fill: HEAD }));
  return svg(H, 'Four outcomes per field',
    'For the 31 receipts with a total, the reference read has 27 matches, 2 wrong totals and 2 blanks; for the 5 receipts without a total it invents none, while the planted read invents 5, which the hard-zero gate total_halluc catches.',
    b);
}

writeFileSync(join(OUT, 'gates.svg'), gates());
writeFileSync(join(OUT, 'outcomes.svg'), outcomes());
console.log('wrote gates.svg and outcomes.svg');
