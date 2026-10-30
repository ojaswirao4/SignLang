"""Prepare the CISLR dataset (Indian Sign Language, ~4,700 words) for extract.py.

CISLR: https://huggingface.co/datasets/Exploration-Lab/CISLR (gated; accept its conditions and log in
with `hf auth login`). Licence AFL-3.0 for the dataset; the videos come from the ISLRTC and
indiansignlanguage.org YouTube dictionaries, so ask them before any commercial use.

Expected layout (outside the project, so the 1.2 GB never syncs to OneDrive or git):
  ~/datasets/cislr/dataset.csv, prototype.csv
  ~/datasets/cislr/videos/<uid>.mp4      (unzipped from CISLR_v1.5-a_videos.zip)

Writes ~/datasets/cislr/manifest.json: word -> its videos, prototype (the clearest, used as the
one-shot reference by the authors) first. Then convert with:
  ..\\wlasl\\.venv\\Scripts\\python ..\\wlasl\\extract.py --set cislr
"""
import csv
import json
import re
from pathlib import Path

DATA = Path.home() / 'datasets' / 'cislr'
# Words whose sign file name would clash: index.json is the sign list, and Windows reserves the rest.
SKIP = {'index', 'con', 'prn', 'aux', 'nul'} | {f'com{i}' for i in range(10)} | {f'lpt{i}' for i in range(10)}


def word(gloss):
    """'Thank you' -> 'thank you'; drops brackets and punctuation so the sign file name is clean."""
    g = re.sub(r'\(.*?\)', ' ', gloss.lower())
    g = re.sub(r'[^a-z0-9]+', ' ', g)
    return re.sub(r'\s+', ' ', g).strip()


def main():
    proto = {r['uid'] for r in csv.DictReader(open(DATA / 'prototype.csv', encoding='utf-8'))} if (DATA / 'prototype.csv').exists() else set()
    manifest, missing = {}, 0
    for r in csv.DictReader(open(DATA / 'dataset.csv', encoding='utf-8')):
        w = word(r['gloss'])
        f = Path('videos') / f"{r['uid']}.mp4"
        if not w or w in SKIP or not (DATA / f).exists():
            missing += 1
            continue
        manifest.setdefault(w, []).append({'file': str(f), 'video_id': r['uid'], 'source': 'CISLR', 'dataset': 'CISLR',
                                           'url': f"https://www.youtube.com/watch?v={r['uid'].rsplit('_', 1)[0] if r['uid'][-2:-1] == '_' else r['uid']}",
                                           'category': r.get('category', ''), 'proto': r['uid'] in proto})
    for vids in manifest.values():
        vids.sort(key=lambda v: not v['proto'])
    (DATA / 'manifest.json').write_text(json.dumps(manifest, indent=1), encoding='utf-8')
    print(f'{len(manifest)} words, {sum(map(len, manifest.values()))} videos ({missing} rows without a video) -> {DATA / "manifest.json"}')


if __name__ == '__main__':
    main()
