// Node unit checks for js/game/formulas.js (run: node .qa/game-formulas.test.mjs).
import assert from 'node:assert/strict';
import * as F from '../js/game/formulas.js';
import { MONSTERS } from '../js/data/monsters.js';
import { COOKING } from '../js/data/economy.js';

let n = 0;
const ok = (name, fn) => { fn(); n++; console.log('ok -', name); };

ok('gather chance rises with level and tier', () => {
  assert.ok(F.gatherChance(1, 1, 1) > 0.35 && F.gatherChance(1, 1, 1) < 0.5);
  assert.ok(F.gatherChance(30, 1, 1) > F.gatherChance(1, 1, 1));
  assert.ok(F.gatherChance(30, 30, 3) > F.gatherChance(30, 30, 1));
  assert.ok(F.gatherChance(99, 1, 5) <= 0.95);
  assert.ok(F.gatherChance(75, 75, 1) >= 0.05);
});
ok('burn chance hits 0 at stopBurn; range helps', () => {
  for (const r of COOKING) {
    assert.equal(F.burnChance(r.stopBurn, r.level, r.stopBurn), 0);
    assert.ok(F.burnChance(r.level, r.level, r.stopBurn) > 0.3);
    assert.ok(F.burnChance(r.level, r.level, r.stopBurn, 3) < F.burnChance(r.level, r.level, r.stopBurn));
  }
});
ok('OSRS hit chance', () => {
  assert.ok(Math.abs(F.hitChance(816, 640) - (1 - 642 / 1634)) < 1e-9);
  assert.ok(F.hitChance(100, 1000) < 0.06);
  assert.ok(F.hitChance(10000, 640) > 0.95);
});
ok('max hit at level 1 is 1; scales', () => {
  assert.equal(F.maxHit(F.effective(1, 0), 0), 1);
  assert.equal(F.maxHit(F.effective(1, 3), 3), 1);
  assert.ok(F.maxHit(F.effective(40, 3), 33) >= 7);
  assert.ok(F.maxHit(F.effective(99, 3), 54) >= 18);
});
ok('level-1 player vs chicken is a fair fight', () => {
  const ch = MONSTERS.chicken;
  const p = F.hitChance(F.attackRoll(F.effective(1, 3), 4), F.monsterDefenceRoll(ch));
  assert.ok(p > 0.5 && p < 0.75, 'player hit chance ' + p);
  const m = F.hitChance(F.monsterAttackRoll(ch), F.attackRoll(F.effective(1, 0), 0));
  assert.ok(m > 0.4 && m < 0.7, 'chicken hit chance ' + m);
});
ok('warchief is beatable around combat 15-20 with iron gear', () => {
  const w = MONSTERS.goblin_warchief;
  const p = F.hitChance(F.attackRoll(F.effective(20, 3), 11), F.monsterDefenceRoll(w));
  assert.ok(p > 0.4, 'player hit ' + p);
  const max = F.maxHit(F.effective(20, 0), 9);
  assert.ok(max >= 3, 'max ' + max);
});
ok('aggression rule', () => {
  assert.equal(F.wouldAggro(2, 4), true);
  assert.equal(F.wouldAggro(2, 5), false);
  assert.equal(F.wouldAggro(20, 99, true), true);
});
ok('melee reach: no diagonals for 1x1', () => {
  assert.equal(F.inMeleeReach(5, 5, 6, 5), true);
  assert.equal(F.inMeleeReach(5, 5, 6, 6), false);
  assert.equal(F.inMeleeReach(5, 5, 6, 6, 1, 1, true), true);
  assert.equal(F.inMeleeReach(5, 5, 5, 5), false);
  assert.equal(F.inMeleeReach(5, 4, 6, 3, 2, 2), true); // west of a 2x2 footprint
  assert.equal(F.inMeleeReach(5, 5, 6, 3, 2, 2), false); // diagonal corner
});
ok('medic fee never exceeds balance', () => {
  assert.equal(F.medicFee(10, 0), 0);
  assert.equal(F.medicFee(10, 1000), 25);
});
console.log(`${n} checks passed`);
