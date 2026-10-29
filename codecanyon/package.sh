#!/usr/bin/env bash
# Build the buyer ZIP without changing or deleting previous builds.
set -euo pipefail
cd "$(dirname "$0")/.."
exec python3 codecanyon/package.py
