// Sign dictionary for the avatar.
// Signs are approximations of ASL, authored as keyframes for the right (dominant) hand
// in avatar body space: x = avatar's left (+) / right (-), y = up, z = toward the viewer.
// A hand pose is { p: palm-centre position, f: finger direction, n: palm normal, h: handshape }.

// ---------- Handshapes ----------
// Each finger is [mcp, pip, dip] bend (0 straight .. 1 fully bent).
// Thumb: a = abduction (out to side), o = opposition (across palm), c = curl.
// s = finger spread (-1 crossed .. 1 wide).
const E = [0, 0, 0];
const C = [1, 1, 1];
const HK = [0.1, 1, 0.9]; // hooked (X)
const BN = [1, 0.05, 0]; // bent at the knuckle
const HF = [0.35, 0.55, 0.35]; // half curve (C)
const OC = [0.55, 0.8, 0.55]; // meets thumb (O)
const FL = [0.7, 0.25, 0.1]; // flat-O
const CL = [0.15, 0.85, 0.6]; // claw
const RX = [0.12, 0.2, 0.1]; // relaxed

const T = {
  side: { a: 0, o: 0.32, c: 0.08 }, // upright against the side of the fist (A)
  across: { a: 0.12, o: 0.55, c: 0.18 }, // folded in front of the palm, joints only lightly bent
  out: { a: 1, o: 0, c: 0 },
  tuck: { a: 0.1, o: 0.85, c: 0.6 }, // under the bent fingertips (E, M, N)
  tip: { a: 0.35, o: 0.65, c: 0.45 },
  wrap: { a: 0, o: 0.75, c: 0.75 },
  up: { a: 0.35, o: 0, c: 0 },
  c: { a: 0.3, o: 0.62, c: 0.35 }, // curves opposite the fingers (C)
  between: { a: 0.1, o: 0.55, c: 0.3 },
  relax: { a: 0.3, o: 0.3, c: 0.2 },
};
const h = (i, m, r, p, t, s = 0) => ({ f: [i, m, r, p], t, s });

export const HANDSHAPES = {
  A: h(C, C, C, C, T.side),
  B: h(E, E, E, E, T.across),
  C: h(HF, HF, HF, HF, T.c),
  D: h(E, OC, OC, OC, T.tip),
  E: h(CL, CL, CL, CL, T.tuck),
  F: h(OC, E, E, E, T.tip, 0.6),
  G: h(E, C, C, C, T.up),
  H: h(E, E, C, C, T.across),
  I: h(C, C, C, E, T.across),
  J: h(C, C, C, E, T.across),
  K: h(E, [0.3, 0.1, 0], C, C, T.between, 0.5),
  L: h(E, C, C, C, T.out),
  M: h([0.8, 1, 0.5], [0.8, 1, 0.5], [0.8, 1, 0.5], C, T.tuck),
  N: h([0.8, 1, 0.5], [0.8, 1, 0.5], C, C, T.tuck),
  O: h(OC, OC, OC, OC, T.tip),
  P: h(E, [0.3, 0.1, 0], C, C, T.between, 0.5),
  Q: h(E, C, C, C, T.up),
  R: h(E, E, C, C, T.across, -0.7),
  S: h(C, C, C, C, T.wrap),
  T: h([0.7, 1, 0.6], C, C, C, T.between),
  U: h(E, E, C, C, T.across),
  V: h(E, E, C, C, T.across, 0.9),
  W: h(E, E, E, C, T.across, 0.9),
  X: h(HK, C, C, C, T.across),
  Y: h(C, C, C, E, T.out, 1),
  Z: h(E, C, C, C, T.across),
  0: h(OC, OC, OC, OC, T.tip),
  1: h(E, C, C, C, T.across),
  2: h(E, E, C, C, T.across, 0.9),
  3: h(E, E, C, C, T.out, 0.9),
  4: h(E, E, E, E, T.across, 0.9),
  5: h(E, E, E, E, T.out, 1),
  6: h(E, E, E, OC, T.tip, 0.8),
  7: h(E, E, OC, E, T.tip, 0.8),
  8: h(E, OC, E, E, T.tip, 0.8),
  9: h(OC, E, E, E, T.tip, 0.6),
  flatO: h(FL, FL, FL, FL, { a: 0.2, o: 0.8, c: 0.15 }),
  claw: h(CL, CL, CL, CL, { a: 0.7, o: 0.2, c: 0.4 }, 0.9),
  bentB: h(BN, BN, BN, BN, T.across),
  ILY: h(E, C, C, E, T.out, 0.6),
  noOpen: h(E, E, C, C, T.out),
  noClose: h([0.45, 0.3, 0.1], [0.45, 0.3, 0.1], C, C, { a: 0.3, o: 0.6, c: 0.35 }),
  flat: h(E, E, E, E, T.up), // fingers together, thumb upright alongside (namaste)
  rest: h(RX, RX, [0.15, 0.25, 0.12], [0.2, 0.3, 0.15], T.relax, 0.1),
};

// Flatten a handshape into the 16 numbers the avatar interpolates.
export function shapeArray(name) {
  const s = HANDSHAPES[name] || HANDSHAPES.rest;
  return [...s.f[0], ...s.f[1], ...s.f[2], ...s.f[3], s.s, s.t.a, s.t.o, s.t.c];
}

// ---------- Keyframe DSL ----------
const UP = [0, 1, 0], DN = [0, -1, 0], FW = [0, 0, 1], BK = [0, 0, -1], IN = [1, 0, 0], OUT = [-1, 0, 0];
const r = (p, f, n, hs) => ({ p, f, n, h: hs });
const mir = (q) => q && { p: [-q.p[0], q.p[1], q.p[2]], f: [-q.f[0], q.f[1], q.f[2]], n: [-q.n[0], q.n[1], q.n[2]], h: q.h };
const k = (R, L = null, t = 0.3, hold = 0.08, face = null) => ({ R, L, t, hold, face });
const kb = (R, t, hold, face) => k(R, mir(R), t, hold, face);
const add = (p, d) => [p[0] + d[0], p[1] + d[1], p[2] + d[2]];
const mv = (q, d, extra = {}) => ({ ...q, p: add(q.p, d), ...extra });

export const REST = {
  R: r([-0.13, 1.0, 0.3], [0.55, 0, 0.8], DN, 'rest'),
  L: r([0.13, 1.0, 0.3], [-0.55, 0, 0.8], DN, 'rest'),
};

// Frequently used non-dominant (left hand) bases, written in world space.
const L_PALM_UP = r([0.05, 1.2, 0.32], [-0.5, 0, 1], UP, 'B');
const L_ARM = r([0.1, 1.2, 0.3], [-1, 0, 0.25], DN, 'B');
const L_INDEX_UP = r([0.04, 1.26, 0.3], UP, [-1, 0, 0], '1');

const CHEST = [-0.05, 1.3, 0.19];
const circle = (base, rad, hs, f, n, steps = 4) => {
  const out = [];
  for (let i = 0; i <= steps; i++) {
    const a = (i / steps) * Math.PI * 2;
    out.push(k(r(add(base, [Math.sin(a) * rad, Math.cos(a) * rad, 0]), f, n, hs), null, i === 0 ? 0.3 : 0.14, 0));
  }
  return out;
};

