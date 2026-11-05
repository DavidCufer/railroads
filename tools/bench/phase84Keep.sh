#!/bin/bash
# Phase 84 check-in: restart the runner if it died, commit and push new rows.
cd /home/user/railroads
pgrep -f "tools/bench/phase84.ts" >/dev/null || (nohup npx tsx tools/bench/phase84.ts 3 >> /tmp/phase84.log 2>&1 &)
git add docs/bench/phase84.jsonl 2>/dev/null
git commit -qm "Phase 84: bench rows" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>" 2>/dev/null && git push -q origin phase-84-canary
wc -l docs/bench/phase84.jsonl 2>/dev/null
