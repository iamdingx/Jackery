"""Build the approved BOM batch from the reviewed dry-run, verifying its sources."""
import argparse
from collections import Counter
from hashlib import sha256
import json
from pathlib import Path
import re
import runpy

root = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser()
parser.add_argument('reviewed_json', type=Path)
parser.add_argument('output', type=Path)
args = parser.parse_args()
review = json.loads(args.reviewed_json.read_text(encoding='utf8'))
for source in review['sourceHashes']:
    if sha256(Path(source['file']).read_bytes()).hexdigest() != source['sha256']:
        raise ValueError('Reviewed source changed: ' + Path(source['file']).name)
old = json.loads((root / 'catalogs/jackery-eu-20261030.json').read_text(encoding='utf8'))
previous = {m['catalogKey']: {p['sku']: p for p in m['bom']} for m in old['models']}
models = {m['catalogKey']: {**m, 'bom': {p['sku']: p for p in m['bom']}} for m in review['models']}
for sku in ('36-0001-000118', '36-0003-000009'):
    assert models['e2000plus-b']['bom'].pop(sku)['software']
models['e1000v2-original']['bom']['36-0002-000048'].update(category=None, allOnly=True, categoryBasis='confirmed_all_only')
models['e2000plus-b']['bom']['23-0007-000024'].update(category='packaging', categoryBasis='confirmed_packaging')
for key, sku in [('e1000pro-default', '07-3100-307060'), ('e2000plus-b', '22-0001-000155')]:
    models[key]['bom'][sku] = {**previous[key][sku], 'category': 'non_core', 'categoryBasis': 'confirmed_assembly'}
for prefix in ('e1000plus', 'e2000plus'):
    a, b = [models[prefix + '-' + version]['bom'] for version in ('a', 'b')]
    pa, pb = [{sku: p for sku, p in parts.items() if p['category'] == 'packaging'} for parts in (a, b)]
    for sku in pa.keys() & pb.keys():
        assert pa[sku]['standardQty'] == pb[sku]['standardQty']
    for own, other, target, other_version in [(pa, pb, a, 'B'), (pb, pa, b, 'A')]:
        for sku in other.keys() - own.keys():
            assert sku not in target
            target[sku] = {**other[sku], 'categoryBasis': 'shared_packaging_' + other_version}

translator = runpy.run_path(str(root / 'scripts/build-bom-translations.py'))['translate']
terms = dict(translator.__globals__['GLOSSARY'])
terms.update({'改版后':'Revised', '外皮':'Jacket', '通讯线束':'Communication Harness', '通信线束':'Communication Harness', '束':'Harness', '纸':'Paper', '封面':'Cover', '保彩锌':'Color Zinc Plated', '线序':'Wire Sequence', '红':'Red', '蓝':'Blue', '黄':'Yellow', '热缩套管':'Heat-Shrink Tubing', '电池模组':'Battery Module', '盖板':'Cover', '欧英澳':'EU/UK/AU', '华宝':'Jackery', '背板组件':'Rear Panel Assembly', '板':'Board', '绝缘':'Insulation', '风道纸':'Air Duct Insulation Paper', '有':'Yes', '顶面':'Top Surface', '单面局部备胶':'Partial Adhesive on One Side', '蜂窝':'Honeycomb', '保护板软件':'Protection Board Firmware'})
translator.__globals__.update(GLOSSARY=terms, TERMS=re.compile('|'.join(re.escape(key) for key in sorted(terms, key=len, reverse=True))))
english = {x['descriptionZh']: x['descriptionEn'] for x in json.loads((root / 'catalogs/jackery-bom-translations.json').read_text(encoding='utf8'))['entries']}
sources = {Path(x['file']).name: x['sha256'] for x in review['sourceHashes']}
items = []
for key, m in models.items():
    parts = []
    for sku, row in sorted(m['bom'].items()):
        zh = row['descriptionZh']
        en = row.get('descriptionEn') or english.get(zh) or translator(zh)
        if re.search(r'[\u3400-\u9fff]', en) or Counter(re.findall(r'\d+(?:\.\d+)?', zh)) != Counter(re.findall(r'\d+(?:\.\d+)?', en)):
            raise ValueError(f'{key} {sku}: review translation {en}')
        source = dict(row['source'])
        for name in ('oldFile', 'reviewedFile'):
            if source.get(name):
                source[name] = Path(source[name]).name
                source[name + 'Sha256'] = sources[source[name]]
        old_part = previous.get(key, {}).get(sku, {})
        holds = [r for r in old_part.get('reviewReasons', []) if r not in ('standard_quantity_missing', 'parent_model_requires_review')]
        if row.get('lifecycle') in ('停止生产', '样机', '试产'):
            holds.append('source_lifecycle:' + row['lifecycle'])
        parts.append({'sku':sku, 'descriptionZh':zh, 'descriptionEn':en, 'category':row['category'], 'allOnly':row.get('allOnly',False), 'unit':'pcs', 'standardQty':row['standardQty'], 'reviewReasons':sorted(set(holds)), 'source':source, 'categoryBasis':row.get('categoryBasis','reviewed')})
    items.append({'catalogKey':key, 'label':m['model'], 'productSku':m['productSku'], 'bom':parts, 'retireSkus':sorted(previous.get(key,{}).keys() - m['bom'].keys())})
assert Counter(p['category'] for m in items for p in m['bom']) == {'core':90,'non_core':197,'packaging':208,None:1}
assert sum(len(m['retireSkus']) for m in items) == 23
args.output.write_text(json.dumps({'batchKey':'classified-bom-20261107','sources':sources,'models':items},ensure_ascii=False,indent=2)+'\n',encoding='utf8')
