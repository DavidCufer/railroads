"""Phase 90: markdown table of the 10-year V2 rows by configuration (year-10 values, mean over the runs present).
`python3 tools/bench/freight90Table.py` reads docs/explore/data/pax89.jsonl."""
import json, collections
rows = [json.loads(l) for l in open("docs/explore/data/pax89.jsonl")]
g = collections.defaultdict(list)
for r in rows:
    if r["years"] == 10 and r["bot"] == "strong":
        g[r["id"].split("/")[1]].append(r)
names = {
    "today+t10": "today's passenger model",
    "route+r33": "route demand 0.33, game as is",
    "route+r33b": "+ bot ranks freight first, best buyer",
    "route+r33bo3": "+ industry output x3",
    "route+r33bf15": "+ freight rates x1.5",
    "route+r33bo3f15": "+ output x3 and rates x1.5",
    "route+r33bo2f125": "+ output x2 and rates x1.25",
    "route+r33bf2": "+ freight rates x2",
    "route+r33bo2f15": "+ output x2 and rates x1.5",
}
print("| configuration | runs | passenger $M | freight $M | freight share | profit $M | pax / freight trains |")
print("|---|---|---|---|---|---|---|")
for k, label in names.items():
    rs = g.get(k, [])
    if not rs:
        continue
    n = len(rs)
    a = lambda f: sum(f(r) for r in rs) / n
    pax = a(lambda r: r["final"]["paxRev"] + r["final"]["mailRev"])
    fr = a(lambda r: r["final"]["freightRev"])
    print(f"| {label} | {n} | {pax:.2f} | {fr:.2f} | {100*fr/max(0.01,pax+fr):.0f} % | {a(lambda r: r['final']['profit']):.2f} | {a(lambda r: r['final']['paxTrains']):.0f} / {a(lambda r: r['final']['freightTrains']):.0f} |")
