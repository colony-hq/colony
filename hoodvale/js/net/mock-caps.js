// In-memory stand-ins for the artifact capabilities `db`, `user` and `room`, shaped like the
// runtime contracts (0.2.67). Used ONLY by tests and the opt-in demo (installDemo); the game never
// imports this file. Owner: net builder.
//
//   const backend = createMockBackend();
//   const a = backend.client({ id: 'u_a', name: 'Ada' });   // { db, user, room, leave() }
//   ctx.net.attach(a);
//
// The db enforces the rules the game declares (see .qa/notes-net.md): private data/users/{self},
// and market/{self}, fills/{self}, players/{self} writable only by their owner.

import { npcQuote, FEATURED } from './market.js';

const SEG = /^[A-Za-z0-9_\-.~:@+]+$/;
const clone = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));
const deepFreeze = (o) => { if (o && typeof o === 'object') { Object.freeze(o); for (const k of Object.keys(o)) deepFreeze(o[k]); } return o; };
const err = (code, message) => Object.assign(new Error(message), { code, message });

function splitPath(path, wantDoc) {
  const segs = String(path).split('/');
  if (!segs.length || segs.some((s) => !s || !SEG.test(s) || s === '.' || s === '..')) throw new TypeError('bad path ' + path);
  if (wantDoc && segs.length % 2 !== 0) throw new TypeError(`document path needs an even number of segments: ${path}`);
  if (!wantDoc && segs.length % 2 !== 1) throw new TypeError(`collection path needs an odd number of segments: ${path}`);
  return segs;
}

