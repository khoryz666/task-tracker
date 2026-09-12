#!/usr/bin/env bash
# Local static server for development/testing (service workers require http(s), not file://).
set -euo pipefail
cd "$(dirname "$0")/web"
python3 -m http.server 8000
