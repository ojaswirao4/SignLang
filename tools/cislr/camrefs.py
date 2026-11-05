"""More reference signers for the camera: every real ISL video we have of each sign-board word.

The camera used to compare a person with one dictionary video per word (plus a second version for
some), so anyone who signs a little differently from that one signer was misread. This collects, per
word on the venues' sign boards, the INCLUDE videos (Deaf signers, several per word; downloaded with
byte ranges like ../include/fetch.py) and all CISLR videos, and writes ~/datasets/isl_cam/manifest.json
with one entry per video (WORD.1, WORD.2 ...). Convert them with:
  ..\\wlasl\\.venv\\Scripts\\python ..\\wlasl\\extract.py --set isl-cam
which writes public/signs/isl-cam/, loaded by islrec.js as extra references of each word.

Usage: python camrefs.py [--per 12] [--download WORD,WORD|all]
(an existing manifest keeps its numbering; videos not in it yet are added after)
  --per       INCLUDE videos per word, spread over the signers
  --download  only fetch INCLUDE videos for these words (the rest use the videos already on disk)
"""
import json
import re
import sys
import time
import zipfile
from pathlib import Path

import requests

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
sys.path.insert(0, str(HERE.parent / 'include'))
from fetch import RangeFile  # noqa: E402

INC = HERE.parent / 'include' / 'data'
CISLR = Path.home() / 'datasets' / 'cislr'
OUT = Path.home() / 'datasets' / 'isl_cam'
SIGNS = ROOT / 'public' / 'signs'

# app token -> the names the datasets use for it (the app signs "I" as ME)
ALIASES = {'ME': ['me', 'i'], 'THANK-YOU': ['thank you', 'thank_you'], 'HEARING-AID': ['hearing aid', 'hearing_aid'],
           'SIGN-LANGUAGE': ['sign language', 'sign_language']}


def board_words():
    src = (ROOT / 'public' / 'js' / 'venues.js').read_text(encoding='utf-8')
    words = set()
    for block in re.findall(r'board:\s*\{(.*?)\n\s*\},', src, re.S):
        for name in re.findall(r'\b([A-Z]+)\b(?=,|\])', block):  # GREETINGS, QUESTIONS
            m = re.search(rf'const {name} = \[(.*?)\];', src, re.S)
            if m:
                words |= set(re.findall(r"'([A-Z][A-Z-]*)'", m.group(1)))
        words |= set(re.findall(r"'([A-Z][A-Z-]*)'", block))
    return sorted(words)


def used_ids(tok):
    """Video ids already in the app as the word's main sign and its #2 version."""
    ids = set()
    for d in ('isl', 'isl-alt'):
        f = SIGNS / d / f'{tok}.json'
        if f.exists():
            ids.add(json.loads(f.read_text())['source']['video_id'])
    return ids


def spread(items, n):
    """n items evenly spread over the list (INCLUDE folders run signer by signer)."""
    if len(items) <= n:
        return items
    return [items[round(i * (len(items) - 1) / (n - 1))] for i in range(n)]


def fetch_video(zips, s, v, dst, tries=3):
    """Download one INCLUDE clip out of its zip on Zenodo (which fails now and then): retry, else skip."""
    for i in range(tries):
        try:
            if v['url'] not in zips:
                zips[v['url']] = zipfile.ZipFile(RangeFile(v['url'], s))
            dst.parent.mkdir(parents=True, exist_ok=True)
            tmp = dst.with_suffix('.part')
            tmp.write_bytes(zips[v['url']].read(v['member']))
            tmp.rename(dst)
            return True
        except Exception as e:  # noqa: BLE001 (network / server errors)
            zips.pop(v['url'], None)
            print(f'  {v["member"]}: {type(e).__name__} (try {i + 1}/{tries})', flush=True)
            time.sleep(5 * (i + 1))
    return False


def main():
    per = int(sys.argv[sys.argv.index('--per') + 1]) if '--per' in sys.argv else 12
    fetch = set(sys.argv[sys.argv.index('--download') + 1].split(',')) if '--download' in sys.argv else None
    catalog = json.loads((INC / 'catalog.json').read_text())
    cislr = json.loads((CISLR / 'manifest.json').read_text(encoding='utf-8'))
    s, zips = requests.Session(), {}
    # keep the numbers already given (and converted): new videos are added after them
    old = json.loads((OUT / 'manifest.json').read_text()) if (OUT / 'manifest.json').exists() else {}
    manifest = dict(old)  # (so a run cut short still keeps every earlier entry)
    for tok in board_words():
        names = ALIASES.get(tok, [tok.lower().replace('-', ' ')])
        keep = sorted((k for k in old if k.rsplit('.', 1)[0] == tok.lower()), key=lambda k: int(k.rsplit('.', 1)[1]))
        vids = [old[k][0] for k in keep]
        skip = used_ids(tok) | {v['video_id'] for v in vids}
        for name in names:
            for v in cislr.get(name, []):
                if v['video_id'] not in skip:
                    vids.append({**v, 'file': str(CISLR / v['file'])})
                    skip.add(v['video_id'])
        for name in {n.replace(' ', '_') for n in names}:
            for v in spread(sorted(catalog.get(name, []), key=lambda v: v['member']), per):
                vid = Path(v['member']).stem
                if vid in skip:
                    continue
                dst = INC / 'videos' / name / Path(v['member']).name
                if not dst.exists():
                    if fetch is not None and 'ALL' not in fetch and tok not in fetch:
                        continue
                    if not fetch_video(zips, s, v, dst):
                        continue
                vids.append({'file': str(dst), 'video_id': vid, 'source': 'INCLUDE', 'dataset': 'INCLUDE', 'url': f'{v["zip"]}:{v["member"]}'})
                skip.add(vid)
        for i, v in enumerate(vids, 1):
            manifest[f'{tok.lower()}.{i}'] = [v]
        OUT.mkdir(parents=True, exist_ok=True)
        (OUT / 'manifest.json').write_text(json.dumps(manifest, indent=1))
        print(f'{tok}: {len(vids)} extra video(s)', flush=True)
    print(f'\n{len(manifest)} reference videos -> {OUT / "manifest.json"}')


if __name__ == '__main__':
    main()
