export const clamp=(n,a,b)=>Math.min(b,Math.max(a,n));
export function strengthScale(str,r){
 const cap=r.STRENGTH_SOFTCAP;
 return str<=10?1-(10-str)*.1:1+(Math.min(str,cap)-10)*r.STRENGTH_MULT+Math.max(0,str-cap)*r.STRENGTH_CAPPEDMULT;
}
export function classSkill(job,weapon,r){
 if(!job.skillsKnown)return null;
 const skills=job.skills||{};
 let level=skills[weapon.skill]||0;
 if(r.azure)for(const [key,factor] of Object.entries(weapon.secondarySkills||{}))level=Math.max(level,(skills[key]||0)*factor);
 return level;
}
export function damage(str,weapon,intent,two,r){
 const force=two?weapon.force_wielded:weapon.force;
 const requirement=two?Math.max(weapon.minstr/2,1):weapon.minstr;
 let scaled=force*strengthScale(str,r);
 if(requirement>str)scaled=Math.max(scaled*.3,1);
 // The source adds the intent's base-force delta AFTER STR and minimum-STR scaling.
 const raw=Math.max(1,Math.floor(scaled+force*(intent.damfactor-1)+.5));
 return r.azure?clamp(raw,intent.minDamage,intent.maxDamage):raw;
}
export function stamina(will,athletics,energyPercent,r){
 const energy=Math.max(0,(will+athletics/2)*100);
 const pool=r.azure?r.staminaBase+(will-10)*r.staminaPerWill:energy/10;
 // DM round(x) floors; round(x,1) elsewhere rounds to the nearest integer.
 const regen=-Math.floor(-10-40*clamp(energyPercent,0,100)/100);
 return {energy,pool:Math.max(0,pool),regen,tick:r.tickSeconds,delay:2};
}
export function parry(def,enemy,weapon,two,skill,enemySkill,opt,r){
 let defense=skill*r.skillParry+(weapon.wdefense+(two?weapon.wdefense_wbonus:0))*r.wdefParry;
 const swiftBonus=weapon.wbalance===1&&!two&&opt.light?10:0;
 let penalty=0;
 if(opt.enemySwift&&opt.enemyLight&&enemy.speed>def.speed){
  penalty=(enemy.speed-def.speed)*10;
  if(opt.zone==='chest')penalty-=Math.max(0,(def.perception-enemy.perception)*5)+Math.max(0,(def.intelligence-enemy.intelligence)*3);
  if(opt.zone==='limbs')penalty-=Math.max(0,(def.perception-enemy.perception)*5);
  penalty=clamp(penalty,0,r[opt.zone==='chest'?'SWIFTCAP_CHEST':opt.zone==='limbs'?'SWIFTCAP_LIMBS':'SWIFTCAP_PRECISE']);
 }
 const oldBonus=opt.old&&!opt.mage?r.oldParry:0;
 const raw=defense+swiftBonus-enemySkill*r.skillParry-penalty+oldBonus;
 const chance=clamp(raw,5,opt.trained?90:75);
 return {chance,raw,defense,swiftBonus,penalty,oldBonus};
}
export function estimate(stats,weapon,intent,skill,athletics,enemySkill,opt,r){
 const hit=damage(stats.strength,weapon,intent,opt.two,r);
 const interval=intent.clickcd/10;
 const stam=stamina(stats.willpower,athletics,opt.energy,r);
 const defend=parry(stats,opt.enemy,weapon,opt.two,skill,enemySkill,opt,r);
 const cost=intent.releasedrain;
 return {hit,interval,dps:hit/interval,...stam,...defend,cost,
  attacks:cost>0?Math.max(0,Math.ceil(stam.pool/cost)-1):Infinity,
  restSeconds:stam.regen>0?Math.ceil(stam.pool/stam.regen)*(stam.delay+stam.tick):Infinity};
}
