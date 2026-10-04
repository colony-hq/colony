// Tiny synchronous event bus. Event names and payloads are catalogued in DESIGN.md §Events.

export function createEvents() {
  const map = new Map();
  return {
    on(name, fn) {
      let set = map.get(name);
      if (!set) map.set(name, (set = new Set()));
      set.add(fn);
      return () => set.delete(fn);
    },
    once(name, fn) {
      const off = this.on(name, (p) => { off(); fn(p); });
      return off;
    },
    off(name, fn) {
      map.get(name)?.delete(fn);
    },
    emit(name, payload) {
      const set = map.get(name);
      if (!set) return;
      for (const fn of [...set]) {
        try { fn(payload); } catch (err) { console.error(`[events] ${name} handler failed`, err); }
      }
    },
  };
}
