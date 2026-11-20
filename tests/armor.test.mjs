import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {armorImpact,versusArmor} from '../combat.mjs';
const data=n=>JSON.parse(readFileSync(new URL('../data/'+n+'.json',import.meta.url)));
const rw=data('stats'),az=data('azure');
const stats={strength:10,speed:10};
const w={wbalance:0,sharp:true,intdamage_factor:1};
const cut={damageType:'slash',penfactor:0,intent_intdamage_factor:1};
const plate=rw.combat.armors.find(a=>a.id==='/obj/item/clothing/suit/roguetown/armor/plate');
test('nonpenetrating cut wears armor and blocks HP damage',()=>{
 const x=armorImpact(30,stats,w,cut,plate,rw.combat.rules);
 assert.equal(x.health,0);assert.equal(x.wear,30);
});
test('blunt reduction differs between builds',()=>{
 const intent={...cut,damageType:'blunt'};
 assert.equal(armorImpact(30,stats,w,intent,plate,rw.combat.rules).wear,23.1);
 assert.equal(armorImpact(30,stats,w,intent,plate,az.combat.rules).wear,25);
 assert.equal(armorImpact(30,stats,w,intent,plate,az.combat.rules).health,0);
});
test('source penetration branches preserve differing HP and integrity mechanics',()=>{
 const intent={...cut,damageType:'stab',penfactor:3};
 const rat=armorImpact(30,stats,w,intent,plate,rw.combat.rules);
 const azure=armorImpact(30,stats,w,intent,plate,az.combat.rules);
 assert.ok(Math.abs(rat.health-21)<1e-8);assert.equal(rat.wear,0);
 assert.ok(Math.abs(azure.health-15)<1e-8);assert.equal(azure.wear,27);
});
test('break threshold uses remaining integrity above failure level and enemy defense',()=>{
 const x=versusArmor({hit:30,interval:1},stats,w,cut,plate,100,.5,rw.combat.rules);
 assert.equal(x.breakHits,15);assert.equal(x.breakSeconds,29);
 assert.equal(x.armorDps,15);assert.equal(x.healthDps,0);
 const miss=versusArmor({hit:30,interval:1},stats,w,cut,plate,100,0,rw.combat.rules);
 assert.equal(miss.breakSeconds,Infinity);
});
test('unarmored scenario has no armor damage and contact-adjusted HP rate',()=>{
 const x=versusArmor({hit:30,interval:1},stats,w,cut,null,100,.6,rw.combat.rules);
 assert.equal(x.healthDps,18);assert.equal(x.breakHits,0);assert.equal(x.armorDps,0);
});
test('both builds import armor ratings and exact source attribution',()=>{
 for(const d of [rw,az]){
 assert.ok(d.combat.armors.length>=5);
 for(const a of d.combat.armors){assert.ok(a.integrity>0);assert.ok(a.failure>0&&a.failure<1);assert.ok(a.source.startsWith(d.repository+'/blob/'+d.commit));}
 }
});

test('discovered armor has unique type IDs, valid ratings, and selectable layered slots',()=>{
 for(const d of [rw,az]){
  const {armors,armorSlots}=d.combat;
  assert.ok(armors.length>700);
  assert.equal(new Set(armors.map(a=>a.id)).size,armors.length);
  const slots=new Set(armorSlots.map(s=>s.id));
  for(const id of ['body','shirt','head','neck','wrists','mask','arms','feet','legs'])assert.ok(slots.has(id));
  for(const a of armors){
   assert.ok(a.slots.length&&a.slots.every(s=>slots.has(s)));
   assert.ok(a.coverage.length);
   assert.ok(['blunt','slash','stab'].some(key=>a.ratings[key]>0));
   assert.ok(Object.values(a.ratings).every(Number.isFinite));
  }
  assert.ok(armors.some(a=>a.slots.length>1));
 }
});
