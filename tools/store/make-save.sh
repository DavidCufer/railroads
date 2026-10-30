#!/bin/sh
# The busy network the store shots are taken from: the "good player" bench bot, central-eu from 1890 for 14 years
# (23 trains). Deterministic (seed 1). Writes tools/store/.cache/busy.json (git-ignored).
set -e
cd "$(dirname "$0")/../.."
mkdir -p tools/store/.cache
DUMP_SAVE="$PWD/tools/store/.cache/busy.json" npx tsx tools/bench/goodPlayer.ts central-eu 1890 normal 1904 1 > /dev/null
