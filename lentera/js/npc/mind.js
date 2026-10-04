// STUB — owner: npc-ai. Tiered NPC "thoughts" (hand-written) + disabled OrbioClient. API: DESIGN.md §Mind.
export function createMind(ctx) {
  return {
    topicsFor(npcId) { return []; },
    async think(npcId, topicId, tier) { return { text: '…', tier, tokens: 0, source: 'local' }; },
  };
}