export const SIGNS = {
  // salute: fingertips at the side of the forehead, then out
  HELLO: [k(r([-0.1, 1.71, 0.15], [0.35, 1, 0], FW, 'B'), null, 0.35, 0.1, { smile: 1, brow: 0.5 }), k(r([-0.27, 1.68, 0.27], [0, 1, 0.15], FW, 'B'), null, 0.35, 0.12, { smile: 1 })],
  BYE: (() => {
    const o = r([-0.22, 1.48, 0.28], UP, FW, 'B');
    return [k(o, null, 0.3, 0, { smile: 1 }), k({ ...o, h: 'bentB' }, null, 0.16, 0), k(o, null, 0.16, 0), k({ ...o, h: 'bentB' }, null, 0.16, 0), k(o, null, 0.16, 0.05)];
  })(),
  WELCOME: [k(r([-0.32, 1.26, 0.34], [0.2, 0, 1], UP, 'B'), null, 0.35, 0, { smile: 1 }), k(r([-0.06, 1.2, 0.24], [1, 0, 0.3], UP, 'B'), null, 0.45, 0.1, { smile: 1 })],
  // flat hand, fingertips at the chin, then forward and down
  'THANK-YOU': [k(r([-0.02, 1.47, 0.16], UP, BK, 'B'), null, 0.35, 0.1, { smile: 1 }), k(r([-0.08, 1.4, 0.38], [0, 0.4, 1], UP, 'B'), null, 0.4, 0.12, { smile: 1, nod: 1 })],
  PLEASE: circle(CHEST, 0.035, 'B', [0.6, 1, 0], BK),
  SORRY: circle(CHEST, 0.035, 'A', [0.6, 1, 0], BK).map((f) => ({ ...f, face: { brow: 0.6 } })),
  YES: (() => {
    const a = r([-0.14, 1.3, 0.32], UP, FW, 'S');
    const b = r([-0.14, 1.27, 0.34], [0, 0.5, 0.85], [0, -0.85, 0.5], 'S');
    return [k(a, null, 0.28, 0, { nod: 1 }), k(b, null, 0.15, 0, { nod: 1 }), k(a, null, 0.15, 0, { nod: 1 }), k(b, null, 0.15, 0.05, { nod: 1 })];
  })(),
  NO: (() => {
    const a = r([-0.14, 1.32, 0.32], UP, FW, 'noOpen');
    const b = { ...a, h: 'noClose' };
    return [k(a, null, 0.28, 0, { shake: 1 }), k(b, null, 0.14, 0, { shake: 1 }), k(a, null, 0.12, 0, { shake: 1 }), k(b, null, 0.14, 0.05, { shake: 1 })];
  })(),
  // index pointing at her chest from just right of it, palm toward her, the wrist curling forward (its natural
  // direction) with the elbow relaxed at her side; found by searching for the least-strained wrist
  ME: [k(r([-0.156, 1.26, 0.192], [0.783, 0.249, -0.57], [-0.516, -0.251, -0.819], '1'), null, 0.3, 0), k(r([-0.14, 1.265, 0.18], [0.783, 0.249, -0.57], [-0.516, -0.251, -0.819], '1'), null, 0.14, 0.1)],
  YOU: [k(r([-0.1, 1.3, 0.36], FW, DN, '1'), null, 0.3, 0), k(r([-0.08, 1.31, 0.42], FW, DN, '1'), null, 0.14, 0.1)],
  WANT: [kb(r([-0.13, 1.22, 0.42], [0.1, 0.1, 1], UP, 'claw'), 0.3, 0), kb(r([-0.13, 1.23, 0.28], [0.1, 0.4, 1], UP, 'claw'), 0.3, 0.08)],
  NEED: (() => {
    const a = r([-0.12, 1.3, 0.33], FW, DN, 'X');
    const b = r([-0.12, 1.26, 0.34], [0, -0.6, 0.8], [0, -0.8, -0.6], 'X');
    return [k(a, null, 0.28, 0), k(b, null, 0.14, 0), k(a, null, 0.12, 0), k(b, null, 0.14, 0.06)];
  })(),
  HAVE: [kb(r([-0.08, 1.31, 0.33], UP, BK, 'bentB'), 0.28, 0), kb(r([-0.07, 1.3, 0.25], UP, BK, 'bentB'), 0.2, 0.1)],
  ROOM: [
    kb(r([-0.1, 1.25, 0.34], FW, IN, 'B'), 0.32, 0.08),
    k(r([0.0, 1.25, 0.43], IN, BK, 'B'), r([0.0, 1.25, 0.24], [-1, 0, 0], FW, 'B'), 0.32, 0.12),
  ],
  RESERVE: [
    k(r([-0.02, 1.3, 0.31], FW, DN, 'S'), r([0.06, 1.2, 0.31], [-0.3, 0, 1], DN, 'S'), 0.3, 0),
    ...circle([-0.01, 1.3, 0.31], 0.025, 'S', FW, DN, 3).slice(1).map((f) => ({ ...f, L: r([0.06, 1.2, 0.31], [-0.3, 0, 1], DN, 'S') })),
    k(r([0.02, 1.245, 0.31], FW, DN, 'S'), r([0.06, 1.2, 0.31], [-0.3, 0, 1], DN, 'S'), 0.16, 0.1),
  ],
  NIGHT: [k(r([-0.1, 1.3, 0.33], [0.3, 0, 1], DN, 'bentB'), L_ARM, 0.3, 0), k(r([-0.01, 1.26, 0.34], [0.3, -0.3, 1], DN, 'bentB'), L_ARM, 0.35, 0.1)],
  DAY: [k(r([-0.12, 1.43, 0.31], UP, BK, '1'), L_ARM, 0.3, 0), k(r([0.03, 1.29, 0.33], IN, BK, '1'), L_ARM, 0.45, 0.08)],
  MORNING: [k(r([-0.12, 1.2, 0.33], [0.3, 0, 1], UP, 'B'), L_ARM, 0.3, 0), k(r([-0.12, 1.33, 0.33], [0, 0.8, 0.6], [0, 0.4, -0.9], 'B'), L_ARM, 0.4, 0.08)],
  NOW: [kb(r([-0.14, 1.32, 0.32], FW, UP, 'Y'), 0.3, 0), kb(r([-0.14, 1.24, 0.34], FW, UP, 'Y'), 0.18, 0.08)],
  TOMORROW: [k(r([-0.08, 1.63, 0.13], UP, IN, 'A'), null, 0.3, 0.05), k(r([-0.13, 1.6, 0.3], [0, 0.5, 1], IN, 'A'), null, 0.3, 0.08)],
  YESTERDAY: [k(r([-0.07, 1.62, 0.13], UP, IN, 'A'), null, 0.3, 0.05), k(r([-0.12, 1.67, 0.05], UP, IN, 'A'), null, 0.3, 0.08)],
  TIME: [
    k(r([-0.02, 1.29, 0.31], [0.3, -0.6, 0.6], DN, '1'), r([0.06, 1.2, 0.31], [-1, 0, 0.3], DN, 'S'), 0.3, 0, { brow: 0.4 }),
    k(r([-0.02, 1.26, 0.31], [0.3, -0.6, 0.6], DN, '1'), r([0.06, 1.2, 0.31], [-1, 0, 0.3], DN, 'S'), 0.12, 0),
    k(r([-0.02, 1.29, 0.31], [0.3, -0.6, 0.6], DN, '1'), r([0.06, 1.2, 0.31], [-1, 0, 0.3], DN, 'S'), 0.12, 0),
    k(r([-0.02, 1.26, 0.31], [0.3, -0.6, 0.6], DN, '1'), r([0.06, 1.2, 0.31], [-1, 0, 0.3], DN, 'S'), 0.12, 0.05),
  ],
  EAT: [k(r([-0.02, 1.6, 0.24], [0.3, 0.3, -1], DN, 'flatO'), null, 0.3, 0), k(r([-0.02, 1.62, 0.19], [0.3, 0.3, -1], DN, 'flatO'), null, 0.14, 0), k(r([-0.02, 1.6, 0.24], [0.3, 0.3, -1], DN, 'flatO'), null, 0.12, 0), k(r([-0.02, 1.62, 0.19], [0.3, 0.3, -1], DN, 'flatO'), null, 0.14, 0.05)],
  DRINK: [k(r([-0.04, 1.54, 0.22], UP, IN, 'C'), null, 0.3, 0.05), k(r([-0.03, 1.6, 0.19], [0.3, 0.8, -0.5], IN, 'C'), null, 0.3, 0.1)],
  WATER: [k(r([-0.02, 1.53, 0.18], UP, IN, 'W'), null, 0.3, 0), k(r([-0.02, 1.54, 0.155], UP, IN, 'W'), null, 0.12, 0), k(r([-0.02, 1.53, 0.18], UP, IN, 'W'), null, 0.12, 0), k(r([-0.02, 1.54, 0.155], UP, IN, 'W'), null, 0.12, 0.05)],
  KEY: [
    k(r([-0.03, 1.28, 0.31], IN, DN, 'X'), r([0.05, 1.28, 0.31], UP, [-1, 0, 0], 'B'), 0.3, 0.05),
    k(r([-0.03, 1.28, 0.31], IN, BK, 'X'), r([0.05, 1.28, 0.31], UP, [-1, 0, 0], 'B'), 0.25, 0.1),
  ],
  MONEY: [
    k(r([0.03, 1.28, 0.32], DN, BK, 'flatO'), L_PALM_UP, 0.3, 0),
    k(r([0.03, 1.235, 0.32], DN, BK, 'flatO'), L_PALM_UP, 0.12, 0),
    k(r([0.03, 1.27, 0.32], DN, BK, 'flatO'), L_PALM_UP, 0.12, 0),
    k(r([0.03, 1.235, 0.32], DN, BK, 'flatO'), L_PALM_UP, 0.12, 0.05),
  ],
  PAY: [k(r([0.03, 1.24, 0.28], [0.1, -0.2, 1], DN, '1'), L_PALM_UP, 0.3, 0), k(r([-0.04, 1.27, 0.46], FW, DN, '1'), L_PALM_UP, 0.25, 0.08)],
  FREE: [kb(r([0.03, 1.3, 0.25], UP, BK, 'F'), 0.3, 0.05), kb(r([-0.2, 1.33, 0.3], [-0.2, 1, 0], FW, 'F'), 0.3, 0.08)],
  SLEEP: [k(r([-0.11, 1.66, 0.09], UP, IN, 'B'), null, 0.35, 0.35, { tilt: 1, eyes: 0.2 })],
  BATHROOM: (() => {
    const a = r([-0.14, 1.3, 0.32], UP, FW, 'T');
    return [k(a, null, 0.28, 0), k(mv(a, [-0.03, 0, 0]), null, 0.1, 0), k(mv(a, [0.03, 0, 0]), null, 0.12, 0), k(mv(a, [-0.03, 0, 0]), null, 0.12, 0), k(a, null, 0.1, 0.05)];
  })(),
  CLEAN: [k(r([0.02, 1.235, 0.25], [0.4, 0, 1], DN, 'B'), L_PALM_UP, 0.3, 0), k(r([0.02, 1.235, 0.42], [0.4, 0, 1], DN, 'B'), L_PALM_UP, 0.3, 0.06)],
  HELP: [
    k(r([0.02, 1.26, 0.32], UP, IN, 'A'), L_PALM_UP, 0.3, 0.05),
    k(r([0.02, 1.34, 0.32], UP, IN, 'A'), mv(L_PALM_UP, [0, 0.08, 0]), 0.3, 0.08),
  ],
  WHERE: (() => {
    const a = r([-0.12, 1.34, 0.33], UP, FW, '1');
    const f = { brow: -1 };
    return [k(a, null, 0.28, 0, f), k(mv(a, [-0.035, 0, 0], { f: [-0.3, 1, 0] }), null, 0.12, 0, f), k(mv(a, [0.035, 0, 0], { f: [0.3, 1, 0] }), null, 0.14, 0, f), k(mv(a, [-0.035, 0, 0], { f: [-0.3, 1, 0] }), null, 0.14, 0, f), k(a, null, 0.12, 0.05, f)];
  })(),
  WHAT: (() => {
    const a = r([-0.17, 1.24, 0.33], [0.3, 0, 1], UP, '5');
    const f = { brow: -1 };
    return [kb(a, 0.3, 0, f), kb(mv(a, [-0.03, 0, 0]), 0.13, 0, f), kb(a, 0.13, 0, f), kb(mv(a, [-0.03, 0, 0]), 0.13, 0.05, f)];
  })(),
  HOW: [kb(r([-0.03, 1.28, 0.3], DN, BK, 'bentB'), 0.3, 0.05, { brow: -1 }), kb(r([-0.05, 1.28, 0.34], FW, UP, 'bentB'), 0.3, 0.08, { brow: -1 })],
  WHEN: [
    k(r([-0.03, 1.36, 0.31], [0.3, 0.3, 1], DN, '1'), L_INDEX_UP, 0.3, 0, { brow: -1 }),
    ...circle([-0.02, 1.36, 0.31], 0.03, '1', [0.3, 0.3, 1], DN, 3).slice(1).map((f) => ({ ...f, L: L_INDEX_UP, face: { brow: -1 } })),
    k(r([0.02, 1.33, 0.31], [0.3, -0.4, 1], DN, '1'), L_INDEX_UP, 0.16, 0.08, { brow: -1 }),
  ],
  WHY: [k(r([-0.07, 1.8, 0.14], [0.3, 1, 0], BK, 'B'), null, 0.3, 0.05, { brow: -1 }), k(r([-0.12, 1.72, 0.3], [0.2, 1, 0.3], BK, 'Y'), null, 0.3, 0.08, { brow: -1 })],
  GOOD: [k(r([-0.02, 1.57, 0.13], UP, BK, 'B'), mv(L_PALM_UP, [0, 0.04, 0]), 0.35, 0.05, { smile: 1 }), k(r([0.0, 1.29, 0.33], [0.3, 0, 1], UP, 'B'), mv(L_PALM_UP, [0, 0.04, 0]), 0.4, 0.08, { smile: 1, nod: 1 })],
  FINE: [k(r([-0.05, 1.33, 0.25], UP, IN, '5'), null, 0.3, 0), k(r([-0.05, 1.33, 0.22], UP, IN, '5'), null, 0.12, 0), k(r([-0.05, 1.33, 0.25], UP, IN, '5'), null, 0.12, 0.08, { smile: 1 })],
  WAIT: [kb(r([-0.2, 1.22, 0.3], [-0.1, 0, 1], UP, '5'), 0.3, 0), kb(r([-0.2, 1.22, 0.3], [-0.1, 0, 1], UP, 'claw'), 0.14, 0), kb(r([-0.2, 1.22, 0.3], [-0.1, 0, 1], UP, '5'), 0.14, 0), kb(r([-0.2, 1.22, 0.3], [-0.1, 0, 1], UP, 'claw'), 0.14, 0.05)],
  PHONE: [k(r([-0.1, 1.64, 0.12], [0.3, -0.35, 1], IN, 'Y'), null, 0.35, 0.3)],
  CAR: (() => {
    const R1 = r([-0.12, 1.3, 0.33], UP, IN, 'S');
    const L1 = mir(R1);
    return [k(R1, L1, 0.3, 0), k(mv(R1, [0, 0.04, 0]), mv(L1, [0, -0.04, 0]), 0.2, 0), k(mv(R1, [0, -0.04, 0]), mv(L1, [0, 0.04, 0]), 0.2, 0), k(R1, L1, 0.18, 0.05)];
  })(),
  FLOOR: [kb(r([-0.04, 1.2, 0.34], FW, DN, 'B'), 0.3, 0), kb(r([-0.22, 1.2, 0.34], FW, DN, 'B'), 0.35, 0.05)],
  UP: [k(r([-0.14, 1.33, 0.32], UP, FW, '1'), null, 0.3, 0), k(r([-0.14, 1.5, 0.3], UP, FW, '1'), null, 0.25, 0.08)],
  DOWN: [k(r([-0.14, 1.32, 0.33], DN, BK, '1'), null, 0.3, 0), k(r([-0.14, 1.2, 0.34], DN, BK, '1'), null, 0.25, 0.08)],
  LEFT: [k(r([-0.14, 1.3, 0.33], UP, FW, 'L'), null, 0.3, 0), k(r([0.04, 1.3, 0.33], UP, FW, 'L'), null, 0.3, 0.08)],
  RIGHT: [k(r([-0.08, 1.3, 0.33], UP, FW, 'R'), null, 0.3, 0), k(r([-0.26, 1.3, 0.33], UP, FW, 'R'), null, 0.3, 0.08)],
  NUMBER: [
    k(r([-0.035, 1.3, 0.32], IN, DN, 'flatO'), r([0.035, 1.3, 0.32], [-1, 0, 0], UP, 'flatO'), 0.3, 0),
    k(r([-0.035, 1.3, 0.32], IN, UP, 'flatO'), r([0.035, 1.3, 0.32], [-1, 0, 0], DN, 'flatO'), 0.3, 0.06),
  ],
  NAME: [
    k(r([0.01, 1.3, 0.32], [1, 0, 0.3], BK, 'H'), r([0.05, 1.26, 0.33], [-1, 0, 0.3], BK, 'H'), 0.3, 0),
    k(r([0.01, 1.275, 0.32], [1, 0, 0.3], BK, 'H'), r([0.05, 1.26, 0.33], [-1, 0, 0.3], BK, 'H'), 0.12, 0),
    k(r([0.01, 1.3, 0.32], [1, 0, 0.3], BK, 'H'), r([0.05, 1.26, 0.33], [-1, 0, 0.3], BK, 'H'), 0.12, 0),
    k(r([0.01, 1.275, 0.32], [1, 0, 0.3], BK, 'H'), r([0.05, 1.26, 0.33], [-1, 0, 0.3], BK, 'H'), 0.12, 0.05),
  ],
  FINISH: [kb(r([-0.13, 1.3, 0.28], UP, BK, '5'), 0.3, 0.05), kb(r([-0.19, 1.28, 0.33], [-0.6, 0.8, 0], FW, '5'), 0.22, 0.08)],
  CHECK: [k(r([-0.02, 1.62, 0.2], [0.2, 0.3, 1], DN, '1'), L_PALM_UP, 0.3, 0.05), k(r([0.03, 1.26, 0.32], [0.2, -0.3, 1], DN, '1'), L_PALM_UP, 0.3, 0.06)],
  IN: [
    k(r([0.03, 1.33, 0.31], DN, BK, 'flatO'), r([0.05, 1.22, 0.31], [-1, 0, 0.2], BK, 'C'), 0.3, 0),
    k(r([0.03, 1.25, 0.31], DN, BK, 'flatO'), r([0.05, 1.22, 0.31], [-1, 0, 0.2], BK, 'C'), 0.25, 0.08),
  ],
  OUT: [
    k(r([0.03, 1.24, 0.31], DN, BK, '5'), r([0.05, 1.22, 0.31], [-1, 0, 0.2], BK, 'C'), 0.3, 0),
    k(r([0.03, 1.36, 0.31], DN, BK, 'flatO'), r([0.05, 1.22, 0.31], [-1, 0, 0.2], BK, 'C'), 0.25, 0.08),
  ],
  STAY: [kb(r([-0.14, 1.3, 0.33], FW, DN, 'Y'), 0.3, 0), kb(r([-0.14, 1.23, 0.34], FW, DN, 'Y'), 0.25, 0.08)],
  LOVE: [k(r([0.05, 1.33, 0.2], [0.7, 1, 0], BK, 'S'), r([-0.05, 1.33, 0.22], [-0.7, 1, 0], BK, 'S'), 0.35, 0.3, { smile: 1 })],
  ILY: [k(r([-0.16, 1.4, 0.32], UP, FW, 'ILY'), null, 0.35, 0.35, { smile: 1 })],
  HAPPY: [
    k(r([-0.05, 1.27, 0.2], [0.5, 1, 0], BK, 'B'), null, 0.3, 0, { smile: 1 }),
    k(r([-0.05, 1.36, 0.2], [0.5, 1, 0], BK, 'B'), null, 0.14, 0, { smile: 1 }),
    k(r([-0.05, 1.27, 0.2], [0.5, 1, 0], BK, 'B'), null, 0.12, 0, { smile: 1 }),
    k(r([-0.05, 1.36, 0.2], [0.5, 1, 0], BK, 'B'), null, 0.14, 0.05, { smile: 1 }),
  ],
  DEAF: [k(r([-0.13, 1.69, 0.08], [0.5, 0.5, 0.2], BK, '1'), null, 0.35, 0.05), k(r([-0.04, 1.6, 0.17], [0.3, 0.5, -0.4], BK, '1'), null, 0.3, 0.08)],
  SIGN: (() => {
    const out = [];
    for (let i = 0; i <= 4; i++) {
      const a = (i / 4) * Math.PI * 2;
      const R1 = r([-0.1 + Math.sin(a) * 0.04, 1.32 + Math.cos(a) * 0.04, 0.33], [0.4, 0.4, 1], DN, '1');
      const L1 = r([0.1 - Math.sin(a + Math.PI) * 0.04, 1.32 + Math.cos(a + Math.PI) * 0.04, 0.33], [-0.4, 0.4, 1], DN, '1');
      out.push(k(R1, L1, i === 0 ? 0.3 : 0.14, 0));
    }
    return out;
  })(),
  UNDERSTAND: [k(r([-0.1, 1.77, 0.12], UP, BK, 'S'), null, 0.35, 0.05, { brow: 0.5 }), k(r([-0.1, 1.78, 0.12], UP, BK, '1'), null, 0.12, 0.1, { brow: 0.5, nod: 1 })],
  AGAIN: [k(r([-0.02, 1.33, 0.32], [0.3, 0.3, 1], UP, 'bentB'), L_PALM_UP, 0.3, 0), k(r([0.03, 1.25, 0.32], [0.3, -0.2, 1], DN, 'bentB'), L_PALM_UP, 0.25, 0.08)],
  SEE: [k(r([-0.06, 1.66, 0.18], [0.2, 0.2, 1], DN, 'V'), null, 0.35, 0.05), k(r([-0.07, 1.58, 0.4], [0.1, 0, 1], DN, 'V'), null, 0.3, 0.08)],
  GIVE: [k(r([-0.1, 1.3, 0.25], [0, 0.5, 1], UP, 'flatO'), null, 0.3, 0), k(r([-0.1, 1.28, 0.45], FW, UP, 'flatO'), null, 0.3, 0.08)],
  MORE: [
    k(r([-0.07, 1.3, 0.33], IN, BK, 'flatO'), r([0.07, 1.3, 0.33], [-1, 0, 0], BK, 'flatO'), 0.3, 0),
    k(r([-0.03, 1.3, 0.33], IN, BK, 'flatO'), r([0.03, 1.3, 0.33], [-1, 0, 0], BK, 'flatO'), 0.12, 0),
    k(r([-0.07, 1.3, 0.33], IN, BK, 'flatO'), r([0.07, 1.3, 0.33], [-1, 0, 0], BK, 'flatO'), 0.12, 0),
    k(r([-0.03, 1.3, 0.33], IN, BK, 'flatO'), r([0.03, 1.3, 0.33], [-1, 0, 0], BK, 'flatO'), 0.12, 0.05),
  ],
  CAN: [kb(r([-0.14, 1.34, 0.33], FW, DN, 'S'), 0.3, 0), kb(r([-0.14, 1.25, 0.34], FW, DN, 'S'), 0.2, 0.08, { nod: 1 })],
  NOT: [k(r([-0.03, 1.53, 0.15], UP, IN, 'A'), null, 0.3, 0.05, { shake: 1 }), k(r([-0.06, 1.48, 0.36], [0, 0.6, 1], IN, 'A'), null, 0.25, 0.08, { shake: 1 })],
  SWIM: [kb(r([-0.03, 1.28, 0.3], FW, DN, 'B'), 0.3, 0), kb(r([-0.2, 1.28, 0.42], [-0.4, 0, 1], DN, 'B'), 0.4, 0.05)],
  EXERCISE: [kb(r([-0.2, 1.5, 0.18], UP, FW, 'S'), 0.3, 0), kb(r([-0.2, 1.6, 0.18], UP, FW, 'S'), 0.18, 0), kb(r([-0.2, 1.5, 0.18], UP, FW, 'S'), 0.18, 0), kb(r([-0.2, 1.6, 0.18], UP, FW, 'S'), 0.18, 0.05)],
  DOCTOR: [
    k(r([0.06, 1.24, 0.3], DN, BK, 'claw'), L_PALM_UP, 0.3, 0),
    k(r([0.06, 1.215, 0.3], DN, BK, 'claw'), L_PALM_UP, 0.12, 0),
    k(r([0.06, 1.24, 0.3], DN, BK, 'claw'), L_PALM_UP, 0.12, 0),
    k(r([0.06, 1.215, 0.3], DN, BK, 'claw'), L_PALM_UP, 0.12, 0.05),
  ],
  EMERGENCY: (() => {
    const a = r([-0.17, 1.45, 0.3], UP, FW, 'E');
    const f = { brow: -1 };
    return [k(a, null, 0.28, 0, f), k(mv(a, [-0.04, 0, 0]), null, 0.1, 0, f), k(mv(a, [0.03, 0, 0]), null, 0.12, 0, f), k(mv(a, [-0.04, 0, 0]), null, 0.12, 0, f), k(a, null, 0.1, 0.05, f)];
  })(),
  LATE: [k(r([-0.3, 1.2, 0.12], DN, BK, 'B'), null, 0.3, 0), k(r([-0.3, 1.2, 0.1], [0, -1, -0.6], BK, 'B'), null, 0.14, 0), k(r([-0.3, 1.2, 0.12], DN, BK, 'B'), null, 0.14, 0.05)],
  ELEVATOR: [k(r([-0.02, 1.2, 0.3], UP, IN, 'E'), r([0.04, 1.28, 0.3], UP, [-1, 0, 0], '1'), 0.3, 0), k(r([-0.02, 1.4, 0.3], UP, IN, 'E'), r([0.04, 1.28, 0.3], UP, [-1, 0, 0], '1'), 0.4, 0.06)],
  HOTEL: [
    k(r([0.02, 1.36, 0.3], IN, BK, 'H'), r([0.04, 1.25, 0.3], UP, BK, '1'), 0.3, 0),
    k(r([0.02, 1.36, 0.3], [1, -0.4, 0], BK, 'H'), r([0.04, 1.25, 0.3], UP, BK, '1'), 0.14, 0),
    k(r([0.02, 1.36, 0.3], IN, BK, 'H'), r([0.04, 1.25, 0.3], UP, BK, '1'), 0.14, 0.05),
  ],
  PARKING: [k(r([0.02, 1.32, 0.3], [0.3, 0, 1], IN, '3'), L_PALM_UP, 0.3, 0), k(r([0.03, 1.25, 0.31], [0.3, 0, 1], IN, '3'), L_PALM_UP, 0.25, 0.08)],
};
// Namaste: the Indian greeting (not an ASL sign): palms pressed together at the chest, fingers up, a small bow
// (as in the ISLRTC dictionary video). The hands come up apart, palms facing, and close sideways into the
// press, then open sideways before dropping; going straight from rest, the fingertips meet first and the
// hands make a "roof" on the way up and down. tuck: elbows stay down at her sides, wrists bent back.
const namaste = (x, y, z, tilt) => [r([-x, y, z], [0, 1, tilt], IN, 'flat'), r([x, y, z], [0, 1, tilt], [-1, 0, 0], 'flat')];
SIGNS.NAMASTE = [
  // lifting: hands wide, fingers forward (from rest the fingers point at each other and would touch)
  { ...k(...namaste(0.12, 1.2, 0.32, 0.9), 0.22, 0, { smile: 1 }), tuck: 1 },
  { ...k(...namaste(0.055, 1.31, 0.32, 0.15), 0.25, 0, { smile: 1 }), tuck: 1 },
  { ...k(...namaste(0.008, 1.33, 0.32, 0.2), 0.22, 0.15, { smile: 1 }), press: 1, tuck: 1 },
  { ...k(...namaste(0.008, 1.315, 0.33, 0.3), 0.3, 0.6, { smile: 1, nod: 1 }), press: 1, tuck: 1 },
  { ...k(...namaste(0.055, 1.31, 0.32, 0.18), 0.22, 0, { smile: 1 }), tuck: 1 },
  { ...k(...namaste(0.12, 1.2, 0.32, 0.9), 0.22, 0, { smile: 1 }), tuck: 1 },
];
SIGNS.CALL = SIGNS.PHONE;
SIGNS.TAXI = SIGNS.CAR;

