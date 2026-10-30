"""Convert WLASL videos into avatar keyframes (public/signs/wlasl/<GLOSS>.json).

For each video: MediaPipe Holistic gives body pose + both hands per frame. We retarget that
onto Aria's body (see public/js/signs.js for the frame format):
  p  palm centre in avatar space   (from pose world landmarks, scaled to Aria's shoulders)
  f  finger direction              (wrist -> middle knuckle)
  n  palm normal                   (out of the palm)
  h  16 handshape numbers          (finger joint bends, spread, thumb a/o/c fitted by forward kinematics)
Then trim to the part where the hands are up, smooth, reduce to keyframes, and write JSON.

Usage:
  python extract.py                 # every gloss in data/manifest.json not converted yet (with face data)
  python extract.py --list data/hotel_words.txt   # the words in that file (see select_words.py), resumable
  python extract.py --force         # redo all of them
  python extract.py book hello      # just these
  python extract.py --set isl       # Indian Sign Language: ../include/data -> public/signs/isl (see ../include/fetch.py)

Each keyframe also carries the signer's face: 'face': {'bs': {ARKit blendshape: 0..1}, 'head': [pitch, yaw, roll]},
relative to their neutral face at rest.
"""
import json
import math
import sys
from pathlib import Path

import cv2
import mediapipe as mp
import numpy as np
from mediapipe.tasks.python import BaseOptions, vision

HERE = Path(__file__).parent
DATA = HERE / 'data'
OUT = HERE.parent.parent / 'public' / 'signs' / 'wlasl'
SETS = {
    'isl': (HERE.parent / 'include' / 'data', HERE.parent.parent / 'public' / 'signs' / 'isl'),
    # CISLR (Indian Sign Language, ~4,700 words): videos and manifest prepared by tools/cislr/prepare.py
    'cislr': (Path.home() / 'datasets' / 'cislr', HERE.parent.parent / 'public' / 'signs' / 'isl'),
    # second CISLR videos of some words, converted only to test camera matching (tools/cislr/eval_camera.mjs)
    'cislr-test': (Path.home() / 'datasets' / 'cislr_test', HERE.parent / 'cislr' / 'test_signs'),
    # the other CISLR video of each camera word (often a regional variant), from tools/cislr/variants.py
    'cislr-alt': (Path.home() / 'datasets' / 'cislr_alt', HERE.parent.parent / 'public' / 'signs' / 'isl-alt'),
}
MODEL = HERE / 'models' / 'holistic_landmarker.task'

# --- avatar constants (keep in sync with public/js/avatar.js) ---
SHOULDER_C = np.array([0.0, 1.435, 0.0])
NOSE = np.array([0.0, 1.685, 0.1])  # nose tip (headPivot 1.57 + head 0.12, nose z ~0.1)
# Meera's shoulder joints are 0.314 apart (meera.js SH_R/SH_L +-0.157), the signs' common space assumed the
# classic avatar's 0.38: every hand came out ~21% too far from her body (too wide, too high, too far
# forward; some beyond her reach, straightening the arm). Signs record the width they were made for
# ('shoulderW'), so other avatars can rescale (human.js).
SHOULDER_W = 0.314
PALM_OFFSET = 0.047
MAXB = np.array([1.55, 1.75, 1.2])
SPREAD_RANGE = 0.41  # SPREAD[3] - SPREAD[0] in avatar.js
HAND_MCP_Y = 0.095  # middle knuckle height in hand space (avatar.js finger defs)
THUMB_ROOT = np.array([0.027, 0.02, 0.005])
THUMB_LENS = [0.04, 0.031, 0.027]
# palm below this (avatar space) = hand at rest; set for the 0.38 body, so it scales with SHOULDER_W (at
# 0.314 a hand hanging at the signer's side came out at ~1.065, counted as raised, and YOU's resting
# hand was taken for the signing one)
REST_Y = SHOULDER_C[1] - (SHOULDER_C[1] - 1.02) * SHOULDER_W / 0.38
# Meera's face points (avatar space; her right = x -), from meera.js: eyes at nose +0.035, mouth -0.062,
# chin -0.112, hairline +0.075 in face units x HEAD_SCALE 1.07; ears at x +-0.0705, y -0.012. Each with the
# direction a fingertip touches it from (out of the face). Used for contacts seen in the video (see contact()).
FACE3D = {'nose': ([0.0, 1.685, 0.1], [0, 0, 1]), 'mouth': ([0.0, 1.656, 0.088], [0, 0, 1]), 'chin': ([0.0, 1.603, 0.075], [0, -0.3, 1]),
          'forehead': ([0.0, 1.79, 0.09], [0, 0.2, 1]), 'eyeR': ([-0.034, 1.722, 0.082], [0, 0, 1]), 'eyeL': ([0.034, 1.722, 0.082], [0, 0, 1]),
          'earR': ([-0.08, 1.71, -0.01], [-1, 0, 0]), 'earL': ([0.08, 1.71, -0.01], [1, 0, 0])}
