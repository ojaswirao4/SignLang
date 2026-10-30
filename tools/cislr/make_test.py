"""Pick words whose CISLR sign is already converted AND that have a second video, and write a
manifest of just those second videos (~/datasets/cislr_test/manifest.json) so extract.py --set
cislr-test converts them into tools/cislr/test_signs/ (never into the app's signs).
Usage: python make_test.py [how many, default 40]"""
import json
import sys
from pathlib import Path

HERE = Path(__file__).parent
DATA = Path.home() / 'datasets' / 'cislr'
TEST = Path.home() / 'datasets' / 'cislr_test'
SIGNS = HERE.parent.parent / 'public' / 'signs' / 'isl'
n = int(sys.argv[1]) if len(sys.argv) > 1 else 40
manifest = json.loads((DATA / 'manifest.json').read_text(encoding='utf-8'))
index = set(json.loads((SIGNS / 'index.json').read_text()))
# the words Meera uses most come first in the converter's queue (part1/part2), so prefer those
order = []
for p in ('part1.txt', 'part2.txt'):
    if (DATA / p).exists():
        order += [w.strip() for w in (DATA / p).read_text(encoding='utf-8').splitlines() if w.strip()]
rank = {w: i for i, w in enumerate(order)}
cands = [w for w, vids in manifest.items() if len(vids) >= 2 and w.upper().replace(' ', '-') in index]
cands.sort(key=lambda w: rank.get(w, 1e9))
pick = cands[:n]
TEST.mkdir(parents=True, exist_ok=True)
used = json.loads((SIGNS / f'{pick[0].upper().replace(" ", "-")}.json').read_text())['source']['video_id'] if pick else None
out = {}
for w in pick:
    tok = w.upper().replace(' ', '-')
    used = json.loads((SIGNS / f'{tok}.json').read_text())['source']['video_id']
    other = [v for v in manifest[w] if v['video_id'] != used]
    if other:
        v = dict(other[0])
        v['file'] = str(Path('..') / 'cislr' / v['file'])
        out[w] = [v]
(TEST / 'manifest.json').write_text(json.dumps(out, indent=1), encoding='utf-8')
print(f'{len(out)} test words: {", ".join(out)}')