export const VOCAB = Object.keys(SIGNS);

// ---------- Dataset signs ----------
// Signs converted from the WLASL video dataset by tools/wlasl/extract.py (licence: C-UDA,
// non-commercial). One JSON file per sign, fetched the first time it is needed.
// Hand-authored SIGNS above take priority over dataset signs with the same name.
const DATASET_URL = 'signs/wlasl/';
const DATASET = {}; // token -> frames
let datasetIndex = new Set();
let datasetPhrases = []; // [regex, token] for multi-word signs like WAKE-UP, HEART-ATTACK
const aslReady = fetch(DATASET_URL + 'index.json')
  .then((r) => (r.ok ? r.json() : []))
  .then((list) => {
    datasetIndex = new Set(list);
    datasetPhrases = list
      .filter((t) => t.includes('-') && !SIGNS[t])
      .sort((a, b) => b.length - a.length)
      .map((t) => [new RegExp(`\\b${t.toLowerCase().split('-').join('\\s+')}\\b`, 'g'), t]);
    return datasetIndex;
  })
  .catch(() => datasetIndex);


// ---------- Indian Sign Language (pilot) ----------
// Signs converted from the INCLUDE dataset (CC BY 4.0) by tools/include/fetch.py + tools/wlasl/extract.py --set isl.
// It has ~260 everyday words, so in ISL mode a word without an Indian sign falls back to its American
// sign, and signSource() tells the caption which language each sign is in.
const ISL_URL = 'signs/isl/';
// INCLUDE folder names that cover several glosses (or a gloss spelled differently)
const ISL_ALIAS = {
  'BIG-LARGE': ['BIG', 'LARGE'], 'SMALL-LITTLE': ['SMALL', 'LITTLE'], 'STORE-OR-SHOP': ['STORE', 'SHOP'], 'STREET-OR-ROAD': ['STREET', 'ROAD'],
  I: ['ME', 'I'], 'CELL-PHONE': ['CELL-PHONE', 'PHONE'], COLOUR: ['COLOUR', 'COLOR'], GREY: ['GREY', 'GRAY'], NEIGHBOUR: ['NEIGHBOUR', 'NEIGHBOR'],
  PANT: ['PANT', 'PANTS'], 'T-SHIRT': ['T-SHIRT', 'TSHIRT'], 'EX-MONSOON': [],
};
const INDIAN_AUTHORED = new Set(['NAMASTE']); // hand-authored signs that are Indian, not ASL
const ISL = {}; // token -> frames
const islFile = new Map(); // token -> file name
let islPhrases = [];
// ISL-only build: Meera signs Indian Sign Language only (CISLR + INCLUDE signs, plus NAMASTE).
// American signs (the hand-authored ASL set and WLASL) are never used; a word with no Indian sign is
// fingerspelled, and numbers use the Indian number signs.
export const ISL_ONLY = true;
let signLang = 'isl';
export const setSignLanguage = (lang) => (signLang = ISL_ONLY || lang === 'isl' ? 'isl' : 'asl');
export const signLanguage = () => signLang;
const islReady = fetch(ISL_URL + 'index.json')
  .then((r) => (r.ok ? r.json() : []))
  .then((list) => {
    for (const f of list) for (const t of ISL_ALIAS[f] || [f]) islFile.set(t, f);
    islPhrases = [...islFile.keys()]
      .filter((t) => t.includes('-'))
      .sort((a, b) => b.length - a.length)
      .map((t) => [new RegExp(`\\b${t.toLowerCase().split('-').join('\\s+')}\\b`, 'g'), t]);
  })
  .catch(() => {});