TIPS = {'thumb': 4, 'index': 8, 'middle': 12}
TOUCH_IN, TOUCH_OUT = 0.04, 0.10  # 2D fingertip-to-face distance (shoulder widths): full contact below, none above
FINGERS = [[5, 6, 7, 8], [9, 10, 11, 12], [13, 14, 15, 16], [17, 18, 19, 20]]
GOOD_ENOUGH = 0.6  # hand-tracking quality at which we don't bother with a word's next clip

M = np.array([1.0, -1.0, -1.0])  # MediaPipe (x right, y down, z away) -> avatar (x right, y up, z toward viewer)


def unit(v):
    n = np.linalg.norm(v)
    return v / n if n > 1e-9 else v


def angle(a, b):
    return math.acos(float(np.clip(np.dot(unit(a), unit(b)), -1, 1)))


def arr(lms):
    return np.array([[l.x, l.y, l.z] for l in lms]) * M


# ---------- thumb forward kinematics (mirrors applyShape in avatar.js) ----------
def rx(t):
    c, s = math.cos(t), math.sin(t)
    return np.array([[1, 0, 0], [0, c, -s], [0, s, c]])


def rz(t):
    c, s = math.cos(t), math.sin(t)
    return np.array([[c, -s, 0], [s, c, 0], [0, 0, 1]])


def thumb_fk(a, o, c):
    R0 = rx(0.3 + o * 0.5) @ rz(-0.4 - a * 0.95 + o * 1.25)  # three.js Euler 'XYZ' with y = 0
    R1 = R0 @ rx(c * 0.7 + o * 0.15)
    R2 = R1 @ rx(c * 1.05)
    j1 = THUMB_ROOT + R0 @ [0, THUMB_LENS[0], 0]
    j2 = j1 + R1 @ [0, THUMB_LENS[1], 0]
    tip = j2 + R2 @ [0, THUMB_LENS[2], 0]
    return j1, j2, tip


GRID = np.linspace(0, 1, 11)
THUMB_TABLE = [((a, o, c), *thumb_fk(a, o, c)) for a in GRID for o in GRID for c in GRID]


def fit_thumb(j1, j2, tip):
    best, bd = None, 1e9
    for prm, f1, f2, ft in THUMB_TABLE:
        d = np.sum((ft - tip) ** 2) + 0.5 * np.sum((f2 - j2) ** 2) + 0.25 * np.sum((f1 - j1) ** 2)
        if d < bd:
            best, bd = prm, d
    return best


# ---------- one hand -> {f, n, shape} ----------
def hand_pose(hw, side):
    """hw: 21x3 hand world landmarks (avatar axes). side: 'R' or 'L'."""
    w = hw[0]
    f = unit(hw[9] - w)
    v5, v17 = hw[5] - w, hw[17] - w
    n = unit(np.cross(v5, v17) if side == 'R' else np.cross(v17, v5))
    n = unit(n - f * np.dot(n, f))
    shape = []
    for m, p, d, t in FINGERS:
        base = hw[m] - w
        seg = [hw[p] - hw[m], hw[d] - hw[p], hw[t] - hw[d]]
        b = [angle(base, seg[0]), angle(seg[0], seg[1]), angle(seg[1], seg[2])]
        if np.dot(seg[0], n) < 0:  # knuckle bent backwards (hyperextended) -> straight
            b[0] = 0.0
        b[0] = max(0.0, b[0] - 0.12)  # wrist->knuckle line is not quite along the straight finger
        shape += list(np.clip(np.array(b) / MAXB * 1.1, 0, 1))
    # spread: angle between index and pinky proximal segments, in the palm plane
    def inplane(v):
        return unit(v - n * np.dot(v, n))
    spr = angle(inplane(hw[6] - hw[5]), inplane(hw[18] - hw[17]))
    shape.append(float(np.clip((spr - 0.18) / SPREAD_RANGE, -0.5, 1)))
    # thumb: express joints in the hand's local frame (Y = fingers, Z = palm out, X = Y x Z),
    # scale to Aria's hand, and fit the avatar thumb's a/o/c by forward kinematics.
    X = np.cross(f, n)
    Rl = np.stack([X, f, n])  # rows = local axes
    sc = HAND_MCP_Y / (np.linalg.norm(hw[9] - w) or 1)
    loc = lambda i: Rl @ (hw[i] - w) * sc * (np.array([1, 1, 1]) if side == 'R' else np.array([-1, 1, 1]))
    a, o, c = fit_thumb(loc(2), loc(3), loc(4))
    shape += [a, o, c]
    return f, n, [round(float(x), 3) for x in shape]


