#!/bin/sh
set -eu
bundle_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
command -v node >/dev/null 2>&1 || { echo 'Install Node.js 24.9 or later first.' >&2; exit 1; }
node "$bundle_dir/check.mjs" --installed
export DSH_TELEMETRY_DISABLED=1
exec node "$bundle_dir/node_modules/@deepseek-ai/dsh/lib/bin.js" --profile web "$@"
