// Live presence via the artifact `room` capability: other adventurers walking the Vale with you,
// public chat (topic `chat`) and emotes (topic `emote`). Owner: net builder.
// Everything received is untrusted: presence and messages are sanitised, rate-limited and capped.
//
// API (DESIGN §9 + additions): available, connected, peers (array, you included), say(text) -> bool,
//   emote(name) -> bool, status() -> {mode: 'live'|'connecting'|'solo', connected, count, error},
//   remote(peer) -> entity|null, EMOTES, update(dt).
// Events out: chat:public {from, text, peer, by, self?, guest?}, peer:join {peer, name},
//   peer:leave {peer, name}, emote:remote {name, peer, from}, room:change {}.
// Events in: 'emote' {name} (local player emote, e.g. from the ui) is broadcast to the room.
// Remote players are entities of kind 'remote' (options Follow / Examine) with humanoid actors.

import { ITEMS } from '../data/items.js';
import { ZONES } from '../data/zones.js';
import { netHub, cleanText, num, int, isHexColor, isIdent, rateLimiter, errCode } from './caps.js';
import { USER_RE } from './market.js';
import { registerNetTab, openNetWindow } from './netui.js';
import { renderPlayersTab, playersTabIcon } from './ui-players.js';

const SEND_MS = 220;      // presence ~4.5 Hz while something changes (moving)
const INTERP_MS = 320;    // remote players render this far in the past
const MAX_ACTORS = 24;
const VIEW_RANGE = 72;    // tiles
const SAY_MS = 5200;      // overhead chat lifetime
const MAX_PEERS = 128;
export const EMOTES = ['wave', 'cheer', 'bow', 'dance', 'clap', 'laugh', 'cry', 'think', 'shrug', 'yes', 'no', 'salute', 'beckon', 'panic'];
const ANIM_RE = /^[a-z][a-z0-9_-]{0,15}$/;
// Player look fields the humanoid actor understands (a-humanoid normaliseLook); NPC-only extras
// (glow, metal, weapon, staff) are not accepted from other players.
const LOOK_KEYS = { body: 'id', build: 'id', skin: 'color', hair: 'id', hairColor: 'color', beard: 'id', hat: 'id', top: 'color', bottom: 'color', boots: 'color',
  apron: 'color', cape: 'color', hood: 'color', tabard: 'color', scarf: 'color', eyes: 'color', sleeves: 'id', robe: 'bool',
  expr: 'id', vest: 'color', dress: 'bool', satchel: 'bool', glasses: 'bool', bandana: 'bool', earrings: 'bool', necklace: 'bool', freckles: 'bool' };
const EQ_SLOTS = ['head', 'cape', 'neck', 'ammo', 'weapon', 'body', 'shield', 'legs', 'hands', 'feet', 'ring'];
const TERMINAL = new Set(['revoked', 'not_granted', 'capability_disabled', 'capability_removed', 'transform_error']);

export function cleanLook(lk) {
  const out = {};
  if (!lk || typeof lk !== 'object') return out;
  for (const [k, kind] of Object.entries(LOOK_KEYS)) {
    const v = lk[k];
    if (kind === 'bool' ? v === true : kind === 'color' ? isHexColor(v) : isIdent(v, 16)) out[k] = v;
  }
  return out;
}
export function cleanEq(eq) {
  const out = {};
  if (!eq || typeof eq !== 'object') return out;
  for (const slot of EQ_SLOTS) {
    const id = eq[slot];
    if (typeof id === 'string' && ITEMS[id]?.equip?.slot === slot) out[slot] = id;
  }
  return out;
}
export function cleanPresence(p) {
  if (!p || typeof p !== 'object' || p.v !== 1) return null;
  const out = {
    st: 'menu', nm: cleanText(p.nm, 16), cb: int(p.cb, 3, 200, 3), ac: cleanText(p.ac, 24),
    id: typeof p.id === 'string' && USER_RE.test(p.id) ? p.id : null,
  };
  if (p.st !== 'play') return out;
  const x = num(p.x, 0, 1400, NaN), z = num(p.z, 0, 1400, NaN);
  if (!Number.isFinite(x) || !Number.isFinite(z)) return out;
  out.st = 'play';
  out.x = x; out.z = z;
  out.yaw = num(p.yaw, -10, 10, 0);
  out.rg = isIdent(p.rg, 24) ? p.rg : 'overworld';
  out.an = typeof p.an === 'string' && ANIM_RE.test(p.an) ? p.an : 'idle';
  out.lk = cleanLook(p.lk);
  out.eq = cleanEq(p.eq);
  return out;
}