export const datasetReady = Promise.all([aslReady, islReady]).then(() => datasetIndex);
const useISL = (tok) => signLang === 'isl' && islFile.has(tok);
// 'isl' or 'asl': the language a token is signed in right now (fingerspelling is the ASL alphabet)
// (ISL-only: fingerspelling uses the two-handed ISL alphabet, so it is Indian too)
export const signSource = (tok) => (useISL(tok) || INDIAN_AUTHORED.has(tok) || (ISL_ONLY && (tok.startsWith('FS:') || /^[A-Z]$/.test(tok))) ? 'isl' : 'asl');

export const hasSign = (tok) => (ISL_ONLY ? useISL(tok) || INDIAN_AUTHORED.has(tok) : !!SIGNS[tok] || datasetIndex.has(tok) || useISL(tok));

// Indian number signs (from the dataset) for each digit; numbers are signed digit by digit.
const DIGIT_SIGN = ['ZERO', 'ONE', 'TWO', 'THREE', 'FOUR', 'FIVE', 'SIX', 'SEVEN', 'EIGHT', 'NINE'];
const islDigits = (num) => (ISL_ONLY && [...num].every((d) => useISL(DIGIT_SIGN[d])) ? [...num].map((d) => DIGIT_SIGN[d]) : [num]);

// Video tracking sometimes misreads a hand for a single keyframe (~60 ms): a finger jumps half-bent and
// back, or the palm flips around and back. Those one-keyframe spikes play as flutter / flips, so they are
// replaced by the average of the two neighbouring keyframes. Palm positions are never changed, and a
// spike that is part of a repeating pattern (signs that open and close the hand, like MILK) is kept.
const angDeg = (a, b) => (Math.acos(Math.max(-1, Math.min(1, (a[0] * b[0] + a[1] * b[1] + a[2] * b[2]) / (Math.hypot(...a) * Math.hypot(...b) || 1)))) * 180) / Math.PI;
export function despike(frames) {
  const out = frames.map((f) => ({ ...f, R: f.R && { ...f.R }, L: f.L && { ...f.L } }));
  for (let i = 1; i < frames.length - 1; i++) {
    for (const s of ['R', 'L']) {
      const a = frames[i - 1][s], b = frames[i][s], c = frames[i + 1][s];
      if (!a || !b || !c) continue;
      const a2 = frames[i - 2]?.[s], c2 = frames[i + 2]?.[s];
      if (Array.isArray(b.h) && Array.isArray(a.h) && Array.isArray(c.h)) {
        const h = b.h.slice();
        for (let k = 0; k < 16; k++) {
          const spike = Math.abs(b.h[k] - a.h[k]) > 0.45 && Math.abs(b.h[k] - c.h[k]) > 0.45 && Math.abs(a.h[k] - c.h[k]) < 0.2;
          const repeats = (a2?.h && Math.abs(a2.h[k] - b.h[k]) < 0.2) || (c2?.h && Math.abs(c2.h[k] - b.h[k]) < 0.2);
          if (spike && !repeats) h[k] = (a.h[k] + c.h[k]) / 2;
        }
        out[i][s].h = h;
      }
      const flip = Math.max(angDeg(a.n, b.n), angDeg(a.f, b.f)) > 60 && Math.max(angDeg(b.n, c.n), angDeg(b.f, c.f)) > 60 && Math.max(angDeg(a.n, c.n), angDeg(a.f, c.f)) < 35;
      const repeats = (a2 && angDeg(a2.n, b.n) < 35) || (c2 && angDeg(c2.n, b.n) < 35);
      if (flip && !repeats) {
        out[i][s].f = a.f.map((v, k) => (v + c.f[k]) / 2);
        out[i][s].n = a.n.map((v, k) => (v + c.n[k]) / 2);
      }
    }
  }
  return out;
}

