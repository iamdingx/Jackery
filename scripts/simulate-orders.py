#!/usr/bin/env python3
"""Serial, evidence-preserving simulation against an isolated loopback demo server.

No database file access or production code changes. An optional fixture regression
uses only the authenticated isolated demo API. requests is the only dependency.
API results do not claim browser/visual verification.
"""
import argparse
import base64
import collections
import copy
import datetime as dt
import hashlib
import io
import json
import pathlib
import re
import sys
import time
import urllib.parse
import xml.etree.ElementTree as ET
import zipfile

import requests

PNG = base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAIAAAADCAIAAAA2iEnWAAAAEUlEQVR4nGP8zwACTGASRgEAFEABBVDVLjgAAAAASUVORK5CYII=')
SPECIAL = '原文 <tag>& "quote" | \\ line\n第二行'
NS = {'s': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
PASSWORDS = {'admin': 'JackeryAdmin!2026', 'alex': 'JackeryAlex!2026', 'blair': 'JackeryBlair!2026'}


class Runner:
    def __init__(self, args):
        self.args = args
        self.base = args.base_url.rstrip('/')
        self.sessions = {}
        self.current = None
        self.results = []
        self.started = dt.datetime.now(dt.timezone.utc).isoformat()
        self.out = pathlib.Path(args.output_dir)
        self.out.mkdir(parents=True, exist_ok=True)
        self.previous_runs=[]
        prior=self.out/'API_RESULTS.json'
        if prior.exists():
            try:
                prior_report=json.loads(prior.read_text(encoding='utf-8'))
                self.previous_runs=prior_report.pop('previousRuns',[])+[prior_report]
                resolved=[]
                for entry in self.previous_runs:
                    if 'results' not in entry and entry.get('path'):
                        entry=json.loads(pathlib.Path(entry['path']).read_text(encoding='utf-8'))
                    if 'results' not in entry:continue
                    legacy={'API-R2-20261030':'api-r2-results.json','API-R3-20261030':'api-r3-results.json'}
                    archive=self.out/'runs'/legacy.get(entry['prefix'],f"{entry['prefix'].lower()}-results.json")
                    # Keep the first raw run, never replace its actual evidence.
                    archive.parent.mkdir(exist_ok=True)
                    if not archive.exists():archive.write_text(json.dumps(entry,ensure_ascii=False,indent=2),encoding='utf-8')
                    entry['_archivePath']=archive.as_posix()
                    resolved.append(entry)
                self.previous_runs=resolved
            except (OSError,ValueError):
                pass

    def check(self, name, actual, expected=True):
        item = {'name': name, 'actual': actual, 'expected': expected, 'passed': actual == expected}
        self.current['assertions'].append(item)
        return item['passed']

    def req(self, account, method, route, payload=None, expected=200, headers=None):
        session = self.sessions[account]
        hdr = {'X-CSRF-Token': getattr(session, 'csrf', '')}
        hdr.update(headers or {})
        t0 = time.monotonic()
        response = session.request(method, self.base + route, json=payload, headers=hdr, timeout=30, allow_redirects=False)
        try:
            data = response.json()
        except ValueError:
            data = {'binaryBytes': len(response.content), 'sha256': hashlib.sha256(response.content).hexdigest(), 'contentType': response.headers.get('Content-Type')}
        if 'csrfToken' in data:
            session.csrf = data['csrfToken']
        # Tokens, cookies and credentials are deliberately excluded from evidence.
        safe = copy.deepcopy(data)
        safe.pop('csrfToken', None)
        step = {'account': account, 'method': method, 'path': route, 'request': payload,
                'expectedStatus': expected, 'actualStatus': response.status_code,
                'durationMs': round((time.monotonic()-t0)*1000), 'response': safe}
        if step['request'] and 'password' in step['request']:
            step['request'] = {**step['request'], 'password': '[REDACTED_SECRET]'}
        if self.current is not None:
            self.current['steps'].append(step)
            self.check(f'{method} {route} HTTP', response.status_code, expected)
        return data, response

    def setup(self):
        for name, password in PASSWORDS.items():
            session = requests.Session()
            session.trust_env = False
            self.sessions[name] = session
            data, response = self.req(name, 'POST', '/api/login', {'username': name, 'password': password})
            if response.status_code != 200:
                raise RuntimeError(f'{name} login failed HTTP {response.status_code}')
        health, _ = self.req('admin', 'GET', '/api/health')
        if health.get('demo') is not True:
            raise RuntimeError('Refusing a non-demo server')
        catalog, _ = self.req('admin', 'GET', '/api/catalog?includeInactive=1')
        self.models = {m['catalogKey']: m for m in catalog['models'] if m.get('catalogKey')}
        if len(self.models) != 9 or sum(m['active'] for m in self.models.values()) != 7:
            raise RuntimeError('Expected the real 9-version/7-enabled Jackery catalog')
        self.bom = {}
        self.knowledge = {}
        for key, model in self.models.items():
            b, _ = self.req('admin', 'GET', f"/api/models/{model['id']}/bom?includeInactive=1&pageSize=100")
            self.bom[key] = b['items']
            self.knowledge[key], _ = self.req('admin', 'GET', f"/api/models/{model['id']}/knowledge")

    def create(self, c):
        data, response = self.req(c['account'], 'POST', '/api/records', {'sn': c.get('snTemplate', c['sn']).replace('{prefix}', self.args.prefix), 'modelId': self.models[c['catalogKey']]['id']}, 201)
        r = data.get('record')
        if not r:
            raise RuntimeError('Legal baseline creation failed')
        self.current['createdIds'].append(r['id'])
        self.current['baselineId'] = r['id']
        self.current['resolvedModelId'] = r['modelId']
        self.check('baseline belongs to selected model', r['modelId'], self.models[c['catalogKey']]['id'])
        self.check('no newly created final check stage', 'final' not in r['checks'])
        return r

    def update(self, c, r, changes, expected=200, account=None, correction=False, headers=None):
        body = {'version': r['version'], **changes}
        route = f"/api/records/{r['id']}"
        if correction:
            route += '/corrections'
            body = {'version': r['version'], 'reason': 'Batch simulation verified correction', 'changes': changes}
        data, _ = self.req(account or c['account'], 'POST' if correction else 'PUT', route, body, expected, headers)
        return data.get('record', r)

    def reload(self, c, r, account=None, suffix=''):
        data, _ = self.req(account or c['account'], 'GET', f"/api/records/{r['id']}"+suffix)
        return data['record']

    def reject(self, c, r, changes, expected=422, **kwargs):
        before = self.reload(c, r)
        self.update(c, r, changes, expected, **kwargs)
        after = self.reload(c, r)
        self.check('rejected request changes no record fields/version', after, before)
        return after

    def materials(self, c):
        return [{'bomId': next(b['id'] for b in self.bom[c['catalogKey']] if b['sku'] == p['sku']), 'quantity': p['qty']} for p in c['materials']]

    def all_pass(self, r):
        return {'initial': {x['code']: 'pass' for x in r['modelSnapshot']['checkItems']}}

    def positive(self, c, r):
        self.req(c['account'], 'PUT', '/api/account/language', {'language': c['language']})
        payload = {'outcome': c['outcome'], 'checks': c['checks'], 'materials': self.materials(c), 'faultCodes': c['faultCodes'], 'scrapReason': c['scrapReason'], 'issueNotes': SPECIAL + ' / ' + c['id'], 'action': 'save'}
        r = self.update(c, r, payload)
        fresh = self.reload(c, r)
        for field in ['outcome', 'checks', 'faultCodes', 'issueNotes']:
            self.check('persisted '+field, fresh[field], payload[field])
        self.check('saved materials replace rather than accumulate', [x['quantity'] for x in fresh['materials']], [x['quantity'] for x in payload['materials']])
        if c['outcome'] in ['like_new', 'good', 'acceptable']:
            failed = copy.deepcopy(c['checks']); failed['initial'][next(iter(failed['initial']))] = 'fail'
            self.reject(c, r, {'checks': failed, 'action': 'complete'}, 422)
        elif c['outcome'] == 'rok':
            unchecked = copy.deepcopy(c['checks']); unchecked['initial'][next(iter(unchecked['initial']))] = 'not_tested'
            self.reject(c, r, {'checks': unchecked, 'action': 'complete'}, 422)
        elif c['outcome'] == 'scrap':
            self.reject(c, r, {'scrapReason': ' ', 'action': 'complete'}, 422)
        if c['outcome'] in ['awp', 'needs_analysis']:
            self.check('WFR remains unfinished', r['status'], 'wfr')
            self.reject(c, r, {'action': 'complete'}, 422)
            r = self.update(c, r, {'issueNotes': payload['issueNotes']+' resumed', 'action': 'save'})
            r = self.update(c, r, {'outcome': 'rok', 'checks': self.all_pass(r), 'action': 'complete'})
        else:
            r = self.update(c, r, {'action': 'complete'})
        self.check('final eligible outcome completed', r['status'], 'completed')
        self.check('single inspection no final gate', 'final' not in r['checks'])
        self.reject(c, r, {'issueNotes': 'locked'}, 403)
        return r

    def bom_case(self, c, r):
        v = c['variant']; key = c['catalogKey']
        active = [b for b in self.bom[key] if b['active']]
        b = next((b for b in active if b['standardQty'] > 1), active[0] if active else None)
        mat = lambda q: [{'bomId': b['id'], 'quantity': q}]
        if v in ['cap_save_over', 'cap_complete_over', 'cap_admin_over']:
            changes = {'outcome': 'rok', 'checks': self.all_pass(r), 'materials': mat(b['standardQty']+1), 'action': 'complete' if v == 'cap_complete_over' else 'save'}
            if v == 'cap_admin_over':
                r = self.update(c, r, {'outcome': 'rok', 'checks': self.all_pass(r), 'action': 'complete'})
            return self.reject(c, r, changes, correction=v=='cap_admin_over', account='admin' if v=='cap_admin_over' else c['account'])
        qtys = {'quantity_zero': 0, 'quantity_negative': -1, 'pcs_fraction': .5, 'quantity_string': '1', 'quantity_null': None}
        if v in qtys: return self.reject(c, r, {'materials': mat(qtys[v])})
        if v == 'duplicate_material': return self.reject(c, r, {'materials': mat(1)*2})
        if v == 'foreign_model_material':
            foreign = next(x for k, rows in self.bom.items() if k != key for x in rows if x['active'])
            return self.reject(c, r, {'materials': [{'bomId': foreign['id'], 'quantity': 1}]})
        if v in ['suspended_material','e1000_no_consumption']:
            held = next(x for x in self.bom[key] if not x['active']) if any(not x['active'] for x in self.bom[key]) else next(x for x in self.bom['e1000-default'] if not x['active'])
            return self.reject(c, r, {'materials': [{'bomId': held['id'], 'quantity': 1}]})
        if v == 'unknown_bom': return self.reject(c, r, {'materials': [{'bomId': 999999, 'quantity': 1}]})
        if v in ['cap_exact_save','cap_lower_save','wfr_repeated_not_accumulated']:
            q = b['standardQty'] if v != 'cap_lower_save' else 1
            r = self.update(c, r, {'materials': mat(q), 'outcome': 'awp'})
            r = self.update(c, r, {'materials': mat(q), 'outcome': 'awp'})
            self.check('exact quantity after second save', r['materials'][0]['quantity'], q)
            return r
        if v == 'catalog_counts':
            rows = [b for rows in self.bom.values() for b in rows if re.fullmatch(r'[a-f0-9]{64}',b.get('source',{}).get('sha256',''))]
            self.check('physical candidate count', len(rows), 404)
            self.check('enabled physical count', sum(x['active'] for x in rows), 261)
            self.check('held physical count', sum(not x['active'] for x in rows), 143)
        elif v in ['suspended_original_create','suspended_a_create']:
            heldkey = 'e1000v2-original' if v == 'suspended_original_create' else 'e2000plus-a'
            self.req(c['account'],'POST','/api/records',{'sn':r['sn']+'-invalid','modelId': self.models[heldkey]['id']},422)
        elif v == 'version_independent_cap':
            a = next(x for x in self.bom['e1000v2-costdown'] if x['sku']=='08-1000-100253')
            b = next(x for x in self.bom['e2000plus-b'] if x['sku']=='08-1000-100253')
            self.check('same SKU version limits differ', a['standardQty'] != b['standardQty'])
            self.check('same SKU scoped by distinct model IDs', a['modelId'] != b['modelId'])
            r=self.update(c,r,{'modelId':a['modelId'],'materials':[{'bomId':a['id'],'quantity':a['standardQty']}]})
            self.check('first selected model cap snapshot',r['materials'][0]['standardQty'],17)
            self.reject(c,r,{'materials':[{'bomId':a['id'],'quantity':18}]})
            data,_=self.req(c['account'],'POST','/api/records',{'sn':r['sn']+'-MODEL25','modelId':b['modelId']},201)
            second=data['record'];self.current['createdIds'].append(second['id'])
            second=self.update(c,second,{'materials':[{'bomId':b['id'],'quantity':25}]})
            self.check('second independent selected model cap snapshot',second['materials'][0]['standardQty'],25)
            self.reject(c,second,{'materials':[{'bomId':b['id'],'quantity':26}]})
            r=self.update(c,r,{'faultCodes':['F0'],'checks':self.all_pass(r)})
            r=self.update(c,r,{'modelId':b['modelId'],'materials':[{'bomId':b['id'],'quantity':25}],'faultCodes':['F0','F9']})
            self.check('model switch accepts legitimate target-model materials',r['modelId'],b['modelId'])
            self.check('model switch replaces old BOM with target BOM',[m['bomId'] for m in r['materials']],[b['id']])
            self.check('model switch resets old checks',set(r['checks']['initial'].values()),{'not_tested'})
            expected=[next(f for f in self.knowledge['e2000plus-b']['faultCodes'] if f['code']==code) for code in ['F0','F9']]
            self.check('model switch resolves target fault snapshots rather than false/old source',r['faultSnapshot'],expected)
        return r

    def sn_case(self, c, r):
        v=c['variant']; inputs={'blank_sn':'','whitespace_sn':'   ','overlength_sn':'S'*201,'numeric_sn':123,'control_sn':'A\x00B'}
        if v in inputs:
            self.req(c['account'],'POST','/api/records',{'sn':inputs[v],'modelId':r['modelId']},422)
        elif v in ['sn_trim','sn_special_chars','same_sn_second_record']:
            sn='  '+r['sn']+'-trim  ' if v=='sn_trim' else r['sn']+'-<>&"\'' if v=='sn_special_chars' else r['sn']
            data,_=self.req(c['account'],'POST','/api/records',{'sn':sn,'modelId':r['modelId']},201)
            if data.get('record'):
                self.current['createdIds'].append(data['record']['id'])
                self.check('SN exact trimmed source retained', data['record']['sn'], sn.strip())
                self.check('new independent record even duplicate SN',data['record']['id']!=r['id'])
        elif v in ['exact_history','partial_history_empty']:
            sn=r['sn'] if v=='exact_history' else r['sn'][:-3]
            data,_=self.req(c['account'],'GET','/api/sn-history?sn='+urllib.parse.quote(sn))
            self.check('exact history lookup only',len(data['items']),1 if v=='exact_history' else 0)
        elif v in ['invalid_model','string_model']:
            self.req(c['account'],'POST','/api/records',{'sn':r['sn']+'-invalid','modelId':999999 if v=='invalid_model' else str(r['modelId'])},422)
        else:
            target=next(m for k,m in self.models.items() if m['active'] and k!=c['catalogKey'])
            if v=='model_change_clears_context':
                r=self.update(c,r,{'materials':self.materials(c),'faultCodes':['F0'],'checks':self.all_pass(r)})
                r=self.update(c,r,{'modelId':target['id']})
                self.check('model switch clears materials',r['materials'],[])
                self.check('model switch clears faults',r['faultCodes'],[])
                self.check('model switch resets checks',set(r['checks']['initial'].values()),{'not_tested'})
            elif v=='model_change_foreign_material':
                # Choose nonempty source BOM independent of the case's E1000.
                part=next(x for x in self.bom[c['catalogKey']] if x['active'])
                r=self.reject(c,r,{'modelId':target['id'],'materials':[{'bomId':part['id'],'quantity':1}]})
            else:
                r=self.reject(c,r,{'modelId':target['id'],'checks':{'initial':{'impossible_old_model_check':'pass'}}})
        return r

    def fault_case(self,c,r):
        v=c['variant']; bad={'fault_unknown':['F99'],'fault_duplicate':['F0','F0'],'fault_nonarray':'F0'}
        if v in bad:return self.reject(c,r,{'faultCodes':bad[v]})
        codes=[] if v=='fault_optional' else [f'F{i}' for i in range(10)] if v=='fault_all_f0_f9' else ['F9','F0','F8'] if v=='fault_order_preserved' else ['F0','F9']
        if v=='fault_snapshot_specialchars':
            # Parent may provide special text in an isolated test fixture.
            candidates=[k for k,vv in self.knowledge.items() if any('<' in json.dumps(f,ensure_ascii=False) and '&' in json.dumps(f,ensure_ascii=False) for f in vv['faultCodes']) and self.models[k]['active']]
            if candidates:
                c=copy.deepcopy(c);c['catalogKey']=candidates[0]
                r=self.update(c,r,{'modelId':self.models[c['catalogKey']]['id']})
        changes={'faultCodes':codes}
        if v=='fault_translation_notes': changes.update({'issueNotes':SPECIAL,'translatedIssueNotes':'Manual translation <>& | source retained','appearanceNotes':'外观原文','translatedAppearanceNotes':'Manual appearance'})
        r=self.update(c,r,changes)
        self.check('optional/multiselect/order preserved',r['faultCodes'],codes)
        expected=[next(x for x in self.knowledge[c['catalogKey']]['faultCodes'] if x['code']==code) for code in codes]
        self.check('fault original snapshot exact',r['faultSnapshot'],expected)
        self.check('fault reload exact',self.reload(c,r)['faultSnapshot'],expected)
        if v=='fault_snapshot_specialchars':
            text=json.dumps(expected,ensure_ascii=False)
            self.check('special source fixture contains HTML metacharacters', '<' in text and '&' in text)
        if v=='fault_model_switch':
            target=next(m for k,m in self.models.items() if m['active'] and k!=c['catalogKey'])
            r=self.update(c,r,{'modelId':target['id']});self.check('switch resets fault context',r['faultCodes'],[])
        return r

    def permission_case(self,c,r):
        v=c['variant']; other='blair' if c['account']=='alex' else 'alex'
        if v=='foreign_read': self.req(other,'GET',f"/api/records/{r['id']}",expected=403)
        elif v in ['foreign_write','foreign_history_readonly']:
            if v=='foreign_history_readonly':
                data,_=self.req(other,'GET',f"/api/records/{r['id']}?historySn="+urllib.parse.quote(r['sn']));self.check('exact context history readable',data['record']['id'],r['id'])
            self.reject(c,r,{'issueNotes':'foreign'},403,account=other)
        elif v=='export_other_owner':self.req(c['account'],'GET',f"/api/export?ownerId={r['ownerId']}",expected=403)
        elif v=='operator_admin':self.req(c['account'],'GET','/api/admin/users',expected=403)
        elif v=='csrf_invalid':self.reject(c,r,{'issueNotes':'CSRF'},403,headers={'X-CSRF-Token':'wrong'})
        elif v=='stale_version':
            before=self.reload(c,r);self.req(c['account'],'PUT',f"/api/records/{r['id']}",{'version':r['version']-1,'issueNotes':'stale'},409);self.check('409 leaves all data unchanged',self.reload(c,r),before)
        else:
            r=self.update(c,r,{'outcome':'scrap','scrapReason':'Physical enclosure damage','action':'complete'})
            if v=='completed_lock':self.reject(c,r,{'issueNotes':'locked'},403)
            elif v=='correction_reason_required':
                before=self.reload(c,r);self.req('admin','POST',f"/api/records/{r['id']}/corrections",{'version':r['version'],'reason':'','changes':{'issueNotes':'x'}},422);self.check('reason required atomic',self.reload(c,r),before)
            else:
                old=copy.deepcopy(r);r=self.update(c,r,{'issueNotes':SPECIAL},account='admin',correction=True)
                data,_=self.req('admin','GET',f"/api/records/{r['id']}/audit")
                entries=[a for a in data['items'] if a['action']=='correction']
                self.check('one correction audit',len(entries),1)
                if entries:
                    self.check('audit reason','Batch simulation verified correction',entries[0]['reason'])
                    self.check('audit before original',entries[0]['before']['issueNotes'],old['issueNotes'])
                    self.check('audit after exact original',entries[0]['after']['issueNotes'],SPECIAL)
                self.check('admin correction preserves completion',r['status'],'completed')
        return r

    def export(self,c,r,language):
        data,response=self.req(c['account'],'GET','/api/export?language='+language+'&q='+urllib.parse.quote(r['sn']))
        with zipfile.ZipFile(io.BytesIO(response.content)) as z:
            wb=ET.fromstring(z.read('xl/workbook.xml'))
            names=[s.attrib['name'] for s in wb.findall('s:sheets/s:sheet',NS)]
            self.check('four real XLSX worksheets',names,['Work Summary','Functional Checks','Material Usage','Photo Index'])
            tables={}
            for i,name in enumerate(names,1):
                xml=ET.fromstring(z.read(f'xl/worksheets/sheet{i}.xml'))
                rows=[]
                for row in xml.findall('s:sheetData/s:row',NS):
                    rows.append([''.join(cell.itertext()) for cell in row.findall('s:c',NS)])
                tables[name]={'headers':rows[0],'rows':rows[1:]}
            self.current.setdefault('exports',[]).append({'language':language,'tables':tables})
            summary=tables['Work Summary'];headers=summary['headers'];row=next(x for x in summary['rows'] if x[2]==r['sn'])
            self.check('summary expected bilingual header',headers[0],'Work Order' if language=='en' else '作业单号')
            self.check('summary SN exact',row[2],r['sn'])
            for en,zh,val in [('Issue Notes','问题描述',r['issueNotes']),('Translated Issue Notes','问题描述-翻译',r['translatedIssueNotes']),('Receiving SKU','入库 SKU',r['receivingSku']),('Fault Codes','故障代码','; '.join(r['faultCodes']))]:
                self.check('export exact '+en,row[headers.index(en if language=='en' else zh)],val)
            snapshot_value=row[headers.index('Fault Snapshot JSON' if language=='en' else '故障快照 JSON')]
            self.check('export fault original snapshot exact',json.loads(snapshot_value),r['faultSnapshot'])
            self.check('one inspection row per check',len(tables['Functional Checks']['rows']),len(r['modelSnapshot']['checkItems']))
            self.check('inspection stage code only',all(x[4]=='inspection' for x in tables['Functional Checks']['rows']))
            self.check('export each inspection field equals saved result',all(x[9]==r['checks']['initial'][x[5]] for x in tables['Functional Checks']['rows']))
            self.check('export material line count',len(tables['Material Usage']['rows']),len(r['materials']))
            material_table=tables['Material Usage'];mh=material_table['headers']
            def column(en,zh):return mh.index(en if language=='en' else zh)
            by_bom={int(row[column('BOM ID','BOM ID')]):row for row in material_table['rows']}
            for part in r['materials']:
                material=by_bom.get(part['bomId'])
                self.check(f"export material row {part['bomId']} exists",material is not None)
                if material is None:continue
                label=f"export material {part['sku']} "
                self.check(label+'actual quantity',float(material[column('Quantity','实际耗用数量')]),part['quantity'])
                self.check(label+'hard cap',float(material[column('BOM Standard Qty','BOM 标准用量上限')]),part['standardQty'])
                self.check(label+'SKU',material[column('Part SKU','物料 SKU')],part['sku'])
                self.check(label+'English description exact',material[column('Description (English)','物料描述（英文）')],part['descriptionEn'])
                self.check(label+'Chinese original description exact',material[column('Description (Chinese)','物料描述（中文）')],part['descriptionZh'])
            self.check('photo index count',len(tables['Photo Index']['rows']),len(r['photos']))
            if r['photos']:
                photo=tables['Photo Index']['rows'][0];original=r['photos'][0]
                self.check('photo export requires authenticated API URL','/api/photos/' in photo[9])
                self.check('photo export original filename',photo[4],original['filename'])
                self.check('photo export valid dimensions',[int(photo[7]),int(photo[8])],[2,3])

    def attachment_case(self,c,r):
        v=c['variant'];language='zh' if v=='language_zh_export' else c['language']
        self.req(c['account'],'PUT','/api/account/language',{'language':language})
        session,_=self.req(c['account'],'GET','/api/session');self.check('account language preference retained',session['user']['language'],language)
        r=self.update(c,r,{'issueNotes':SPECIAL,'translatedIssueNotes':'Manual <>& source translation','receivingSku':'legacy-receiving-'+c['id'],'postSortSku':'legacy-sort','faultCodes':['F0','F8'],'materials':self.materials(c),'checks':self.all_pass(r),'outcome':'awp'})
        if v in ['photo_success_export','photo_failure_retry']:
            if v=='photo_failure_retry':
                before=self.reload(c,r);self.req(c['account'],'POST',f"/api/records/{r['id']}/photos",{'version':r['version'],'filename':'bad.png','contentBase64':base64.b64encode(b'not an image').decode()},422);self.check('failed photo leaves record unchanged',self.reload(c,r),before)
            data,_=self.req(c['account'],'POST',f"/api/records/{r['id']}/photos",{'version':r['version'],'filename':'original-原图.png','contentBase64':base64.b64encode(PNG).decode()},201)
            r=data['record'];photo=data['photo'];_,resp=self.req(c['account'],'GET',photo['url']);self.check('valid PNG bytes exact',hashlib.sha256(resp.content).hexdigest(),hashlib.sha256(PNG).hexdigest())
            other='blair' if c['account']=='alex' else 'alex';self.req(other,'GET',photo['url'],expected=403);_,resp=self.req(other,'GET',photo['url']+'?sn='+urllib.parse.quote(r['sn']));self.check('photo exact SN context readable',resp.content==PNG)
        self.export(c,r,language)
        if v=='notes_reference_export':self.export(c,r,'zh' if language=='en' else 'en')
        return r

    def prototype_case(self,c,r):
        """An isolated source-backed fixture is excluded from the 404 source rows.

        A JS prototype key must behave as an unknown translation lookup key. Keep
        this explicit extension separate from the 100/103 business-case manifest.
        """
        sku=self.args.prefix+'-FIXTURE-CONSTRUCTOR'
        fixture={'modelId':r['modelId'],'sku':sku,'descriptionEn':'','descriptionZh':'constructor',
                 'unit':'pcs','standardQty':1,'active':True,
                 'source':{'file':'isolated-test-fixture-only','row':1,'fixtureOnly':True,'purpose':'unknown prototype translation key; not a real catalog source'}}
        data,_=self.req('admin','POST','/api/admin/bom',fixture,201)
        item=data.get('item')
        self.check('isolated fixture BOM was created',item is not None)
        if item is None:return r
        self.current['fixture']={'bomId':item['id'],'sku':sku,'source404Included':False,'purpose':'constructor is an unknown translation key, never prototype inheritance'}
        data,response=self.req('admin','GET',f"/api/models/{r['modelId']}/bom?q="+urllib.parse.quote(sku))
        rows=data.get('items',[])
        self.check('unknown prototype key does not produce HTTP500',response.status_code,200)
        self.check('fixture exact SKU search returns one row',len(rows),1)
        if rows:
            self.check('unknown key English stays empty',rows[0]['descriptionEn'],'')
            self.check('unknown key Chinese stays original',rows[0]['descriptionZh'],'constructor')
            self.check('unknown key explicitly reports missingEnglish',rows[0].get('missingEnglish'),True)
        real=next(b for b in self.bom[c['catalogKey']] if b['active'])
        r=self.update(c,r,{'outcome':'awp','materials':[{'bomId':item['id'],'quantity':1},{'bomId':real['id'],'quantity':1}]})
        self.check('fixture plus real material are independent lines',len(r['materials']),2)
        # Both export languages exercise every material row, including blank EN
        # and translated real-source EN, with exact original ZH preservation.
        self.export(c,r,'en');self.export(c,r,'zh')
        return r

    def run(self,cases):
        for c in cases:
            self.current={'id':c['id'],'category':c['category'],'variant':c['variant'],'account':c['account'],'expected':c['expected'],'createdIds':[],'steps':[],'assertions':[]}
            try:
                r=self.create(c)
                category=c['category']
                fn={'positive':self.positive,'bom':self.bom_case,'sn_model':self.sn_case,'fault':self.fault_case,'permission_audit':self.permission_case,'bilingual_export_attachment':self.attachment_case,'extended_regression':self.prototype_case}[category]
                r=fn(c,r)
                self.current['finalRecord']=self.reload(c,r)
            except Exception as exc:
                self.current['exception']=f'{type(exc).__name__}: {exc}'
                self.check('execution completed without harness exception',str(exc),'no exception')
            self.current['passed']=bool(self.current['createdIds']) and all(a['passed'] for a in self.current['assertions'])
            self.results.append(self.current)
            print(f"{c['id']} {c['variant']}: {'PASS' if self.current['passed'] else 'FAIL'}",flush=True)
            # Windows readers/indexers can briefly lock output files. Preserve the
            # complete in-memory evidence and continue every case if a write races.
            try:
                self.write()
            except OSError as exc:
                print(f"Evidence write deferred: {exc}",flush=True)
        self.current=None
        self.write()

    def save_text(self,name,text):
        target=self.out/name
        for attempt in range(10):
            try:
                target.write_text(text,encoding='utf-8')
                return
            except OSError:
                if attempt==9:raise
                time.sleep(.1)

    def write(self):
        assertions=[a for c in self.results for a in c['assertions']]
        ids=[i for c in self.results for i in c['createdIds']]
        report={'startedAt':self.started,'updatedAt':dt.datetime.now(dt.timezone.utc).isoformat(),'baseUrl':self.base,'prefix':self.args.prefix,'scope':'isolated demo real catalog; serial requests; no visual claims',
                'cases':len(self.results),'passed':sum(c['passed'] for c in self.results),'failed':sum(not c['passed'] for c in self.results),'createdIds':ids,'distinctCreatedRecords':len(set(ids)),
                'manifestCases':sum(c['category']!='extended_regression' for c in self.results),'manifestPassed':sum(c['passed'] and c['category']!='extended_regression' for c in self.results),
                'extensionCases':sum(c['category']=='extended_regression' for c in self.results),'extensionPassed':sum(c['passed'] and c['category']=='extended_regression' for c in self.results),
                'assertions':len(assertions),'assertionsPassed':sum(a['passed'] for a in assertions),'categoryCounts':dict(collections.Counter(c['category'] for c in self.results)),'results':self.results,
                'previousRuns':[{'prefix':p.get('prefix'),'path':p.get('_archivePath'),'passed':p.get('passed'),'failed':p.get('failed'),'cases':p.get('cases')} for p in self.previous_runs],
                'historyNotes':['R1 stopped after C066 on Windows evidence-write OSError22; C060 initially compared equal-cap versions (test assumption). R1 raw JSON was overwritten before the retention instruction; only the tool transcript and this summary remain. R2 full evidence is retained in runs.']}
        self.save_text('API_RESULTS.json',json.dumps(report,ensure_ascii=False,indent=2,default=lambda x:sorted(x) if isinstance(x,set) else str(x)))
        lines=['# 串行API模拟实际日志','',f"地址 `{self.base}`；prefix `{self.args.prefix}`；{len(self.results)} cases，{report['passed']} pass，{report['failed']} fail，{len(set(ids))}条真实独立记录，{len(assertions)}个断言。",'', '请求实际JSON/每步断言完整见API_RESULTS.json；凭据与session令牌不入报告。', '', '| Case | 分支 | 实际 | Created IDs | 断言通过/总数 |','|---|---|---|---|---|']
        for c in self.results:lines.append(f"| {c['id']} | {c['variant']} | {'PASS' if c['passed'] else 'FAIL'} | {','.join(map(str,c['createdIds']))} | {sum(a['passed'] for a in c['assertions'])}/{len(c['assertions'])} |")
        self.save_text('API_LOG.md','\n'.join(lines)+'\n')
        defects=['# API模拟失败与根因线索','', '以下按实际失败断言登记；API失败不自动等同生产缺陷，需区分测试前置、脚本问题和业务实现。','']
        for previous in self.previous_runs:
            for case in previous.get('results',[]):
                unexpected=[s for s in case.get('steps',[]) if s['actualStatus']!=s['expectedStatus']]
                if not unexpected:continue
                defects.extend([f"## 先前运行 {previous.get('prefix')} / {case['id']}：原始失败保留",''])
                for s in unexpected: defects.append(f"- `{s['method']} {s['path']}` expected {s['expectedStatus']}, actual {s['actualStatus']}; body={s['request']}; response={s['response']}")
                if case['variant']=='version_independent_cap':
                    fixed=any(c['id']=='C060' and c['passed'] and any(a['name']=='model switch resolves target fault snapshots rather than false/old source' and a['passed'] for a in c['assertions']) for c in self.results)
                    defects.append('- P1实际业务缺陷：切换型号并同一请求加入新型号合法BOM被422拒绝。domain中 `old=!modelChanged && ...` 在切型号时为false，`old ?? current`保留false，因而拒绝合法新BOM；fault prior存在同类风险。C060保留完整换型+合法新材料+新型号故障snapshot+旧检查清空额外断言。'+('本轮完整路径已通过，API修复回归闭环；原始失败证据仍保留。' if fixed else '本轮尚未通过完整修复回归。'))
                defects.append('')
        for c in self.results:
            if c['passed']:continue
            defects.extend([f"## {c['id']} {c['variant']}",''])
            for a in c['assertions']:
                if not a['passed']:defects.append('- '+a['name']+': expected `'+str(a['expected'])[:450]+'`; actual `'+str(a['actual'])[:450]+'`.')
            if c.get('exception'):defects.append('- Harness exception: '+c['exception'])
            defects.append('- 根因定位：检查该case逐步response.error及拒绝前后快照；不修改生产实现。\n')
        if not report['failed']:defects.append('本次实际运行未发现API断言失败；不覆盖浏览器视觉、现场部署或真实业务数据。')
        defects.append('历史R1：第66笔后证据写入发生Windows OSError22；另C060曾比较两个相同上限版本，属于测试假设问题。R1原始JSON在保留要求到达前已被下一轮覆盖，只有工具输出/概要，不声称保有完整原始证据。后续写入增加重试，全部100笔执行完成；R2完整日志已外置保留。')
        self.save_text('DEFECTS_API.md','\n'.join(defects)+'\n')


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--base-url',required=True)
    parser.add_argument('--cases',default='docs/batch-simulation/CASES.json')
    parser.add_argument('--output-dir',default='docs/batch-simulation')
    parser.add_argument('--prefix',default='API-'+dt.datetime.now().strftime('%Y%m%d%H%M%S'))
    parser.add_argument('--case-ids',help='Optional comma-separated IDs for supplementary serial regression; the full manifest remains validated')
    parser.add_argument('--prototype-regression',action='store_true',help='Append EXT-PROTOTYPE isolated constructor-key translation/export regression (not a source catalog row)')
    args=parser.parse_args()
    u=urllib.parse.urlparse(args.base_url)
    if u.scheme not in ('http','https') or u.hostname not in ('127.0.0.1','localhost') or u.username or u.password or u.path not in ('','/') or u.query or u.fragment or u.port==4310:
        parser.error('Only an isolated localhost/127.0.0.1 origin is allowed; live4310 is forbidden')
    if not re.fullmatch(r'[A-Za-z0-9_-]{1,60}',args.prefix):parser.error('prefix must be 1-60 safe ASCII characters')
    manifest=json.loads(pathlib.Path(args.cases).read_text(encoding='utf-8'))
    cases=manifest['cases'] if isinstance(manifest,dict) else manifest
    if len(cases)<100 or len({c['id'] for c in cases})!=len(cases):parser.error('At least 100 uniquely identified manifest cases required')
    if args.prototype_regression:
        cases=cases+[{'id':'EXT-PROTOTYPE','category':'extended_regression','variant':'unknown_prototype_translation_key','account':'admin',
                      'catalogKey':'e1000v2-costdown','sn':'{prefix}-PROTOTYPE-FIXTURE','expected':{'status':200,'business':'constructor remains unknown: empty EN, original ZH, missingEnglish true; both-language two-row exports exact'}}]
    if args.case_ids:
        selected=set(args.case_ids.split(','));unknown=selected-{c['id'] for c in cases}
        if unknown:parser.error('Unknown case IDs: '+','.join(sorted(unknown)))
        cases=[c for c in cases if c['id'] in selected]
    runner=Runner(args);runner.setup();runner.run(cases)
    return 0 if all(c['passed'] for c in runner.results) else 1


if __name__=='__main__':
    sys.exit(main())
