// STUB — owner: gameplay-ui. Synthesized WebAudio (slendro). API fixed by DESIGN.md §Audio.
export function createAudio(ctx) {
  return {
    unlocked: false,
    unlock() { this.unlocked = true; },
    play(name, opts = {}) {},
    setMusic(mood) {},
    setAmbience(levels) {},
    applyVolumes() {},
    update(dt, t) {},
  };
}
