#!/bin/sh
# Process a generated character into game assets:
#   .qa/lab/build.sh <id> ['{"skirt":true,"height":1.7}']
# Reads .qa/lab/src/<id>.glb, writes assets/chars/<id>.json + .jpg (and lab previews to /tmp).
set -e
cd "$(dirname "$0")/../.."
ID="$1"; OPTS="${2:-{\}}"
OUT="${LAB_OUT:-/tmp/hv-lab}"
mkdir -p "$OUT" assets/chars
cat > "$OUT/steps-$ID.json" <<JSON
[
  { "eval": "lab.process('$ID', $OPTS).then((r) => JSON.stringify(r).slice(0, 400))" },
  { "save": "lab.asset('$ID')", "file": "$ID.json" },
  { "save": "lab.texture('$ID', 1024)", "file": "$ID.jpg" },
  { "eval": "lab.view(0)" }, { "shot": "$ID-front" },
  { "eval": "lab.view(Math.PI / 2)" }, { "shot": "$ID-side" },
  { "eval": "lab.show('$ID', { thL: [0.6, 0, 0], knL: [-0.3, 0, 0], knR: [-0.9, 0, 0], thR: [-0.4, 0, 0], shL: [0.9, 0, -0.2], elL: [1.2, 0, 0], shR: [-0.5, 0, 0.3], spine: [-0.1, 0.3, 0] }); lab.view(0.7)" }, { "shot": "$ID-pose" }
]
JSON
node tools/smoke.mjs --page .qa/lab/lab.html --steps "$OUT/steps-$ID.json" --out "$OUT" > "$OUT/report-$ID.json"
cp "$OUT/$ID.json" "$OUT/$ID.jpg" assets/chars/
node -e "const r=require('$OUT/report-$ID.json'); console.log(JSON.stringify({errors:r.errors, info:r.logs[0]}, null, 1))"
ls -la "assets/chars/$ID.json" "assets/chars/$ID.jpg"
