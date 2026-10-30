"""Second versions of the camera words, so the camera also knows the other way a word is signed.

CISLR often has two videos of a word from different dictionaries, and they can show different
regional signs. The main sign (public/signs/isl/) uses one; this writes ~/datasets/cislr_alt/manifest.json
with the word's other videos, for the signs in public/signs/isl/camera_vocab.json. Then convert with:
  ..\\wlasl\\.venv\\Scripts\\python ..\\wlasl\\extract.py --set cislr-alt
which writes public/signs/isl-alt/, loaded by islrec.js as extra templates (TOKEN#2).
"""
import json
from pathlib import Path

DATA = Path.home() / 'datasets' / 'cislr'
ALT = Path.home() / 'datasets' / 'cislr_alt'
SIGNS = Path(__file__).resolve().parent.parent.parent / 'public' / 'signs' / 'isl'


def main():
    manifest = json.loads((DATA / 'manifest.json').read_text(encoding='utf-8'))
    vocab = json.loads((SIGNS / 'camera_vocab.json').read_text(encoding='utf-8'))
    out = {}
    for tok in vocab:
        w = tok.lower().replace('-', ' ')
        main_sign = SIGNS / f'{tok}.json'
        if w not in manifest or not main_sign.exists():
            continue
        used = json.loads(main_sign.read_text())['source']['video_id']
        # absolute paths, so extract.py finds the videos in the main CISLR folder
        others = [{**v, 'file': str(DATA / v['file'])} for v in manifest[w] if v['video_id'] != used]
        if others:
            out[w] = others
    ALT.mkdir(parents=True, exist_ok=True)
    (ALT / 'manifest.json').write_text(json.dumps(out, indent=1), encoding='utf-8')
    print(f'{len(out)} words with a second video, {sum(map(len, out.values()))} videos -> {ALT / "manifest.json"}')


if __name__ == '__main__':
    main()