# ---------- video -> per-frame raw poses ----------
def run_video(path, landmarker, ts0):
    cap = cv2.VideoCapture(str(path))
    fps = cap.get(cv2.CAP_PROP_FPS) or 30
    frames, i = [], 0
    while True:
        ok, fr = cap.read()
        if not ok:
            break
        h, w = fr.shape[:2]
        s = 640 / max(h, w)
        if s < 1:
            fr = cv2.resize(fr, (int(w * s), int(h * s)))
        # (enlarging tiny 300x300 CISLR clips was tried: no better tracking, ~4x slower, so they stay as they are)
        img = mp.Image(image_format=mp.ImageFormat.SRGB, data=cv2.cvtColor(fr, cv2.COLOR_BGR2RGB))
        r = landmarker.detect_for_video(img, ts0 + int(i * 1000 / fps))
        r.img_wh = (fr.shape[1], fr.shape[0])  # (for 2D distances in pixels: landmarks are 0..1 per axis)
        frames.append(r)
        i += 1
    cap.release()
    return frames, fps, ts0 + int(i * 1000 / fps) + 1000


def retarget(results):
    """-> list of {'R': (p,f,n,shape) | None, 'L': ...} in avatar space, or None per frame without a body."""
    def body(r):
        pw = arr(r.pose_world_landmarks)
        sc_mid = (pw[11] + pw[12]) / 2
        sw = np.linalg.norm(pw[11] - pw[12]) or 0.35
        # torso frame: X = signer's right -> left shoulder, Y = hips -> shoulders, Z = out of the chest.
        # Expressing everything in it undoes the signer turning away from the camera.
        X = unit(pw[11] - pw[12])
        Y = (pw[11] + pw[12]) / 2 - (pw[23] + pw[24]) / 2
        Y = unit(Y - X * np.dot(Y, X))
        return pw, sc_mid, SHOULDER_W / sw, np.stack([X, Y, np.cross(X, Y)])

    # Above the shoulders, heights follow the face, not the shoulder width: Meera's nose is 0.25 above her
    # shoulder line, a signer's (at her shoulder width) ~0.19, so face-height signs landed on her chin
    # (ZERO's O). Heights above the shoulder line are stretched by this signer's own nose height.
    noses = [(B @ (pw[0] - c) * k)[1] for pw, c, k, B in (body(r) for r in results if r.pose_world_landmarks)]
    up = float(np.clip((NOSE[1] - SHOULDER_C[1]) / np.median(noses), 0.8, 1.6)) if noses else 1.0
    lift = lambda v: np.array([v[0], v[1] * up if v[1] > 0 else v[1], v[2]])

    out = []
    for r in results:
        if not r.pose_world_landmarks:
            out.append(None)
            continue
        pw, sc_mid, k, B = body(r)
        fr = {'nose': lift(B @ (pw[0] - sc_mid) * k)}
        # face: the 52 ARKit blendshape scores, and head pitch / yaw / roll relative to the torso
        # (from the ears and nose; pitch > 0 = looking down, yaw > 0 = turning to her left)
        fr['bs'] = np.array([c.score for c in r.face_blendshapes]) if r.face_blendshapes else None
        ev = B @ (pw[7] - pw[8])
        nm = B @ (pw[0] - (pw[7] + pw[8]) / 2)
        fr['head'] = np.array([math.atan2(-nm[1], nm[2]), math.atan2(-ev[2], ev[0]), math.atan2(ev[1], ev[0])])
        # the image itself, in shoulder widths from between the shoulders: depth from one camera is the
        # weakest estimate (a fingertip on the ear read as a palm 38 cm in front of the shoulders, DEAF),
        # but whether a fingertip is on the face is plain to see
        fr['face2d'] = None
        if r.pose_landmarks and hasattr(r, 'img_wh'):
            wd, ht = r.img_wh
            pl = r.pose_landmarks
            px = lambda l: np.array([l.x * wd, l.y * ht])
            mid2, u2 = (px(pl[11]) + px(pl[12])) / 2, np.linalg.norm(px(pl[11]) - px(pl[12])) or 1
            n2 = lambda l: (px(l) - mid2) / u2
            nose2, mouth2 = n2(pl[0]), (n2(pl[9]) + n2(pl[10])) / 2
            eyes2 = (n2(pl[2]) + n2(pl[5])) / 2
            fr['face2d'] = {'nose': nose2, 'mouth': mouth2, 'chin': mouth2 + (mouth2 - nose2) * 1.6, 'forehead': eyes2 + (eyes2 - mouth2) * 0.9,
                            'eyeR': n2(pl[5]), 'eyeL': n2(pl[2]), 'earR': n2(pl[8]), 'earL': n2(pl[7])}
        for side, wi, hand, hand2 in (('R', 16, r.right_hand_world_landmarks, r.right_hand_landmarks), ('L', 15, r.left_hand_world_landmarks, r.left_hand_landmarks)):
            wrist = lift(B @ (pw[wi] - sc_mid) * k)  # relative to the shoulder centre
            tips2 = tips3 = None
            if hand:
                hw = arr(hand)
                f, n, shape = hand_pose(hw, side)
                f, n = B @ f, B @ n
                tips3 = {t: B @ (hw[j] - hw[0]) for t, j in TIPS.items()}  # fingertip from the wrist (m, torso frame)
                if hand2 and fr['face2d'] is not None:
                    tips2 = {t: n2(hand2[j]) for t, j in TIPS.items()}
            else:
                f = n = shape = None
            fr[side] = {'w': wrist, 'f': f, 'n': n, 'h': shape, 'tips2': tips2, 'tips3': tips3}
        out.append(fr)
    return out


