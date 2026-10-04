// STUB — owner: game builder. Ground items: drops, 'Take', despawn, CREDIT drops to the wallet.
export function createLoot(ctx) {
  return { drop(id, qty, tx, tz, opts) { return ctx.entities.spawnItem(id, qty, tx, tz, opts); }, update() {} };
}
