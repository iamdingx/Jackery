#!/usr/bin/env bash
set -Eeuo pipefail
umask 027
if [ "$(id -u)" -ne 0 ]; then printf 'Run with sudo.\n' >&2; exit 1; fi
app=/opt/jackery
release="$app/releases/abb8df9-84b855ad13e8"
runtime="$app/runtime/node-v24.22.2-linux-x64"
archive=/home/sagacity/Jackery_V1_Ubuntu_abb8df9.zip
node_archive=/home/sagacity/node-v24.22.2-linux-x64.tar.xz
for p in "$app" /var/lib/jackery /etc/jackery /etc/systemd/system/jackery.service /etc/nginx/sites-available/jackery; do
  if [ -e "$p" ] || [ -L "$p" ]; then printf 'Existing target requires an upgrade/backup plan: %s\n' "$p" >&2; exit 1; fi
done
if ss -H -ltn '( sport = :14310 )' | grep -q .; then printf 'Upstream port is occupied.\n' >&2; exit 1; fi
printf '%s  %s\n' 21d21039adf2ce5130be8fae729a33eb51b3b03e8bb864faf0593a36cd3deea2 "$archive" | sha256sum -c -
printf '%s  %s\n' 48cc0e21e048790e54c0cf5749c2725005313d652651c40b7a21feb9697aaf75 "$node_archive" | sha256sum -c -
install -d -m 0755 "$app/releases" "$app/runtime" "$release"
tar -xJf "$node_archive" -C "$app/runtime"
"$runtime/bin/node" --version
"$runtime/bin/node" -e 'const [a,b]=process.versions.node.split(".").map(Number);if(a!==24||b<10)process.exit(1);if(typeof require("node:sqlite").DatabaseSync!=="function")process.exit(1)'
unzip -q "$archive" -d "$release"
(cd "$release" && sha256sum -c SHA256SUMS)
find "$release" -type d -exec chmod 0755 {} +
find "$release" -type f -exec chmod 0644 {} +
chown -R root:root "$release" "$runtime"
if ! getent passwd jackery >/dev/null; then
  useradd --system --user-group --home-dir /var/lib/jackery --no-create-home --shell /usr/sbin/nologin jackery
fi
install -d -o jackery -g jackery -m 0750 /var/lib/jackery
install -d -o root -g root -m 0750 /etc/jackery
install -o root -g root -m 0600 "$release/deployment/service-environment.template" /etc/jackery/jackery.env
sed "s|@@NODE_BIN@@|$runtime/bin/node|g; s| /opt/jackery/current/server.js| server.js|g" "$release/deployment/jackery.service.template" > "$app/jackery.service.rendered"
install -o root -g root -m 0644 "$app/jackery.service.rendered" /etc/systemd/system/jackery.service
ln -s "$release" "$app/current"
systemctl daemon-reload
systemctl enable --now jackery.service
healthy=0
for attempt in $(seq 1 30); do
  if curl --fail --silent --max-time 2 http://127.0.0.1:14310/api/health | "$runtime/bin/node" -e 'let s="";process.stdin.on("data",d=>s+=d);process.stdin.on("end",()=>{try{const x=JSON.parse(s);process.exit(x.ok===true&&x.demo===false?0:1)}catch{process.exit(1)}})'; then healthy=1; break; fi
  sleep 1
done
if [ "$healthy" -ne 1 ]; then
  systemctl stop jackery.service
  printf 'New upstream failed; proxy was not published.\n' >&2
  exit 1
fi
install -o root -g root -m 0644 "$release/deployment/nginx.conf.template" /etc/nginx/sites-available/jackery
ln -s /etc/nginx/sites-available/jackery /etc/nginx/sites-enabled/jackery
if ! nginx -t; then
  rm -- /etc/nginx/sites-enabled/jackery
  printf 'New proxy config disabled; existing default site left unchanged.\n' >&2
  exit 1
fi
systemctl reload nginx.service
curl --fail --silent --max-time 5 -H 'Host: 221.224.86.238' http://127.0.0.1/api/health
printf '\nJackery production service installed; initial admin credential remains private in the data directory.\n'
