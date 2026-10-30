// Match a signed movement against ISL sign templates.
// Both sides are in the avatar's keyframe format ({R: {p, f, n, h}, L: ... | null} per frame, see
// signs.js): the templates are Meera's own signs (converted from CISLR videos, the hand-made ISL
// letters), and the live side is the camera's tracking turned into the same format (islrec.js).
// Matching = dynamic time warping over a fixed number of resampled frames, so a slower or faster
// signer still lines up. Pure functions, so tools/cislr/eval_camera.mjs can test them offline.

export const N_STEPS = 12;

// The body the signs are converted for: Meera's shoulder width (tools/wlasl/extract.py). Signs converted
// before that record no width and were made for 0.38; scale those about the shoulder centre to match.
export const BODY_W = 0.314;
const LEGACY_W = 0.38, SC = [0, 1.435, 0];
export function toBody(frames, shoulderW = LEGACY_W) {
  if (!frames || Math.abs(shoulderW - BODY_W) < 1e-3) return frames;
  const k = BODY_W / shoulderW;
  const sc = (h) => h && { ...h, p: h.p.map((x, i) => SC[i] + (x - SC[i]) * k) };
  return frames.map((f) => ({ ...f, R: sc(f.R), L: sc(f.L) }));
}
// Weights (tuned with tools/cislr/eval_camera.mjs; it can override them to try others):
//  p     palm position (metres); depth (z) from one camera is unreliable, so it counts for less
//  path  the movement itself: palm position relative to where the sign's own path is centred
//  dir   finger direction and palm normal (1 - cos)
//  shape finger bends + spread (mean absolute difference)
//  miss  one side has a second hand and the other doesn't (hidden: ... and it touches the first)
// (chosen on the eval's simulated signer variation: 96% top-1 / 98% top-3 among 400 signs at its
// roughest level; depth is ignored, and the movement counts for more than where exactly it is made)
export const CFG = { p: 1.5, z: 0, path: 6, dir: 1, shape: 1.4, miss: 1.2, hidden: 0.3, left: 0.6 };

const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const dxyz = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], (a[2] - b[2]) * CFG.z);
const lerp3 = (a, b, u) => [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u];
const lerpN = (a, b, u) => a.map((x, i) => x + (b[i] - x) * u);

function handDist(a, b) {
  const shape = a.h && b.h ? a.h.slice(0, 13).reduce((s, x, i) => s + Math.abs(x - b.h[i]), 0) / 13 : 0.3;
  const path = CFG.path && a.q && b.q ? CFG.path * dxyz(a.q, b.q) : 0;
  // a hand estimated from the arm (islrec.js) has a direction but no palm normal or finger shape
  const dir = a.n && b.n ? 2 - dot(a.f, b.f) - dot(a.n, b.n) : 2 * (1 - dot(a.f, b.f));
  return CFG.p * dxyz(a.p, b.p) + path + CFG.dir * dir + CFG.shape * shape;
}

// A camera can't tell two touching hands apart (HELP: fist resting on the palm), so a second hand
// that is missing where the other side's two hands are this close costs only CFG.hidden, and a
// touching second hand (tracked badly, half covered) never costs more than that.
const TOUCH = 0.12;
const touching = (f) => Math.hypot(f.R.p[0] - f.L.p[0], f.R.p[1] - f.L.p[1]) < TOUCH;

function frameDist(a, b) {
  let d = handDist(a.R, b.R);
  if (a.L && b.L) d += touching(a) && touching(b) ? Math.min(CFG.left * handDist(a.L, b.L), CFG.hidden) : CFG.left * handDist(a.L, b.L);
  else if (a.L || b.L) d += touching(a.L ? a : b) ? CFG.hidden : CFG.miss;
  return d;
}

