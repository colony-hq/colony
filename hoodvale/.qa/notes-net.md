# Net builder notes (js/net/*)

## Publish declaration (integration)

```js
capabilities: {
  db: { rules: [
    { path: "market", read: "view", write: "owner" },   // everyone reads the shared order book
    { path: "market/{self}", write: "interact" },       // each player writes only market/<id> (+ /orders/*)
    { path: "fills", read: "view", write: "owner" },     // everyone reads fills (makers settle from them)
    { path: "fills/{self}", write: "interact" },        // each taker writes only fills/<id> (+ /log/*)
    { path: "players", read: "view", write: "owner" },   // hiscores: everyone reads
    { path: "players/{self}", write: "interact" },      // each player writes only players/<id>
    { path: "data/users/{self}", write: "interact" },   // private cloud save (default privacy kept)
    // optional hardening if no other module needs free-form shared docs:
    // { path: "", read: "view", write: "owner" },
  ] },
  user: { scopes: ["profile"] },                 // ids for db paths + display names (never stored)
  room: { topics: { chat: "interact", emote: "interact", trade: "interact" } },  // `trade` reserved, unused
  sample: {},
}
```
Prefix rules (`market`, `fills`, `players`) set both read and write as the contract requires.

## Documents written

| Path | Who | Shape |
|---|---|---|
| `data/users/{self}/save` | owner only (private) | `{v:1, savedAt, syncId, name, created, total, save: <state.save>}` (≤ ~230 KB; history trimmed if bigger) |
| `players/{self}` | owner | `{v:1, at, total, combat, qp, xp, lv_<skill>, xp_<skill>}` — numbers only, no names |
| `market/{self}` | owner | index read by all: `{v:1, at, orders:[{id,item,side,price,qty,ext,at,status,closedAt}]}` (open + closed < 24 h, ≤ 12) |
| `market/{self}/orders/{id}` | owner | `{v:1, ...same order}` (deleted when the order is collected/retired) |
| `fills/{self}` | owner (taker) | index read by all: `{v:1, at, fills:[{id,maker,order,item,side,qty,price,at,void?}]}` (≤ 150, 30 days) |
| `fills/{self}/log/{id}` | owner | `{v:1, ...same fill}` (deleted when pruned from the index) |

Readers subscribe to just two collections (`market`, `fills`, ordered by `at`, limit 200) plus
`players` while the Hiscores window is open. Every remote document is validated (`market.js`
cleanOrder/cleanFill, `cloud.js` cleanRow) and capped; prices/qtys are integers within bounds.

Settlement rule (both sides compute it from the same docs, `market.js evaluateOrder`): a fill is
valid if it matches the maker order's item/side/price, is not void, is after the order opened and
before a cancel, and fits capacity `qty − ext` taking fills in (at, takerId/fillId) order. Takers wait
~1 block (2.6 s) and settle; losers void their fill and keep their escrow. Makers apply valid fills
into their collection box. Live cancels refund after a 3.6 s grace so in-flight fills land first.
Known residual race: a maker's NPC fill and a player fill landing in the same instant can, rarely,
deliver one extra unit to the taker (nothing of real value; NPC fills skip live orders for 20 s
after any player fill to keep this rare).

## Room
- presence (~4.5 Hz while anything changes, nothing while idle): `{v:1, st:'play'|'menu', x, z, yaw, rg (region id), an (anim), lk (look whitelist), eq ({slot:itemId}), cb, ac (current action), nm (character name), id (user id)}`.
- topic `chat`: `{v:1, t}` (≤120 chars). topic `emote`: `{v:1, e}` (whitelisted names, `room.EMOTES`).
- Incoming: sanitised (control/bidi/invisible chars stripped), per-peer rate limits (chat 3/6 s, emote 2/3 s, presence 24/2 s), duplicates dropped, agents ignored, max 128 peers, 24 rendered actors (nearest, same region, ≤ 72 tiles).
- Remote players = entities `kind:'remote'`, uid `remote:<peer>`, `peer`, `name` (user.profiles name → character name → 'Adventurer'), `level`/`combatLevel`, options Follow/Examine, actor `ctx.actors.create({kind:'humanoid', look, remote:true})` + `setEquipment`, interpolated 320 ms behind.
- The ui overlay draws remote nameplates + overhead chat (it matches `chat:public.peer` to `entity.peer`). room.js has its own label layer only as a fallback when `ctx.ui.say` is missing.

