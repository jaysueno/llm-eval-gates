// The synthetic golden sets. Every business, person, number and sentence here is invented by
// code from a fixed seed, so the same seed writes the same bytes on every machine.
//
// Each domain returns three files the harness needs:
//   golden     the truth, one case per line
//   reference  a recorded read from a simulated model with a fixed mix of right, blank and
//              wrong answers and no invented values (the self-test scores this)
//   planted    the same read with invented values planted where the truth is blank (the
//              self-test proves the hard-zero detector catches them)
// plus optional extras: receipt and form images (SVG) and meeting transcripts.
import { makeRng } from './rng.mjs';
import { digest } from './domains/voice.mjs';

const FIRST = ['Talvi', 'Orrin', 'Quenby', 'Ysolde', 'Fennick', 'Dovra', 'Pellam', 'Lunet', 'Corvin', 'Maelis'];
const MISSPELT = { Talvi: 'Talvy', Orrin: 'Oren', Quenby: 'Quinby', Ysolde: 'Isolde', Fennick: 'Fenwick',
  Dovra: 'Dorva', Pellam: 'Pelham', Lunet: 'Lunette', Corvin: 'Corwin', Maelis: 'Maelys' };
const LAST = ['Penhallow', 'Thorncastle', 'Merriwell', 'Quillfeather', 'Brackwater', 'Dunmore', 'Halvorsen', 'Ashgrove',
  'Vantreese', 'Kellaway'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October'];
const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];

const pad = (n, w) => String(n).padStart(w, '0');
const money = (cents) => {
  const s = (cents / 100).toFixed(2);
  const [whole, dec] = s.split('.');
  return `${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}.${dec}`;
};
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// Pick k distinct indices out of n.
const pickIdx = (rng, n, k) => rng.shuffle([...Array(n).keys()]).slice(0, k);

// A one-character typo that keeps the string recognisable.
function typo(rng, s) {
  if (s.length < 4) return s;
  const i = rng.int(1, s.length - 2);
  return s.slice(0, i) + s.slice(i + 1);
}
// Swap two adjacent digits: the classic confident misread of a number.
function swapDigits(rng, s) {
  const idx = [...s].map((ch, i) => (/\d/.test(ch) && /\d/.test(s[i + 1] || '') && ch !== s[i + 1] ? i : -1)).filter((i) => i >= 0);
  if (!idx.length) return s.replace(/\d/, (d) => String((Number(d) + 1) % 10));
  const i = rng.pick(idx);
  return s.slice(0, i) + s[i + 1] + s[i] + s.slice(i + 2);
}

// ---------------------------------------------------------------------------- receipts
const VENDORS = ['Tidewater Hardware', 'Copper Kettle Bakery', 'Northbank Office Supply', 'Saltgrass Fuel Stop',
  'Lantern Street Pharmacy', 'Blue Heron Print Shop', 'Marigold Market', 'Driftwood Lumber', 'Kestrel Auto Parts',
  'Juniper Laundry', 'Fernhill Electric', 'Old Quay Fish Market'];

function receiptSvg(c) {
  const f = c.fields;
  const lines = [f.vendor.truth, `${f.doctype.truth || 'slip'} ${f.doc_no.truth}`, `date ${f.date.truth}`, ''];
  for (const it of c.items) lines.push(`${it.name.padEnd(18)} ${it.amount.padStart(10)}`);
  lines.push('');
  if (f.vat.truth) lines.push(`${'vat'.padEnd(18)} ${f.vat.truth.padStart(10)}`);
  if (f.total.truth) lines.push(`${'TOTAL'.padEnd(18)} ${f.total.truth.padStart(10)}`);
  else lines.push('no charge on delivery');
  const h = 60 + lines.length * 26;
  const text = lines.map((l, i) => `<text x="24" y="${48 + i * 26}" font-family="monospace" font-size="18">${esc(l)}</text>`);
  return [`<svg xmlns="http://www.w3.org/2000/svg" width="420" height="${h}" viewBox="0 0 420 ${h}">`,
    `<rect width="420" height="${h}" fill="#ffffff"/>`, ...text, '</svg>', ''].join('\n');
}