export function createRoom(ctx) {
  const { events, state } = ctx;
  const net = netHub(ctx);
  const R = new Map(); // peer -> remote record
  const chatLimit = rateLimiter(3, 6);
  const emoteLimit = rateLimiter(2, 3);
  const presLimit = rateLimiter(24, 2);
  const lastChat = new Map(); // peer -> {text, at}
  let room = null;
  let unsub = [];
  let error = null;
  let lastSent = 0, lastSig = '', lastNames = 0;
  let selfSay = null; // { text, until }
  let changedFlag = false;
  let labels = null; // DOM root for name labels
  let tmpV = null;

  const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
  const markChanged = () => { changedFlag = true; };
  const displayName = (r) => net.nameOf(r.by || r.p?.id) || r.p?.nm || 'Adventurer';
  const myName = () => net.me?.name || state.save.name || 'You';

  // ---- Binding ------------------------------------------------------------------------
  function unbind() {
    for (const u of unsub.splice(0)) { try { u(); } catch { /* ignore */ } }
    for (const r of [...R.values()]) dropRemote(r, false);
    R.clear();
    room = null;
    markChanged();
  }
  function bind(ns) {
    unbind();
    room = ns;
    error = null;
    const onErr = (e) => {
      const code = errCode(e);
      if (TERMINAL.has(code)) { error = code; unbind(); events.emit('room:change', {}); }
    };
    try {
      unsub.push(room.onPeers(onPeers, onErr));
      unsub.push(room.on('chat', onChat, onErr));
      unsub.push(room.on('emote', onEmote, onErr));
      unsub.push(room.onConnection(() => markChanged(), onErr));
    } catch (e) { onErr(e); return; }
    lastSig = '';
    markChanged();
  }
  net.on(() => {
    const ns = net.room;
    if (ns && ns !== room && !error) bind(ns);
    else if (!ns && room) unbind();
    // Ids resolve later than the room: refresh names.
    resolveNames(true);
    markChanged();
  });

  // ---- Presence in --------------------------------------------------------------------
  function onPeers(change) {
    const t = now();
    for (const p of change.left || []) {
      const r = R.get(p.peer);
      if (r) { dropRemote(r, true); R.delete(p.peer); }
    }
    for (const p of [...(change.joined || []), ...(change.updated || [])]) {
      if (!p || typeof p.peer !== 'string' || p.kind === 'agent') continue;
      let r = R.get(p.peer);
      if (!r) {
        if (R.size >= MAX_PEERS) continue;
        r = { peer: p.peer, by: null, isMe: !!p.isMe, sameTab: !!p.sameTab, guest: !!p.guest, p: null, samples: [], entity: null, actor: null, say: null, emote: null, joinedAt: Date.now(), announced: false };
        R.set(p.peer, r);
      }
      r.by = typeof p.by === 'string' && USER_RE.test(p.by) ? p.by : null;
      r.isMe = !!p.isMe; r.sameTab = !!p.sameTab; r.guest = !!p.guest;
      r.updatedAt = Date.now();
      if (r.sameTab) { r.p = cleanPresence(p.presence); continue; }
      if (!presLimit.allow(p.peer)) continue;
      const prev = r.p;
      r.p = cleanPresence(p.presence);
      if (r.p?.st === 'play') {
        const last = r.samples[r.samples.length - 1];
        if (!last || last.x !== r.p.x || last.z !== r.p.z || last.yaw !== r.p.yaw || !prev) {
          r.samples.push({ t, x: r.p.x, z: r.p.z, yaw: r.p.yaw });
          if (r.samples.length > 12) r.samples.shift();
        }
      }
      if (!r.announced && r.p && !r.isMe) {
        r.announced = true;
        resolveNames(true);
        events.emit('peer:join', { peer: r.peer, name: displayName(r) });
      }
    }
    markChanged();
  }

  function dropRemote(r, announce) {
    if (r.entity) { try { ctx.entities?.remove?.(r.entity); } catch (err) { console.warn('[net] remote remove', err); } }
    r.entity = null; r.actor = null;
    r.labelEl?.remove(); r.labelEl = null;
    if (announce && r.announced && !r.isMe) events.emit('peer:leave', { peer: r.peer, name: displayName(r) });
    markChanged();
  }

  // ---- Chat & emotes ------------------------------------------------------------------
  function onChat(msg) {
    if (!msg || msg.sameTab || msg.kind === 'agent') return;
    const peer = String(msg.peer || '');
    if (!peer || !chatLimit.allow(peer)) return;
    const text = cleanText(msg.data?.t, 120);
    if (!text) return;
    const prev = lastChat.get(peer);
    if (prev && prev.text === text && Date.now() - prev.at < 3000) return;
    lastChat.set(peer, { text, at: Date.now() });
    if (lastChat.size > 256) lastChat.delete(lastChat.keys().next().value);
    const r = R.get(peer);
    const from = r ? displayName(r) : (net.nameOf(msg.by) || 'Adventurer');
    if (r) r.say = { text, until: now() + SAY_MS };
    events.emit('chat:public', { from, text, peer, by: msg.by || null, guest: !!msg.guest, self: !!msg.isMe });
  }
  function onEmote(msg) {
    if (!msg || msg.sameTab || msg.kind === 'agent') return;
    const peer = String(msg.peer || '');
    if (!peer || !emoteLimit.allow(peer)) return;
    const name = typeof msg.data?.e === 'string' && EMOTES.includes(msg.data.e) ? msg.data.e : null;
    if (!name) return;
    const r = R.get(peer);
    if (r) {
      if (typeof r.actor?.emote === 'function') { try { r.actor.emote(name); } catch { /* ignore */ } }
      else r.emote = { name, until: now() + 2600 };
    }
    const from = r ? displayName(r) : 'Adventurer';
    events.emit('emote:remote', { name, peer, from });
    events.emit('emote', { name, peer, from, remote: true }); // audio etc. (peer set = someone else)
  }

  function say(text) {
    const t = cleanText(text, 120);
    if (!t) return false;
    if (!room || !room.connected?.()) return false;
    if (!chatLimit.allow('~self')) { events.emit('chat:game', { text: 'You are talking too fast — wait a moment.', kind: 'warn' }); return false; }
    room.emit('chat', { v: 1, t }).catch((e) => {
      if (errCode(e) === 'not_permitted') events.emit('chat:game', { text: 'Public chat needs Contributor access to this artifact.', kind: 'warn' });
    });
    selfSay = { text: t, until: now() + SAY_MS };
    events.emit('chat:public', { from: myName(), text: t, peer: null, by: net.selfId || null, self: true });
    return true;
  }
  function emote(name) {
    if (!EMOTES.includes(name) || !room || !room.connected?.()) return false;
    if (!emoteLimit.allow('~self')) return false;
    room.emit('emote', { v: 1, e: name }).catch(() => {});
    return true;
  }
  // Local emotes (ui / Players tab emit 'emote' {name}): animate your character and tell the room.
  events.on('emote', (p) => {
    if (!p || typeof p.name !== 'string' || p.peer || p.remote) return;
    if (EMOTES.includes(p.name)) { try { ctx.player?.actor?.emote?.(p.name); } catch { /* ignore */ } }
    emote(p.name);
  });

  // ---- Presence out -------------------------------------------------------------------
  function presencePayload() {
    const s = state.save;
    if (state.mode !== 'play' && state.mode !== 'dead') return { v: 1, st: 'menu', nm: cleanText(s.name, 16), cb: ctx.skills?.combatLevel?.() || 3, ...(net.selfId ? { id: net.selfId } : {}) };
    const P = ctx.player;
    const pos = P?.pos;
    const x = pos ? pos.x : s.pos?.x || 0, z = pos ? pos.z : s.pos?.z || 0;
    const eq = {};
    for (const [slot, e] of Object.entries(s.equipment || {})) if (e?.id && EQ_SLOTS.includes(slot)) eq[slot] = e.id;
    const cur = ctx.actions?.current;
    const anim = P?.moving ? (P.running ? 'run' : 'walk') : (typeof cur?.handler?.anim === 'string' && cur.started ? cur.handler.anim : (ctx.combat?.inCombat ? 'attack' : 'idle'));
    let region = 'overworld';
    try { region = ctx.map?.regionAt?.(x, z)?.id || 'overworld'; } catch { /* ignore */ }
    return {
      v: 1, st: state.mode === 'dead' ? 'menu' : 'play',
      x: Math.round(x * 100) / 100, z: Math.round(z * 100) / 100, yaw: Math.round((P?.yaw || 0) * 100) / 100,
      rg: region, an: ANIM_RE.test(anim) ? anim : 'idle', lk: cleanLook(s.look), eq,
      cb: ctx.skills?.combatLevel?.() || 3, ac: cleanText(cur?.option && cur.started ? cur.option : '', 24), nm: cleanText(s.name, 16),
      ...(net.selfId ? { id: net.selfId } : {}),
    };
  }
  function sendPresence(force = false) {
    // Not gated on connected(): presence applies locally and the platform re-asserts it on reconnect.
    if (!room) return;
    const t = now();
    if (!force && t - lastSent < SEND_MS) return;
    const p = presencePayload();
    const sig = JSON.stringify(p);
    if (sig === lastSig) return;
    lastSig = sig;
    lastSent = t;
    room.presence(p).catch(() => { lastSig = ''; });
  }
  events.on('player:teleport', () => { lastSent = 0; });
  events.on('mode:change', () => { lastSent = 0; });

  // ---- Remote rendering ---------------------------------------------------------------
  function ensureEntity(r) {
    if (r.entity || !ctx.entities?.add) return r.entity;
    const p = r.p;
    let actor = null;
    try {
      actor = ctx.actors?.create?.({ kind: 'humanoid', look: { ...p.lk }, remote: true }) || null;
      actor?.setEquipment?.(Object.fromEntries(Object.entries(p.eq).map(([k, v]) => [k, { id: v, qty: 1 }])));
    } catch (err) { console.warn('[net] remote actor failed', err); }
    const e = {
      uid: 'remote:' + r.peer, kind: 'remote', name: displayName(r), x: Math.floor(p.x), z: Math.floor(p.z), w: 1, d: 1, yaw: p.yaw,
      level: p.cb,
      options: () => ['Follow', 'Examine'],
      examine: () => {
        const n = displayName(r);
        const c = r.p?.nm && r.p.nm !== n ? ` (as ${r.p.nm})` : '';
        const doing = r.p?.ac ? ` Busy: ${r.p.ac.toLowerCase()}.` : '';
        return `${n}${c}, combat level ${r.p?.cb || 3}. Another adventurer, here right now.${doing}${r.guest ? ' (guest)' : ''}`;
      },
      pick: { r: 0.45, h: 1.9 },
      view: actor,
      peer: r.peer, // the ui overlay matches chat:public {peer} to this for overhead chat
      combatLevel: p.cb,
      remote: { peer: r.peer, by: r.by },
    };
    r.entity = ctx.entities.add(e);
    r.actor = actor;
    r.lookSig = JSON.stringify(p.lk);
    r.eqSig = JSON.stringify(p.eq);
    return r.entity;
  }

  function sampleAt(r, t) {
    const s = r.samples;
    if (!s.length) return null;
    if (t <= s[0].t || s.length === 1) return s[0];
    for (let i = s.length - 1; i > 0; i--) {
      const a = s[i - 1], b = s[i];
      if (t >= a.t && t <= b.t) {
        if (Math.hypot(b.x - a.x, b.z - a.z) > 8) return b; // teleport: snap
        const k = (t - a.t) / Math.max(1, b.t - a.t);
        let dy = b.yaw - a.yaw;
        while (dy > Math.PI) dy -= Math.PI * 2;
        while (dy < -Math.PI) dy += Math.PI * 2;
        return { x: a.x + (b.x - a.x) * k, z: a.z + (b.z - a.z) * k, yaw: a.yaw + dy * k };
      }
    }
    return s[s.length - 1];
  }

  function myRegion() {
    try { const p = ctx.player?.pos; return p ? ctx.map?.regionAt?.(p.x, p.z)?.id || 'overworld' : 'overworld'; } catch { return 'overworld'; }
  }

  function renderRemotes() {
    const inWorld = state.mode === 'play' || state.mode === 'dead' || state.mode === 'cutscene';
    const me = ctx.player?.pos;
    const reg = myRegion();
    const tNow = now();
    const cands = [];
    for (const r of R.values()) {
      const ok = inWorld && !r.isMe && r.p?.st === 'play' && r.p.rg === reg && me && Math.max(Math.abs(r.p.x - me.x), Math.abs(r.p.z - me.z)) <= VIEW_RANGE;
      if (ok) cands.push(r);
      else if (r.entity) dropRemote(r, false);
    }
    if (cands.length > MAX_ACTORS) {
      cands.sort((a, b) => Math.hypot(a.p.x - me.x, a.p.z - me.z) - Math.hypot(b.p.x - me.x, b.p.z - me.z));
      for (const r of cands.splice(MAX_ACTORS)) if (r.entity) dropRemote(r, false);
    }
    for (const r of cands) {
      const e = ensureEntity(r);
      if (!e) continue;
      const s = sampleAt(r, tNow - INTERP_MS) || r.p;
      const h = ctx.map?.heightAt ? ctx.map.heightAt(s.x, s.z) : 0;
      e.pos.set?.(s.x, h, s.z);
      e.yaw = s.yaw;
      e.name = displayName(r);
      e.level = r.p.cb;
      e.combatLevel = r.p.cb;
      const tx = Math.floor(s.x), tz = Math.floor(s.z);
      if (tx !== e.x || tz !== e.z) ctx.entities.moveTo?.(e, tx, tz);
      const a = r.actor;
      if (a) {
        a.setPosition?.(s.x, h, s.z);
        a.setYaw?.(s.yaw);
        const ls = JSON.stringify(r.p.lk), es = JSON.stringify(r.p.eq);
        if (ls !== r.lookSig) { r.lookSig = ls; try { a.setLook?.({ ...r.p.lk }); } catch { /* ignore */ } }
        if (es !== r.eqSig) { r.eqSig = es; try { a.setEquipment?.(Object.fromEntries(Object.entries(r.p.eq).map(([k, v]) => [k, { id: v, qty: 1 }]))); } catch { /* ignore */ } }
        const last = r.samples[r.samples.length - 1];
        const settled = !last || tNow - INTERP_MS >= last.t;
        let anim = r.p.an;
        if (settled && (anim === 'walk' || anim === 'run') && tNow - last.t > 900) anim = 'idle';
        if (r.emote && tNow < r.emote.until) anim = r.emote.name;
        try { a.play?.(anim); } catch { /* unknown anim */ }
      }
    }
  }

  // ---- Name labels + overhead chat (DOM, #overlay) ------------------------------------
  function labelRoot() {
    if (labels?.isConnected) return labels;
    if (typeof document === 'undefined') return null;
    const host = document.getElementById('overlay');
    if (!host) return null;
    labels = document.createElement('div');
    labels.className = 'nx-names';
    labels.style.cssText = 'position:absolute;inset:0;pointer-events:none;overflow:hidden;';
    const css = document.createElement('style');
    css.textContent = `.nx-name{position:absolute;left:0;top:0;transform:translate(-50%,-100%);white-space:nowrap;text-align:center;font:600 12px/1.15 var(--font-body);color:#fff;text-shadow:1px 1px 0 #000,0 0 3px #000;will-change:transform}
      .nx-name .lv{color:#9fe7c8;font-weight:400;font-size:11px}.nx-name .g{color:var(--parch-dim);font-size:10px}
      .nx-name .say{display:block;color:var(--yellow);font:700 13px/1.2 var(--font-body);max-width:260px;white-space:normal;margin:0 auto 2px}`;
    labels.append(css);
    host.append(labels);
    return labels;
  }
  function placeLabel(key, el, wx, wy, wz, cam, W, H) {
    tmpV.set(wx, wy, wz).project(cam);
    if (tmpV.z > 1 || tmpV.z < -1 || Math.abs(tmpV.x) > 1.15 || Math.abs(tmpV.y) > 1.15) { el.style.display = 'none'; return; }
    el.style.display = '';
    el.style.transform = `translate(${((tmpV.x + 1) / 2) * W}px, ${((1 - tmpV.y) / 2) * H}px) translate(-50%, -100%)`;
  }
  function renderLabels() {
    // The ui overlay draws remote nameplates + overhead chat when present; this layer is the fallback.
    if (typeof ctx.ui?.say === 'function') { if (labels) { labels.remove(); labels = null; for (const r of R.values()) r.labelEl = null; } return; }
    const root = labelRoot();
    const cam = ctx.camera;
    const THREE = ctx.THREE;
    if (!root || !cam || !THREE) return;
    if (!tmpV) tmpV = new THREE.Vector3();
    const W = root.clientWidth || window.innerWidth, H = root.clientHeight || window.innerHeight;
    const show = state.mode === 'play' && state.settings?.showNames !== false;
    const tNow = now();
    for (const r of R.values()) {
      if (!r.entity || !show) { if (r.labelEl) r.labelEl.style.display = 'none'; continue; }
      if (!r.labelEl) { r.labelEl = document.createElement('div'); r.labelEl.className = 'nx-name'; root.append(r.labelEl); r.labelSig = ''; }
      const sayText = r.say && tNow < r.say.until ? r.say.text : '';
      const sig = displayName(r) + '|' + r.p.cb + '|' + sayText + '|' + r.guest;
      if (sig !== r.labelSig) {
        r.labelSig = sig;
        r.labelEl.replaceChildren();
        if (sayText) { const s = document.createElement('span'); s.className = 'say'; s.textContent = sayText; r.labelEl.append(s); }
        r.labelEl.append(document.createTextNode(displayName(r) + ' '));
        const lv = document.createElement('span'); lv.className = 'lv'; lv.textContent = `(level-${r.p.cb})`; r.labelEl.append(lv);
        if (r.guest) { const g = document.createElement('span'); g.className = 'g'; g.textContent = ' guest'; r.labelEl.append(g); }
      }
      const p = r.entity.pos;
      placeLabel(r.peer, r.labelEl, p.x, p.y + (r.actor?.headHeight || 1.8) + 0.45, p.z, cam, W, H);
    }
    // Your own overhead chat.
    const selfText = selfSay && tNow < selfSay.until && show ? selfSay.text : '';
    if (!root.selfEl) { root.selfEl = document.createElement('div'); root.selfEl.className = 'nx-name'; root.append(root.selfEl); }
    const se = root.selfEl;
    if (!selfText || !ctx.player?.pos) { se.style.display = 'none'; se.dataset.t = ''; }
    else {
      if (se.dataset.t !== selfText) { se.dataset.t = selfText; se.replaceChildren(); const s = document.createElement('span'); s.className = 'say'; s.textContent = selfText; se.append(s); }
      const p = ctx.player.pos;
      placeLabel('self', se, p.x, p.y + (ctx.player.actor?.headHeight || 1.8) + 0.35, p.z, cam, W, H);
    }
  }

  function resolveNames(force = false) {
    if (!net.user) return;
    const t = Date.now();
    if (!force && t - lastNames < 30000) return;
    lastNames = t;
    const ids = [...R.values()].map((r) => r.by || r.p?.id).filter(Boolean);
    if (ids.length) net.names(ids).then(markChanged);
  }

  // ---- Follow -------------------------------------------------------------------------
  ctx.actions?.register?.('Follow', {
    approach: () => null,
    start(e) { ctx.events.emit('chat:game', { text: `You start following ${e.name}.`, kind: 'game' }); return true; },
    tick(e, n) {
      if (!e.alive || !ctx.entities?.get?.(e.uid)) { ctx.events.emit('chat:game', { text: 'You lost sight of them.', kind: 'game' }); return false; }
      const P = ctx.player;
      if (!P) return false;
      const d = Math.max(Math.abs(P.x - e.x), Math.abs(P.z - e.z));
      if (d > 1 && (n % 2 === 0 || !P.moving)) P.walkToEntity(e, { adjacent: true }, null);
      return true;
    },
    stop() {},
  }, 'remote');

  // ---- Public API ---------------------------------------------------------------------
  const api = {
    EMOTES,
    get available() { return !!room; },
    get connected() { return !!room?.connected?.(); },
    get peers() {
      const out = [];
      for (const r of R.values()) {
        const p = r.p || {};
        let zone = '';
        try { if (p.st === 'play') zone = ZONES[ctx.map?.zoneAt?.(p.x, p.z)]?.name || (p.rg !== 'overworld' ? titleCase(p.rg) : 'The wilds'); } catch { /* ignore */ }
        out.push({
          peer: r.peer, by: r.by, name: r.sameTab ? myName() : displayName(r), charName: p.nm || '', cb: p.cb || 3, inWorld: p.st === 'play',
          zone, action: p.ac || '', isMe: r.isMe, sameTab: r.sameTab, guest: r.guest, entity: r.entity, x: p.x, z: p.z, updatedAt: r.updatedAt || 0,
        });
      }
      if (!out.some((x) => x.sameTab)) out.unshift({ peer: 'self', name: myName(), charName: state.save.name, cb: ctx.skills?.combatLevel?.() || 3, inWorld: state.mode === 'play', zone: '', action: '', isMe: true, sameTab: true });
      return out.sort((a, b) => (b.sameTab - a.sameTab) || (b.inWorld - a.inWorld) || a.name.localeCompare(b.name));
    },
    status() {
      const pending = net.status('room') === 'pending';
      const count = [...R.values()].filter((r) => !r.isMe).length;
      return { mode: room ? 'live' : pending ? 'connecting' : 'solo', connected: !!room?.connected?.(), count, error };
    },
    remote(peer) { return R.get(peer)?.entity || null; },
    say, emote,
    // The Players view as a window (same content as the side-panel tab).
    open() { return openNetWindow(ctx, 'net-players', { title: 'Players', width: 340, render: (el) => renderPlayersTab(ctx, el) }); },
    update() {
      if (room) sendPresence();
      renderRemotes();
      renderLabels();
      resolveNames();
      if (changedFlag) { changedFlag = false; events.emit('room:change', {}); }
    },
  };

  registerNetTab(ctx, { id: 'players', title: 'Players', icon: playersTabIcon, order: 75, render: (el) => renderPlayersTab(ctx, el), onShow: (el) => renderPlayersTab(ctx, el) });
  return api;
}

const titleCase = (s) => String(s || '').replace(/[_-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
