import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {defenseRoll,attackMatch,fatigueRace} from '../targeting.mjs';
for(const build of ['stats','azure']){
 const {combat:{weapons,armors,shields,rules:r}}=JSON.parse(readFileSync(new URL(`../data/${build}.json`,import.meta.url)));
 const make=(name='arming sword',options={})=>{
  const weapon=weapons.find(w=>w.name===name);
  return {weapon,intent:weapon.intents.one[0],stats:{strength:10,speed:10,willpower:10,perception:10,intelligence:10,fortune:10},skill:3,two:false,stance:'defend',zone:'chest',gear:[],contact:1,opts:{mode:'block',trained:true,light:true,matchSkill:3,shieldSkill:3,...options}};
 };
 test(`${build}: heavy STR gap raises block cost; Defend has no block cooldown`,()=>{
  const a=make('steel mace'),d=make();a.stats.strength=15;
  const b=defenseRoll(d,a,r);assert.equal(b.cooldown,0);assert.equal(b.cost,r.BASE_PARRY_STAMINA_DRAIN+10);
  d.opts.mode='dodge';assert.equal(defenseRoll(d,a,r).cost,8);
  d.opts.trained=false;assert.equal(defenseRoll(d,a,r).chance,0);
 });
 test(`${build}: speed and weapon balance affect dodge odds; offhand shield can win block selection`,()=>{
  const a=make('rapier'),d=make('arming sword',{mode:'dodge'});a.stats.speed=12;
  assert.equal(defenseRoll(d,a,r).chance,10);
  const heavy=make('steel mace');d.stats.speed=11;assert.equal(defenseRoll(d,heavy,r).chance,70);
  d.opts={...d.opts,mode:'block',shield:shields[0],shieldSkill:6};assert.equal(defenseRoll(d,heavy,r).usesShield,true);
  d.two=true;assert.equal(defenseRoll(d,heavy,r).usesShield,false);
 });
 test(`${build}: matchup routes armor both ways and stamina race uses selected defense`,()=>{
  const a=make('steel mace'),d=make();a.stats.strength=17;
  const naked=attackMatch(a,d,r);d.gear=[{item:armors.find(a=>a.id==='/obj/item/clothing/suit/roguetown/armor/plate'),condition:100}];const armored=attackMatch(a,d,r);
  assert.ok(naked.healthDps>armored.healthDps);assert.ok(armored.pieces[0].wearRate>0);
  const actor=(profile,active,attack)=>({...attack,profile,active,pool:100,maxEnergy:1000,energyPercent:100,startFatigue:0,miss:0,contact:1});
  const blocks=fatigueRace(actor(a,true,armored),actor(d,false,attackMatch(d,a,r)),r);
  d.opts.mode='dodge';const dodges=fatigueRace(actor(a,true,armored),actor(d,false,attackMatch(d,a,r)),r);
  assert.ok(Number.isFinite(blocks.enemyTime));assert.ok(blocks.enemyTime<dodges.enemyTime);
 });
}