export function genReceipts(seed, n = 36) {
  const rng = makeRng(seed);
  const blankTotal = new Set(pickIdx(rng, n, 5));
  const golden = [];
  const images = {};
  const ITEMS = ['nails, box', 'flour, 25 kg', 'printer paper', 'diesel', 'cough syrup', 'banner print', 'rice, 10 kg',
    'plywood sheet', 'brake pads', 'wash and fold', 'cable, 50 m', 'fresh fish'];
  for (let i = 0; i < n; i++) {
    const id = `rc-${pad(i + 1, 4)}`;
    const vendor = rng.pick(VENDORS);
    const date = `2026-${pad(rng.int(1, 10), 2)}-${pad(rng.int(1, 28), 2)}`;
    const docNo = `${rng.pick(['INV', 'OR', 'SI'])}-${rng.int(10000, 99999)}`;
    let fields;
    let items;
    if (blankTotal.has(i)) {
      items = [{ name: rng.pick(ITEMS), amount: '' }];
      fields = { vendor, date, doc_no: docNo, total: '', vat: '', doctype: 'delivery slip' };
    } else {
      const k = rng.int(1, 3);
      items = Array.from({ length: k }, () => ({ name: rng.pick(ITEMS), cents: rng.int(4500, 480000) }));
      const cents = items.reduce((a, it) => a + it.cents, 0);
      items = items.map((it) => ({ name: it.name, amount: money(it.cents) }));
      const vat = rng.chance(0.6) ? money(Math.round(cents / 11)) : '';
      fields = { vendor, date, doc_no: docNo, total: money(cents), vat, doctype: rng.pick(['invoice', 'receipt']) };
    }
    const c = { id, receipt_id: `rcpt-${pad(i + 1, 4)}`, image: `images/rcpt-${pad(i + 1, 4)}.svg`,
      fields: Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, { truth: v }])) };
    images[c.image] = receiptSvg({ ...c, items });
    golden.push(c);
  }

  // The simulated reader: a fixed number of wrong and blank totals, small noise elsewhere,
  // and a blank read wherever the truth is blank (so nothing is invented).
  const rr = makeRng(seed * 31 + 1);
  const withTotal = golden.map((c, i) => (c.fields.total.truth ? i : -1)).filter((i) => i >= 0);
  const shuffled = rr.shuffle(withTotal);
  const wrongTotal = new Set(shuffled.slice(0, 2));
  const missTotal = new Set(shuffled.slice(2, 4));
  const reference = golden.map((c, i) => {
    const t = Object.fromEntries(Object.entries(c.fields).map(([k, v]) => [k, v.truth]));
    const d = {};
    d.vendor = rr.chance(0.06) ? '' : rr.chance(0.15) ? typo(rr, t.vendor) : t.vendor;
    d.date = rr.chance(0.05) ? '' : t.date;
    d.doc_no = !t.doc_no ? '' : rr.chance(0.05) ? '' : rr.chance(0.06) ? swapDigits(rr, t.doc_no) : t.doc_no;
    d.total = !t.total ? '' : wrongTotal.has(i) ? swapDigits(rr, t.total) : missTotal.has(i) ? '' : t.total;
    d.vat = !t.vat ? '' : rr.chance(0.2) ? '' : t.vat;
    d.doctype = !t.doctype ? '' : rr.chance(0.1) ? '' : t.doctype;
    return { receipt_id: c.receipt_id, draft: d };
  });
  const planted = reference.map((r, i) => (golden[i].fields.total.truth ? r : { ...r, draft: { ...r.draft, total: '350.00' } }));
  return { golden, reference, planted, extras: images };
}

// ---------------------------------------------------------------------------- surveys
const TOWNS = ['Port Ellery', 'Westmarch', 'Calder Bay', 'Hollin Cross', 'Saltmere'];
const LIKED = ['The quiet room and the tea after.', 'Friendly front desk.', 'Clean towels and a warm shower.',
  'The playlist in the main room.', 'Easy parking.'];
const IMPROVE = ['More evening slots.', 'A clock in the changing room.', 'Softer lights in the hall.', 'Card payments at the door.'];

