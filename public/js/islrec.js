// Camera recognition for Indian Sign Language (ISL-only build).
// MediaPipe Pose + Hands track the signer; each frame is turned into the same keyframe format as
// Meera's signs, with the same maths as the video converter (tools/wlasl/extract.py: torso frame,
// shoulder-width scaling, finger bends). A sign is the stretch between the hands rising and dropping
// again; it is matched (islmatch.js) against ISL references: the venue's sign-board words (without
// a board, the words Meera uses most), the ISL alphabet, or the number signs.
// Same interface as SignRecognizer (recognizer.js): start/stop/setMode and the on* callbacks, except
// that onGloss also gets the runner-up words, for a "Did you mean…?" choice.
import { rank, topWords, isConfident, mirrorFrames, toBody, BODY_W } from './islmatch.js';
import { islLetterTemplates } from './signs.js';

const MP = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14';
const HAND_MODEL = 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';
const POSE_MODEL = 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task';
const SIGNS = 'signs/isl/';
const ALT = 'signs/isl-alt/'; // second dictionary's version of some words (regional variants), if converted
const MIN_REF = 5; // keyframes an extra signer's clip needs to count
const CAM = 'signs/isl-cam/'; // more signers of the sign-board words (INCLUDE, CISLR): WORD.1, WORD.2 ... (tools/cislr/camrefs.py)

// --- avatar constants (as in extract.py / avatar.js) ---
const SHOULDER_C = [0, 1.435, 0];
const SHOULDER_W = BODY_W; // Meera's (islmatch.js), as the signs are converted for
const NOSE_UP = 0.25; // her nose above her shoulder line: heights above the shoulders follow the face (extract.py)
const PALM_OFFSET = 0.047;
const MAXB = [1.55, 1.75, 1.2];
const SPREAD_RANGE = 0.41;
const UP_Y = 1.06; // palm above this (avatar space) = hand raised to sign
const FINGERS = [[5, 6, 7, 8], [9, 10, 11, 12], [13, 14, 15, 16], [17, 18, 19, 20]];
const DIGITS = ['ZERO', 'ONE', 'TWO', 'THREE', 'FOUR', 'FIVE', 'SIX', 'SEVEN', 'EIGHT', 'NINE'];

// --- small vector helpers ---
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const addv = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a) => Math.hypot(...a);
const unit = (a) => { const n = norm(a); return n > 1e-9 ? mul(a, 1 / n) : a; };
const angle = (a, b) => Math.acos(Math.max(-1, Math.min(1, dot(unit(a), unit(b)))));
const clamp01 = (x) => Math.max(0, Math.min(1, x));
const toAvatar = (l) => [l.x, -l.y, -l.z]; // MediaPipe (x right, y down, z away) -> avatar axes

// One hand's world landmarks -> finger direction, palm normal and bends (extract.py hand_pose; the
// thumb fit is left out: matching uses the four fingers' bends and spread).
function handPose(hw, side) {
  const w = hw[0];
  const f = unit(sub(hw[9], w));
  const v5 = sub(hw[5], w), v17 = sub(hw[17], w);
  let n = unit(side === 'R' ? cross(v5, v17) : cross(v17, v5));
  n = unit(sub(n, mul(f, dot(n, f))));
  const h = [];
  for (const [m, p, d, t] of FINGERS) {
    const base = sub(hw[m], w);
    const seg = [sub(hw[p], hw[m]), sub(hw[d], hw[p]), sub(hw[t], hw[d])];
    const b = [angle(base, seg[0]), angle(seg[0], seg[1]), angle(seg[1], seg[2])];
    if (dot(seg[0], n) < 0) b[0] = 0;
    b[0] = Math.max(0, b[0] - 0.12);
    b.forEach((x, i) => h.push(clamp01((x / MAXB[i]) * 1.1)));
  }
  const inplane = (v) => unit(sub(v, mul(n, dot(v, n))));
  const spr = angle(inplane(sub(hw[6], hw[5])), inplane(sub(hw[18], hw[17])));
  h.push(Math.max(-0.5, Math.min(1, (spr - 0.18) / SPREAD_RANGE)), 0, 0, 0);
  return { f, n, h };
}

