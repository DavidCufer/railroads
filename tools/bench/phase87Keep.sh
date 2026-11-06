#!/bin/bash
# Restart-safe: run the Phase 87 batches in order, committing + pushing rows to phase-87-hard as they appear.
cd "$(dirname "$0")/../.." || exit 1
pgrep -f "tools/bench/phase87.ts" >/dev/null && exit 0
for b in "$@"; do
  npx tsx tools/bench/phase87.ts "$b" 4 >> /tmp/p87.log 2>&1
  git add docs/bench/phase87.jsonl && git commit -qm "Phase 87: bench rows ($b)" && git push -q origin HEAD:phase-87-hard
done
