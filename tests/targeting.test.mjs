import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {accuracy,stanceAttack,parryDrain,criticalMiss,versusTarget,fatigueRace,ZONES} from '../targeting.mjs';
const data=JSON.parse(readFileSync(new URL('../data/stats.json',import.meta.url)));
const r=data.combat.rules,w=data.combat.weapons.find(x=>x.name==='arming sword'),intent=w.intents.one[0];
const stats={strength:10,willpower:10,speed:10,perception:10,intelligence:10,fortune:10};
test('major targets use both accuracy rolls; chest skips aiming',()=>{
 const chest=accuracy(stats,w,intent,4,'chest','normal',r);assert.equal(chest.exact,1);
 const arm=accuracy(stats,w,intent,4,'l_arm','normal',r);
 assert.equal(arm.roll,48);assert.ok(Math.abs(arm.exact-.7296)<1e-9);
});
test('precision failure routes to parent only with PER at least 11',()=>{
 const low=accuracy(stats,w,intent,4,'l_eye','normal',r);assert.equal(low.parent,0);
 const high=accuracy({...stats,perception:11},w,intent,4,'l_eye','normal',r);
 assert.ok(high.parent>0);assert.ok(Math.abs(high.exact+high.parent+high.chest-1)<1e-9);
 for(const z of ZONES){const a=accuracy(stats,{...w,wlength:3},intent,4,z.id,'normal',r);assert.ok(Math.abs(a.distribution.reduce((n,x)=>n+x.p,0)-1)<1e-9);}
});
test('short/normal weapons cannot target standing feet; long weapons can',()=>{
 assert.equal(accuracy(stats,w,intent,4,'l_foot','normal',r).reachable,false);
 assert.equal(accuracy(stats,{...w,wlength:3},intent,4,'l_foot','normal',r).reachable,true);
});
test('aimed/swift stance affect accuracy, cadence and fatigue separately from balance',()=>{
 const a=accuracy(stats,w,intent,4,'l_arm','normal',r);
 assert.ok(accuracy(stats,w,intent,4,'l_arm','aimed',r).exact>a.exact);
 assert.ok(accuracy(stats,w,intent,4,'l_arm','swift',r).exact<a.exact);
 const normal=stanceAttack(stats,w,intent,false,'normal',r),swift=stanceAttack(stats,w,intent,false,'swift',r);
 assert.ok(swift.interval<normal.interval);assert.equal(swift.cost,normal.cost+10);
});
test('heavy weapons impose two fatigue per positive STR gap on parrying enemy',()=>{
 assert.equal(parryDrain({...stats,strength:15},stats,{wbalance:-1},true,r),15);
 assert.equal(parryDrain({...stats,strength:15},stats,{wbalance:1},true,r),5);
 assert.equal(parryDrain(stats,{...stats,strength:15},{wbalance:-1},false,r),10);
});
test('poor fortune true misses are distinct from accuracy fallback',()=>{
 assert.equal(criticalMiss({...stats,fortune:8}),.08);assert.equal(criticalMiss(stats),0);
});
test('head targets bypass torso plate while fallback can hit protected chest',()=>{
 const gear=data.combat.armors.find(a=>a.id==='/obj/item/clothing/suit/roguetown/armor/plate'),enemy={...stats};
 const opts={light:true,enemyLight:true,trained:true,old:false,mage:false};
 const chest=versusTarget(stats,w,intent,4,'normal',false,enemy,w,false,3,'chest',gear,100,1,opts,r);
 const head=versusTarget(stats,w,intent,4,'normal',false,enemy,w,false,3,'head',gear,100,1,opts,r);
 assert.equal(chest.healthDps,0);assert.ok(head.healthDps>0);assert.ok(head.armorWear<chest.armorWear);
});
test('expected fatigue race identifies which side exhausts first',()=>{
 const actor={hit:20,interval:1,cost:1,pool:100,maxEnergy:1000,startFatigue:0,energyPercent:100,active:true,miss:0,contact:1,parryChance:50,parryCost:5};
 const x=fatigueRace(actor,{...actor,active:false,parryCost:25},r);
 assert.ok(Number.isFinite(x.enemyTime));assert.equal(x.yourTime,Infinity);
 const y=fatigueRace({...actor,cost:25},{...actor,active:false,parryChance:5},r);
 assert.ok(Number.isFinite(y.yourTime));assert.equal(y.enemyTime,Infinity);
});
