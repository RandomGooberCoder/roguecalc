import {clamp, damage, stamina, parry, armorImpact} from './combat.mjs?v=targeting-1';
export const ZONES=[
 ['chest','Chest','chest','CHEST',false],['head','Head','head','HEAD',true],
 ['l_arm','Left arm','l_arm','ARM_LEFT',false],['r_arm','Right arm','r_arm','ARM_RIGHT',false],
 ['l_leg','Left leg','l_leg','LEG_LEFT',false],['r_leg','Right leg','r_leg','LEG_RIGHT',false],
 ['l_hand','Left hand','l_arm','HAND_LEFT',false],['r_hand','Right hand','r_arm','HAND_RIGHT',false],
 ['l_foot','Left foot','l_leg','FOOT_LEFT',false],['r_foot','Right foot','r_leg','FOOT_RIGHT',false],
 ['l_eye','Left eye','head','LEFT_EYE',true],['r_eye','Right eye','head','RIGHT_EYE',true],
 ['nose','Nose','head','NOSE',true],['mouth','Mouth','head','MOUTH',true],
 ['ears','Ears','head','EARS',true],['skull','Skull','head','HAIR',true],
 ['neck','Neck','head','NECK',false],['groin','Groin','chest','GROIN',false],
 ['stomach','Stomach','chest','VITALS',false]
].map(([id,name,parent,coverage,face])=>({id,name,parent,coverage,face}));
export const zoneOf=id=>ZONES.find(z=>z.id===id)||ZONES[0];
export function zoneType(id){const z=zoneOf(id);return z.id==='chest'?'chest':z.id===z.parent?'limbs':'precise';}
export function reachable(zone,weapon){return !['l_foot','r_foot'].includes(zone)||weapon.wlength>2;}
export function accuracy(stats,weapon,intent,skill,zone,stance,r){
 const z=zoneOf(zone),a=r.accuracy;
 if(!reachable(zone,weapon))return {exact:0,parent:0,chest:0,roll:0,reachable:false,distribution:[]};
 if(zone==='chest')return {exact:1,parent:0,chest:0,roll:100,reachable:true,distribution:[{id:'chest',p:1}]};
 let score=(z.id===z.parent?a.ACC_MAJOR_ZONE_BONUS:0)-(z.face?a.ACC_FACE_SUBZONE_PENALTY:0);
 score+=stats.perception>10?Math.min((stats.perception-10)*a.ACC_PER_BONUS_PER_POINT,a.ACC_PER_BONUS_CAP):-(10-stats.perception)*a.ACC_PER_PENALTY_PER_POINT;
 score+=skill*a.ACC_SKILL_BONUS_PER_LEVEL+(intent.accuracy||0);
 const bc=intent.bladeClass;
 if(bc==='BCLASS_STAB')score+=a.ACC_STAB_BONUS;
 if(bc==='BCLASS_PICK')score+=a.ACC_PICK_BONUS;
 if(bc==='BCLASS_CUT')score+=a.ACC_CUT_BONUS;
 if(['BCLASS_BLUNT','BCLASS_SMASH'].includes(bc)&&z.id!==z.parent)score-=a.ACC_BLUNT_PRECISE_PENALTY;
 if(weapon.wlength===1)score+=a.ACC_SHORT_WEAPON_BONUS;
 if(stance==='aimed')score+=a.ACC_AIMED_BONUS;
 if(stance==='swift')score-=a.ACC_SWIFT_PENALTY;
 const roll=clamp(score,a.ACC_MIN,a.ACC_MAX),first=roll/100,second=clamp(roll+stats.perception-10,0,100)/100;
 const major=z.id===z.parent;
 const exact=major?first+(1-first)*second:first;
 const parent=!major&&stats.perception>=11?(1-first)*second:0;
 const chest=1-exact-parent;
 const outcomes=new Map();
 for(const [id,prob] of [[z.id,exact],[z.parent,parent],['chest',chest]])outcomes.set(id,(outcomes.get(id)||0)+prob);
 return {exact,parent,chest,roll,reachable:true,distribution:[...outcomes].filter(([,p])=>p>0).map(([id,p])=>({id,p}))};
}
export function stanceAttack(stats,weapon,intent,two,stance,r){
 let cd=intent.clickcd;
 if(stance==='aimed')cd=Math.floor(cd*r.CLICK_CD_MOD_AIMED);
 if(stance==='swift')cd=Math.min(cd,Math.max(Math.floor(cd*r.CLICK_CD_MOD_SWIFT),r.CLICK_CD_INTENTCAP));
 let hit=damage(stats.strength,weapon,intent,two,r);
 if(stance==='strong')hit+=(two?weapon.force_wielded:weapon.force)*r.STRONG_STANCE_DMG_BONUS;
 if(r.azure)hit=clamp(hit,intent.minDamage,intent.maxDamage);
 const extra=stance==='strong'||(stance==='swift'&&intent.clickcd>r.CLICK_CD_INTENTCAP)?r.EXTRA_STAMDRAIN_SWIFSTRONG:0;
 return {hit,interval:cd/10,cost:intent.releasedrain+extra,misscost:intent.misscost||0,dps:hit/(cd/10)};
}
export function parryDrain(attacker,defender,weapon,trained,r){
 const heavy=weapon.wbalance===-1?weapon.wbalance*Math.max(0,attacker.strength-defender.strength)*r.STAM_DRAIN_PER_STR_DIFF_HEAVY_BAL:0;
 return Math.max(5,r.BASE_PARRY_STAMINA_DRAIN+(trained?0:5)+heavy);
}
export function criticalMiss(stats){return clamp((10-(stats.fortune??10))*4,0,100)/100;}
export function versusTarget(stats,weapon,intent,skill,stance,two,enemy,enemyWeapon,enemyTwo,enemySkill,zone,gear,condition,contact,opts,r){
 const aimed=accuracy(stats,weapon,intent,skill,zone,stance,r),raw=stanceAttack(stats,weapon,intent,two,stance,r);
 const enemyParry=parry(enemy,stats,enemyWeapon,enemyTwo,enemySkill,skill,{...opts,enemySwift:weapon.wbalance===1,zone:zoneType(zone)},r).chance;
 const eligibleFraction=1/Math.max(1,Math.ceil((r.parryCooldown-1e-9)/raw.interval));
 const effectiveParry=enemyParry*eligibleFraction;
 const land=(1-criticalMiss(stats))*(1-effectiveParry/100)*contact;
 let health=0,wear=0,armorP=0;
 // The armed source resolves the bodypart before armor: precise face -> head, hands -> arm, etc.
 for(const outcome of aimed.distribution){
  const parent=zoneOf(outcome.id).parent,flag=zoneOf(parent).coverage;
  const armor=gear&&condition>gear.failure*100&&(gear.coverage||[]).includes(flag)?gear:null;
  const impact=armorImpact(raw.hit,stats,weapon,intent,armor,r);
  health+=outcome.p*impact.health;wear+=outcome.p*impact.wear;if(armor)armorP+=outcome.p;
 }
 const remaining=gear?Math.max(0,gear.integrity*(condition/100-gear.failure)):0;
 const hits=remaining===0?0:wear>0?Math.ceil((remaining-1e-9)/wear):Infinity;
 return {...raw,aimed,enemyParry,effectiveParry,landPercent:land*100,
  exactLandedPercent:aimed.exact*land*100,healthHit:health,healthDps:health/raw.interval*land,
  armorWear:wear,armorDps:wear/raw.interval*land,breakHits:hits,
  breakSeconds:hits===0?0:land>0&&Number.isFinite(hits)?(hits/land-1)*raw.interval:Infinity,armorP};
}
// Deterministic expected-fatigue trajectory; it is not a stochastic win-probability simulator.
export function fatigueRace(you,enemy,r,horizon=180){
 const actors=[you,enemy].map(a=>({...a,fatigue:a.pool*a.startFatigue/100,energy:a.maxEnergy*a.energyPercent/100,lastSpend:-100,lastParry:-100,nextAttack:0,nextTick:r.tickSeconds,time:null,attacks:0,parries:0}));
 let t=0;
 for(let events=0;events<12000;events++){
  t=Math.min(...actors.flatMap(a=>[a.active?a.nextAttack:Infinity,a.nextTick]));if(t>horizon)break;
  for(const a of actors)if(a.nextTick<=t+1e-8){
   if(t>a.lastSpend+2&&a.fatigue>=1){const regen=-Math.floor(-10-40*clamp(a.energy/a.maxEnergy,0,1));a.fatigue=Math.max(0,a.fatigue-regen);a.lastSpend=t;}
   // Normal combat-mode reserve drain, no Battle Ready/traits.
   a.energy=Math.max(0,a.energy-(r.azure?1:2));a.nextTick+=r.tickSeconds;
  }
  const due=actors.map(a=>a.active&&a.nextAttack<=t+1e-8);
  const additions=[0,0];
  actors.forEach((a,i)=>{
   if(!due[i])return;
   const d=actors[1-i];a.attacks++;a.nextAttack+=a.interval;
   additions[i]+=a.cost*(1-a.miss);
   if(t>=d.lastParry+r.parryCooldown-1e-8){
    d.lastParry=t;const expected=(1-a.miss)*a.contact*d.parryChance/100;
    additions[1-i]+=expected*d.parryCost;d.parries+=expected;
   }
  });
  additions.forEach((cost,i)=>{if(cost>0){const a=actors[i];a.fatigue+=cost;a.energy=Math.max(0,a.energy-cost);a.lastSpend=t;if(a.fatigue>=a.pool&&a.time===null)a.time=t;}});
  if(actors.some(a=>a.time!==null))break;
 }
 return {yourTime:actors[0].time??Infinity,enemyTime:actors[1].time??Infinity,
  yourFatigue:Math.min(100,actors[0].fatigue/actors[0].pool*100),enemyFatigue:Math.min(100,actors[1].fatigue/actors[1].pool*100),
  yourParryCost:you.parryCost,enemyParryCost:enemy.parryCost,horizon};
}
