#!/bin/sh
set -eu
cd "$(dirname "$0")"
node -e "const v=process.versions.node.split('.').map(Number);if(v[0]!==24||v[1]<10){console.error('Node.js 24.10+ (24.x) required');process.exit(1)}"
exec node server.js "$@"