// Resample a frame sequence to n steps, evenly in time (template frames carry durations in .t; live
// frames are evenly spaced). Frames without a right hand are dropped first.
export function resample(frames, n = N_STEPS) {
  const fs = frames.filter((f) => f && f.R && f.R.p);
  if (!fs.length) return [];
  const times = [];
  let acc = 0;
  fs.forEach((f, i) => times.push((acc += i ? (f.t ?? 1) : 0)));
  const total = times[times.length - 1] || 1;
  // The tracker often loses the second hand while it is behind or touching the other (HELP: fist on
  // palm), so a hand seen in a quarter of the frames counts as there throughout, and so does one
  // seen only touching the first (often just once); gaps take the nearest frame it was seen in.
  const seen = fs.map((f, i) => (f.L && f.L.p ? i : -1)).filter((i) => i >= 0);
  const twoHanded = seen.length >= fs.length * 0.25 || (seen.length > 0 && seen.every((i) => touching(fs[i])));
  const nearL = (i) => fs[seen.reduce((b, s) => (Math.abs(s - i) < Math.abs(b - i) ? s : b), seen[0])].L;
  const out = [];
  for (let k = 0; k < n; k++) {
    const t = (k / (n - 1)) * total;
    // the two frames around time t (a single-frame sign, like a static letter, just repeats)
    let j = 1;
    while (j < fs.length - 1 && times[j] < t) j++;
    const a = fs[Math.max(0, Math.min(j - 1, fs.length - 1))], b = fs[Math.min(j, fs.length - 1)];
    const span = fs.length > 1 ? times[j] - times[j - 1] || 1 : 1;
    const u = fs.length > 1 ? Math.max(0, Math.min(1, (t - times[j - 1]) / span)) : 0;
    const mix = (x, y) => ({ p: lerp3(x.p, y.p, u), f: lerp3(x.f, y.f, u), n: x.n && y.n ? lerp3(x.n, y.n, u) : x.n || y.n, h: x.h && y.h ? lerpN(x.h, y.h, u) : x.h || y.h });
    const R = mix(a.R, b.R);
    const ia = fs.indexOf(a), ib = fs.indexOf(b);
    const L = twoHanded ? mix(a.L && a.L.p ? a.L : nearL(ia), b.L && b.L.p ? b.L : nearL(ib)) : null;
    out.push({ R, L });
  }
  // q: each palm relative to the centre of its own path (the movement, independent of where it's made)
  for (const s of ['R', 'L']) {
    const ps = out.map((f) => f[s]?.p).filter(Boolean);
    if (!ps.length) continue;
    const c = [0, 1, 2].map((i) => ps.reduce((acc, p) => acc + p[i], 0) / ps.length);
    out.forEach((f) => f[s] && (f[s].q = f[s].p.map((x, i) => x - c[i])));
  }
  return out;
}

// Dynamic time warping cost (average per step) between two resampled sequences.
export function dtw(a, b, band = 3) {
  const n = a.length, m = b.length;
  if (!n || !m) return Infinity;
  const D = Array.from({ length: n + 1 }, () => new Float64Array(m + 1).fill(Infinity));
  D[0][0] = 0;
  for (let i = 1; i <= n; i++) {
    for (let j = Math.max(1, i - band); j <= Math.min(m, i + band); j++) {
      D[i][j] = frameDist(a[i - 1], b[j - 1]) + Math.min(D[i - 1][j], D[i][j - 1], D[i - 1][j - 1]);
    }
  }
  return D[n][m] / (n + m);
}

// A left-handed signer: mirror so the active hand is "R", like Meera's (right-handed) signs.
export function mirrorFrames(frames) {
  const mx = (v) => v && [-v[0], v[1], v[2]];
  const mh = (h) => h && { p: mx(h.p), f: mx(h.f), n: mx(h.n), h: h.h };
  return frames.map((f) => f && { ...f, R: mh(f.L), L: mh(f.R) });
}

// Rank templates ({token: frames}) for a live sequence. Returns [{tok, score}] best first.
// A lower score is a closer match; `confident` marks a clear winner (well ahead of the runner-up).
export function rank(liveFrames, templates, prepared = new Map()) {
  const live = resample(liveFrames);
  if (!live.length) return [];
  const res = [];
  for (const [tok, frames] of Object.entries(templates)) {
    let t = prepared.get(tok);
    if (!t) prepared.set(tok, (t = resample(frames)));
    // a word can have several reference signs (regional variants): CAR, CAR#2
    if (t.length) res.push({ tok, word: tok.split('#')[0], score: dtw(live, t) });
  }
  res.sort((x, y) => x.score - y.score);
  return res;
}

// The best n different words (variants of the same word collapse into one).
export const topWords = (ranked, n = 3) => [...new Set(ranked.map((x) => x.word))].slice(0, n);

// a clear winner: the runner-up (a different word) is at least 15% further away
export const isConfident = (ranked) => {
  const second = ranked.find((x) => x.word !== ranked[0]?.word);
  return ranked.length > 1 && (!second || second.score > ranked[0].score * 1.15);
};
