#!/usr/bin/env bash
set -u
printf '== identity and OS ==\n'
id
uname -sm
if [ -r /etc/os-release ]; then
  sed -n '/^ID=/p; /^VERSION_ID=/p; /^PRETTY_NAME=/p' /etc/os-release
fi
printf '\n== runtime ==\n'
if command -v node >/dev/null 2>&1; then
  command -v node
  node --version
  node -e 'const [a,b]=process.versions.node.split(".").map(Number);console.log(JSON.stringify({supported:a===24&&b>=10,sqlite:typeof require("node:sqlite").DatabaseSync==="function"}))'
else
  printf 'Node runtime not found\n'
fi
printf '\n== relevant listeners ==\n'
if command -v ss >/dev/null 2>&1; then
  ss -ltnp '( sport = :80 or sport = :443 or sport = :14310 )'
fi
printf '\n== service status ==\n'
if command -v systemctl >/dev/null 2>&1; then
  systemctl is-active jackery.service nginx.service 2>/dev/null || true
fi
printf '\n== disk ==\n'
df -h / /var /opt 2>/dev/null || true
printf '\n== existing application metadata only ==\n'
for p in /opt/jackery/current /var/lib/jackery/huabao.sqlite /etc/systemd/system/jackery.service /etc/nginx/sites-enabled/jackery; do
  if [ -e "$p" ] || [ -L "$p" ]; then
    stat -c '%A %U:%G %s %n' "$p"
    if [ -L "$p" ]; then readlink "$p"; fi
  fi
done
printf '\nRead-only preflight complete; no service/configuration/data was changed.\n'
