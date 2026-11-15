import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {calculate} from '../calc.mjs';
for (const [file, repo] of [['stats.json','Rotwood-Vale/Ratwood-2.0'],['azure.json','Azure-Peak/Azure-Peak']]) {
 const data=JSON.parse(readFileSync(new URL('../data/'+file,import.meta.url)));
 test(file+' has independent valid definitions and attribution',()=>{
  assert.equal(data.repository,'https://github.com/'+repo);
  for(const group of ['races','jobs','statpacks','buffs','ages']) {
   assert.ok(data[group].length);
   assert.equal(new Set(data[group].map(x=>x.id)).size,data[group].length);
   for(const item of data[group]) assert.ok(item.source.startsWith(data.repository+'/blob/'+data.commit+'/'));
  }
  const old=data.ages.find(x=>x.id==='old');
  assert.equal(old.stats.intelligence,file==='azure.json'?2:3);
  const race=data.races.find(x=>x.name==='Aasimar');
  assert.equal(race.choices.length,file==='azure.json'?6:7);
  for(const choice of race.choices){
   const rows=calculate(data,race,{stats:{}},{stats:{}},{stats:{}},choice);
   for(const row of rows) assert.equal(row.base[0],10+(race.stats[row.stat]??0)+(choice.stats[row.stat]??0));
  }
 });
}
