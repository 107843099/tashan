#!/usr/bin/env python3
"""Keep entry-point asset URLs in sync with the files they actually load."""
import hashlib
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
# Version the lazy scene first, then hash the entry controller that imports it.
controller = ROOT / 'assets/js/entry-ceremony.js'
scene = ROOT / 'assets/js/entry-stone-scene.js'
scene_version = hashlib.sha256(scene.read_bytes()).hexdigest()[:10]
source = controller.read_text()
updated = re.sub(r"(\./entry-stone-scene\.js)(?:\?v=[^'\"]+)?", lambda match: match[1] + '?v=' + scene_version, source)
if source != updated:
    controller.write_text(updated)

for name in ('index.html', 'project-preview.html'):
    page = ROOT / name
    def version(match):
        path = match[1]
        digest = hashlib.sha256((ROOT / path).read_bytes()).hexdigest()[:10]
        return './' + path + '?v=' + digest
    source = page.read_text()
    updated = re.sub(r'\./(assets/[^"?]+\.(?:js|css))(?:\?v=[^"\s]+)?', version, source)
    if source != updated:
        page.write_text(updated)
print('Entry asset versions are current.')
