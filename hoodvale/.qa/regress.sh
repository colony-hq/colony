#!/bin/bash
# Full regression: every QA step file, default desktop / mobile smokes, formula, net and content checks.
# Usage: .qa/regress.sh (prints errors per run; outputs under $REGRESS_OUT, default /tmp/hv-regress).
cd "$(dirname "$0")/.."
OUT=${REGRESS_OUT:-/tmp/hv-regress}
mkdir -p $OUT
for f in .qa/game-e2e-*.json .qa/content-smoke*.json .qa/audio-e2e-*.json; do
  n=$(basename $f .json)
  timeout 600 node tools/smoke.mjs --steps $f --out $OUT/$n --q low > $OUT/$n.log 2>&1
  python3 - "$OUT/$n.log" "$n" <<'PY'
import json,sys
t=open(sys.argv[1]).read()
try:
  r=json.loads(t[t.index('{'):])
  print(sys.argv[2], 'errors:', len(r['errors']), [e[:160] for e in r['errors']][:4])
except Exception as e:
  print(sys.argv[2], 'PARSE FAIL', t[-300:])
PY
done
timeout 600 node tools/smoke.mjs --out $OUT/desk --q medium > $OUT/desk.log 2>&1; python3 -c "
import json;t=open('$OUT/desk.log').read();r=json.loads(t[t.index('{'):]);print('desktop errors',r['errors'][:4])"
timeout 600 node tools/smoke.mjs --out $OUT/mob --mobile --q low > $OUT/mob.log 2>&1; python3 -c "
import json;t=open('$OUT/mob.log').read();r=json.loads(t[t.index('{'):]);print('mobile errors',r['errors'][:4])"
node .qa/game-formulas.test.mjs 2>&1 | tail -2
node .qa/net-test.mjs 2>&1 | tail -3
node .qa/content-check.mjs 2>&1 | tail -3
echo REGRESS-DONE
