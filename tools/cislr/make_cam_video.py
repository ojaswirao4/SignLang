"""Build a fake-webcam video (.y4m, which Chrome can play as a camera) from CISLR sign videos:
each word's clip, padded with a still rest frame before and after (hands down), so the camera sees
one sign at a time. Usage: python make_cam_video.py out.y4m word1 word2 ... [--second]
--second uses each word's OTHER video (not the one the app's sign was made from), when there is one."""
import json
import sys
from pathlib import Path

import cv2
import numpy as np

DATA = Path.home() / 'datasets' / 'cislr'
SIGNS = Path(__file__).parent.parent.parent / 'public' / 'signs' / 'isl'
W, H, FPS = 640, 480, 25
args = [a for a in sys.argv[1:] if not a.startswith('--')]
out, words = args[0], args[1:]
second = '--second' in sys.argv
manifest = json.loads((DATA / 'manifest.json').read_text(encoding='utf-8'))


def fit(fr):
    # the 300x300 clip, scaled to the camera's height, centred on a grey background
    s = H / fr.shape[0]
    fr = cv2.resize(fr, (int(fr.shape[1] * s), H))
    canvas = np.full((H, W, 3), 128, np.uint8)
    x = (W - fr.shape[1]) // 2
    canvas[:, x:x + fr.shape[1]] = fr
    return canvas


def rest(fr):
    """The signer with hands down: the clip's first frame (CISLR clips start at rest)."""
    return fr


frames = []
for w in words:
    vids = manifest[w]
    used = json.loads((SIGNS / f'{w.upper().replace(" ", "-")}.json').read_text())['source']['video_id']
    pick = [v for v in vids if (v['video_id'] != used) == second] or vids
    cap = cv2.VideoCapture(str(DATA / pick[0]['file']))
    clip = []
    while True:
        ok, fr = cap.read()
        if not ok:
            break
        clip.append(fit(fr))
    frames += [clip[0]] * FPS + clip + [clip[-1]] * int(FPS * 1.2)
    print(w, pick[0]['video_id'], len(clip), 'frames')

with open(out, 'wb') as f:
    f.write(f'YUV4MPEG2 W{W} H{H} F{FPS}:1 Ip A1:1 C420jpeg\n'.encode())
    for fr in frames:
        f.write(b'FRAME\n')
        f.write(cv2.cvtColor(fr, cv2.COLOR_BGR2YUV_I420).tobytes())
print(f'{out}: {len(frames) / FPS:.1f} s')
