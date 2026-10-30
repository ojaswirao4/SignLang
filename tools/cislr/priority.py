"""Order the CISLR words so the ones Meera actually says are converted first.

Scans the app's answer texts (public/js/*.js), counts how often each CISLR word appears, and writes
part1.txt / part2.txt (for two extract.py workers) with the most-used words first, skipping words
already converted. Usage: python priority.py
"""
import json
import re
from collections import Counter
from pathlib import Path

HERE = Path(__file__).parent
APP = HERE.parent.parent / 'public'
DATA = Path.home() / 'datasets' / 'cislr'
manifest = json.loads((DATA / 'manifest.json').read_text(encoding='utf-8'))
done = {p.stem for p in (APP / 'signs' / 'isl').glob('*.json')}

src = ' '.join(p.read_text(encoding='utf-8', errors='ignore') for p in (APP / 'js').glob('*.js'))
# only text Meera says: string literals that read like a sentence (several words), not code
said = [s for s in re.findall(r"'((?:[^'\\\n]|\\.)*)'|\"((?:[^\"\\\n]|\\.)*)\"|`([^`]*)`", src) for s in s if s.count(' ') >= 3]
text = re.sub(r'\$\{[^}]*\}', ' ', ' '.join(said)).lower()
text = re.sub(r'[^a-z0-9]+', ' ', text)
# words Meera never signs (articles, "be" verbs, most prepositions: see STOP in signs.js)
STOP = set('a an the is are am was were be been being to of for at on in into by with and or it its this that these those there here do does did will would shall should just so very also as from about any some then than if'.split())
toks = text.split()
words = Counter(t for t in toks if t not in STOP)
pairs = Counter(' '.join(p) for p in zip(toks, toks[1:]))


def uses(w):
    if ' ' in w:
        return pairs.get(w, 0) * 2  # a phrase sign covers two words at once
    return max(words.get(w, 0), words.get(w + 's', 0), words.get(w + 'ing', 0), words.get(w + 'ed', 0))


todo = [w for w in manifest if w.upper().replace(' ', '-') not in done]
todo.sort(key=lambda w: -uses(w))
used = sum(1 for w in todo if uses(w))
# deal alternately so both workers get their share of the important words
parts = [todo[0::2], todo[1::2]]
for i, part in enumerate(parts, 1):
    (DATA / f'part{i}.txt').write_text('\n'.join(part) + '\n', encoding='utf-8')
print(f'{len(todo)} words to do, {used} of them appear in Meera\'s answers (converted first)')

# The camera's vocabulary: the 400 words Meera uses most (all words, converted or not; the app keeps
# only those that have a sign). Matching against all ~4,700 at once would confuse similar signs.
allw = sorted(manifest, key=lambda w: -uses(w))
vocab = [w.upper().replace(' ', '-') for w in allw if uses(w)][:400]
(APP / 'signs' / 'isl' / 'camera_vocab.json').write_text(json.dumps(vocab), encoding='utf-8')
print(f'camera vocabulary: {len(vocab)} words -> public/signs/isl/camera_vocab.json')
print('first 30:', ', '.join(todo[:30]))