// One camera frame -> {R, L} in avatar space (extract.py retarget), or null without a body.
const noseHeights = []; // the person's nose above their shoulders (at her shoulder width), recent frames
const NOSE_REL = [0, NOSE_UP, 0.1]; // her nose from her shoulder centre (extract.py NOSE - SHOULDER_C)
let noseAvg = null; // the person's nose (as the hands: from the shoulder centre, lifted), smoothed
function retarget(pose, poseImg, hands) {
  if (!pose) return null;
  const pw = pose.map(toAvatar);
  const scMid = mul(addv(pw[11], pw[12]), 0.5);
  const k = SHOULDER_W / (norm(sub(pw[11], pw[12])) || 0.35);
  const X = unit(sub(pw[11], pw[12]));
  let Y = sub(scMid, mul(addv(pw[23], pw[24]), 0.5));
  Y = unit(sub(Y, mul(X, dot(Y, X))));
  const Z = cross(X, Y);
  const B = (v) => [dot(X, v), dot(Y, v), dot(Z, v)];
  // heights above the shoulder line stretched by the person's own nose height, as the converter does
  noseHeights.push(B(sub(pw[0], scMid))[1] * k);
  if (noseHeights.length > 90) noseHeights.shift();
  const med = [...noseHeights].sort((a, b) => a - b)[noseHeights.length >> 1];
  const up = Math.min(1.6, Math.max(0.8, NOSE_UP / (med || NOSE_UP)));
  const lift = (v) => [v[0], v[1] > 0 ? v[1] * up : v[1], v[2]];
  // Near the face a hand is placed relative to the face, not the shoulders, as the converter does: a
  // head held forward or to one side (at a laptop) would otherwise move "at the ear" to the chin
  const nose = lift(mul(B(sub(pw[0], scMid)), k));
  noseAvg = noseAvg ? noseAvg.map((x, i) => x + (nose[i] - x) * 0.3) : nose;
  const toFace = (palm) => {
    const wgt = Math.min(1, Math.max(0, 1 - (norm(sub(palm, noseAvg)) - 0.1) / 0.15));
    return addv(palm, mul(sub(NOSE_REL, noseAvg), wgt));
  };
  // which detected hand is which: the one whose wrist is nearest the body's right / left wrist
  const sides = {};
  const d2 = (a, b) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
  hands.forEach((hd) => {
    const dr = d2(hd.img[0], poseImg[16]), dl = d2(hd.img[0], poseImg[15]);
    const s = dr <= dl ? 'R' : 'L';
    if (!sides[s] || Math.min(dr, dl) < sides[s].d) sides[s] = { hd, d: Math.min(dr, dl) };
  });
  const fr = {};
  for (const [s, wi, ei] of [['R', 16, 14], ['L', 15, 13]]) {
    const wrist = lift(mul(B(sub(pw[wi], scMid)), k));
    const hd = sides[s]?.hd;
    if (!hd) {
      // The hand model often misses a hand the body model still sees (low, palm up, blurry: the
      // resting hand of WHERE). Estimate a raised one from the arm: wrist position, forearm
      // direction, no palm or finger shape.
      const f = unit(B(sub(pw[wi], pw[ei])));
      const p = addv(SHOULDER_C, toFace(addv(wrist, mul(f, PALM_OFFSET))));
      const seen = (pose[wi].visibility ?? 1) > 0.6 && (pose[ei].visibility ?? 1) > 0.6;
      fr[s] = seen && p[1] > UP_Y ? { w: wrist, f, n: null, h: null, p, est: true } : { w: wrist, f: null };
      continue;
    }
    const hp = handPose(hd.world.map(toAvatar), s);
    const f = B(hp.f), n = B(hp.n);
    fr[s] = { w: wrist, f, n, h: hp.h, p: addv(SHOULDER_C, toFace(addv(wrist, mul(unit(f), PALM_OFFSET)))) };
  }
  return fr;
}