export function createMockBackend({ latency = 12 } = {}) {
  const docs = new Map(); // path -> frozen data
  const subs = new Set(); // { kind: 'doc'|'query', path|coll, ..., fn, viewer }
  const names = new Map();
  const clients = new Set();
  const later = (fn) => setTimeout(fn, latency);

  const canRead = (viewer, segs) => !(segs[0] === 'data' && segs[1] === 'users' && segs[2] !== viewer);
  const canWrite = (viewer, segs) => {
    if (!viewer) return false;
    if (segs[0] === 'data' && segs[1] === 'users') return segs[2] === viewer;
    if (['market', 'fills', 'players'].includes(segs[0])) return segs[1] === viewer;
    return true;
  };
  const snapOf = (path, viewer) => {
    const segs = path.split('/');
    const d = canRead(viewer, segs) ? docs.get(path) : undefined;
    return { id: segs[segs.length - 1], exists: d !== undefined, data: () => d, metadata: { fromCache: false, hasPendingWrites: false } };
  };
  function runQuery(q, viewer) {
    const depth = q.coll.split('/').length + 1;
    let list = [];
    for (const [path] of docs) {
      if (!path.startsWith(q.coll + '/') || path.split('/').length !== depth) continue;
      const s = snapOf(path, viewer);
      if (s.exists) list.push(s);
    }
    for (const [f, op, v] of q.where) list = list.filter((s) => { const x = s.data()[f]; return op === '==' ? x === v : op === '!=' ? x !== v : op === '>' ? x > v : op === '>=' ? x >= v : op === '<' ? x < v : op === '<=' ? x <= v : true; });
    if (q.order) {
      const [f, dir] = q.order;
      list.sort((a, b) => {
        const x = a.data()[f], y = b.data()[f];
        if (x === undefined && y === undefined) return 0;
        if (x === undefined) return 1;
        if (y === undefined) return -1;
        return (x < y ? -1 : x > y ? 1 : 0) * (dir === 'desc' ? -1 : 1);
      });
    } else list.sort((a, b) => (a.id < b.id ? -1 : 1));
    if (q.limit) list = list.slice(0, q.limit);
    return { docs: list, size: list.length, empty: !list.length, docChanges: () => [], metadata: { fromCache: false, hasPendingWrites: false } };
  }
  function notify(path) {
    for (const s of subs) {
      if (s.kind === 'doc' && s.path === path) later(() => subs.has(s) && s.fn(snapOf(path, s.viewer)));
      if (s.kind === 'query' && path.startsWith(s.q.coll + '/') && path.split('/').length === s.q.coll.split('/').length + 1) later(() => subs.has(s) && s.fn(runQuery(s.q, s.viewer)));
    }
  }

  function makeDb(viewer) {
    const query = (coll, q = { coll, where: [], order: null, limit: 0 }) => ({
      path: coll,
      where: (f, op, v) => query(coll, { ...q, where: [...q.where, [f, op, v]] }),
      orderBy: (f, dir = 'asc') => query(coll, { ...q, order: [f, dir] }),
      limit: (n) => query(coll, { ...q, limit: n }),
      get: () => new Promise((r) => later(() => r(runQuery(q, viewer)))),
      onSnapshot(next, error) {
        const s = { kind: 'query', q, fn: next, viewer };
        subs.add(s);
        later(() => subs.has(s) && next(runQuery(q, viewer)));
        return () => subs.delete(s);
      },
      doc: (id) => docRef(`${coll}/${id || Math.random().toString(36).slice(2, 12)}`),
      add: async (data) => { const r = docRef(`${coll}/${Math.random().toString(36).slice(2, 12)}`); await r.set(data); return r; },
    });
    const docRef = (path) => {
      const segs = splitPath(path, true);
      const write = (fn) => new Promise((resolve, reject) => later(() => {
        if (!canWrite(viewer, segs)) return reject(err('invalid_argument', 'write not permitted at ' + path));
        fn();
        notify(path);
        resolve();
      }));
      return {
        id: segs[segs.length - 1], path,
        get: () => new Promise((r) => later(() => r(snapOf(path, viewer)))),
        set: (data) => {
          if (!data || typeof data !== 'object' || Array.isArray(data)) return Promise.reject(err('invalid_argument', 'body must be an object'));
          if (JSON.stringify(data).length > 256 * 1024) return Promise.reject(err('invalid_argument', 'document too large'));
          return write(() => docs.set(path, deepFreeze(clone(data))));
        },
        update: (data) => write(() => { const cur = docs.get(path); if (!cur) throw err('invalid_argument', 'missing'); docs.set(path, deepFreeze({ ...clone(cur), ...clone(data) })); }),
        delete: () => write(() => docs.delete(path)),
        onSnapshot(next) {
          const s = { kind: 'doc', path, fn: next, viewer };
          subs.add(s);
          later(() => subs.has(s) && next(snapOf(path, viewer)));
          return () => subs.delete(s);
        },
        collection: (sub) => query(`${path}/${sub}`),
      };
    };
    return Object.freeze({
      doc: (p) => docRef(p),
      collection: (p) => { splitPath(p, false); return query(p); },
    });
  }

  function makeUser(me) {
    const profile = (id) => ({ id, name: names.get(id) || '', avatarUrl: 'data:,', color: '#c9a24a', email: null, isMe: id === me.id, guest: false });
    return Object.freeze({
      isOwner: async () => false, canEdit: async () => false, can: async () => null,
      id: async () => me.id,
      me: async () => ({ ...profile(me.id), isOwner: false, canEdit: false }),
      name: async () => names.get(me.id) || '',
      profiles: async (ids) => Object.fromEntries([].concat(ids).map((id) => [id, profile(id)])),
      search: async () => [],
    });
  }

  // ---- room -------------------------------------------------------------------------
  let peerSeq = 0;
  function makeRoom(client) {
    const handlers = new Map(); // topic -> Set
    const peerSubs = new Set();
    const viewOf = (c) => Object.freeze({ peer: c.peer, by: c.id, isMe: c.id === client.id, sameTab: c === client, kind: 'viewer', guest: !!c.guest, presence: c.presence, updatedAt: c.updatedAt });
    client.deliverPeers = (change) => {
      for (const fn of peerSubs) later(() => fn({
        peers: room.peers(),
        joined: (change.joined || []).map(viewOf), left: (change.left || []).map(viewOf), updated: (change.updated || []).map(viewOf),
      }));
    };
    client.deliverMsg = (from, topic, data) => {
      const set = handlers.get(topic);
      if (!set) return;
      const msg = Object.freeze({ topic, data: deepFreeze(clone(data)), peer: from.peer, by: from.id, isMe: from.id === client.id, sameTab: from === client, kind: 'viewer', guest: !!from.guest });
      for (const fn of set) later(() => fn(msg));
    };
    const room = Object.freeze({
      emit(topic, data) {
        if (!client.connected) return Promise.resolve();
        for (const c of clients) c.deliverMsg(client, topic, data);
        return Promise.resolve();
      },
      on(topic, fn) {
        let set = handlers.get(topic);
        if (!set) handlers.set(topic, (set = new Set()));
        set.add(fn);
        return () => set.delete(fn);
      },
      presence(patch) {
        const merged = { ...client.presence };
        for (const [k, v] of Object.entries(patch || {})) { if (v === null) delete merged[k]; else merged[k] = clone(v); }
        if (JSON.stringify(merged).length > 4096) return Promise.reject(err('invalid_argument', 'presence over 4 KiB'));
        client.presence = deepFreeze(merged);
        client.updatedAt = Date.now();
        for (const c of clients) c.deliverPeers({ updated: [client] });
        return Promise.resolve();
      },
      peers: () => Object.freeze([...clients].filter((c) => c.inRoom).map(viewOf)),
      onPeers(fn) {
        peerSubs.add(fn);
        later(() => fn({ peers: room.peers(), joined: room.peers(), left: [], updated: [] }));
        return () => peerSubs.delete(fn);
      },
      connected: () => client.connected,
      onConnection(fn) { later(() => fn(client.connected)); return () => {}; },
      join: async () => { throw err('not_permitted', 'named rooms are not mocked'); },
      canSendToClaudeSession: async () => 'off',
      sendToClaudeSession: async () => { throw err('claude_unavailable', 'mock'); },
    });
    return room;
  }

  const backend = {
    docs,
    client({ id, name = '', guest = false } = {}) {
      if (id && name) names.set(id, name);
      const c = { id, guest, peer: 'p' + (++peerSeq).toString(36).padStart(6, '0') + Math.random().toString(36).slice(2, 6), presence: deepFreeze({}), updatedAt: Date.now(), connected: true, inRoom: true };
      c.room = makeRoom(c);
      clients.add(c);
      for (const o of clients) if (o !== c) o.deliverPeers({ joined: [c] });
      const caps = { db: makeDb(id), user: makeUser({ id }), room: c.room, id, peer: c.peer };
      caps.leave = () => { c.inRoom = false; clients.delete(c); for (const o of clients) o.deliverPeers({ left: [c] }); };
      caps.raw = c;
      return caps;
    },
    setName(id, name) { names.set(id, name); },
  };
  return backend;
}

