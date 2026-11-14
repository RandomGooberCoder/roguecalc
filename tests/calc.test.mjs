import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { calculate, add, display } from '../calc.mjs';

const data = JSON.parse(readFileSync(new URL('../data/stats.json', import.meta.url)));
const byName = (group, name) => data[group].find(x => x.name === name);

test('screenshot example matches base, vigilant, and warden independently', () => {
  const rows = calculate(data, byName('races', 'Humen'), byName('jobs', 'Foot Knight'), byName('statpacks', 'Foresighted'));
  assert.deepEqual(rows.map(x => x.base[0]), [10, 12, 13, 13, 13, 10, 10]);
  assert.deepEqual(rows.map(x => x.buffs[0][0]), [10, 14, 13, 14, 14, 11, 10]);
  assert.deepEqual(rows.map(x => x.buffs[1][0]), [10, 15, 13, 13, 13, 11, 10]);
});

test('random statpacks preserve inclusive minimum and maximum', () => {
  const rows = calculate(data, { stats: {} }, { stats: {} }, byName('statpacks', 'Fated'));
  for (const row of rows) assert.deepEqual(row.base, [8, 12]);
  assert.deepEqual(rows.find(x => x.stat === 'perception').buffs[0], [10, 14]);
  assert.equal(display([-2, 2], true), '-2 to +2');
});

test('negative contributions are added without clamping', () => {
  assert.deepEqual(add(10, -4, -3, [-2, 2]), [1, 5]);
});

test('data has unique type IDs and valid source links', () => {
  for (const group of ['races', 'jobs', 'statpacks']) {
    const ids = data[group].map(x => x.id);
    assert.equal(new Set(ids).size, ids.length);
    for (const item of data[group]) {
      assert.ok(item.source.startsWith(`${data.repository}/blob/${data.commit}/`));
      for (const [stat, value] of Object.entries(item.stats)) {
        assert.ok(data.stats.includes(stat));
        assert.ok(Number.isInteger(value) || (Array.isArray(value) && value.length === 2 && value.every(Number.isInteger)));
      }
    }
  }
});