export class ISLRecognizer {
  constructor(video, overlay, { onFrame, onGloss, onLetter, onIdle, allowed } = {}) {
    this.video = video;
    this.canvas = overlay;
    this.ctx = overlay.getContext('2d');
    this.cb = { onFrame, onGloss, onLetter, onIdle, allowed }; // allowed(): the words that fit at this point of the sentence, or null
    this.mode = 'words';
    this.seq = null; // frames of the sign being made
    this.down = 0;
    this.noHandSince = performance.now();
    this.idleFired = true;
    this.templates = {};
    this.prepared = new Map();
    this.extraWords = [];
  }

  // Words beyond the camera vocabulary to recognise (the venue's sign board).
  setExtraWords(words) {
    this.extraWords = words || [];
    this._vocab = null;
  }

  async init() {
    const vision = await import(`${MP}/vision_bundle.mjs`);
    const files = await vision.FilesetResolver.forVisionTasks(`${MP}/wasm`);
    const mk = async (Cls, model, extra) => {
      try {
        return await Cls.createFromOptions(files, { baseOptions: { modelAssetPath: model, delegate: 'GPU' }, runningMode: 'VIDEO', ...extra });
      } catch {
        return await Cls.createFromOptions(files, { baseOptions: { modelAssetPath: model, delegate: 'CPU' }, runningMode: 'VIDEO', ...extra });
      }
    };
    this.hands = await mk(vision.HandLandmarker, HAND_MODEL, { numHands: 2, minHandDetectionConfidence: 0.5, minTrackingConfidence: 0.5 });
    this.pose = await mk(vision.PoseLandmarker, POSE_MODEL, { numPoses: 1 });
    this.Draw = vision.DrawingUtils;
    this.HandLandmarker = vision.HandLandmarker;
    this.PoseLandmarker = vision.PoseLandmarker;
  }

  // The reference signs for the current mode.
  async _loadTemplates() {
    const key = this.mode;
    if (this._vocab === key) return;
    let toks;
    if (this.mode === 'letters') {
      this.templates = islLetterTemplates();
      this.prepared = new Map();
      this._vocab = key;
      return;
    }
    const index = new Set(await fetch(SIGNS + 'index.json').then((r) => r.json()).catch(() => []));
    if (this.mode === 'numbers') toks = DIGITS;
    else {
      const vocab = await fetch(SIGNS + 'camera_vocab.json').then((r) => r.json()).catch(() => []);
      // With a venue's sign board, only its words: among all ~400 words, too many look alike from one
      // camera (a hand raised beside the head is HEARING-AID, PERSONAL, UNDERSTAND, UP...)
      toks = this.extraWords.length ? [...new Set(this.extraWords)] : vocab;
    }
    toks = toks.filter((t) => index.has(t));
    const alt = new Set(await fetch(ALT + 'index.json').then((r) => (r.ok ? r.json() : [])).catch(() => []));
    const refs = {}; // word -> its extra signers' files
    if (this.mode === 'words') {
      for (const f of await fetch(CAM + 'index.json').then((r) => (r.ok ? r.json() : [])).catch(() => [])) (refs[f.split('.')[0]] ||= []).push(f);
    }
    const get = (url) => fetch(url).then((r) => r.json()).then((d) => toBody(d.frames, d.shoulderW)).catch(() => null);
    const tpl = {};
    for (let i = 0; i < toks.length; i += 24) {
      await Promise.all(toks.slice(i, i + 24).map(async (t) => {
        const fr = await get(SIGNS + encodeURIComponent(t) + '.json');
        if (fr) tpl[t] = fr;
        if (alt.has(t)) {
          const fa = await get(ALT + encodeURIComponent(t) + '.json');
          if (fa) tpl[t + '#2'] = fa;
        }
        for (const f of refs[t] || []) {
          // (a clip converted into only a few keyframes is a near-still pose that matches any sign made near it)
          const fc = await get(CAM + encodeURIComponent(f) + '.json');
          if (fc && fc.length >= MIN_REF) tpl[`${t}#c${f.split('.')[1]}`] = fc;
        }
      }));
    }
    this.templates = tpl;
    this.prepared = new Map();
    this._vocab = key;
  }

