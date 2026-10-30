#!/bin/sh
# Phase 72: the late-game saves the store shots are taken from (bench bots, seed 1, deterministic) into
# tools/store/.cache (git-ignored). busy / busy-useast: the cautious bot, steam era; rich-*: the strong bot in 1950 (diesels).
set -e
cd "$(dirname "$0")/../.."
mkdir -p tools/store/.cache
C="$PWD/tools/store/.cache"
DUMP_SAVE="$C/busy.json" npx tsx tools/bench/goodPlayer.ts central-eu 1890 normal 1904 1 > /dev/null &
DUMP_SAVE="$C/busy-useast.json" npx tsx tools/bench/goodPlayer.ts us-east 1900 normal 1914 1 > /dev/null &
DUMP_SAVE="$C/rich-1950eu.json" npx tsx tools/bench/strongPlayer.ts central-eu 1950 normal 1966 1 > /dev/null &
DUMP_SAVE="$C/rich-1950us.json" npx tsx tools/bench/strongPlayer.ts us-east 1950 normal 1966 1 > /dev/null &
wait
