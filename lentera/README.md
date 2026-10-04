# LENTERA: Kabut Nusantara

Browser 3D open-world adventure prototype on an Indonesian island swallowed by a mind-fog.
Three.js r170 (importmap from cdn.jsdelivr.net), native ES modules, no build step, no external
assets: every mesh, texture and sound is procedural. Talking to islanders costs simulated
CREDIT (Orbio-style inference credit): Redup is cheap and confused, Terang is sharp and costly.

## Run locally

```
node tools/make-dev.mjs        # wraps the content-only index.html into dev.html
node tools/serve.mjs 8080      # http://127.0.0.1:8080/dev.html  (add ?debug for window.__lentera)
node tools/smoke.mjs --out .qa/shots   # headless Chromium (SwiftShader) smoke test
node tools/manifest.mjs        # .qa/files.json for publishing index.html + js/**
```

## Controls

| | Keyboard + mouse | Gamepad | Touch |
|---|---|---|---|
| Move / look | WASD / mouse (click to lock, or drag) | L / R stick | left stick / drag right half |
| Jump, glide (hold in the air) | Space | A | Lompat |
| Sprint | Shift | B (hold) / L3 | Lari |
| Interact | E | X | Aksi or tap the prompt |
| Flare the lantern | F / right mouse | RT / LT | Nyala |
| Journal | J / Tab | Y | Jurnal |
| Pause | Esc / P | Start | II |

## Design

See `DESIGN.md` (story, systems, module contracts, events) and `.qa/notes-*.md` (per-builder
integration notes). CREDIT is simulated in-page: no wallet, no network, no real value.
`js/npc/orbio-client.js` shows how live inference would plug in; it is disabled and never called.
