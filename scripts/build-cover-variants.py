#!/usr/bin/env python3
"""Check committed cover variants, or regenerate them with --write.

Normal catalog/release builds use the committed WebP files and need no imaging
package. Optional regeneration requires Pillow==12.3.0 with libwebp 1.6.0; both
versions and all source/output hashes are recorded for reproducibility.
"""
import argparse
import hashlib
import io
import json
import struct
from pathlib import Path
from urllib.parse import unquote, urlsplit

ROOT = Path(__file__).resolve().parents[1]
MANIFEST = ROOT / 'data/cover-variants.json'
WIDTHS = (320, 640, 960)
RECIPE = {'pillow': '12.3.0', 'libwebp': '1.6.0', 'quality': 84, 'method': 6,
          'resample': 'LANCZOS', 'widths': list(WIDTHS), 'defaultWidth': 640}


def digest(data):
    return hashlib.sha256(data).hexdigest()


def source(href):
    url = urlsplit(href)
    if url.scheme or url.netloc or not url.path.startswith('./assets/covers/') or url.query or url.fragment:
        raise ValueError('Expected a local cover path: ' + href)
    path = (ROOT / unquote(url.path)).resolve(strict=True)
    if (ROOT / 'assets/covers').resolve() not in path.parents or not path.is_file():
        raise ValueError('Cover must remain inside assets/covers')
    return path


def webp_size(data):
    """Read dimensions without Pillow, for ordinary build-time checks."""
    if data[:4] != b'RIFF' or data[8:12] != b'WEBP':
        raise ValueError('Expected a WebP image')
    offset = 12
    while offset + 8 <= len(data):
        tag, size = data[offset:offset + 4], struct.unpack_from('<I', data, offset + 4)[0]
        chunk = data[offset + 8:offset + 8 + size]
        if len(chunk) != size:
            break
        if tag == b'VP8 ' and len(chunk) >= 10 and chunk[3:6] == b'\x9d\x01\x2a':
            return tuple(value & 0x3fff for value in struct.unpack_from('<HH', chunk, 6))
        if tag == b'VP8X' and len(chunk) >= 10:
            return (1 + int.from_bytes(chunk[4:7], 'little'), 1 + int.from_bytes(chunk[7:10], 'little'))
        if tag == b'VP8L' and len(chunk) >= 5 and chunk[0] == 0x2f:
            bits = int.from_bytes(chunk[1:5], 'little')
            return ((bits & 0x3fff) + 1, ((bits >> 14) & 0x3fff) + 1)
        offset += 8 + size + size % 2
    raise ValueError('WebP dimensions are missing')


def check():
    manifest = json.loads(MANIFEST.read_text(encoding='utf-8'))
    if manifest.get('recipe') != RECIPE:
        raise ValueError('Cover recipe changed; regenerate the committed variants')
    examples = json.loads((ROOT / 'data/generated-examples.json').read_text(encoding='utf-8'))
    for identifier, record in manifest['projects'].items():
        original = source(record['source']).read_bytes()
        if digest(original) != record['sourceSha256'] or digest(original) != examples[identifier]['sha256']:
            raise ValueError('Original cover changed: ' + identifier)
        if [image['width'] for image in record['variants']] != list(WIDTHS):
            raise ValueError('Cover widths do not match the recipe: ' + identifier)
        for image in record['variants']:
            data = source(image['src']).read_bytes()
            if len(data) != image['bytes'] or digest(data) != image['sha256']:
                raise ValueError('Cover variant changed: ' + image['src'])
            if webp_size(data) != (image['width'], image['height']):
                raise ValueError('Cover variant dimensions do not match: ' + image['src'])
            if abs(image['height'] - record['height'] * image['width'] / record['width']) > 1:
                raise ValueError('Cover variant aspect ratio changed: ' + image['src'])
    return manifest


def write():
    import PIL
    from PIL import Image, ImageOps, features
    if PIL.__version__ != RECIPE['pillow'] or features.version('webp') != RECIPE['libwebp']:
        raise SystemExit('Regeneration requires Pillow==12.3.0 and libwebp 1.6.0; ordinary builds do not require Pillow.')
    examples = json.loads((ROOT / 'data/generated-examples.json').read_text(encoding='utf-8'))
    manifest = {'version': 1, 'generatedBy': 'scripts/build-cover-variants.py', 'recipe': RECIPE, 'projects': {}}
    for identifier, example in sorted(examples.items()):
        original = source(example['cover'])
        content = original.read_bytes()
        if len(content) < 250 * 1024:
            continue
        if digest(content) != example['sha256']:
            raise ValueError('Original image hash does not match provenance: ' + identifier)
        with Image.open(io.BytesIO(content)) as decoded:
            image = ImageOps.exif_transpose(decoded).convert('RGB')
            width, height = image.size
            if width < max(WIDTHS):
                raise ValueError('Refusing to upscale a cover: ' + identifier)
            record = {'source': example['cover'], 'sourceSha256': digest(content), 'sourceBytes': len(content),
                      'width': width, 'height': height, 'variants': []}
            for target_width in WIDTHS:
                target_height = round(height * target_width / width)
                resized = image.resize((target_width, target_height), Image.Resampling.LANCZOS)
                buffer = io.BytesIO()
                resized.save(buffer, format='WEBP', quality=RECIPE['quality'], method=RECIPE['method'])
                data = buffer.getvalue()
                relative = 'assets/covers/{}-example-{}.webp'.format(identifier, target_width)
                target = ROOT / relative
                if target.is_symlink():
                    raise ValueError('Refusing a symbolic-link output: ' + relative)
                if not target.exists() or target.read_bytes() != data:
                    target.write_bytes(data)
                record['variants'].append({'src': './' + relative, 'width': target_width, 'height': target_height,
                                           'bytes': len(data), 'sha256': digest(data)})
            manifest['projects'][identifier] = record
    if MANIFEST.is_symlink():
        raise ValueError('Refusing a symbolic-link manifest')
    output = json.dumps(manifest, ensure_ascii=False, indent=2) + '\n'
    if not MANIFEST.exists() or MANIFEST.read_text(encoding='utf-8') != output:
        MANIFEST.write_text(output, encoding='utf-8')
    return check()


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--write', action='store_true', help='Regenerate committed WebP images with the pinned encoder')
    parser.add_argument('--check', action='store_true', help='Verify committed image hashes and dimensions (default; no Pillow)')
    args = parser.parse_args()
    result = write() if args.write else check()
    originals = sum(item['sourceBytes'] for item in result['projects'].values())
    defaults = sum(image['bytes'] for item in result['projects'].values() for image in item['variants'] if image['width'] == 640)
    print('Cover variants: {} originals, {} WebP images; default previews {:,} -> {:,} bytes ({:.1%} smaller).'.format(
        len(result['projects']), len(result['projects']) * len(WIDTHS), originals, defaults, 1 - defaults / originals))