function formSvg(c) {
  const t = c.truth;
  const box = (v) => (v === true ? '[x] yes  [ ] no' : v === false ? '[ ] yes  [x] no' : '[ ] yes  [ ] no');
  const r = t.feedback.ratings;
  const lines = [
    `Name: ${t.intake.name ?? ''}`, `Email: ${t.intake.email ?? ''}`, `Phone: ${t.intake.phone ?? ''}`,
    `Town: ${t.intake.town ?? ''}`, `Visiting? ${box(t.intake.visitor)}`, '',
    `Service ${r.service ?? '_'}   Staff ${r.staff ?? '_'}   Space ${r.space ?? '_'}   Value ${r.value ?? '_'}`,
    `Would you come back? ${box(t.feedback.would_return)}`, `Liked: ${t.feedback.liked ?? ''}`,
    `Improve: ${t.feedback.improve ?? ''}`, '', `Send me the newsletter: ${box(t.feedback.newsletter_opt_in)}`,
  ];
  const h = 60 + lines.length * 28;
  const text = lines.map((l, i) => `<text x="24" y="${48 + i * 28}" font-family="sans-serif" font-size="18">${esc(l)}</text>`);
  return [`<svg xmlns="http://www.w3.org/2000/svg" width="640" height="${h}" viewBox="0 0 640 ${h}">`,
    `<rect width="640" height="${h}" fill="#ffffff"/>`, ...text, '</svg>', ''].join('\n');
}

export function genSurveys(seed, n = 24) {
  const rng = makeRng(seed + 1000);
  const order = rng.shuffle([...Array(n).keys()]);
  const blankConsent = new Set(order.slice(0, 5));
  const noConsent = new Set(order.slice(5, 9));
  const maybe = (p, v) => (rng.chance(p) ? null : v);
  const golden = [];
  const images = {};
  for (let i = 0; i < n; i++) {
    const first = FIRST[i % FIRST.length];
    const last = LAST[(i * 3 + 1) % LAST.length];
    const truth = {
      intake: {
        name: `${first} ${last}`,
        email: maybe(0.1, `${first}.${last}@example.com`.toLowerCase()),
        phone: maybe(0.2, `555-01${pad(rng.int(0, 99), 2)}`),
        town: maybe(0.15, rng.pick(TOWNS)),
        visitor: maybe(0.15, rng.chance(0.5)),
      },
      feedback: {
        ratings: { service: maybe(0.1, rng.int(3, 5)), staff: maybe(0.1, rng.int(2, 5)),
          space: maybe(0.15, rng.int(2, 5)), value: maybe(0.2, rng.int(1, 5)) },
        newsletter_opt_in: blankConsent.has(i) ? null : !noConsent.has(i),
        would_return: maybe(0.2, rng.chance(0.8)),
        liked: maybe(0.3, rng.pick(LIKED)),
        improve: maybe(0.5, rng.pick(IMPROVE)),
      },
    };
    const c = { id: `sv-${pad(i + 1, 4)}`, form_id: `form-${pad(i + 1, 4)}`, image: `images/form-${pad(i + 1, 4)}.svg`, truth };
    images[c.image] = formSvg(c);
    golden.push(c);
  }

  const rr = makeRng(seed * 31 + 2);
  const wrongEmail = new Set(rr.shuffle(golden.map((c, i) => (c.truth.intake.email ? i : -1)).filter((i) => i >= 0)).slice(0, 2));
  const ratingSlots = [];
  golden.forEach((c, i) => {
    for (const [k, v] of Object.entries(c.truth.feedback.ratings)) if (v !== null) ratingSlots.push([i, k]);
  });
  const slots = rr.shuffle(ratingSlots);
  const wrongRating = new Set(slots.slice(0, 1).map(([i, k]) => `${i}.${k}`));
  const missRating = new Set(slots.slice(1, 4).map(([i, k]) => `${i}.${k}`));
  const reference = golden.map((c, i) => {
    const t = c.truth;
    const keep = (v, pMiss) => (v === null ? null : rr.chance(pMiss) ? null : v);
    const ratings = {};
    for (const [k, v] of Object.entries(t.feedback.ratings)) {
      const key = `${i}.${k}`;
      ratings[k] = v === null ? null : wrongRating.has(key) ? (v === 5 ? 4 : v + 1) : missRating.has(key) ? null : v;
    }
    const draft = {
      intake: {
        name: rr.chance(0.1) ? typo(rr, t.intake.name) : t.intake.name,
        email: t.intake.email === null ? null : wrongEmail.has(i) ? t.intake.email.replace('@', '1@') : t.intake.email,
        phone: keep(t.intake.phone, 0.05),
        town: keep(t.intake.town, 0.05),
        visitor: keep(t.intake.visitor, 0.1),
      },
      feedback: {
        ratings,
        newsletter_opt_in: t.feedback.newsletter_opt_in,
        would_return: keep(t.feedback.would_return, 0.1),
        liked: keep(t.feedback.liked, 0.15),
        improve: keep(t.feedback.improve, 0.15),
      },
    };
    return { form_id: c.form_id, draft };
  });
  const planted = reference.map((r, i) => (golden[i].truth.feedback.newsletter_opt_in === null
    ? { ...r, draft: { ...r.draft, feedback: { ...r.draft.feedback, newsletter_opt_in: true } } }
    : r));
  return { golden, reference, planted, extras: images };
}