// The same misreading over 2-3 keyframes (a still or blurry hand seen edge-on: the palm flips round, or
// the fingers swing sideways, then back; WHERE's resting hand, BABY). A real hand can't turn away and
// back that fast, so a run that leaves and returns to the same orientation at over GLITCH_DPS is
// bridged smoothly from the keyframe before it to the one after it.
const GLITCH_DPS = 900;
export function deglitch(frames) {
  const out = frames.map((f) => ({ ...f, R: f.R && { ...f.R }, L: f.L && { ...f.L } }));
  const turn = (x, y) => Math.max(angDeg(x.f, y.f), angDeg(x.n, y.n));
  const unit = (v) => { const l = Math.hypot(...v) || 1; return v.map((x) => x / l); };
  for (const s of ['R', 'L']) {
    for (let i = 1; i < out.length - 1; i++) {
      for (const len of [3, 2]) {
        const a = out[i - 1][s], c = out[i + len]?.[s];
        const mid = out.slice(i, i + len).map((f) => f[s]);
        if (!a || !c || mid.some((m) => !m)) continue;
        const secs = out.slice(i, i + len + 1).reduce((t, f) => t + (f.t || 0.05), 0);
        // the whole hand darts away and back; or just the fingers do, while the palm makes a real turn
        // (WHERE's resting hand turns palm-up, and on the way the fingers swing round into her body)
        const away = Math.min(...mid.map((m) => Math.min(turn(a, m), turn(m, c))));
        const awayF = Math.min(...mid.map((m) => Math.min(angDeg(a.f, m.f), angDeg(m.f, c.f))));
        const whole = turn(a, c) <= 35 && away >= 60 && (2 * away) / secs >= GLITCH_DPS;
        const fingers = angDeg(a.f, c.f) <= 70 && awayF >= 90 && (2 * awayF) / secs >= GLITCH_DPS;
        if (!whole && !fingers) continue;
        mid.forEach((m, j) => {
          const u = (j + 1) / (len + 1);
          m.f = unit(a.f.map((v, k) => v + (c.f[k] - v) * u));
          m.n = unit(a.n.map((v, k) => v + (c.n[k] - v) * u));
        });
        i += len - 1;
        break;
      }
    }
  }
  return out;
}

// A hand down at rest height in the video is the signer's other hand hanging at their side (or a hand
// on its way down), where tracking reads it worst: fingers "up" by the hip, palm flipped, an arm so
// straight its elbow swings about (THEIR's left hand spun round). Meera stands at a counter, so there
// the hand eases into her own rest on the counter: unchanged above SETTLE_HI, fully at rest by SETTLE_LO.
const SETTLE_HI = 1.16, SETTLE_LO = 1.06; // (from 1.1: a hand at 1.08 stayed on her hip, elbow out; GOVERNMENT)
// A hand the tracker didn't see at all (keyframe 'est': its turn and shape were filled in from another
// moment, only the arm's position is real) settles from higher up: HELP's left hand otherwise held a
// made-up pose out at her waist before rising to meet the other hand.
const SETTLE_EST_HI = 1.32, SETTLE_EST_LO = 1.16;
let restShape = null;
export function settle(frames) {
  restShape ||= shapeArray('rest');
  const unit = (v) => { const l = Math.hypot(...v) || 1; return v.map((x) => x / l); };
  const mix = (a, b, w) => a.map((x, i) => x + (b[i] - x) * w);
  // a hand resting or unseen in most of the sign is the passive hand: it rests throughout (HOTEL's
  // left hand, tracked in just its first keyframe, sat on her hip there)
  const passive = {};
  for (const s of ['R', 'L']) {
    const hs = frames.map((f) => f[s]).filter((h) => h?.p);
    passive[s] = hs.length > 0 && hs.filter((h) => h.est || h.p[1] < SETTLE_HI).length / hs.length >= 0.6;
  }
  return frames.map((f) => {
    let out = f;
    for (const s of ['R', 'L']) {
      const h = f[s];
      if (!h?.p) continue;
      const [hi, lo] = h.est ? [SETTLE_EST_HI, SETTLE_EST_LO] : [SETTLE_HI, SETTLE_LO];
      const w = passive[s] ? 1 : Math.max(0, Math.min(1, (hi - h.p[1]) / (hi - lo)));
      if (!w) continue;
      const rest = REST[s];
      out = out === f ? { ...f } : out;
      out[s] = { ...h, p: mix(h.p, rest.p, w), f: unit(mix(h.f, rest.f, w)), n: unit(mix(h.n, rest.n, w)), h: Array.isArray(h.h) ? mix(h.h, restShape, w) : h.h };
    }
    return out;
  });
}

// The CISLR clips are 300x300, so a hand is ~30 pixels: finger tracking squeezes every finger toward
// half-bent (a fist reads ~0.7, a pointing index ~0.3 beside ~0.6 curled fingers), and Meera's hands
// looked vague and claw-like. Sharpen within each hand: where the fingers clearly differ (DEAF's index),
// the straighter ones straighten and the others curl in; where they agree, a firmly bent hand closes
// into a fist and a mostly straight one flattens. Real half-curves (C, O) are left as they are. The
// decisions use finger bends averaged over neighbouring keyframes, so a hand doesn't flicker.
const CRISP = 0.6; // how far toward straight / curled (0..1)
export function crisp(frames) {
  const bends = (h) => [0, 1, 2, 3].map((i) => (h[3 * i] + h[3 * i + 1] + h[3 * i + 2]) / 3);
  return frames.map((f, i) => {
    let out = f;
    for (const s of ['R', 'L']) {
      const h = f[s]?.h;
      if (!Array.isArray(h) || h.length < 12) continue;
      const near = [frames[i - 1], f, frames[i + 1]].map((g) => g?.[s]?.h).filter((x) => Array.isArray(x) && x.length >= 12);
      const m = bends(h).map((_, k) => near.reduce((a, x) => a + bends(x)[k], 0) / near.length);
      const hi = Math.max(...m), lo = Math.min(...m), avg = m.reduce((a, x) => a + x, 0) / 4;
      const nh = h.slice();
      for (let k = 0; k < 4; k++) {
        let to = null;
        if (hi - lo > 0.25) to = m[k] < (hi + lo) / 2 ? 0 : 1;
        else if (avg > 0.62) to = 1;
        else if (avg < 0.3) to = 0;
        if (to === null) continue;
        for (let j = 0; j < 3; j++) nh[3 * k + j] += (to - nh[3 * k + j]) * CRISP;
      }
      out = out === f ? { ...f } : out;
      out[s] = { ...f[s], h: nh };
    }
    return out;
  });
}

// Some dataset clips are very short (CISLR), so keyframes can be only 0.067 s apart; a hand that
// reverses direction inside such a short step (a circling sign like FAMILY) plays as a jerk. Give every
// step at least MIN_STEP, and enough time that no palm moves faster than a brisk natural signing speed,
// nor turns faster than a wrist does in brisk signing (a quick turn read from video otherwise spins).
const MAX_SPEED = 1.1; // metres per second
const MAX_TURN = 450; // degrees per second
const MIN_STEP = 0.13; // seconds
// the whole hand's turn between two orientations (fingers f, palm n): more than either direction alone
// turns when the hand rotates about an axis between them
const cross3 = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const unit3 = (v) => { const l = Math.hypot(...v) || 1; return v.map((x) => x / l); };
function handTurnDeg(a, b) {
  const basis = (h) => { const f = unit3(h.f), s = unit3(cross3(f, h.n)); return [f, cross3(s, f), s]; };
  const A = basis(a), B = basis(b);
  let tr = 0;
  for (let i = 0; i < 3; i++) tr += A[i][0] * B[i][0] + A[i][1] * B[i][1] + A[i][2] * B[i][2];
  return (Math.acos(Math.max(-1, Math.min(1, (tr - 1) / 2))) * 180) / Math.PI;
}
// And no sharper change of hand velocity than MAX_ACCEL between two steps (a hand reversing inside two
// short steps jolts, DISABILITY): both steps get more time, as a person slows into a turn.
const MAX_ACCEL = 35; // metres per second squared
export function pace(frames) {
  const out = frames.map((f, i) => {
    if (!i) return f;
    const prev = frames[i - 1];
    let d = 0, turn = 0;
    for (const s of ['R', 'L']) {
      if (f[s]?.p && prev[s]?.p) d = Math.max(d, Math.hypot(f[s].p[0] - prev[s].p[0], f[s].p[1] - prev[s].p[1], f[s].p[2] - prev[s].p[2]));
      if (f[s]?.f && prev[s]?.f) turn = Math.max(turn, handTurnDeg(f[s], prev[s]));
    }
    const t = Math.max(f.t || 0.05, MIN_STEP, d / MAX_SPEED, turn / MAX_TURN);
    return t !== f.t ? { ...f, t } : f;
  });
  const vel = (i, s) => out[i][s].p.map((x, k) => (x - out[i - 1][s].p[k]) / out[i].t);
  for (let pass = 0; pass < 4; pass++) {
    for (let i = 2; i < out.length; i++) {
      let a = 0;
      for (const s of ['R', 'L']) {
        if (!out[i][s]?.p || !out[i - 1][s]?.p || !out[i - 2][s]?.p) continue;
        const v1 = vel(i - 1, s), v2 = vel(i, s);
        a = Math.max(a, Math.hypot(v2[0] - v1[0], v2[1] - v1[1], v2[2] - v1[2]) / ((out[i].t + out[i - 1].t) / 2));
      }
      if (a > MAX_ACCEL) {
        const k = Math.sqrt(a / MAX_ACCEL); // (acceleration falls with the square of the time)
        out[i] = { ...out[i], t: out[i].t * k };
        out[i - 1] = { ...out[i - 1], t: out[i - 1].t * k };
      }
    }
  }
  return out;
}

