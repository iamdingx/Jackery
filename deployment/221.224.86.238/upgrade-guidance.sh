#!/usr/bin/env bash
set -Eeuo pipefail
umask 077
if [ "$(id -u)" -ne 0 ] || [ "$#" -ne 3 ]; then printf 'Usage: sudo bash upgrade-guidance.sh ARCHIVE SHA256 RELEASE_NAME\n' >&2; exit 1; fi
archive=$(readlink -f "$1")
expected=$2
name=$3
[[ "$archive" == /home/sagacity/*.zip && "$expected" =~ ^[a-f0-9]{64}$ && "$name" =~ ^[a-z0-9][a-z0-9._-]{5,90}$ ]] || exit 1
app=/opt/jackery
node="$app/runtime/node-v24.22.2-linux-x64/bin/node"
old=$(readlink -f "$app/current")
[[ "$old" == "$app/releases/"* ]] && [ -L "$app/current" ] || exit 1
release="$app/releases/$name"
[ ! -e "$release" ] || { printf 'Release already exists; refusing overwrite.\n' >&2; exit 1; }
printf '%s  %s\n' "$expected" "$archive" | sha256sum -c -
install -d -m 0755 "$release"
unzip -q "$archive" -d "$release"
(cd "$release" && sha256sum -c SHA256SUMS)
find "$release" -type d -exec chmod 0755 {} +
find "$release" -type f -exec chmod 0644 {} +
chown -R root:root "$release"
"$node" --check "$release/server.js"
"$node" --check "$release/src/source-translations.js"
backup="/var/backups/jackery/guidance-update-$(date -u +%Y%m%dT%H%M%SZ)-$$"
install -d -m 0700 "$backup"
cp -p /etc/nginx/sites-available/jackery "$backup/nginx.conf"
cp -p /etc/systemd/system/jackery.service "$backup/jackery.service"
cp -p /etc/jackery/jackery.env "$backup/jackery.env"
printf '%s\n' "$old" > "$backup/previous-release.txt"
switched=0
stopped=0
rollback(){
 trap - ERR
 set +e
 if [ "$switched" -eq 1 ]; then ln -s "$old" "$app/current.rollback.$$" && mv -Tf "$app/current.rollback.$$" "$app/current"; fi
 if [ "$stopped" -eq 1 ]; then systemctl restart jackery.service; fi
 cp -p "$backup/nginx.conf" /etc/nginx/sites-available/jackery
 nginx -t && systemctl reload nginx.service
 printf 'Upgrade failed. Previous application/proxy restored. Database not replaced. Backup: %s\n' "$backup" >&2
 exit 1
}
trap rollback ERR
printf 'server { listen 80; server_name 221.224.86.238; add_header Retry-After 15 always; return 503; }\n' > /etc/nginx/sites-available/jackery
nginx -t
systemctl reload nginx.service
systemctl stop jackery.service
stopped=1
(cd "$old" && "$node" scripts/backup.mjs --data-dir /var/lib/jackery --output "$backup")
snapshot(){
 python3 - "$1" <<'PY'
import sqlite3,json,hashlib,sys
d=sqlite3.connect('file:/var/lib/jackery/huabao.sqlite?mode=ro',uri=True)
state={}
for table in ['records','photos','users','models','bom','model_knowledge','meta','audits']:
 rows=d.execute('SELECT * FROM '+table+' ORDER BY 1').fetchall()
 state[table]={'rows':len(rows),'sha256':hashlib.sha256(json.dumps(rows,ensure_ascii=False,separators=(',',':')).encode()).hexdigest()}
with open(sys.argv[1],'w',encoding='utf-8') as f:json.dump(state,f,ensure_ascii=False,indent=2)
PY
}
snapshot "$backup/before-state.json"
ln -s "$release" "$app/current.next.$$"
mv -Tf "$app/current.next.$$" "$app/current"
switched=1
systemctl restart jackery.service
healthy=0
for attempt in $(seq 1 30); do
 if curl --fail --silent --max-time 2 http://127.0.0.1:14310/api/health > "$backup/health.json" && python3 -c 'import json,sys;x=json.load(open(sys.argv[1]));sys.exit(0 if x.get("ok") is True and x.get("demo") is False else 1)' "$backup/health.json"; then healthy=1; break; fi
 sleep 1
done
[ "$healthy" -eq 1 ]
snapshot "$backup/after-state.json"
cmp "$backup/before-state.json" "$backup/after-state.json"
cp -p "$backup/nginx.conf" /etc/nginx/sites-available/jackery
nginx -t
systemctl reload nginx.service
trap - ERR
python3 - "$backup/before-state.json" "$backup" "$old" "$release" <<'PY'
import json,sys,datetime
s=json.load(open(sys.argv[1]));r={'status':'UPGRADED','previousRelease':sys.argv[3],'release':sys.argv[4],'backup':sys.argv[2],'allPersistentTablesUnchanged':True,'tableCounts':{k:v['rows'] for k,v in s.items()},'verifiedAt':datetime.datetime.now(datetime.timezone.utc).isoformat()}
with open('/opt/jackery/guidance-upgrade-receipt.json','w',encoding='utf-8') as f:json.dump(r,f,ensure_ascii=False,indent=2)
print(json.dumps(r,ensure_ascii=False))
PY
