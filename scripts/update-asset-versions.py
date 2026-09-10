#!/usr/bin/env python3
"""Keep entry-point asset URLs in sync with the files they actually load."""
import hashlib
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
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
