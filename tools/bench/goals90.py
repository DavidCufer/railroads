"""Phase 90 step 4: medians of the g90 / g90h rows (year 5 / 10 / 16 revenue and operating profit, $M) per era, plus the
before/after figures. `python3 tools/bench/goals90.py` reads docs/explore/data/pax89.jsonl."""
import json, statistics, collections
rows = [json.loads(l) for l in open("docs/explore/data/pax89.jsonl")]
def med(xs): return statistics.median(xs) if xs else float("nan")
for tag in ("g90", "g90h", "g90p45"):
    g = collections.defaultdict(list)
    for r in rows:
        if r["id"].split("/")[1] == "route+" + tag: g[r["startYear"]].append(r)
    print("==", tag)
    for era in sorted(g):
        rs = g[era]; alive = [r for r in rs if not r["bankrupt"] and r["years"] == 16]
        def at(r, y, i): return r["byYear"][y - 1][i]
        out = {}
        for name, i in (("profit", 1), ("rev", 2)):
            out[name] = [round(med([at(r, y, i) for r in alive]), 2) if alive else None for y in (5, 10, 16)]
        pax = med([at(r, 16, 3) for r in alive]) if alive else 0
        frt = med([at(r, 16, 4) for r in alive]) if alive else 0
        print(era, "runs", len(rs), "survivors", len(alive), "revenue", out["rev"], "profit", out["profit"],
              "y16 pax", round(pax, 2), "freight", round(frt, 2), "freight share", round(100 * frt / max(.01, pax + frt)), "%")
