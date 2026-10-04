// Lists every shipped file (index.html + js/**) and writes .qa/files.json for the Artifact
// publish step: { page, files: { "<published path>": "<source path relative to repo root>" } }.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
function walk(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(p));
    else if (/\.(js|mjs)$/.test(e.name)) out.push(p);
  }
  return out;
}
const files = {};
let bytes = fs.statSync(path.join(ROOT, 'index.html')).size;
for (const f of walk(path.join(ROOT, 'js')).sort()) {
  const rel = path.relative(ROOT, f).split(path.sep).join('/');
  files[rel] = 'lentera/' + rel;
  bytes += fs.statSync(f).size;
}
const manifest = { page: 'lentera/index.html', count: Object.keys(files).length, bytes, files };
fs.mkdirSync(path.join(ROOT, '.qa'), { recursive: true });
fs.writeFileSync(path.join(ROOT, '.qa', 'files.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(`${manifest.count} files, ${(bytes / 1024).toFixed(1)} KiB -> .qa/files.json`);
