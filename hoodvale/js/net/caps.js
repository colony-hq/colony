// Capability hub for the net modules (db, user, room) + small helpers for untrusted input.
// Owner: net builder.
//
// Every capability is optional: `await window.claude?.use?.(name)` may resolve null (signed out,
// public link, not declared, headless tests) or never at all (we time out after 12 s). The game
// never waits on this hub; modules subscribe with hub.on(fn) and light features up when they arrive.
//
// One hub per ctx (ctx.net). Tests and the in-page demo inject capabilities with
// ctx.net.attach({ db, user, room }) — the same shapes as the artifact runtime (see .qa/notes-net.md).
//
// hub: { caps: {db, user, room} (undefined = still asking, null = absent), selfId (undefined while
//        asking, null = no identity), status(name), on(fn) -> off, attach(map), names(ids) -> Promise
//        <{id: name}>, nameOf(id) (cached, sync), ready (Promise once every capability answered) }

const NAMES = ['db', 'user', 'room'];
const USE_TIMEOUT_MS = 12000;

export function netHub(ctx) {
  if (ctx.net) return ctx.net;
  const listeners = new Set();
  const nameCache = new Map(); // id -> display name ('' when unresolvable)
  let attached = false;
  let notifyQueued = false;

  const hub = {
    caps: { db: undefined, user: undefined, room: undefined },
    selfId: undefined,
    me: null, // { id, name, color } of this viewer (display only, never stored)
    get db() { return hub.caps.db || null; },
    get user() { return hub.caps.user || null; },
    get room() { return hub.caps.room || null; },
    status(name) { const v = hub.caps[name]; return v === undefined ? 'pending' : v ? 'on' : 'off'; },
    on(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    // Inject capabilities (tests, demo). Overrides whatever the runtime answers later.
    attach(map = {}) {
      attached = true;
      for (const n of NAMES) if (n in map) hub.caps[n] = map[n] || null;
      for (const n of NAMES) if (hub.caps[n] === undefined) hub.caps[n] = null;
      hub.selfId = undefined;
      resolveSelf();
      notify();
      return hub;
    },
    // Resolve display names for user ids (via user.profiles; never stored anywhere).
    async names(ids) {
      const list = [...new Set((ids || []).filter((x) => typeof x === 'string' && x))];
      const out = {};
      const user = hub.user;
      if (user && list.length) {
        try {
          const ps = await user.profiles(list);
          let changed = false;
          for (const id of list) {
            const n = cleanText(ps?.[id]?.name || '', 32);
            if (nameCache.get(id) !== n) changed = true;
            nameCache.set(id, n);
          }
          if (changed) notify('names');
        } catch { /* profiles never rejects by contract; be safe anyway */ }
      }
      for (const id of list) out[id] = nameCache.get(id) || '';
      return out;
    },
    nameOf(id) { return (id && nameCache.get(id)) || ''; },
    ready: null,
  };

  function notify(kind = 'caps') {
    if (notifyQueued) return;
    notifyQueued = true;
    Promise.resolve().then(() => {
      notifyQueued = false;
      for (const fn of [...listeners]) {
        try { fn(hub, kind); } catch (err) { console.error('[net] hub listener failed', err); }
      }
    });
  }

  async function resolveSelf() {
    const user = hub.user;
    if (!user) { hub.selfId = null; hub.me = null; notify(); return; }
    try {
      const id = await user.id();
      hub.selfId = typeof id === 'string' && id ? id : null;
      const me = await user.me?.();
      hub.me = me ? { id: hub.selfId, name: cleanText(me.name || '', 32), color: typeof me.color === 'string' ? me.color : '' } : null;
      if (hub.selfId && hub.me?.name) nameCache.set(hub.selfId, hub.me.name);
    } catch { hub.selfId = null; }
    notify();
  }

  function use(name) {
    let p;
    try {
      const w = typeof window !== 'undefined' ? window : null;
      p = w?.claude?.use ? Promise.resolve(w.claude.use(name)) : Promise.resolve(null);
    } catch { p = Promise.resolve(null); }
    const timeout = new Promise((r) => setTimeout(() => r(null), USE_TIMEOUT_MS));
    return Promise.race([p.catch(() => null), timeout]).then((v) => v || null, () => null);
  }

  hub.ready = Promise.all(NAMES.map((n) => use(n).then((ns) => {
    if (attached) return;
    hub.caps[n] = ns;
    if (n === 'user') resolveSelf();
    else notify();
  }))).then(() => hub);

  ctx.net = hub;
  return hub;
}

// ---------------------------------------------------------------------------
// Untrusted-input helpers (room messages, presence, other players' db documents)
// ---------------------------------------------------------------------------

// Strip control, format/invisible, bidi and private-use characters; collapse whitespace; cap length.
const STRIP = /[\u0000-\u001f\u007f-\u009f­͏؜ᅟᅠ឴឵᠋-᠎​-‏‪-‮⁠-⁯ㅤ︀-️﻿ﾠ￰-￻-]/g;
export function cleanText(value, max = 120) {
  if (value == null) return '';
  let s = String(value).replace(STRIP, ' ').replace(/\s+/g, ' ').trim();
  if (s.length > max) s = Array.from(s).slice(0, max).join('');
  return s;
}

export function num(v, min, max, def = min) {
  const n = typeof v === 'number' ? v : Number(v);
  if (!Number.isFinite(n)) return def;
  return n < min ? min : n > max ? max : n;
}
export function int(v, min, max, def = min) { return Math.round(num(v, min, max, def)); }
export const isHexColor = (v) => typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v);
export const isIdent = (v, max = 24) => typeof v === 'string' && v.length <= max && /^[a-z0-9][a-z0-9_.-]*$/i.test(v);

// Token-bucket rate limiter keyed by sender: allow(key) -> bool.
export function rateLimiter(capacity, perSeconds) {
  const buckets = new Map();
  const refill = capacity / perSeconds;
  return {
    allow(key, cost = 1) {
      const now = Date.now() / 1000;
      let b = buckets.get(key);
      if (!b) { b = { tokens: capacity, t: now }; buckets.set(key, b); }
      b.tokens = Math.min(capacity, b.tokens + (now - b.t) * refill);
      b.t = now;
      if (b.tokens < cost) return false;
      b.tokens -= cost;
      if (buckets.size > 512) buckets.delete(buckets.keys().next().value);
      return true;
    },
    forget(key) { buckets.delete(key); },
  };
}

// Serialized writer: one write at a time per document path, coalescing bursts (latest wins).
export function docWriter() {
  const slots = new Map(); // path -> { busy, next: fn|null }
  async function run(path) {
    const s = slots.get(path);
    if (!s || s.busy || !s.next) return;
    const fn = s.next;
    s.next = null;
    s.busy = true;
    try { await fn(); } catch (err) { s.onError?.(err); }
    s.busy = false;
    if (s.next) run(path);
    else slots.delete(path);
  }
  return {
    // fn: async () => db.doc(path).set(...). Later calls replace a queued (not yet started) one.
    write(path, fn, onError) {
      let s = slots.get(path);
      if (!s) slots.set(path, (s = { busy: false, next: null }));
      s.next = fn;
      s.onError = onError;
      run(path);
    },
    get pending() { return slots.size; },
  };
}

export const errCode = (e) => (e && typeof e === 'object' && typeof e.code === 'string' ? e.code : 'unavailable');