def contact(frame, side, palm_rel, f):
    """(weight 0..1, palm position relative to the shoulder centre, (fingertip, face point), fingertip in
    the image) that puts the fingertip seen on the face (in the image) on the same point of Meera's face;
    weight 0 = no contact."""
    hand, face = frame[side], frame.get('face2d')
    if face is None or not hand.get('tips2') or not hand.get('tips3'):
        return 0.0, palm_rel, None, None
    # (not the eyes: people don't sign by touching them; a hand held in front of the eye, ZERO's O, isn't a touch)
    d, tip, fp = min((np.linalg.norm(tp - face[fn]), tn, fn) for tn, tp in hand['tips2'].items() for fn in face if not fn.startswith('eye'))
    wgt = float(np.clip(1 - (d - TOUCH_IN) / (TOUCH_OUT - TOUCH_IN), 0, 1))
    if not wgt:
        return 0.0, palm_rel, None, None
    pos, out = FACE3D[fp]
    target = np.array(pos) + unit(np.array(out, float)) * 0.025  # fingertip at the skin (a touch reads; no strain on the arm)
    palm_to_tip = hand['tips3'][tip] - unit(f) * PALM_OFFSET
    return wgt, target - palm_to_tip - SHOULDER_C, (tip, fp), hand['tips2'][tip]


def body_clamp(p):
    """Keep palms in front of Aria's body; monocular depth is the weakest part of the estimate."""
    x, y, z = p
    if y > 1.5 and abs(x) < 0.12:
        z = max(z, 0.12)  # face
    elif 0.9 < y <= 1.5 and abs(x) < 0.22:
        z = max(z, 0.2)  # chest / belly
    else:
        z = max(z, 0.1)
    return np.array([x, y, z])


