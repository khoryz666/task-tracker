#!/usr/bin/env bash
# Compiles the TypeScript sources to plain ES modules. No bundler.
set -euo pipefail
cd "$(dirname "$0")"

tsc -p web/tsconfig.app.json
tsc -p web/sw-src/tsconfig.sw.json

echo "Build complete. Serve web/ over http(s) (see ./serve.sh) — do not open via file://."