// Hand corrections for signs whose video can't show a detail (a 30-pixel hand loses the thumb), checked
// against the dictionary video: applied as the sign loads, so re-converting doesn't undo them.
const raised = (h) => h && h.p[1] > 1.12;
const withShape = (side, name) => (frames) => {
  const s = shapeArray(name);
  return frames.map((f) => (raised(f[side]) ? { ...f, [side]: { ...f[side], h: s } } : f));
};
// While the hand is up (above `from`, fully by `full`), ease it toward a pose: any of p (position),
// dp (shift), f (finger direction; the palm is kept square to it), n (palm direction), shape.
const toward = (side, from, full, { p, dp, f, n, shape }) => (frames) => {
  const u = (v) => { const l = Math.hypot(...v) || 1; return v.map((x) => x / l); };
  const mix = (a, b, w) => a.map((x, i) => x + (b[i] - x) * w);
  const s = shape && shapeArray(shape);
  return frames.map((fr) => {
    const h = fr[side];
    if (!h?.p) return fr;
    const w = Math.max(0, Math.min(1, (h.p[1] - from) / (full - from)));
    if (!w) return fr;
    let P = h.p, F = h.f, N = h.n, H = h.h;
    if (p) P = mix(P, p, w);
    if (dp) P = P.map((x, i) => x + dp[i] * w);
    if (f) F = u(mix(F, f, w));
    if (n) N = u(mix(N, n, w));
    N = u(N.map((x, i) => x - F[i] * (N[0] * F[0] + N[1] * F[1] + N[2] * F[2]))); // square to the fingers
    if (s && Array.isArray(H)) H = mix(H, s, w);
    return { ...fr, [side]: { ...h, p: P, f: F, n: N, h: H } };
  });
};
export const ISL_FIX = {
  I: withShape('R', 'A'), // thumb-up fist toward herself (read as a loose, half-bent hand)
  THREE: withShape('R', 'W'), // index, middle and ring up, thumb holding the little finger (read as a flat hand)
  // palm over the eyes (only the fingertips are seen near the face, and eyes aren't fingertip contacts)
  NIGHT: toward('R', 1.45, 1.58, { p: [-0.01, 1.72, 0.17], f: [0.3, 0.95, 0], n: [0, 0, -1], shape: 'flat' }),
  // index pointing down (low-quality tracking read it pointing forward, fingers half-bent)
  FLOOR: toward('R', 1.2, 1.3, { f: [0.15, -0.9, 0.4], shape: '1' }),
  // two fingers together, pointing across the chest, a little lower (read as a claw at the shoulder)
  // (its path peaks ~6 cm above the rest, at her shoulder; the signer's stays at the chest: lowered more there)
  NAME: (fr) => toward('R', 1.33, 1.4, { dp: [0, -0.06, 0] })(toward('R', 1.2, 1.3, { dp: [0.03, -0.07, 0], f: [0.9, -0.1, 0.4], shape: 'H' })(fr)),
};

// Fetch the dataset signs a gloss needs before playing it.
export async function loadSigns(tokens) {
  await datasetReady;
  const uniq = [...new Set(tokens)];
  const need = uniq.filter((t) => !useISL(t) && !SIGNS[t] && datasetIndex.has(t) && !DATASET[t]);
  const needISL = uniq.filter((t) => useISL(t) && !ISL[t]);
  await Promise.all([
    ...need.map((t) =>
      fetch(DATASET_URL + encodeURIComponent(t) + '.json')
        .then((r) => r.json())
        .then((d) => (DATASET[t] = despike(d.frames)))
        .catch(() => datasetIndex.delete(t))
    ),
    ...needISL.map((t) =>
      fetch(ISL_URL + encodeURIComponent(islFile.get(t)) + '.json')
        .then((r) => r.json())
        .then((d) => (ISL[t] = pace(settle((ISL_FIX[t] || ((f) => f))(crisp(deglitch(despike(d.frames))))))))
        .catch(() => islFile.delete(t))
    ),
  ]);
}

// ---------- Fingerspelling & numbers ----------
const FS_POS = [-0.17, 1.36, 0.29];
function letterPose(ch) {
  const base = r(FS_POS, UP, FW, ch);
  if ('GH'.includes(ch)) return r(FS_POS, IN, BK, ch);
  if ('PQ'.includes(ch)) return r(add(FS_POS, [0, -0.02, 0.02]), [0.3, -0.7, 0.6], BK, ch);
  if (/[0-9]/.test(ch)) return r(FS_POS, UP, '12345'.includes(ch) && false ? BK : FW, ch);
  return base;
}

// ---------- Indian Sign Language alphabet (two-handed) ----------
// Hand-made from the photos of the ISLAN dataset (Elakkiya R & Rajalakshmi E, Mendeley Data, CC BY 4.0,
// doi:10.17632/rc349j45m5.1), Signer 1, double-handed set. The photos are close-ups from the signer's
// own view, so they could not be converted automatically; these poses copy them by eye and should be
// checked by an ISL signer. Vowels: the right index touches a fingertip of the open left hand
// (A thumb, E index, I middle, O ring, U little finger).
HANDSHAPES.three = h(E, E, E, C, T.across); // index + middle + ring together (M)
HANDSHAPES.two = h(E, E, C, C, T.across); // index + middle together (F, N)
const unitv = (v) => { const n = Math.hypot(...v) || 1; return v.map((x) => x / n); };
const LP = [0.07, 1.27, 0.29]; // left hand's palm, in front of the left chest
// open left hand held sideways (fingers pointing across the body, palm toward the signer), as in the
// ISLAN photos: the fingertips then stack top to bottom (thumb on top, little finger lowest)
const LV = [0.1, 1.28, 0.3];
const L5 = r(LV, [-1, 0, 0.15], BK, '5');
const L1 = r([0.06, 1.26, 0.3], UP, BK, '1'); // left index up
const LPALM = r([0.05, 1.25, 0.31], [-0.5, 0, 1], UP, 'B'); // left palm up
// fingertips of that sideways left hand, relative to its palm (x toward the body's midline is negative)
const TIP = { thumb: [-0.045, 0.07, 0.02], index: [-0.09, 0.03, 0.015], middle: [-0.097, 0.01, 0.015], ring: [-0.092, -0.01, 0.015], little: [-0.078, -0.03, 0.015] };
// right index tip touching a point, coming down onto it from above and in front
const touch = (pt, f = [0.15, -1, -0.3], hs = '1') => r(add(pt, unitv(f).map((x) => -x * 0.095)), f, IN, hs);
const vowel = (tip) => [{ ...k(touch(add(LV, TIP[tip])), L5, 0.25, 0.2), press: 1 }];
const one = (R, L, hold = 0.22) => [{ ...k(R, L, 0.25, hold), press: 1 }];
const ISL_LETTERS = {
  A: vowel('thumb'),
  E: vowel('index'),
  I: vowel('middle'),
  O: vowel('ring'),
  U: vowel('little'),
  // J: I (middle finger), then the index draws a hook down the palm
  J: [...vowel('middle'), { ...k(touch(add(LV, [-0.05, -0.01, 0.02])), L5, 0.18, 0.04), press: 1 }, { ...k(touch(add(LV, [-0.02, -0.03, 0.02])), L5, 0.14, 0.1), press: 1 }],
  B: one(r([-0.012, 1.33, 0.31], [0.4, 0.9, 0], FW, 'O'), r([0.012, 1.26, 0.31], [-0.4, 0.9, 0], [0, 0, 1], 'O')), // two rings, one above the other
  C: one(r([-0.12, 1.33, 0.31], UP, IN, 'C'), null), // one hand
  D: one(r([0.0, 1.31, 0.31], UP, IN, 'C'), L1), // half-circle against the left index
  F: one(r([0.0, 1.31, 0.32], IN, DN, 'two'), L1), // two fingers across the left index
  G: one(r([0.03, 1.33, 0.3], FW, DN, 'S'), r([0.03, 1.26, 0.3], FW, DN, 'S')), // fist on fist
  H: [{ ...k(r([0.02, 1.28, 0.27], [0.4, 0, 1], DN, 'B'), LPALM, 0.25, 0.04), press: 1 }, { ...k(r([0.02, 1.28, 0.38], [0.4, 0, 1], DN, 'B'), LPALM, 0.2, 0.12), press: 1 }], // brush across the palm
  K: one(r([0.0, 1.37, 0.31], IN, DN, 'X'), L1), // hooked index over the left index
  L: one(r([-0.02, 1.32, 0.31], UP, IN, '1'), r([0.05, 1.27, 0.3], [-1, 0, 0.2], BK, 'B')), // index up against the flat left hand
  M: one(r([0.03, 1.275, 0.31], [0.4, 0, 1], DN, 'three'), LPALM), // three fingers on the palm
  N: one(r([0.03, 1.275, 0.31], [0.4, 0, 1], DN, 'two'), LPALM), // two fingers on the palm
  P: one(r([0.0, 1.37, 0.3], IN, FW, 'O'), L1), // ring on top of the left index
  Q: one(r([0.03, 1.21, 0.31], [0.3, -1, 0], FW, '1'), r([0.05, 1.29, 0.3], [-1, 0, 0.2], BK, 'O')), // tail under a ring
  R: one(touch(add(LP, [0.0, 0.03, 0.02]), [0.3, 0, -1], 'X'), r(LP, [-0.3, 1, 0], BK, 'B')), // curled index on the palm
  S: one(r([-0.025, 1.29, 0.31], [0.7, 0.5, 0], FW, 'I'), r([0.025, 1.27, 0.31], [-0.7, 0.5, 0], [0, 0, 1], 'I')), // little fingers hooked
  T: one(r([0.0, 1.37, 0.31], IN, DN, '1'), L1), // index across the top of the left index
  V: one(r([-0.12, 1.34, 0.31], UP, FW, 'V'), null), // one hand
  W: one(r([-0.01, 1.3, 0.32], [0.6, 0.8, 0], FW, '4'), r([0.01, 1.3, 0.3], [-0.6, 0.8, 0], [0, 0, 1], '4')), // fingers crossed
  X: one(r([0.0, 1.3, 0.32], [0.7, 0.7, 0], FW, '1'), r([0.0, 1.3, 0.3], [-0.7, 0.7, 0], [0, 0, 1], '1')), // index fingers crossed
  Y: one(r([0.05, 1.21, 0.31], DN, FW, '1'), r([0.05, 1.29, 0.3], UP, BK, 'V')), // stem under a V
  Z: [
    ...one(touch(add(LP, [0.02, 0.06, 0.02])), r(LP, [-0.3, 1, 0], BK, 'B'), 0.05),
    { ...k(touch(add(LP, [-0.03, 0.06, 0.02])), r(LP, [-0.3, 1, 0], BK, 'B'), 0.12, 0), press: 1 },
    { ...k(touch(add(LP, [0.02, 0.0, 0.02])), r(LP, [-0.3, 1, 0], BK, 'B'), 0.12, 0), press: 1 },
    { ...k(touch(add(LP, [-0.03, 0.0, 0.02])), r(LP, [-0.3, 1, 0], BK, 'B'), 0.12, 0.1), press: 1 },
  ],
};
export const hasIslLetters = () => ISL_ONLY;

