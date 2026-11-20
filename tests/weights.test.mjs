import test from 'node:test';
import assert from 'node:assert/strict';
import { calculate, weightedTotal } from '../calc.mjs';

test('statpack weight doubles STR and SPD, ignores LCK, and preserves signed ranges', () => {
  assert.deepEqual(weightedTotal({strength: 2, speed: [-3, 1], fortune: [-50, 50], perception: 1, intelligence: -2, constitution: 1, willpower: 1}), [-1, 7]);
  assert.deepEqual(weightedTotal({}), [0, 0]);
});

test('resulting totals include starting stats and each area bonus independently', () => {
  const data = {base: 10, stats: ['strength','speed','perception','intelligence','constitution','willpower','fortune'], buffs: [{stats: {speed: 2}}, {stats: {willpower: 3}}]};
  const rows = calculate(data, {stats: {strength: 1}}, {stats: {perception: 1}}, {stats: {strength: [-1, 1], fortune: 9}}, {stats: {speed: -1}}, {stats: {willpower: 1}});
  const weigh = get => weightedTotal(Object.fromEntries(rows.map(row => [row.stat, get(row)])));
  assert.deepEqual(weigh(r => r.base), [80, 84]);
  assert.deepEqual(weigh(r => r.buffs[0]), [84, 88]);
  assert.deepEqual(weigh(r => r.buffs[1]), [83, 87]);
});
