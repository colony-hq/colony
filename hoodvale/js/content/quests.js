// STUB — owner: content builder. Quest state machine for data/quests.js.
export function createQuests(ctx) {
  return { stage(id) { return ctx.state.save.quests[id] ?? null; }, isDone(id) { return ctx.state.save.quests[id] === 'done'; }, points() { return 0; }, update() {} };
}
