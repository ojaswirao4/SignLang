// Offline accuracy test for camera matching (public/js/islmatch.js): each sign in test_signs/ (a
// different CISLR video of the word, often another signer) is matched against the app's ISL signs,
// as if it had been signed to the camera. Reports top-1 / top-3 accuracy.
// Usage: node eval_camera.mjs [vocabulary size, default 400]
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const SIGNS = join(HERE, '..', '..', 'public', 'signs', 'isl');
const { rank, CFG, toBody } = await import(pathToFileURL(join(HERE, '..', '..', 'public', 'js', 'islmatch.js')).href);
const N = +(process.argv[2] || 400);
// optional weight overrides to try, e.g. '{"z":0,"path":3}'; QUIET=1 prints only the totals
Object.assign(CFG, JSON.parse(process.env.CFG_JSON || process.argv[3] || '{}')); // (CFG_JSON: Windows PowerShell drops the quotes from arguments)

// the camera's vocabulary: the words Meera uses most (camera_vocab.json, from priority.py), that are converted
const order = JSON.parse(readFileSync(join(SIGNS, 'camera_vocab.json'), 'utf8'));
const index = new Set(JSON.parse(readFileSync(join(SIGNS, 'index.json'), 'utf8')));
const tests = readdirSync(join(HERE, 'test_signs')).filter((f) => f.endsWith('.json') && f !== 'index.json').map((f) => f.slice(0, -5));
const vocabToks = [...new Set([...tests, ...order])].filter((t) => index.has(t)).slice(0, N);
const load = (f) => { const d = JSON.parse(readFileSync(f, 'utf8')); return toBody(d.frames, d.shoulderW); }; // (all at Meera's scale)
const templates = Object.fromEntries(vocabToks.map((t) => [t, load(join(SIGNS, t + '.json'))]));
console.log(`vocabulary: ${vocabToks.length} signs; test signs: ${tests.length}`);

let top1 = 0, top3 = 0;
const prepared = new Map();
const rows = [];
// SYNTH=1: instead of the second videos (which are often a different regional sign), make a "live"
// version of each vocabulary sign the way a different person signing the same sign would differ:
// speed and rhythm, body size, position, hand shape and angle noise. Tests the matcher itself.
let seed = 7;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const jitter = (v, s) => v.map((x) => x + (rnd() - 0.5) * 2 * s);
const unitv = (v) => { const n = Math.hypot(...v) || 1; return v.map((x) => x / n); };
const LV = +(process.env.SYNTH) || 1; // SYNTH=2, 3: rougher signing / worse tracking
function synth(frames) {
  const scale = 1 + (rnd() - 0.5) * 0.24 * LV, off = jitter([0, 0, 0], 0.05 * LV), sp = 0.6 + rnd() * 0.8;
  const hand = (h) => h && { p: jitter(h.p.map((x, i) => (i === 1 ? 1.435 + (x - 1.435) * scale : x * scale) + off[i]), 0.02 * LV), f: unitv(jitter(h.f, 0.25 * LV)), n: unitv(jitter(h.n, 0.25 * LV)), h: h.h.map((x) => Math.max(0, Math.min(1, x + (rnd() - 0.5) * 0.3 * LV))) };
  // DROP=0.5: the tracker loses the second hand in that share of frames (it hides behind the other)
  const drop = +(process.env.DROP || 0);
  return frames.map((f) => ({ t: (f.t ?? 0.1) * sp * (0.7 + rnd() * 0.6), R: hand(f.R), L: rnd() < drop ? null : hand(f.L) }));
}
const queries = process.env.SYNTH ? vocabToks.filter((_, i) => i % 5 === 0) : tests;
for (const t of queries) {
  const live = process.env.SYNTH ? synth(templates[t]) : load(join(HERE, 'test_signs', t + '.json'));
  const r = rank(live, templates, prepared);
  const pos = r.findIndex((x) => x.tok === t);
  if (pos === 0) top1++;
  if (pos >= 0 && pos < 3) top3++;
  rows.push(`${t.padEnd(12)} ${pos === 0 ? 'OK ' : pos < 3 ? 'top3' : '    '} -> ${r.slice(0, 3).map((x) => `${x.tok} ${x.score.toFixed(2)}`).join(', ')}${pos >= 3 ? `  (right one #${pos + 1})` : ''}`);
}
if (!process.env.QUIET) console.log(rows.join('\n'));
const nq = queries.length;
console.log(`\ntop-1: ${top1}/${nq} (${Math.round((100 * top1) / nq)}%)  top-3: ${top3}/${nq} (${Math.round((100 * top3) / nq)}%)  chance: ${(100 / vocabToks.length).toFixed(1)}%`);