// The ISL letters as camera references (islrec.js): the same frames, with hand-shape names turned
// into their numbers and directions made unit length.
export function islLetterTemplates() {
  const hand = (q) => q && { p: q.p, f: unitv(q.f), n: unitv(q.n), h: shapeArray(q.h) };
  return Object.fromEntries(Object.entries(ISL_LETTERS).map(([L, frames]) => [L, frames.map((f) => ({ t: f.t, R: hand(f.R), L: hand(f.L) }))]));
}

export function fingerspellFrames(word, gi) {
  const frames = [];
  const chars = word.toUpperCase().replace(/[^A-Z0-9]/g, '').split('');
  if (ISL_ONLY) {
    chars.forEach((ch) => {
      const ltr = ISL_LETTERS[ch];
      if (!ltr) return; // digits are signed as number signs (see islDigits), not spelled
      ltr.forEach((f, j) => frames.push({ ...f, gi, ...(j === 0 ? { letter: ch } : {}) }));
    });
    return frames;
  }
  chars.forEach((ch, i) => {
    let pose = letterPose(ch);
    if (i > 0 && chars[i - 1] === ch) pose = mv(pose, [-0.035, 0, 0]); // doubled letters slide
    const fr = k(pose, null, i === 0 ? 0.3 : 0.2, 0.22);
    fr.gi = gi;
    fr.letter = ch;
    frames.push(fr);
    if (ch === 'J') frames.push({ ...k(r(add(FS_POS, [0.02, -0.04, 0]), [0.4, 0.6, 0], BK, 'J'), null, 0.25, 0.05), gi });
    if (ch === 'Z') {
      [[0.03, 0.03], [-0.03, 0.03], [0.03, -0.03], [-0.03, -0.03]].forEach(([dx, dy]) => frames.push({ ...k(r(add(FS_POS, [dx, dy, 0]), UP, FW, 'Z'), null, 0.12, 0), gi }));
    }
  });
  return frames;
}

// Turn a list of gloss tokens into playable keyframes.
// Tokens: sign names (ROOM), 'FS:WORD' for fingerspelling, or pure digit strings.
export function buildFrames(tokens) {
  const frames = [];
  tokens.forEach((tok, gi) => {
    // a hand-authored Indian sign (NAMASTE) beats its converted video: palms that must press together
    // come out of tracking centimetres apart and jittery
    const sign = (INDIAN_AUTHORED.has(tok) && SIGNS[tok]) || (useISL(tok) && ISL[tok]) || (!ISL_ONLY && (SIGNS[tok] || DATASET[tok]));
    if (sign) {
      sign.forEach((f) => frames.push({ ...f, gi }));
    } else if (/^\d+$/.test(tok)) {
      frames.push(...fingerspellFrames(tok, gi));
    } else {
      const w = tok.startsWith('FS:') ? tok.slice(3) : tok;
      frames.push(...fingerspellFrames(w, gi));
    }
    // small pause between signs
    if (frames.length) frames[frames.length - 1] = { ...frames[frames.length - 1], hold: (frames[frames.length - 1].hold || 0) + 0.08 };
  });
  return frames;
}

// ---------- English -> gloss ----------
const PHRASES = [
  [/\bthank(s| you)\b/g, ' THANK-YOU '],
  [/\bcheck[\s-]?in\b/g, ' CHECK IN '],
  [/\bcheck[\s-]?out\b/g, ' CHECK OUT '],
  [/\bwi[\s-]?fi\b/g, ' FS:WIFI '],
  [/\bi love you\b/g, ' ILY '],
  [/\bbreakfast\b/g, ' EAT MORNING '],
  [/\bdinner\b/g, ' EAT NIGHT '],
  [/\blunch\b/g, ' EAT DAY '],
  [/\btonight\b/g, ' NOW NIGHT '],
  [/\btoday\b/g, ' NOW DAY '],
  [/\bsign language\b/g, ' SIGN '],
  [/\bwould like\b/g, ' WANT '],
  [/\bfront desk\b|\breception\b/g, ' HOTEL '],
  [/\broom service\b/g, ' ROOM GIVE '],
  // welfare-schemes vocabulary
  [/\bscholarships?\b/g, ' SCHOOL MONEY '],
  [/\bunemploy(ed|ment)\b/g, ' NOT WORK '],
  [/\bhearing aids?\b/g, ' HEARING-AID '],
];
const SYN = {
  hi: 'HELLO', hello: 'HELLO', hey: 'HELLO', welcome: 'WELCOME', bye: 'BYE', goodbye: 'BYE',
  please: 'PLEASE', sorry: 'SORRY', apologize: 'SORRY', yes: 'YES', yeah: 'YES', sure: 'YES', certainly: 'YES',
  no: 'NO', not: 'NOT', "don't": 'NOT', "can't": 'NOT', cannot: 'NOT', never: 'NOT',
  i: 'ME', me: 'ME', my: 'ME', mine: 'ME', we: 'ME', our: 'ME', us: 'ME',
  you: 'YOU', your: 'YOU', yours: 'YOU',
  want: 'WANT', wanted: 'WANT', need: 'NEED', needs: 'NEED', have: 'HAVE', has: 'HAVE',
  room: 'ROOM', rooms: 'ROOM', suite: 'ROOM', book: 'RESERVE', booking: 'RESERVE', booked: 'RESERVE', reserve: 'RESERVE', reservation: 'RESERVE', reserved: 'RESERVE',
  night: 'NIGHT', nights: 'NIGHT', day: 'DAY', days: 'DAY', morning: 'MORNING', now: 'NOW',
  tomorrow: 'TOMORROW', yesterday: 'YESTERDAY', time: 'TIME', hour: 'TIME', hours: 'TIME', minutes: 'TIME', clock: 'TIME',
  when: 'WHEN', where: 'WHERE', what: 'WHAT', which: 'WHAT', how: 'HOW', why: 'WHY',
  eat: 'EAT', food: 'EAT', meal: 'EAT', meals: 'EAT', restaurant: 'EAT', menu: 'EAT', drink: 'DRINK', drinks: 'DRINK', coffee: 'DRINK', tea: 'DRINK', bar: 'DRINK', water: 'WATER',
  key: 'KEY', keycard: 'KEY', money: 'MONEY', price: 'MONEY', prices: 'MONEY', cost: 'MONEY', costs: 'MONEY', rate: 'MONEY', rates: 'MONEY', charge: 'MONEY', fee: 'MONEY', bill: 'MONEY', invoice: 'MONEY', rupees: 'MONEY',
  pay: 'PAY', payment: 'PAY', paid: 'PAY', free: 'FREE', complimentary: 'FREE', included: 'FREE',
  sleep: 'SLEEP', bed: 'SLEEP', beds: 'SLEEP', pillow: 'SLEEP', pillows: 'SLEEP',
  bathroom: 'BATHROOM', toilet: 'BATHROOM', restroom: 'BATHROOM', washroom: 'BATHROOM',
  clean: 'CLEAN', cleaning: 'CLEAN', housekeeping: 'CLEAN', laundry: 'CLEAN', towel: 'CLEAN', towels: 'CLEAN',
  help: 'HELP', assist: 'HELP', assistance: 'HELP', support: 'HELP',
  good: 'GOOD', great: 'GOOD', nice: 'GOOD', excellent: 'GOOD', wonderful: 'GOOD', fine: 'FINE', ok: 'FS:OK', okay: 'FS:OK',
  wait: 'WAIT', moment: 'WAIT', phone: 'PHONE', call: 'CALL', dial: 'CALL',
  car: 'CAR', taxi: 'TAXI', cab: 'TAXI', drive: 'CAR', airport: 'FS:AIRPORT',
  floor: 'FLOOR', level: 'FLOOR', up: 'UP', upstairs: 'UP', rooftop: 'UP', down: 'DOWN', downstairs: 'DOWN', basement: 'DOWN', left: 'LEFT',
  number: 'NUMBER', name: 'NAME', finish: 'FINISH', done: 'FINISH', finished: 'FINISH', confirmed: 'FINISH', check: 'CHECK',
  stay: 'STAY', staying: 'STAY', love: 'LOVE', happy: 'HAPPY', glad: 'HAPPY', pleased: 'HAPPY', enjoy: 'HAPPY',
  deaf: 'DEAF', sign: 'SIGN', understand: 'UNDERSTAND', again: 'AGAIN', repeat: 'AGAIN',
  see: 'SEE', look: 'SEE', view: 'SEE', give: 'GIVE', bring: 'GIVE', send: 'GIVE', deliver: 'GIVE', provide: 'GIVE',
  more: 'MORE', extra: 'MORE', another: 'MORE', additional: 'MORE', can: 'CAN', could: 'CAN', able: 'CAN',
  swim: 'SWIM', pool: 'SWIM', swimming: 'SWIM', gym: 'EXERCISE', exercise: 'EXERCISE', fitness: 'EXERCISE', workout: 'EXERCISE',
  doctor: 'DOCTOR', medical: 'DOCTOR', hospital: 'DOCTOR', clinic: 'DOCTOR', pharmacy: 'DOCTOR', medicine: 'DOCTOR',
  emergency: 'EMERGENCY', fire: 'EMERGENCY', urgent: 'EMERGENCY', late: 'LATE',
  elevator: 'ELEVATOR', lift: 'ELEVATOR', hotel: 'HOTEL', parking: 'PARKING', park: 'PARKING',
  // welfare schemes: long official words -> the nearest dataset sign, so replies are signed rather than spelled out
  disability: 'DEAF', disabilities: 'DEAF', disabled: 'DEAF', handicapped: 'DEAF', impaired: 'DEAF', deafness: 'DEAF',
  certificate: 'DOCUMENT', certificates: 'DOCUMENT', application: 'FORM', apply: 'REQUEST', applies: 'REQUEST', applied: 'REQUEST',
  portal: 'INTERNET', online: 'INTERNET', website: 'INTERNET', site: 'INTERNET', app: 'INTERNET', download: 'INTERNET',
  income: 'EARN', salary: 'EARN', earning: 'EARN', earnings: 'EARN', pension: 'MONEY', allowance: 'MONEY', amount: 'MONEY',
  reimbursement: 'PAY', reimbursed: 'PAY', concession: 'DISCOUNT', concessional: 'DISCOUNT', subsidy: 'DISCOUNT',
  national: 'INDIA', indian: 'INDIA', citizen: 'PEOPLE', citizens: 'PEOPLE', anyone: 'ANY', older: 'OLD', loss: 'LOSE',
  district: 'LOCAL', department: 'GOVERNMENT', ministry: 'GOVERNMENT', central: 'GOVERNMENT', welfare: 'HELP', scheme: 'PROGRAM', schemes: 'PROGRAM',
  yearly: 'YEAR', annual: 'YEAR', annually: 'YEAR', course: 'CLASS', courses: 'CLASS', coaching: 'TEACH', training: 'TEACH',
  exam: 'TEST', exams: 'TEST', assessment: 'TEST', education: 'SCHOOL', institute: 'SCHOOL', institutes: 'SCHOOL',
  job: 'WORK', jobs: 'WORK', employment: 'WORK', recruitment: 'WORK', usually: 'OFTEN', severe: 'SERIOUS', profound: 'SERIOUS',
  overseas: 'INTERNATIONAL', abroad: 'INTERNATIONAL', details: 'INFORM', admission: 'ENTER', rehabilitation: 'THERAPY',
  official: 'GOVERNMENT', officially: 'GOVERNMENT', link: 'INTERNET', links: 'INTERNET', confirm: 'CHECK', fare: 'MONEY', fares: 'MONEY',
  travelling: 'TRAVEL', traveling: 'TRAVEL', percentage: 'PERCENT', device: 'MACHINE', devices: 'MACHINE', came: 'COME', attend: 'GO', receive: 'GET', received: 'GET',
  licence: 'CARD', license: 'CARD', seat: 'CHAIR', seats: 'CHAIR', agency: 'OFFICE', loan: 'BORROW', loans: 'BORROW',
};
// Not signed (ASL drops articles, "be" verbs and most prepositions, which are shown by placement).
const STOP = new Set(
  ('a an the is are am was were be been being to of for at on in into by with and or it its this that these those there here ' +
    'do does did will would shall should just so very also as from about any some then than if let lets let\'s i\'ll we\'ll ' +
    'you\'ll i\'m it\'s that\'s there\'s get got make made per each our is has had having may might must ' +
    'above across against along among around behind below beneath beside between beyond during except inside near off ' +
    'onto outside over past through throughout toward towards under underneath upon within without via ' +
    'i\'d you\'d we\'re you\'re they\'re i\'ve we\'ve you\'ve isn\'t aren\'t wasn\'t oh um uh').split(' ')
);
const MAX_SPELL = 10; // longer unknown words are left out rather than spelled letter by letter