def fill(seq, key):
    """Linearly fill None gaps in seq[i][key]; returns False if nothing was detected at all."""
    idx = [i for i, v in enumerate(seq) if v[key] is not None]
    if not idx:
        return False
    for i in range(len(seq)):
        if seq[i][key] is None:
            prev = max([j for j in idx if j < i], default=None)
            nxt = min([j for j in idx if j > i], default=None)
            if prev is None:
                seq[i][key] = seq[nxt][key]
            elif nxt is None:
                seq[i][key] = seq[prev][key]
            else:
                u = (i - prev) / (nxt - prev)
                a, b = np.array(seq[prev][key], float), np.array(seq[nxt][key], float)
                seq[i][key] = a + (b - a) * u
    return True


def smooth(values, k=2):
    v = np.array(values, float)
    out = v.copy()
    for i in range(len(v)):
        lo, hi = max(0, i - k), min(len(v), i + k + 1)
        out[i] = v[lo:hi].mean(axis=0)
    return out


def rdp(points, eps):
    """Ramer-Douglas-Peucker on an (n, d) array -> kept indices."""
    if len(points) < 3:
        return list(range(len(points)))
    a, b = points[0], points[-1]
    ab = b - a
    L = np.linalg.norm(ab)
    if L < 1e-9:
        d = np.linalg.norm(points - a, axis=1)
    else:
        t = np.clip(((points - a) @ ab) / (L * L), 0, 1)
        d = np.linalg.norm(points - (a + np.outer(t, ab)), axis=1)
    i = int(np.argmax(d))
    if d[i] > eps:
        left = rdp(points[: i + 1], eps)
        right = rdp(points[i:], eps)
        return left[:-1] + [x + i for x in right]
    return [0, len(points) - 1]


