// Wraps index.html (content-only, as published to the Artifact host) into a full document
// that mimics the host skeleton: dev.html. Usage: node tools/make-dev.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export function makeDev() {
  const body = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const html = `<!doctype html>
<html lang="id">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<style>:root{color-scheme:light;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}body{margin:0;font:14px system-ui,sans-serif;background:#faf9f7}img{max-width:100%}[hidden]{display:none!important}</style>
</head>
<body>
${body}
</body>
</html>
`;
  fs.writeFileSync(path.join(ROOT, 'dev.html'), html);
  return path.join(ROOT, 'dev.html');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  console.log('wrote', makeDev());
}
