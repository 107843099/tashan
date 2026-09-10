#!/usr/bin/env python3
"""Read the local library. Generate browser data; never execute imported projects."""
from pathlib import Path
import json, re, hashlib, zipfile, runpy
from urllib.parse import quote

ROOT = Path(__file__).resolve().parents[1]
LIBRARY = ROOT / 'vibe coding库'
GENERATED = ROOT / 'data/generated'
GENERATED.mkdir(parents=True, exist_ok=True)
(ROOT / 'assets/data').mkdir(parents=True, exist_ok=True)

def digest(data): return hashlib.sha256(data).hexdigest()
def href(path): return './' + quote(str(path), safe='/')
def local_file(relative):
    path = (ROOT / relative).resolve()
    if LIBRARY.resolve() not in path.parents or not path.is_file():
        raise ValueError('Missing or invalid library source: ' + relative)
    return path

def document(path, identifier):
    data = path.read_bytes()
    if path.suffix == '.zip':
        with zipfile.ZipFile(path) as archive:
            members = [n for n in archive.namelist() if n.endswith('.md') and not n.startswith('__MACOSX') and '/node_modules/' not in n]
            if not members: raise ValueError('No Markdown document in ' + str(path))
            data = archive.read(members[0])
        output = GENERATED / 'prompts' / (identifier + '.md')
        output.parent.mkdir(exist_ok=True)
        output.write_bytes(data)
        download = href(output.relative_to(ROOT))
    else: download = href(path.relative_to(ROOT))
    content = data.decode('utf-8-sig')
    blocks = []
    for index, match in enumerate(re.finditer(r'```[^\n]*\n([\s\S]*?)\n```', content)):
        headings = re.findall(r'^#{1,4}\s+(.+)$',content[:match.start()],re.M)
        blocks.append({'title':headings[-1] if headings else 'Prompt '+str(index+1),'text':match.group(1)})
    if not blocks: blocks = [{'title':re.sub(r'^#+\s*','',content.splitlines()[0]),'text':content}]
    return {'content':content,'blocks':blocks,'download':download,'bytes':len(data),'sha256':digest(data)}

curation = json.loads((ROOT/'data/catalog-curation.json').read_text())
checks = json.loads((ROOT/'data/verification.json').read_text())
teaching = json.loads((ROOT/'data/teaching-analysis.json').read_text()) if (ROOT/'data/teaching-analysis.json').exists() else {}
examples = json.loads((ROOT/'data/generated-examples.json').read_text()) if (ROOT/'data/generated-examples.json').exists() else {}
# Display images are pre-generated and committed; normal builds only validate
# their source hashes and dimensions, without importing an image encoder.
cover_variants = runpy.run_path(str(ROOT/'scripts/build-cover-variants.py'))['check']()['projects']
all_files = [p for p in LIBRARY.rglob('*') if p.is_file() and p.suffix in ('.html','.md') and 'node_modules' not in p.parts]
by_hash = {}
for path in all_files: by_hash.setdefault(digest(path.read_bytes()),[]).append(str(path.relative_to(ROOT)))
projects=[]
for item in curation:
    path=local_file(item['source'])
    item['sourceHref']=href(item['source'])
    item['bytes']=path.stat().st_size
    item['sha256']=digest(path.read_bytes())
    item['currentVersionId']='catalog-'+item['sha256'][:32]
    item['sourceReferences']=item.get('sourceReferences',[])
    item['packageHref']=href(item['package']) if item.get('package') and local_file(item['package']) else href(item['source']) if path.suffix == '.zip' else None
    html=path.read_text() if item['kind']=='visual' else ''
    item['hasCompanionFiles']=bool(re.search(r'(?:src|href)=[\"\'](?:\./)?(?:src|assets|pinhole)[^\"\']*',html))
    item['duplicates']=[p for p in by_hash.get(item['sha256'],[]) if p!=item['source']]
    item['cover']='./assets/covers/'+item['id']+'.webp' if (ROOT/'assets/covers'/ (item['id']+'.webp')).exists() else None
    item['verification']=checks.get(item['id'],{'status':'pending','scope':'待完成运行或输出验证','date':None,'classroomVerified':False,'evidence':'已读取本地材料；尚未完成交互或 AI 输出测试。'})
    item['descriptionOrigin']='editorial'
    item['teaching']=teaching.get(item['id'])
    item['example']=examples.get(item['id'])
    if item['example']:
        item['cover']=item['example']['cover']
    if item['id'] in cover_variants:
        variants = cover_variants[item['id']]['variants']
        default = next(image for image in variants if image['width'] == 640)
        item['coverVariants']=variants
        item['cover']=default['src']
        item['coverWidth']=default['width']
        item['coverHeight']=default['height']
        if item['example']:
            item['example']['cover']=item['cover']
    item['document']=document(path,item['id']) if item['kind']=='prompt' else document(local_file(item['promptSource']),item['id']) if item.get('promptSource') else None
    projects.append(item)
output={'version':1,'libraryRoot':'vibe coding库','generatedFrom':'local-files','projects':projects,'discoveredFiles':len(all_files),'note':'简介和建议学段为展示整理；来源原文保留。运行检查不等于课堂验证。'}
(GENERATED/'catalog.json').write_text(json.dumps(output,ensure_ascii=False,indent=2))
(ROOT/'assets/data/catalog.js').write_text('// Generated by scripts/build-catalog.py from local files.\nwindow.PRACTICE_LIBRARY = '+json.dumps(output,ensure_ascii=False).replace('</','<\\/')+';\n')
translations=json.loads((ROOT/'data/interface-translations.json').read_text())
(ROOT/'assets/data/translations.js').write_text('// Generated from data/interface-translations.json.\nwindow.PRACTICE_TRANSLATIONS = '+json.dumps(translations,ensure_ascii=False).replace('</','<\\/')+';\n')
print('Catalog: %d projects (%d visualizations, %d prompts), %d local source files indexed.'%(len(projects),sum(p['kind']=='visual' for p in projects),sum(p['kind']=='prompt' for p in projects),len(all_files)))