def to_keyframes(frames, fps):
    orig = [i for i, f in enumerate(frames) if f is not None]  # video frame numbers, for previews
    frames = [frames[i] for i in orig]
    if len(frames) < 8:
        return None, 'too few frames with a body'
    # which frames have hands up
    up = {s: [f[s]['h'] is not None and SHOULDER_C[1] + f[s]['w'][1] + 0.03 > REST_Y for f in frames] for s in 'RL'}
    motion = {s: sum(up[s]) for s in 'RL'}
    dom = 'R' if motion['R'] >= motion['L'] else 'L'
    if motion[dom] < 4:
        return None, 'no hand detected above the waist'
    # trim the raise from / drop to rest: keep frames where the dominant palm is in the upper part
    # of its own height range for this clip (Aria moves from rest by herself)
    ys = [SHOULDER_C[1] + frames[i][dom]['w'][1] for i in range(len(frames)) if up[dom][i]]
    lo_y, hi_y = min(ys), max(ys)
    cut = lo_y + 0.3 * (hi_y - lo_y) if hi_y - lo_y > 0.12 else REST_Y
    act = [i for i in range(len(frames)) if up[dom][i] and SHOULDER_C[1] + frames[i][dom]['w'][1] >= cut]
    if len(act) < 3:
        act = [i for i in range(len(frames)) if up[dom][i]]
    lo, hi = act[0], act[-1] + 1
    seg = frames[lo:hi]
    use_other = motion['L' if dom == 'R' else 'R'] >= max(4, 0.25 * motion[dom])

    tracks, unseen_by = {}, {}
    for s in 'RL':
        if s != dom and not use_other:
            continue
        rows = [{'w': f[s]['w'], 'f': f[s]['f'], 'n': f[s]['n'], 'h': f[s]['h']} for f in seg]
        unseen = [r['f'] is None for r in rows]  # hand not tracked: its shape and turn are filled in (keyframe 'est')
        if not all(fill(rows, k) for k in ('f', 'n', 'h')):
            continue
        W = smooth([r['w'] for r in rows])
        F = smooth([r['f'] for r in rows])
        N = smooth([r['n'] for r in rows])
        H = smooth([r['h'] for r in rows], 1)
        NO = smooth([f['nose'] for f in seg])
        P0 = []
        for i in range(len(rows)):
            palm = W[i] + unit(F[i]) * PALM_OFFSET
            # near the face, place the hand relative to Aria's face instead of her shoulders,
            # so chin / forehead / cheek contacts land on her face
            wgt = float(np.clip(1 - (np.linalg.norm(palm - NO[i]) - 0.1) / 0.15, 0, 1))
            P0.append(palm + wgt * ((NOSE - SHOULDER_C) - NO[i]))
        # fingertip-on-face contacts seen in the image: the hand is moved by the correction that puts the
        # fingertip on her face. Between two contacts less than CARRY apart (ear then mouth, DEAF) the
        # correction carries across, so the hand slides along the face instead of flying out to the
        # tracker's depth and back; before the first and after the last it eases in / out over EASE.
        # In the image a hand held in front of the face overlaps it as much as one touching it, so only the
        # same fingertip on the same face point, nearly still, for DWELL frames counts (DEAF: index on the
        # ear, then on the mouth). A hand passing in front covers a different point every frame (nose, eye,
        # ear, forehead: TRAVEL), and pulling those onto the face hauled the arm up, elbow jumping.
        CARRY, EASE, DWELL, STILL = 0.6, 0.35, 3, 0.05
        CT = [contact(f, s, P0[i], F[i]) for i, f in enumerate(seg)]
        run = [0] * len(CT)
        i = 0
        while i < len(CT):  # runs of frames with the same fingertip on the same point, barely moving
            j = i + 1
            if CT[i][0] >= 0.5:
                while (j < len(CT) and CT[j][0] >= 0.5 and CT[j][2] == CT[i][2]
                       and np.linalg.norm(CT[j][3] - CT[j - 1][3]) < STILL):
                    j += 1
            for q in range(i, j):
                run[q] = j - i if CT[i][0] >= 0.5 else 0
            i = j
        CT = [c if run[i] >= DWELL else (0.0, c[1], None, None) for i, c in enumerate(CT)]
        anchors = [i for i, c in enumerate(CT) if c[0] >= 0.5]
        delta = {i: CT[i][0] * (CT[i][1] - P0[i]) for i in range(len(CT)) if CT[i][0] > 0}
        P = []
        for i in range(len(rows)):
            d = delta.get(i)
            if d is None or CT[i][0] < 0.5:
                a = max((j for j in anchors if j < i), default=None)
                b = min((j for j in anchors if j > i), default=None)
                if a is not None and b is not None and (b - a) / fps <= CARRY:
                    u = (i - a) / (b - a)
                    d = delta[a] * (1 - u) + delta[b] * u
                else:
                    near = [(abs(i - j) / fps, j) for j in (a, b) if j is not None and abs(i - j) / fps < EASE]
                    if near:
                        t, j = min(near)
                        eased = delta[j] * (1 - t / EASE)
                        d = eased if d is None or np.linalg.norm(eased) > np.linalg.norm(d) else d
            P.append(body_clamp(SHOULDER_C + P0[i] + (d if d is not None else 0)))
        tracks[s] = (np.array(P), F, N, H)
        unseen_by[s] = unseen
    if dom not in tracks:
        return None, 'dominant hand lost'

    # left-dominant signer -> mirror so Aria always signs right-handed
    if dom == 'L':
        mir = lambda T: (T[0] * [-1, 1, 1], T[1] * [-1, 1, 1], T[2] * [-1, 1, 1], T[3])
        tracks = {('R' if s == 'L' else 'L'): mir(T) for s, T in tracks.items()}
        unseen_by = {('R' if s == 'L' else 'L'): u for s, u in unseen_by.items()}

    face = face_track(frames, lo, hi, mirror=dom == 'L')

    # keyframes: RDP on the palm path + handshape change (both hands)
    feat = [np.hstack([T[0] * 12, T[3] * 0.6]) for T in tracks.values()]
    keep = sorted(set(rdp(np.hstack(feat), 0.35)))
    # never leave more than ~0.3 s between keyframes
    gap = max(2, int(fps * 0.3))
    full = []
    for a, b in zip(keep, keep[1:]):
        full += list(range(a, b, gap))
    full = sorted(set(full + [keep[-1]]))

    out = []
    prev_i = None
    for i in full:
        fr = {'t': 0.32 if prev_i is None else round(max(0.05, (i - prev_i) / fps), 3), 'hold': 0, 'lin': 1}
        for s in 'RL':
            if s in tracks:
                P, F, N, H = tracks[s]
                fr[s] = {'p': [round(float(x), 3) for x in P[i]], 'f': [round(float(x), 3) for x in unit(F[i])],
                         'n': [round(float(x), 3) for x in unit(N[i])], 'h': [round(float(x), 3) for x in H[i]]}
                if unseen_by[s][i]:
                    fr[s]['est'] = 1  # not tracked here: only the arm's position is known (signs.js settles it)
            else:
                fr[s] = None
        if face:
            bs, head = face[0][i], face[1][i]
            fr['face'] = {'bs': {FACE_NAMES[j]: round(float(v), 2) for j, v in enumerate(bs) if v >= 0.08},
                          'head': [round(float(x), 3) for x in head]}
        out.append(fr)
        prev_i = i
    out[0]['lin'] = 0  # ease in from wherever the avatar was
    out[-1]['hold'] = 0.1
    return {'frames': out, 'videoFrames': [orig[lo + i] for i in full], 'dominant': dom, 'twoHanded': len(tracks) == 2}, None


