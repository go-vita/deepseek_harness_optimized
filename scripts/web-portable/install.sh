#!/bin/sh
set -eu
bundle_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
cd "$bundle_dir"
command -v node >/dev/null 2>&1 || { echo 'Install Node.js 24.9 or later first.' >&2; exit 1; }
node ./check.mjs
command -v pnpm >/dev/null 2>&1 || { echo 'Install pnpm 11.28.5 first, then run ./install.sh again.' >&2; exit 1; }
[ "$(pnpm --version)" = '11.28.5' ] || { echo 'This bundle requires pnpm 11.28.5.' >&2; exit 1; }
rm -f .web-installed.json
pnpm install --prod --frozen-lockfile
node ./check.mjs --record-install
echo 'Dependencies installed. Run ./start.sh to start Harness.'
