import test from 'node:test';
import assert from 'node:assert/strict';
import {rankStatpacks} from '../calc.mjs';
const pack = (name, stats) => ({name, id: name, stats});
const ids = list => list.map(({pack}) => pack.id);
test('Max has priority, Dump breaks ties, and Neutral stats finish the ranking', () => {
  const packs = [pack('Frail', {strength:-4, intelligence:-4}), pack('Neutral bonus', {strength:2, intelligence:-1, speed:1}), pack('No dump', {strength:2}), pack('Deeper dump', {strength:2, intelligence:-2}), pack('Plain', {strength:2, intelligence:-1})];
  assert.deepEqual(ids(rankStatpacks(packs, {strength:'max', intelligence:'dump'})), ['Deeper dump', 'Neutral bonus', 'Plain', 'No dump', 'Frail']);
});
test('multiple Max stats count equally and ranges use their midpoint', () => {
  const packs = [pack('Variable', {strength:[-2,2], fortune:[0,6]}), pack('Strong', {strength:2}), pack('Lucky', {fortune:4})];
  assert.deepEqual(ids(rankStatpacks(packs, {strength:'max', fortune:'max'})), ['Lucky','Variable','Strong']);
});
test('no priorities gives no ranking; dumping alone favors lower values', () => {
  const packs = [pack('Austere', {}), pack('Sacrifice', {constitution:-2})];
  assert.deepEqual(rankStatpacks(packs, {}), []);
  assert.deepEqual(ids(rankStatpacks(packs, {constitution:'dump'})), ['Sacrifice','Austere']);
});