# MediaPipe's 52 face blendshapes, in its output order; '' = not used (blinks and gaze are incidental
# in the videos, Aria blinks and looks around by herself). Names match the avatar's ARKit morphs.
MP_FACE = ('_neutral browDownLeft browDownRight browInnerUp browOuterUpLeft browOuterUpRight cheekPuff cheekSquintLeft cheekSquintRight '
           'eyeBlinkLeft eyeBlinkRight eyeLookDownLeft eyeLookDownRight eyeLookInLeft eyeLookInRight eyeLookOutLeft eyeLookOutRight '
           'eyeLookUpLeft eyeLookUpRight eyeSquintLeft eyeSquintRight eyeWideLeft eyeWideRight jawForward jawLeft jawOpen jawRight '
           'mouthClose mouthDimpleLeft mouthDimpleRight mouthFrownLeft mouthFrownRight mouthFunnel mouthLeft mouthLowerDownLeft '
           'mouthLowerDownRight mouthPressLeft mouthPressRight mouthPucker mouthRight mouthRollLower mouthRollUpper mouthShrugLower '
           'mouthShrugUpper mouthSmileLeft mouthSmileRight mouthStretchLeft mouthStretchRight mouthUpperUpLeft mouthUpperUpRight '
           'noseSneerLeft noseSneerRight').split()
FACE_NAMES = [n[0].upper() + n[1:] for n in MP_FACE]
FACE_USE = np.array([not (n.startswith(('_', 'eyeBlink', 'eyeLook'))) for n in MP_FACE])
MIRROR = [FACE_NAMES.index(n.replace('Left', '#').replace('Right', 'Left').replace('#', 'Right')) for n in FACE_NAMES]


def face_track(frames, lo, hi, mirror=False):
    """Blendshapes + head angles for frames[lo:hi], relative to the signer's own neutral face.
    Neutral = median of the frames outside the sign (hands at rest); returns (bs[n,52], head[n,3]) or None."""
    have = [i for i, f in enumerate(frames) if f['bs'] is not None and len(f['bs']) == len(MP_FACE)]
    if len(have) < 3:
        return None
    rest = [i for i in have if i < lo or i >= hi] or have
    bs0 = np.median([frames[i]['bs'] for i in rest], axis=0)
    head0 = np.median([frames[i]['head'] for i in rest], axis=0)
    rows = [{'bs': frames[i]['bs'] if frames[i]['bs'] is not None and len(frames[i]['bs']) == len(MP_FACE) else None,
             'head': frames[i]['head']} for i in range(lo, hi)]
    if not fill(rows, 'bs'):
        return None
    bs = np.clip(smooth([r['bs'] for r in rows], 1) - bs0, 0, 1) * FACE_USE
    head = np.clip(smooth([r['head'] for r in rows], 2) - head0, -0.45, 0.45)
    if mirror:  # swap left/right shapes; yaw and roll change sign
        bs = bs[:, MIRROR]
        head = head * [1, -1, -1]
    return bs, head


def quality(frames):
    """How well the hands were tracked while signing: the fraction of frames, from the first frame a
    hand is seen to the last, where a hand is detected. Frames before and after are left out, because
    in short, chest-cropped clips (CISLR) the resting hands are simply below the picture there; gaps
    inside the sign are real tracking losses and still count."""
    fs = [f for f in frames if f]
    seen = [i for i, f in enumerate(fs) if f['R']['h'] is not None or f['L']['h'] is not None]
    if len(seen) < 3:
        return 0
    span = fs[seen[0]:seen[-1] + 1]
    return len(seen) / len(span) * min(1, len(seen) / 8)  # fewer than 8 tracked frames is too little to trust