  async start() {
    this.stop();
    const gen = this._gen;
    this._ready ||= this.init().catch((e) => {
      this._ready = null;
      throw e;
    });
    await this._ready;
    // the reference signs load while the camera is already on (a sign made before they are ready is skipped)
    this._tplLoading = this._loadTemplates().catch(() => {});
    if (gen !== this._gen) return false;
    const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480, facingMode: 'user' }, audio: false });
    if (gen !== this._gen) {
      stream.getTracks().forEach((t) => t.stop());
      return false;
    }
    this.stream = stream;
    this.video.srcObject = stream;
    try {
      await this.video.play();
    } catch (e) {
      // AbortError: another start or stop replaced the stream while it was starting
      if (gen !== this._gen || e?.name === 'AbortError') return false;
      throw e;
    }
    if (gen !== this._gen) return false;
    this.running = true;
    this._tick();
    return true;
  }

  stop() {
    this._gen = (this._gen || 0) + 1;
    this.running = false;
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.video.srcObject = null;
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  setMode(m) {
    this.mode = m;
    this.seq = null;
    this.hold = null;
    if (this.running) this._loadTemplates();
  }

  _tick() {
    if (!this.running) return;
    requestAnimationFrame(() => this._tick());
    const v = this.video;
    if (v.readyState < 2) return;
    const now = performance.now();
    if (now - (this._last || 0) < 45) return; // ~20 frames a second
    const dt = this._last ? (now - this._last) / 1000 : 0.05;
    this._last = now;
    const pr = this.pose.detectForVideo(v, now);
    const hr = this.hands.detectForVideo(v, now);
    const hands = (hr.landmarks || []).map((img, i) => ({ img, world: hr.worldLandmarks[i] }));
    this._draw(pr, hr);
    const fr = retarget(pr.worldLandmarks?.[0], pr.landmarks?.[0], hands);
    this._process(fr, hands.length, dt, now);
  }

  _draw(pr, hr) {
    const c = this.canvas, g = this.ctx, v = this.video;
    if (c.width !== v.videoWidth) {
      c.width = v.videoWidth;
      c.height = v.videoHeight;
    }
    g.clearRect(0, 0, c.width, c.height);
    const du = new this.Draw(g);
    const body = pr.landmarks?.[0];
    if (body) du.drawConnectors(body, this.PoseLandmarker.POSE_CONNECTIONS.filter((e) => e.start >= 11 && e.end <= 24), { color: 'rgba(255,255,255,0.5)', lineWidth: 2 });
    (hr.landmarks || []).forEach((lm, i) => {
      du.drawConnectors(lm, this.HandLandmarker.HAND_CONNECTIONS, { color: i ? '#8fd3ff' : '#f2c46d', lineWidth: 3 });
      du.drawLandmarks(lm, { color: '#ffffff', fillColor: i ? '#3aa0ff' : '#d99a2b', radius: 3, lineWidth: 1 });
    });
  }

  _process(fr, nHands, dt, now) {
    if (!fr || !nHands) {
      if (!this.idleFired && now - this.noHandSince > 1800) {
        this.idleFired = true;
        this.cb.onIdle?.();
      }
    } else {
      this.noHandSince = now;
      this.idleFired = false;
    }
    // only hands the hand model sees start or end a sign; ones estimated from the arm just fill in
    const up = !!fr && ['R', 'L'].some((s) => fr[s].p && !fr[s].est && fr[s].p[1] > UP_Y);
    if (this.mode === 'letters') return this._letters(fr, up, now);

    // words and numbers: a sign runs from the hands rising until they drop (or leave the picture)
    if (up) {
      this.seq ||= [];
      this.seq.push({ t: dt, R: fr.R.p ? fr.R : null, L: fr.L.p ? fr.L : null });
      this.down = 0;
      this.cb.onFrame?.({ shape: 'Signing…', zone: '', progress: Math.min(1, this.seq.length / 20) });
    } else if (this.seq) {
      if (++this.down >= 6) {
        const seq = this.seq;
        this.seq = null;
        this._finish(seq);
      }
    } else this.cb.onFrame?.({ shape: nHands ? 'Ready' : '–', zone: '', progress: 0 });
  }

  _finish(seq) {
    if (seq.length < 5) return; // a twitch, not a sign
    if (this._vocab !== this.mode) return this.cb.onFrame?.({ shape: 'Loading signs…', zone: '', progress: 0 });
    // trim the raise and the drop: keep the upper part of the leading hand's height range
    const trim = (frames) => {
      const ys = frames.filter((f) => f.R).map((f) => f.R.p[1]);
      if (ys.length < 4) return null;
      const lo = Math.min(...ys), hi = Math.max(...ys);
      const cut = hi - lo > 0.12 ? lo + 0.3 * (hi - lo) : -Infinity;
      const act = frames.filter((f) => f.R && f.R.p[1] >= cut);
      return act.length >= 3 ? act : frames;
    };
    // the more active hand leads; a left-handed signer is mirrored, like the converter does
    // (counting only hands the hand model saw). Close counts happen in two-handed signs whose hands
    // overlap (HELP), so then both ways are tried and the better match is kept.
    const cnt = (s) => seq.filter((f) => f[s] && !f[s].est).length;
    const r = cnt('R'), l = cnt('L');
    const ways = l > 1.5 * r ? [mirrorFrames(seq)] : l > r / 1.5 ? [seq, mirrorFrames(seq)] : [seq];
    let frames = null, ranked = [];
    const ok = this.mode === 'words' && this.cb.allowed?.();
    const tpl = ok ? Object.fromEntries(Object.entries(this.templates).filter(([k]) => ok.includes(k.split('#')[0]))) : this.templates;
    for (const w of ways) {
      const fw = trim(w);
      const rw = fw ? rank(fw, tpl, this.prepared) : [];
      if (rw.length && (!ranked.length || rw[0].score < ranked[0].score)) [frames, ranked] = [fw, rw];
    }
    if (!ranked.length) return;
    window.__islTrace?.push({ seq, frames, top: ranked.slice(0, 6) }); // for tools/cislr/camera_test.mjs
    const words = topWords(ranked, 3);
    const sure = isConfident(ranked);
    this.cb.onFrame?.({ shape: sure ? words[0] : `${words[0]}?`, zone: '', progress: 0 });
    if (this.mode === 'numbers') this.cb.onLetter?.(String(DIGITS.indexOf(words[0])), words.slice(1).map((w) => String(DIGITS.indexOf(w))));
    else this.cb.onGloss?.(words[0], words.slice(1), sure);
  }

  // Letters are held still: when the hands stay steady for ~0.4 s, match the last moments against the
  // ISL alphabet; after a letter, the hands must move before the next one counts.
  _letters(fr, up, now) {
    if (!up) {
      this.hold = null;
      this.cb.onFrame?.({ shape: fr ? 'Ready' : '–', zone: '', progress: 0 });
      return;
    }
    // letters are all finger shape, so a hand estimated from the arm alone doesn't count here
    const cur = { t: 0.05, R: fr.R.p && !fr.R.est ? fr.R : null, L: fr.L.p && !fr.L.est ? fr.L : null };
    this.hold ||= { frames: [], moved: true };
    const h = this.hold;
    const prev = h.frames[h.frames.length - 1];
    const move = prev && prev.R && cur.R ? norm(sub(prev.R.p, cur.R.p)) : 0;
    if (move > 0.02) {
      h.frames = [];
      h.moved = true;
    }
    h.frames.push(cur);
    if (h.frames.length > 10) h.frames.shift();
    this.cb.onFrame?.({ shape: 'Hold still…', zone: '', progress: h.moved ? h.frames.length / 8 : 0 });
    if (h.moved && h.frames.length >= 8 && this._vocab === this.mode) {
      const cnt = (s) => h.frames.filter((f) => f[s]).length;
      const frames = cnt('L') > cnt('R') && !cnt('R') ? mirrorFrames(h.frames) : h.frames;
      const ranked = rank(frames, this.templates, this.prepared);
      if (ranked.length) {
        const words = topWords(ranked, 3);
        h.moved = false;
        this.cb.onFrame?.({ shape: words[0], zone: '', progress: 1 });
        this.cb.onLetter?.(words[0], words.slice(1));
      }
    }
  }
}