// "booked" -> book, "rooms" -> room, "stopping" -> stop, "cities" -> city
function lemmas(w) {
  const c = [w];
  if (w.endsWith('ies')) c.push(w.slice(0, -3) + 'y');
  if (w.endsWith('es')) c.push(w.slice(0, -2));
  if (w.endsWith('s')) c.push(w.slice(0, -1));
  if (w.endsWith('ied')) c.push(w.slice(0, -3) + 'y');
  if (w.endsWith('ed')) c.push(w.slice(0, -2), w.slice(0, -1));
  if (w.endsWith('ing')) c.push(w.slice(0, -3), w.slice(0, -3) + 'e');
  const stem = c[c.length - 1];
  if (/(ed|ing)$/.test(w) && /([b-df-hj-np-tv-z])\1$/.test(stem)) c.push(stem.slice(0, -1)); // stopp -> stop
  return c;
}
const NUMWORDS = {
  zero: '0', one: '1', two: '2', three: '3', four: '4', five: '5', six: '6', seven: '7', eight: '8', nine: '9', ten: '10',
  first: '1', second: '2', third: '3', fourth: '4', fifth: '5', sixth: '6', seventh: '7', eighth: '8', ninth: '9', tenth: '10', ground: '0',
};

// ---------- ISL word order ----------
// Indian Sign Language puts time first, the verb at the end after its object (subject-object-verb),
// "can" / "not" after the verb, and question words last:
//   "I want a room tomorrow"   -> TOMORROW ME ROOM WANT
//   "Where can I eat?"         -> ME EAT CAN WHERE
//   "I do not understand."     -> ME UNDERSTAND NOT
// Each sentence is reordered on its own. Greetings stay first, thanks and "please" last.
const ISL_TIME = new Set(['NOW', 'TODAY', 'TONIGHT', 'TOMORROW', 'YESTERDAY', 'MORNING', 'NIGHT', 'EVENING', 'AFTERNOON', 'LATER', 'SOON', 'WEEK', 'MONTH', 'YEAR']);
const ISL_WH = new Set(['WHAT', 'WHERE', 'WHEN', 'HOW', 'WHY', 'WHO', 'WHICH']);
const ISL_NEG = new Set(['NOT', 'NEVER']);
const ISL_MODAL = new Set(['CAN', 'MUST', 'SHOULD', 'WILL', 'MAY']);
const ISL_VERB = new Set(('WANT NEED HAVE EAT DRINK SLEEP GO COME HELP UNDERSTAND SIGN KNOW SEE PAY CALL WAIT FIND LOSE FORGET LIKE LOVE STAY ' +
  'LEAVE ARRIVE BUY RESERVE BOOK CHECK OPEN CLOSE CHANGE TAKE GIVE SEND BRING LEARN READ WRITE WORK MEET USE TRAVEL RENT CANCEL REPEAT SPEAK ' +
  'LISTEN TELL ASK SHOW APPLY GET JOIN DRIVE WALK SIT CLEAN ORDER CARRY KEEP PUT FILL VISIT RETURN START FINISH TRY PLAY WATCH COOK WASH').split(' '));
const ISL_FIRST = new Set(['HELLO', 'NAMASTE', 'WELCOME', 'HI', 'SORRY', 'YES', 'NO']);
const ISL_LAST = new Set(['PLEASE', 'THANK-YOU']);
export function islOrder(toks) {
  // a lone "NO" is an answer and stays put; "NO" inside a clause negates it
  const first = [], time = [], body = [], verbs = [], modal = [], neg = [], wh = [], last = [];
  toks.forEach((t, i) => {
    if (ISL_FIRST.has(t) && body.length + time.length === 0) first.push(t);
    else if (ISL_LAST.has(t)) last.push(t);
    else if (ISL_TIME.has(t) && !/^\d+$/.test(toks[i - 1] || '')) time.push(t); // "2 NIGHT" is a duration, not a time
    else if (ISL_WH.has(t)) wh.push(t);
    else if (ISL_NEG.has(t)) neg.push(t);
    else if (ISL_MODAL.has(t)) modal.push(t);
    else if (ISL_VERB.has(t) && !(t === 'CHECK' && /^(IN|OUT)$/.test(toks[i + 1] || ''))) verbs.push(t); // CHECK IN / CHECK OUT is one thing
    else body.push(t);
  });
  return [...first, ...time, ...body, ...verbs, ...modal, ...neg, ...wh, ...last];
}

export function textToGloss(text, max = 80) {
  if (!ISL_ONLY) return glossOne(text, max);
  // ISL: sign each sentence in ISL order
  const sentences = String(text || '').split(/(?<=[.!?])\s+/).filter((s) => s.trim());
  // (repeats are collapsed, except number signs: 11 is ONE ONE)
  return sentences.flatMap((s) => islOrder(glossOne(s, max))).filter((t, i, a) => t !== a[i - 1] || DIGIT_SIGN.includes(t)).slice(0, max);
}

function glossOne(text, max = 80) {
  let s = ' ' + String(text || '').toLowerCase() + ' ';
  PHRASES.forEach(([re, rep]) => (s = s.replace(re, rep)));
  if (signLang === 'isl') islPhrases.forEach(([re, tok]) => (s = s.replace(re, ` ${tok} `)));
  if (!ISL_ONLY) datasetPhrases.forEach(([re, tok]) => (s = s.replace(re, ` ${tok} `)));
  const originalWords = String(text || '').split(/\s+/);
  // Capitalised mid-sentence words are names (spelled); the first word of each sentence is not.
  const proper = new Set(
    originalWords
      .filter((w, i) => i > 0 && /^[A-Z][a-z]+/.test(w) && !/[.!?:;("“]$/.test(originalWords[i - 1]) && !/^\W*$/.test(originalWords[i - 1]))
      .map((w) => w.toLowerCase().replace(/[^a-z]/g, ''))
  );
  const out = [];
  s.split(/\s+/).forEach((raw) => {
    if (!raw) return;
    if (/^[A-Z'-]+$/.test(raw) || raw.startsWith('FS:')) return out.push(raw);
    const w = raw.replace(/[^a-z0-9'₹:]/g, '').replace(/:$/, '');
    if (!w) return;
    if (/^\d{1,2}:\d{2}$/.test(w)) return out.push(w.replace(':00', '').replace(':', ''));
    const digits = w.replace(/[^0-9]/g, '');
    if (digits && digits.length === w.replace(/[₹,]/g, '').length) return out.push(digits.slice(0, 6), ...(w.includes('₹') ? ['MONEY'] : []));
    if (/^\d+(st|nd|rd|th)$/.test(w)) return out.push(digits);
    if (/^\d+(am|pm)$/.test(w)) return out.push(w.replace(/\D/g, ''), 'FS:' + w.replace(/\d/g, '').toUpperCase());
    if ((w === 'am' || w === 'pm') && /^\d+$/.test(out[out.length - 1])) return out.push('FS:' + w.toUpperCase());
    if (NUMWORDS[w]) return out.push(NUMWORDS[w]);
    if (STOP.has(w)) return;
    // an Indian sign for the word itself beats an ASL stand-in from SYN (HOSPITAL, not DOCTOR)
    const isl = signLang === 'isl' && /[a-z]/.test(w) && lemmas(w.replace(/[^a-z]/g, '')).map((l) => l.toUpperCase()).find(useISL);
    if (isl) return out.push(isl);
    const base = SYN[w] || SYN[w.replace(/s$/, '')];
    if (base && (!ISL_ONLY || hasSign(base))) return out.push(base); // ISL-only: a synonym counts only if it has an Indian sign
    const word = w.replace(/'s$/, '').replace(/[^a-z]/g, '');
    if (!word) return;
    if (proper.has(w) && word.length <= 8 && !hasSign(word.toUpperCase())) return out.push('FS:' + word.toUpperCase());
    // dataset sign for the word (or its base form)?
    const known = lemmas(word).map((l) => l.toUpperCase()).find(hasSign);
    if (known) return out.push(known);
    // anything else is fingerspelled
    if (word.length <= MAX_SPELL) out.push('FS:' + word.toUpperCase());
  });
  // collapse immediate repeats; ISL-only: numbers become Indian number signs, digit by digit
  const dedup = out.filter((t, i) => t !== out[i - 1] || /^\d+$/.test(t)).flatMap((t) => (/^\d+$/.test(t) ? islDigits(t) : [t]));
  return dedup.slice(0, max);
}

// Human-readable label for a gloss token
export function glossLabel(tok) {
  if (tok.startsWith('FS:')) return tok.slice(3).split('').join('-');
  if (/^\d+$/.test(tok)) return tok;
  return tok.replace('-', ' ');
}
