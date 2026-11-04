// Honest camera accuracy on real signers: each reference video of a sign-board word (an INCLUDE or
// CISLR signer, public/signs/isl-cam/ and isl-alt/) is held out and signed "to the camera" against the
// rest, as islrec.js matches (the venue's board words). Compares one reference per word (main + #2,
// the old camera) with all signers (the new one). INCLUDE clips of the same signer often sit next to
// each other (MVI_0029, MVI_0030 ...), so references within 10 numbers of the held-out clip are left out too.
// Usage: node eval_refs.mjs [venue|all]   (default: schemes; all = every venue's board)
//   CFG_JSON='{"p":3}' tries other matching weights; it also prints how often a sure match (islmatch.js
//   isConfident) is right, and how many signs it would turn away.
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..');
const SIGNS = join(ROOT, 'public', 'signs');
const { rank, toBody, isConfident, CFG } = await import(pathToFileURL(join(ROOT, 'public', 'js', 'islmatch.js')).href);

Object.assign(CFG, JSON.parse(process.env.CFG_JSON || '{}'));

// the venue's board words, read the way camrefs.py does
const venue = process.argv[2] || 'schemes';
const src = readFileSync(join(ROOT, 'public', 'js', 'venues.js'), 'utf8');
const words = new Set();
for (const v of venue === 'all' ? ['hotel', 'flight', 'schemes'] : [venue]) {
  const block = src.slice(src.indexOf(`  ${v}: {`)).match(/board:\s*\{(.*?)\n\s*\},/s)[1];
  for (const [, w] of block.matchAll(/'([A-Z][A-Z-]*)'/g)) words.add(w);
  for (const [, name] of block.matchAll(/\b([A-Z]+)\b(?=,|\])/g)) {
    const m = src.match(new RegExp(`const ${name} = \\[(.*?)\\];`, 's'));
    if (m) for (const [, w] of m[1].matchAll(/'([A-Z][A-Z-]*)'/g)) words.add(w);
  }
}

const load = (f) => { const d = JSON.parse(readFileSync(f, 'utf8')); return { frames: toBody(d.frames, d.shoulderW), id: d.source.video_id, ds: d.source.dataset }; };
const camIndex = existsSync(join(SIGNS, 'isl-cam', 'index.json')) ? JSON.parse(readFileSync(join(SIGNS, 'isl-cam', 'index.json'), 'utf8')) : [];
const refs = {}; // word -> [{key, frames, id, ds, main}]
for (const w of words) {
  const list = [];
  if (existsSync(join(SIGNS, 'isl', w + '.json'))) list.push({ key: w, main: true, ...load(join(SIGNS, 'isl', w + '.json')) });
  if (existsSync(join(SIGNS, 'isl-alt', w + '.json'))) list.push({ key: w + '#2', main: true, ...load(join(SIGNS, 'isl-alt', w + '.json')) });
  for (const f of camIndex.filter((f) => f.split('.')[0] === w)) {
    const r = load(join(SIGNS, 'isl-cam', f + '.json'));
    if (r.frames.length >= 5) list.push({ key: `${w}#c${f.split('.')[1]}`, ...r }); // as islrec.js (MIN_REF)
  }
  if (list.length) refs[w] = list;
}
const num = (id) => +(id.match(/(\d+)$/) || [0, NaN])[1];
const sameSigner = (a, b) => a.ds === 'INCLUDE' && b.ds === 'INCLUDE' && Math.abs(num(a.id) - num(b.id)) <= 10;

const score = { old: [0, 0], new: [0, 0] };
const sure = { old: [0, 0], new: [0, 0] }; // [sure matches, of them right]
let n = 0;
const misses = {};
for (const [w, list] of Object.entries(refs)) {
  for (const q of list) {
    if (q.key === w) continue; // the main sign is what Meera signs; test the other signers
    n++;
    for (const mode of ['old', 'new']) {
      const tpl = {};
      for (const [w2, l2] of Object.entries(refs)) {
        for (const r of l2) {
          if (r === q || (w2 === w && sameSigner(r, q))) continue;
          if (mode === 'old' && !r.main) continue;
          tpl[r.key] = r.frames;
        }
      }
      const ranked = rank(q.frames, tpl);
      const ws = [...new Set(ranked.map((x) => x.word))];
      const pos = ws.indexOf(w);
      if (isConfident(ranked)) sure[mode][0]++, (sure[mode][1] += pos === 0);
      if (pos === 0) score[mode][0]++;
      if (pos >= 0 && pos < 3) score[mode][1]++;
      if (mode === 'new' && pos !== 0) (misses[w] ||= []).push(ws[0]);
    }
  }
}
const pct = (k) => `${Math.round((100 * k) / n)}%`;
console.log(`${venue}: ${Object.keys(refs).length} words, ${n} held-out signer videos`);
console.log(`one reference per word (old): top-1 ${score.old[0]}/${n} (${pct(score.old[0])})  top-3 ${pct(score.old[1])}`);
console.log(`all signers (new):            top-1 ${score.new[0]}/${n} (${pct(score.new[0])})  top-3 ${pct(score.new[1])}`);
for (const m of ['old', 'new']) console.log(`${m}: sure on ${pct(sure[m][0])} of signs, right ${Math.round((100 * sure[m][1]) / (sure[m][0] || 1))}% of those`);
if (process.env.MISSES) for (const [w, m] of Object.entries(misses)) console.log(`  ${w}: misread as ${m.join(', ')}`);
