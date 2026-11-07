#!/usr/bin/env bash
set -Eeuo pipefail
umask 077
if [ "$(id -u)" -ne 0 ] || [ "$#" -ne 3 ]; then
  echo "Usage: sudo bash upgrade-inventory.sh ARCHIVE SHA256 RELEASE_NAME" >&2
  exit 1
fi
archive=$(readlink -f "$1")
expected=$2
name=$3
[[ "$archive" == /home/sagacity/*.zip && "$expected" =~ ^[a-f0-9]{64}$ && "$name" =~ ^[a-z0-9][a-z0-9._-]{5,90}$ ]] || exit 1
app=/opt/jackery
data=/var/lib/jackery
site=/etc/nginx/sites-available/jackery
node="$app/runtime/node-v24.22.2-linux-x64/bin/node"
old=$(readlink -f "$app/current")
[[ "$old" == "$app/releases/"* && -L "$app/current" ]] || exit 1
release="$app/releases/$name"
[ ! -e "$release" ] || { echo "Release already exists" >&2; exit 1; }
printf '%s  %s\n' "$expected" "$archive" | sha256sum -c -
install -d -m 0755 "$release"
unzip -q "$archive" -d "$release"
(cd "$release" && sha256sum -c SHA256SUMS)
find "$release" -type d -exec chmod 0755 {} +
find "$release" -type f -exec chmod 0644 {} +
chown -R root:root "$release"
"$node" --check "$release/server.js"
batch="$release/catalogs/jackery-classified-bom-20261107.json"
cli="$release/scripts/update-classified-bom.mjs"
backup="/var/backups/jackery/inventory-release-$(date -u +%Y%m%dT%H%M%SZ)-$$"
install -d -m 0700 "$backup"
cp -p "$site" "$backup/nginx.conf"
cp -p /etc/systemd/system/jackery.service "$backup/jackery.service"
cp -p /etc/jackery/jackery.env "$backup/jackery.env"
printf '%s\n' "$old" > "$backup/previous-release.txt"
"$node" "$cli" --data-dir "$data" --batch "$batch" > "$backup/preview.json"
preview=$(python3 - "$backup/preview.json" <<'PY'
import json,sys
r=json.load(open(sys.argv[1]))
assert len(r['models']) == 11 and all(m['active'] for m in r['models']), r
assert r['addedModels'] == 2 and r['retired'] == 23, r
assert [sum(m[k] for m in r['models']) for k in ['rows','core','non_core','packaging','allOnly']] == [496,90,197,208,1], r
print(r['previewHash'])
PY
)
stopped=0
switched=0
applied=0
rollback(){
  trap - ERR
  set +e
  systemctl stop jackery.service
  if [ "$applied" -eq 1 ]; then
    python3 - "$data/huabao.sqlite" "$backup_db" <<'PY'
import sqlite3,sys
db=sqlite3.connect(sys.argv[1])
db.execute('PRAGMA foreign_keys=ON')
db.execute('ATTACH DATABASE ? AS old',(sys.argv[2],))
with db:
    for table in ('bom','model_knowledge','models'):
        db.execute(f'DELETE FROM main.{table} WHERE id NOT IN (SELECT id FROM old.{table})')
        db.execute(f'UPDATE main.{table} SET data=(SELECT data FROM old.{table} WHERE id=main.{table}.id)')
    db.execute('DELETE FROM main.meta WHERE key=?',('catalog:classified-bom-20261107',))
assert db.execute('PRAGMA quick_check').fetchone() == ('ok',)
PY
    if [ "$?" -ne 0 ]; then
      echo "BOM rollback failed. Maintenance is still active. Backup: $backup" >&2
      exit 1
    fi
  fi
  if [ "$switched" -eq 1 ]; then
    ln -s "$old" "$app/current.rollback.$$" && mv -Tf "$app/current.rollback.$$" "$app/current"
  fi
  if [ "$stopped" -eq 1 ]; then systemctl restart jackery.service; else systemctl start jackery.service; fi
  cp -p "$backup/nginx.conf" "$site"
  nginx -t && systemctl reload nginx.service
  echo "Upgrade failed. Previous application and BOM restored. Backup: $backup" >&2
  exit 1
}
trap rollback ERR
printf 'server { listen 80; server_name 221.224.86.238; add_header Retry-After 15 always; return 503; }\n' > "$site"
nginx -t
systemctl reload nginx.service
systemctl stop jackery.service
stopped=1
"$node" "$release/scripts/backup.mjs" --data-dir "$data" --output "$backup"
backup_db=$(find "$backup" -mindepth 2 -maxdepth 2 -name huabao.sqlite -print)
[ -f "$backup_db" ]
runuser -u jackery -- "$node" "$cli" --data-dir "$data" --batch "$batch" --apply "$preview" > "$backup/import.json"
applied=1
python3 - "$data/huabao.sqlite" "$backup_db" "$backup" "$batch" <<'PY'
import datetime,json,pathlib,sqlite3,sys
live,backup,output,batch=sys.argv[1:]
db=sqlite3.connect('file:'+live+'?mode=ro',uri=True)
before=sqlite3.connect('file:'+backup+'?mode=ro',uri=True)
assert db.execute('PRAGMA quick_check').fetchone() == ('ok',)
assert not db.execute('PRAGMA foreign_key_check').fetchall()
unchanged={}
for table in ('records','photos','users','audits','appearance','sessions'):
    old_rows=before.execute(f'SELECT * FROM {table} ORDER BY 1').fetchall()
    assert old_rows == db.execute(f'SELECT * FROM {table} ORDER BY 1').fetchall(),table
    unchanged[table]=len(old_rows)
old_ids=before.execute('SELECT id,model_id,sku FROM bom ORDER BY id').fetchall()
assert old_ids == db.execute('SELECT id,model_id,sku FROM bom WHERE id<=? ORDER BY id',(old_ids[-1][0],)).fetchall()
models={x['catalogKey']:x for (raw,) in db.execute('SELECT data FROM models') if (x:=json.loads(raw)).get('catalogKey')}
assert len(models)==11 and all(m['active'] for m in models.values())
assert db.execute('SELECT count(*) FROM inventory').fetchone()==(0,)
report=json.loads((pathlib.Path(output)/'import.json').read_text())
for entry in json.loads(pathlib.Path(batch).read_text())['models']:
    model=models[entry['catalogKey']]
    parts={p['sku']:p for (raw,) in db.execute('SELECT data FROM bom WHERE model_id=?',(model['id'],)) if (p:=json.loads(raw))}
    for expected in entry['bom']:
        item=parts[expected['sku']]
        assert (item['standardQty'],item['category'],item['allOnly']) == (expected['standardQty'],expected['category'],expected['allOnly'])
    assert all(not parts[sku]['active'] for sku in entry['retireSkus'] if sku in parts)
result={'status':'IMPORTED','migration':report,'preservedTableCounts':unchanged,'stockRows':0,'backup':output,'verifiedAt':datetime.datetime.now(datetime.timezone.utc).isoformat()}
(pathlib.Path(output)/'receipt.json').write_text(json.dumps(result,ensure_ascii=False)+'\n')
PY
ln -s "$release" "$app/current.next.$$"
mv -Tf "$app/current.next.$$" "$app/current"
switched=1
systemctl restart jackery.service
healthy=0
for attempt in $(seq 1 30); do
  if curl --fail --silent --max-time 2 http://127.0.0.1:14310/api/health > "$backup/health.json" &&
    python3 -c 'import json,sys;x=json.load(open(sys.argv[1]));assert x["ok"] and x["demo"] is False' "$backup/health.json"; then
    healthy=1
    break
  fi
  sleep 1
done
[ "$healthy" -eq 1 ]
cp -p "$backup/nginx.conf" "$site"
nginx -t
systemctl reload nginx.service
trap - ERR
cat "$backup/receipt.json"
printf 'Release: %s\n' "$release"
