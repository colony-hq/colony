// STUB — owner: net builder. Live presence (other players), public chat via the room capability.
export function createRoom(ctx) {
  return { available: false, peers: [], say(text) { return false; }, update() {} };
}