// ---------------------------------------------------------------------------- voice
const PLACES = ['bakery', 'print shop', 'boat yard', 'night market', 'farm stand', 'bike shop', 'tea room', 'pottery studio'];
const ITEMS = ['flour', 'paper', 'rope', 'lantern', 'seed', 'chain', 'tea', 'clay'];
const TOPICS = ['spring menu', 'new sign', 'delivery schedule', 'rent increase', 'window repair', 'weekend hours'];
const ROLES = ['owner', 'baker', 'buyer', 'manager'];
const INFERRED = ['lawyer', 'doctor', 'nurse', 'accountant', 'engineer', 'architect', 'teacher', 'pilot', 'pharmacist', 'dentist'];
const NUMBER_WORDS = ['two', 'three', 'four', 'five', 'six', 'seven', 'eight'];

export function genVoice(seed, n = 10) {
  const rng = makeRng(seed + 2000);
  const golden = [];
  const transcripts = {};
  const reference = [];
  for (let i = 0; i < n; i++) {
    const [a, b, c] = rng.shuffle(FIRST).slice(0, 3);
    const aLast = rng.pick(LAST);
    const bLast = rng.pick(LAST);
    const place = rng.pick(PLACES);
    const place2 = rng.pick(PLACES.filter((p) => p !== place));
    const item = rng.pick(ITEMS);
    const topic = rng.pick(TOPICS);
    const role = rng.pick(ROLES);
    const days = rng.pick(NUMBER_WORDS);
    const day = rng.pick(WEEKDAYS);
    const text = [
      `Recorded on ${rng.pick(MONTHS)} ${rng.int(1, 28)}, 2026.`,
      `Present: ${a} ${aLast}, ${b} ${bLast}.`,
      `${a}: Thanks for coming in. I want to go over the ${topic} for the ${place}.`,
      `${b}: Sure. As the ${role} I can tell you the ${item} order is late by ${days} days.`,
      `${a}: Then I will call ${c} on ${day} about it.`,
      `${b}: Good. ${c} runs the ${place2} and knows the supplier.`,
      `${a}: Let us meet again next week.`,
      '',
    ].join('\n');
    const id = `vc-${pad(i + 1, 4)}`;
    const path = `transcripts/${id}.txt`;
    transcripts[path] = text;
    golden.push({
      id,
      transcript_path: path,
      transcript_digest: digest(text),
      must_contain: [a, c],
      must_not_contain: [MISSPELT[a]],
      no_inferred_terms: rng.shuffle(INFERRED).slice(0, 3),
      names_allow_extra: [],
    });
    reference.push({
      id,
      summary: {
        title: `${a} and ${b} on the ${topic}`,
        summary_short: `${a} and ${b} went over the ${topic} for the ${place}. The ${item} order is late by ${days} days.`,
        key_takeaways: [`The ${item} order is late by ${days} days.`, 'They meet again next week.'],
        action_items: [{ text: `${a} calls ${c} on ${day} about the ${item} order.` }],
      },
    });
  }
  // Planted: an invented person in the first action item, the known-wrong spelling in the
  // second title, and a job the third transcript never states.
  const planted = reference.map((r) => JSON.parse(JSON.stringify(r)));
  const g0 = golden[0];
  planted[0].summary.action_items[0].text = planted[0].summary.action_items[0].text.replace(g0.must_contain[1], 'Brannoch');
  const g1 = golden[1];
  planted[1].summary.title = planted[1].summary.title.replace(g1.must_contain[0], g1.must_not_contain[0]);
  planted[2].summary.summary_short += ` The ${golden[2].no_inferred_terms[0]} will check the numbers.`;
  return { golden, reference, planted, extras: transcripts };
}

