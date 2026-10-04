// STUB — owner: gameplay-ui. Title / pause / settings. API: DESIGN.md §Menus.
export function createMenus(ctx) {
  const { state, input, events } = ctx;
  return {
    update(dt) {
      if (state.mode === 'title' && (input.anyPressed())) { ctx.audio.unlock(); state.setMode('play'); }
      else if (state.mode === 'play' && input.pressed('pause')) state.pushMode('pause');
      else if (state.mode === 'pause' && input.pressed('pause')) state.popMode();
    },
  };
}
