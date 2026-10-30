"""Sheet: ISLAN photo (left) next to Meera (right) for each letter. Run after letters_preview.mjs."""
import glob
import os
from pathlib import Path

import cv2
import numpy as np

HERE = Path(__file__).parent
PREV = HERE / 'preview' / 'letters'
ISLAN = Path.home() / 'datasets' / 'islan' / 'letters' / 'signer1'
H = 190


def fit(img):
    return cv2.resize(img, (int(img.shape[1] * H / img.shape[0]), H))


def photo(L):
    f = sorted(glob.glob(str(ISLAN / L / '*')))[0]
    if f.lower().endswith('.mp4'):
        cap = cv2.VideoCapture(f)
        cap.set(cv2.CAP_PROP_POS_FRAMES, int(cap.get(cv2.CAP_PROP_FRAME_COUNT)) // 2)
        return cap.read()[1]
    return cv2.imread(f)


tiles = []
for L in 'ABCDEFGHIJKLMNOPQRSTUVWXYZ':
    t = np.hstack([fit(photo(L)), np.zeros((H, 4, 3), np.uint8), fit(cv2.imread(str(PREV / f'{L}.png')))])
    t = cv2.copyMakeBorder(t, 0, 6, 0, 6, cv2.BORDER_CONSTANT)
    cv2.putText(t, L, (6, 30), cv2.FONT_HERSHEY_SIMPLEX, 1.0, (0, 255, 255), 2)
    tiles.append(t)
w = max(t.shape[1] for t in tiles)
tiles = [cv2.copyMakeBorder(t, 0, 0, 0, w - t.shape[1], cv2.BORDER_CONSTANT) for t in tiles]
for i, part in enumerate([tiles[:13], tiles[13:]], 1):
    rows = [np.hstack(part[j:j + 3]) if len(part[j:j + 3]) == 3 else np.hstack(part[j:j + 3] + [np.zeros_like(part[0])] * (3 - len(part[j:j + 3]))) for j in range(0, len(part), 3)]
    cv2.imwrite(str(PREV / f'sheet_{i}.jpg'), np.vstack(rows))
print('sheets in', PREV)