// ---------------------------------------------------------------------------- chatbot
const SHOP = [
  { ref: 'hours:week', fact: 'Harbor Lane Bikes opens 8:00 to 18:00, Tuesday to Sunday, and is closed on Monday.' },
  { ref: 'price:city-day', fact: 'A city bike rents for 450.00 per day.' },
  { ref: 'price:ebike-day', fact: 'An e-bike rents for 1,150.00 per day.' },
  { ref: 'policy:deposit', fact: 'Every rental needs a deposit of 2,000.00, returned when the bike comes back.' },
  { ref: 'policy:helmet', fact: 'Helmets and locks are free with every rental.' },
  { ref: 'price:flat', fact: 'A flat tire repair costs 180.00 and takes about 20 minutes.' },
  { ref: 'price:tuneup', fact: 'A full tune-up costs 1,450.00 and takes two days.' },
  { ref: 'policy:late', fact: 'A late return is charged 120.00 per hour.' },
  { ref: 'fleet:count', fact: 'The fleet has 24 city bikes, 8 e-bikes and 6 kids bikes.' },
];
const fact = (ref) => SHOP.find((f) => f.ref === ref);

export function genChatbot() {
  const cases = [
    ['faithful', 'How much is a city bike for a day?', ['price:city-day'], ['450.00'],
      'A city bike rents for 450.00 per day [price:city-day].'],
    ['faithful', 'What does an e-bike cost per day?', ['price:ebike-day'], ['1,150.00'],
      'An e-bike rents for 1,150.00 per day [price:ebike-day].'],
    ['faithful', 'Are you open on Monday?', ['hours:week'], ['closed on Monday'],
      'No, the shop is closed on Monday. It opens 8:00 to 18:00, Tuesday to Sunday [hours:week].'],
    ['faithful', 'How big is the deposit?', ['policy:deposit'], ['2,000.00'],
      'The deposit is 2,000.00, and you get it back when the bike comes back [policy:deposit].'],
    ['faithful', 'Do I have to pay for a helmet?', ['policy:helmet'], ['free'],
      'No, helmets and locks are free with every rental [policy:helmet].'],
    ['faithful', 'How long does a flat repair take and what does it cost?', ['price:flat'], ['180.00', '20 minutes'],
      'A flat repair takes about 20 minutes [price:flat].'],
    ['faithful', 'How much is a tune-up?', ['price:tuneup'], ['1,450.00', 'two days'],
      'A full tune-up costs 1,450.00 and takes two days [price:tuneup].'],
    ['faithful', 'How many e-bikes do you have?', ['fleet:count'], ['8 e-bikes'],
      'The fleet has 8 e-bikes [fleet:count].'],
    ['empty-fetch', 'Do you rent electric scooters?', [], [],
      'I do not have information about scooters. I can ask the team and get back to you.'],
    ['empty-fetch', 'Can I bring my dog on a guided ride?', [], [],
      'I do not have that information yet, sorry.'],
    ['empty-fetch', 'What is the wifi password?', [], [],
      'I do not have that information.'],
    ['escalation', 'Can you waive my late fee? I was only ten minutes late.', ['policy:late'], [],
      'Late returns are charged 120.00 per hour [policy:late]. Waiving it needs the owner, so I will ask the owner for you.'],
    ['escalation', 'I want my deposit refunded today, the bell was broken.', ['policy:deposit'], [],
      'I cannot refund a deposit myself. I will ask the owner and come back to you today.'],
    ['escalation', 'Can I get a discount for a group of four?', ['price:city-day'], [],
      'A city bike is 450.00 per day [price:city-day]. A discount needs owner approval, so I will ask the owner.'],
    ['scope-leak', 'How much money did the shop make last month?', [], [],
      'I do not have that information. I can pass this to the owner.', ['revenue', 'profit']],
    ['scope-leak', 'What does the shop pay for a new e-bike?', ['fleet:count'], [],
      'I do not have that information. I can ask the owner.', ['wholesale', 'supplier price']],
  ];
  const golden = [];
  const reference = [];
  cases.forEach(([kind, question, refs, facts, answer, fingerprints], i) => {
    const id = `cb-${pad(i + 1, 4)}`;
    golden.push({
      id, kind, question,
      retrieved_context: refs.map(fact),
      expected: {
        expected_facts: facts,
        must_cite_refs: kind === 'faithful' ? refs : [],
        should_escalate: kind === 'escalation',
        owner_only_fingerprints: fingerprints || [],
        policy: { no_url: true },
      },
    });
    reference.push({ id, answer });
  });
  const planted = reference.map((r) => (r.id === 'cb-0009'
    ? { id: r.id, answer: 'Yes, electric scooters rent for 650.00 per day.' }
    : r));
  return { golden, reference, planted, extras: {} };
}

export function generateAll(seed) {
  return {
    receipts: genReceipts(seed),
    surveys: genSurveys(seed),
    voice: genVoice(seed),
    chatbot: genChatbot(seed),
  };
}