## APIs (DESIGN §9 kept; additions)
- `ctx.net` (caps hub, created by chain.js): `caps {db,user,room}`, `selfId`, `me`, `status(name)`, `on(fn)`, `attach({db,user,room})` (tests/demo), `names(ids)` → Promise, `nameOf(id)`.
- `chain`: `info`, `simulated`, `tx(hash)`, `txsFor(addr, limit)`, `block(n)`, `latestTxs(n)`, `finality(tx)` ('pending'|'soft'|'final'), `label(addr)`, `sysAddress(name)` (e.g. 'shop:general', 'oracle', 'vale', 'sheriff', 'hood', 'medic'), `isSelf`, `tokenOf(itemId)`, `itemOfToken(id)`, `search(q)`, `tps`, `lastFinal`. Ambient simulated txs every block.
- `wallet`: `address`, `open()` (window version of the tab), `openExplorer(target)` (`{tx}|{address}|{block}|{item}|{query}`). `meta` for credit/debit: `{from|to, item, qty, kind}` → readable counterparties in the explorer. Please pass `{from: 'shop:<id>'}` / `{to: 'oracle'}` etc. when you can.
- `exchange`: `open({item, tab: 'trade'|'orders'|'collect'|'history', at, source})`, `close()`, `place({item, side, qty, price})`, `cancel(id)`, `collect(id?)` (no id = all), `collectAll()`, `orders()`, `history()`, `quote(id)`, `book(id)`, `chart(id)`, `tape(id)`, `status()`, `slotsFree()`, `boxCount()`, `atDesk()`, `inventoryItems()`, `search(q)`. Orders can only be placed within 7 tiles of an exchange desk / clerk (UI gate; prices viewable anywhere).
- `cloud`: `available`, `status()`, `syncNow()`, `openHiscores(skill?)`, `hiscores.subscribe(skill, cb)`, `myStats()`.
- `room`: `available`, `connected`, `peers`, `say(text)`, `emote(name)`, `status()`, `remote(peer)`, `open()` (Players window), `EMOTES`.
- Tabs registered on `game:ready`: `wallet` (order 70, icon 'wallet'), `players` (order 75, icon 'players').
- Chat commands (via `ctx.ui.registerCommand`): `::exchange`, `::wallet`, `::explorer [hash|address]`, `::hiscores [skill]`, `::players`.

## Events (new)
`exchange:change {order}`, `exchange:fill {order, qty, price, src}`, `exchange:status`, `exchange:book`,
`exchange:open {source}`, `wallet:confirm {block}`, `cloud:status {phase}`, `room:change`,
`emote:remote {name, peer, from}`, `peer:join/leave {peer, name}`, `chat:public {from, text, peer, by, guest, self}`.
Listened: `emote {name}` (broadcast to the room), `save:written` (cloud mirror; sets `save.savedAt`).

## Save fields owned by net
`save.exchange = {v:1, orders, history, myFills}`, `save.wallet.nonce`, `save.savedAt`, `save.cloudSync`.

## Requests to other builders
- integration (data): consider adding 'Collect' to `exchange_desk` options (bank booths already have it; both route to `exchange.collect()`).
- game: keep `actions.handlerFor()` — net wraps the existing 'object:Collect' (flour bin) and only takes bank booth / exchange desk.
- whoever animates the local player: `emote {name}` is broadcast by net, but nothing plays the local emote animation yet.

## Testing
- `node .qa/net-test.mjs` — 63 checks: market model, chain/wallet, NPC exchange, live player orders with
  3 mocked clients (race/overfill, void, cancel grace, junk docs, rule enforcement), room presence/chat/
  emotes/sanitising/rate limits, cloud mirror privacy + hiscores.
- In-page demo (opt-in, never loaded by the game): `import('./js/net/mock-caps.js').then(m => m.installDemo(__hv.ctx))`
  → 2 simulated players walking around you, chatting, waving, with market orders, a bot that buys
  from your live sell orders, and hiscore rows.
- Screenshots: `.qa/shots-net/` (01 wallet, 02/03 explorer, 04–06 exchange, 07 hiscores solo,
  08 live world + players tab, 09–10 live exchange + bot fill, 11 live hiscores, 12 wallet tab,
  13–15 phone, 16–17 cloud restore + follow).
