import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {strengthScale,damage,stamina,parry,classSkill,estimate} from '../combat.mjs';
const load=n=>JSON.parse(readFileSync(new URL('../data/'+n+'.json',import.meta.url)));
const rw=load('stats'),az=load('azure');
const R=rw.combat.rules,A=az.combat.rules;
test('build-specific STR soft cap',()=>{
 assert.equal(strengthScale(10,R),1);assert.equal(strengthScale(9,R),.9);
 assert.ok(Math.abs(strengthScale(16,R)-1.5)<1e-9);
 assert.ok(Math.abs(strengthScale(16,A)-1.46)<1e-9);
});
test('intent bonus is additive after STR scaling, not multiplied',()=>{
 const w={force:20,force_wielded:30,minstr:0};
 assert.equal(damage(12,w,{damfactor:1.2},false,R),28);
 assert.equal(damage(12,w,{damfactor:1.2},true,R),42);
 assert.equal(damage(2,{...w,minstr:10},{damfactor:1},false,R),1);
 assert.equal(damage(20,w,{damfactor:2,minDamage:0,maxDamage:25},false,A),25);
});
test('stamina pools and eligible recovery ticks remain build-specific',()=>{
 assert.equal(stamina(13,4,100,R).pool,150);
 assert.equal(stamina(13,4,100,A).pool,150);
 assert.equal(stamina(10,4,100,R).pool,120);
 assert.equal(stamina(10,4,100,A).pool,135);
 assert.equal(stamina(13,4,50,R).regen,30);
 assert.equal(stamina(13,4,0,R).regen,10);
 assert.equal(R.tickSeconds,2);assert.equal(A.tickSeconds,2);
});
const stats={strength:10,willpower:10,speed:10,perception:10,intelligence:10};
const options={two:false,enemy:stats,energy:100,light:true,trained:true,enemySwift:false,enemyLight:true,zone:'chest',old:false,mage:false};
const w={force:20,force_wielded:25,minstr:5,wdefense:4,wdefense_wbonus:3,wbalance:0};
test('parry skills, WDEF, old-age exception and caps',()=>{
 assert.equal(parry(stats,stats,w,false,4,3,options,R).chance,60);
 assert.equal(parry(stats,stats,w,true,4,3,options,R).chance,90);
 assert.equal(parry(stats,stats,w,false,4,3,{...options,old:true},R).chance,80);
 assert.equal(parry(stats,stats,w,false,4,3,{...options,old:true,mage:true},R).chance,60);
 assert.equal(parry(stats,stats,w,false,4,3,{...options,old:true},A).chance,60);
 assert.equal(parry(stats,stats,w,false,6,0,{...options,trained:false},R).chance,75);
 assert.equal(parry(stats,stats,w,false,0,6,options,R).chance,5);
});
test('swift penalty uses target zone and favorable PER/INT differences',()=>{
 const enemy={...stats,speed:14};const opt={...options,enemySwift:true};
 assert.equal(parry(stats,enemy,w,false,4,3,opt,R).penalty,10);
 assert.equal(parry(stats,enemy,w,false,4,3,{...opt,zone:'limbs'},R).penalty,25);
 assert.equal(parry(stats,enemy,w,false,4,3,{...opt,zone:'precise'},R).penalty,40);
 assert.equal(parry({...stats,perception:18},enemy,w,false,4,3,opt,R).penalty,0);
});
test('Azure secondary weapon skill uses best weighted skill',()=>{
 const job={skillsKnown:true,skills:{swords:2,maces:5}};
 const weapon={skill:'swords',secondarySkills:{maces:.8}};
 assert.equal(classSkill(job,weapon,A),4);assert.equal(classSkill(job,weapon,R),2);
 assert.equal(classSkill({skillsKnown:false},weapon,A),null);
});
test('both snapshots contain valid combat catalogs and class skill imports',()=>{
 for(const data of [rw,az]){
  assert.ok(data.combat.weapons.length>=8);
  assert.ok(data.jobs.find(j=>j.name==='Foot Knight').skills['/datum/skill/combat/swords']>=4);
  for(const weapon of data.combat.weapons){
   assert.ok(weapon.source.startsWith(data.repository));
   for(const [grip,intents] of Object.entries(weapon.intents))for(const intent of intents){
    assert.equal(intent.chargetime,0);assert.equal(intent.swingdelay,0);
    const result=estimate(stats,weapon,intent,4,4,3,{...options,two:grip==='two'},data.combat.rules);
    assert.ok(Number.isFinite(result.dps)&&result.dps>0);
    assert.ok(result.chance>=5&&result.chance<=90);
   }
  }
 }
});
