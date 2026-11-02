#!/usr/bin/env bash
set -Eeuo pipefail
umask 077
[ "$(id -u)" -eq 0 ] && [ "$#" -eq 1 ] || exit 1
candidate=$(readlink -f "$1")
[[ "$candidate" == /home/sagacity/jackery-sku-candidate-* ]] && [ -f "$candidate/scripts/update-model-skus.mjs" ] || exit 1
node=/opt/jackery/runtime/node-v24.22.2-linux-x64/bin/node
old=$(readlink -f /opt/jackery/current)
backup="/var/backups/jackery/model-sku-$(date -u +%Y%m%dT%H%M%SZ)-$$"
install -d -m 0700 "$backup"
cp -p /etc/nginx/sites-available/jackery "$backup/nginx.conf"
stopped=0
snapshot(){
 python3 - "$1" <<'PY'
import sqlite3,json,hashlib,sys
d=sqlite3.connect('file:/var/lib/jackery/huabao.sqlite?mode=ro',uri=True)
r={}
for table in ['records','photos','users','models','bom','model_knowledge','meta','audits','appearance']:
 rows=d.execute('SELECT * FROM '+table+' ORDER BY 1').fetchall()
 r[table]={'rows':rows,'sha256':hashlib.sha256(json.dumps(rows,ensure_ascii=False,separators=(',',':')).encode()).hexdigest()}
with open(sys.argv[1],'w',encoding='utf-8') as f:json.dump(r,f,ensure_ascii=False)
PY
}
recover(){
 trap - ERR
 set +e
 if [ -f "$backup/before.json" ]; then
  python3 - "$backup/before.json" <<'PY'
import sqlite3,json,sys
s=json.load(open(sys.argv[1]));d=sqlite3.connect('/var/lib/jackery/huabao.sqlite')
with d:
 for row in s['models']['rows']:d.execute('UPDATE models SET data=? WHERE id=?',(row[1],row[0]))
 d.execute('DELETE FROM meta WHERE key=?',('model-sku:jackery-eu-bom-confirmed-20261102',))
 for row in s['meta']['rows']:d.execute('INSERT INTO meta(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value',row)
PY
 fi
 if [ "$stopped" -eq 1 ]; then systemctl restart jackery.service; fi
 cp -p "$backup/nginx.conf" /etc/nginx/sites-available/jackery
 nginx -t && systemctl reload nginx.service
 printf 'SKU update failed; restored original model master values. Backup: %s\n' "$backup" >&2
 exit 1
}
trap recover ERR
printf 'server { listen 80; server_name 221.224.86.238; add_header Retry-After 15 always; return 503; }\n' > /etc/nginx/sites-available/jackery
nginx -t
systemctl reload nginx.service
systemctl stop jackery.service
stopped=1
(cd "$old" && "$node" scripts/backup.mjs --data-dir /var/lib/jackery --output "$backup")
snapshot "$backup/before.json"
(cd "$candidate" && "$node" scripts/update-model-skus.mjs --data-dir /var/lib/jackery --report "$backup/update-report.json")
snapshot "$backup/after.json"
python3 - "$backup" <<'PY'
import json,sys,pathlib,datetime
p=pathlib.Path(sys.argv[1]);a=json.loads((p/'before.json').read_text());b=json.loads((p/'after.json').read_text());report=json.loads((p/'update-report.json').read_text())
assert report['matchedModels']==9 and len(report['pendingModels'])==2
for t in ['records','photos','users','bom','model_knowledge','audits','appearance']:assert a[t]['sha256']==b[t]['sha256'],t
assert len(a['models']['rows'])==len(b['models']['rows'])==9
old={r[0]:json.loads(r[1]) for r in a['models']['rows']};new={r[0]:json.loads(r[1]) for r in b['models']['rows']};assert set(old)==set(new)
expected={'e1000-default':'70-1000-EUO001','e2000plus-a':'21-0001-000037'};changes=[]
for key,x in old.items():
 y=new[key]
 if x!=y:
  assert x['catalogKey'] in expected and y==dict(x,productSku=expected[x['catalogKey']])
  changes.append({'modelId':key,'catalogKey':x['catalogKey'],'before':x.get('productSku',''),'after':y['productSku']})
am=dict(a['meta']['rows']);bm=dict(b['meta']['rows']);mk='model-sku:jackery-eu-bom-confirmed-20261102'
assert {k:v for k,v in am.items() if k!=mk}=={k:v for k,v in bm.items() if k!=mk}
assert mk in bm
r={'status':'UPDATED','backup':str(p),'masterChanges':changes,'matchedModels':report['matchedModels'],'pendingModels':report['pendingModels'],'businessTablesUnchanged':True,'bomAndKnowledgeUnchanged':True,'modelIdsAndActivationUnchanged':True,'tableCounts':{t:len(v['rows']) for t,v in b.items()},'verifiedAt':datetime.datetime.now(datetime.timezone.utc).isoformat()}
(p/'receipt.json').write_text(json.dumps(r,ensure_ascii=False,indent=2)+'\n');print(json.dumps(r,ensure_ascii=False))
PY
systemctl restart jackery.service
healthy=0
for attempt in $(seq 1 20); do
 if curl --fail --silent --max-time 2 http://127.0.0.1:14310/api/health > "$backup/health.json"; then healthy=1; break; fi
 sleep 1
done
[ "$healthy" -eq 1 ]
cp -p "$backup/nginx.conf" /etc/nginx/sites-available/jackery
nginx -t
systemctl reload nginx.service
trap - ERR
printf 'SKU update verified and service restored. Receipt: %s/receipt.json\n' "$backup"