// ---------------------------------------------------------------------------
// Demo: two simulated adventurers walking near you, chatting, trading and on the hiscores.
// Opt-in only (tests / screenshots): import('./js/net/mock-caps.js').then(m => m.installDemo(ctx))
// ---------------------------------------------------------------------------
export function installDemo(ctx, { bots = 2 } = {}) {
  const backend = createMockBackend();
  const me = backend.client({ id: 'u_demo_you', name: 'You (demo)' });
  ctx.net.attach(me);
  const roster = [
    { id: 'u_demo_wren', name: 'Wren Ashby', char: 'Wren', look: { body: 'female', skin: '#c8956b', hair: 'long', hairColor: '#2a1a12', top: '#3f7f3a', bottom: '#4a3a2a', boots: '#3a2a1a' }, eq: { weapon: 'oak_shortbow', head: 'leather_cowl', body: 'leather_body' }, cb: 24, lines: ['Anyone selling oak logs?', 'The Exchange has iron ore cheap right now', 'gg on that troll'] },
    { id: 'u_demo_tobias', name: 'Tobias Kell', char: 'Tobias', look: { body: 'male', skin: '#e0b48a', hair: 'short', hairColor: '#8a5a2a', top: '#5a5a5a', bottom: '#2a2a2a', boots: '#2a2a2a' }, eq: { weapon: 'iron_sword', shield: 'iron_kiteshield', head: 'iron_helm' }, cb: 31, lines: ['Heading to Copperhollow, who is in?', 'wave if you can see me', 'Bought a steel greatsword, feeling rich'] },
  ].slice(0, bots);
  const live = roster.map((r, i) => ({ ...r, caps: backend.client({ id: r.id, name: r.name }), phase: i * Math.PI, t0: Date.now() }));
  const now = Date.now();
  // Market orders (undercutting NPC asks / outbidding NPC bids) + hiscore rows.
  live.forEach((b, i) => {
    const orders = FEATURED.slice(i * 4, i * 4 + 4).map((item, k) => {
      const q = npcQuote(item);
      const sell = k % 2 === 0;
      return { id: `o${b.id.slice(7)}${k}x`, item, side: sell ? 'sell' : 'buy', price: sell ? Math.max(q.bid + 1, q.ask - 1) : q.bid + (q.ask - q.bid > 2 ? 1 : 0), qty: 20 + k * 15, ext: 0, at: now - 60000 * (k + 1), status: 'open', closedAt: null };
    });
    b.caps.db.doc('market/' + b.id).set({ v: 1, at: now, orders });
    const lv = (n) => Math.max(1, Math.min(99, n));
    const stats = { v: 1, at: now, combat: b.cb, qp: 3 + i * 2, xp: 0, total: 0 };
    for (const [k, s] of ['attack', 'strength', 'defence', 'hitpoints', 'archery', 'arcana', 'woodcutting', 'fishing', 'mining', 'thieving', 'fletching', 'firemaking', 'cooking', 'smithing', 'crafting'].entries()) {
      const L = lv(8 + ((k * 7 + i * 13) % 30));
      stats['lv_' + s] = L; stats['xp_' + s] = Math.round(83 * Math.pow(1.104, L) * (1 + i)); stats.total += L; stats.xp += stats['xp_' + s];
    }
    b.caps.db.doc('players/' + b.id).set(stats);
  });
  // A bot that buys from your live sell orders a few seconds after you post them.
  const buyer = live[0];
  if (buyer) {
    const fills = [];
    buyer.caps.db.collection('market').onSnapshot((snap) => {
      for (const d of snap.docs) {
        if (d.id !== 'u_demo_you') continue;
        for (const o of d.data().orders || []) {
          if (o.status !== 'open' || o.side !== 'sell' || fills.some((f) => f.order === o.id)) continue;
          const qty = Math.max(1, Math.min(o.qty - (o.ext || 0), Math.ceil(o.qty / 2)));
          const f = { id: 'f' + Math.random().toString(36).slice(2, 12), maker: 'u_demo_you', order: o.id, item: o.item, side: 'sell', qty, price: o.price, at: 0 };
          fills.push(f);
          setTimeout(() => {
            f.at = Date.now();
            buyer.caps.db.doc('fills/' + buyer.id).set({ v: 1, at: Date.now(), fills: fills.filter((x) => x.at) });
            buyer.caps.room.emit('chat', { v: 1, t: `Grabbed ${qty} of your ${o.item.replace(/_/g, ' ')} on the Exchange, thanks!` });
          }, 4000);
        }
      }
    });
  }
  // Walk circles around the player; chat now and then.
  const timer = setInterval(() => {
    const p = ctx.player?.pos;
    if (!p) return;
    const t = (Date.now() - now) / 1000;
    live.forEach((b, i) => {
      const a = t * 0.35 + b.phase;
      const r = 3.2 + i * 1.6;
      const x = p.x + Math.cos(a) * r, z = p.z + Math.sin(a) * r;
      b.caps.room.presence({ v: 1, st: 'play', x: +x.toFixed(2), z: +z.toFixed(2), yaw: +(-a).toFixed(2), rg: 'overworld', an: 'walk', lk: b.look, eq: b.eq, cb: b.cb, ac: '', nm: b.char, id: b.id });
    });
  }, 220);
  let lineIdx = 0;
  const chatter = setInterval(() => {
    const b = live[lineIdx % live.length];
    if (!b) return;
    b.caps.room.emit('chat', { v: 1, t: b.lines[Math.floor(lineIdx / live.length) % b.lines.length] });
    if (lineIdx % 3 === 1) b.caps.room.emit('emote', { v: 1, e: 'wave' });
    lineIdx++;
  }, 7000);
  setTimeout(() => live[1]?.caps.room.emit('chat', { v: 1, t: 'Welcome to the Vale!' }), 1500);
  return { backend, me, bots: live, stop() { clearInterval(timer); clearInterval(chatter); for (const b of live) b.caps.leave(); } };
}