def token(gloss):
    return gloss.upper().replace(' ', '-').replace('_', '-')


def has_face(path):
    try:
        d = json.loads(path.read_text())
        return isinstance(d, dict) and d.get('faceData', False)  # index.json is a list, not a sign
    except (OSError, ValueError):
        return False


def main():
    global DATA, OUT
    argv = sys.argv[1:]
    if '--set' in argv:
        DATA, OUT = SETS[argv[argv.index('--set') + 1]]
    manifest = json.loads((DATA / 'manifest.json').read_text())
    force = '--force' in argv
    word_list = argv[argv.index('--list') + 1] if '--list' in argv else None
    args = [a for i, a in enumerate(argv) if not a.startswith('--') and not (i and argv[i - 1] in ('--list', '--set'))]
    if word_list:
        want = [l.strip().lower() for l in Path(word_list).read_text(encoding='utf-8').splitlines() if l.strip()]
    else:
        want = [g.lower() for g in args] or list(manifest)
    OUT.mkdir(parents=True, exist_ok=True)
    if not args and not force:  # resume: skip signs already converted (with face data)
        want = [g for g in want if not has_face(OUT / f'{token(g)}.json')]
    missing = [g for g in want if g not in manifest]
    if missing:
        print(f'no downloaded video for {len(missing)} word(s): {", ".join(missing)}')
        want = [g for g in want if g in manifest]
    opts = vision.HolisticLandmarkerOptions(base_options=BaseOptions(model_asset_path=str(MODEL)), running_mode=vision.RunningMode.VIDEO,
                                            output_face_blendshapes=True)
    report = {}
    for n, gloss in enumerate(want, 1):
        best = None
        for v in manifest.get(gloss, []):
            try:
                # fresh tracker per video so tracking state never leaks between clips
                with vision.HolisticLandmarker.create_from_options(opts) as lm:
                    res, fps, _ = run_video(DATA / v['file'], lm, 0)
                raw = retarget(res)
                kf, err = to_keyframes(raw, fps)
            except Exception as e:  # corrupt video etc.
                kf, err, raw = None, f'{type(e).__name__}: {e}', []
            q = quality(raw) if kf else 0
            if kf and (best is None or q > best[0]):
                best = (q, kf, v)
            if not kf:
                report.setdefault(gloss, []).append(err)
            if best and best[0] >= GOOD_ENOUGH:
                break  # clips are in preference order; skip the rest when this one tracked well
        if best:
            q, kf, v = best
            doc = {'gloss': token(gloss), 'source': {'dataset': v.get('dataset', 'WLASL'), 'video_id': v['video_id'], 'site': v['source'], 'url': v['url']},
                   'quality': round(q, 2), 'shoulderW': SHOULDER_W, 'faceData': any('face' in f for f in kf['frames']), **kf}
            (OUT / f'{token(gloss)}.json').write_text(json.dumps(doc, separators=(',', ':')))
            print(f'[{n}/{len(want)}] {gloss}: {len(kf["frames"])} keyframes, quality {q:.2f}, {"two" if kf["twoHanded"] else "one"}-handed', flush=True)
        else:
            print(f'[{n}/{len(want)}] {gloss}: FAILED {report.get(gloss)}', flush=True)
        if n % 25 == 0:
            write_index()  # so the running app picks up new signs during a long run
    print(f'\nindex: {write_index()} signs')


# Signs the app may use: well tracked, and a sensible length (a clip taken from a long video, e.g. a
# lesson rather than a dictionary entry, produces hundreds of keyframes and is left out).
MIN_QUALITY = 0.5
MAX_KEYFRAMES = 60


def usable(path):
    d = json.loads(path.read_text())
    return isinstance(d, dict) and d.get('quality', 0) >= MIN_QUALITY and len(d.get('frames', [])) <= MAX_KEYFRAMES


def write_index():
    idx = sorted(p.stem for p in OUT.glob('*.json') if p.stem != 'index' and usable(p))
    (OUT / 'index.json').write_text(json.dumps(idx))
    return len(idx)


if __name__ == '__main__':
    main()
