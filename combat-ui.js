import {classSkill, estimate, parry, stamina} from './combat.mjs?v=targeting-1';
import {ZONES,zoneOf,zoneType,accuracy,stanceAttack,parryDrain,criticalMiss,versusTarget,fatigueRace} from './targeting.mjs?v=targeting-1';
const $=id=>document.getElementById(id);
let state=null,key='',activeWeapon='',enemyIntentKey='';
const rank=['None','Novice','Apprentice','Journeyman','Expert','Master','Legendary'];
const num=(id,min,max)=>Math.min(max,Math.max(min,Number($(id).value)||0));
function options(el,items){el.replaceChildren(...items.map(x=>new Option(x.name,x.id)));}
export function initCombat(){
 options($('opponent-zone'),ZONES);
 for(const id of ['combat-skill','combat-athletics']){
  $(id).add(new Option('Class default','auto'));
  rank.forEach((name,i)=>$(id).add(new Option(`${i} - ${name}`,String(i))));
 }
 $('stats-tab').addEventListener('click',()=>tab(false));
 $('combat-tab').addEventListener('click',()=>tab(true));
 for(const el of $('combat-view').querySelectorAll('input,select'))el.addEventListener('input',()=>draw());
}
function tab(combat){
 $('stats-view').hidden=combat;$('combat-view').hidden=!combat;
 $('stats-tab').setAttribute('aria-pressed',String(!combat));$('combat-tab').setAttribute('aria-pressed',String(combat));
}
export function renderCombat(data,job,rows,age){
 state={data,job,rows,age};
 if(!data.combat){$('combat-tab').disabled=true;tab(false);return;}
 $('combat-tab').disabled=false;
 const nextKey=data.repository+'|'+job.id;
 if(key!==nextKey){
  const sameBuild=key.split('|')[0]===data.repository;
  const prior=$('combat-weapon').value;
  options($('combat-weapon'),data.combat.weapons);
  if(sameBuild&&data.combat.weapons.some(w=>w.id===prior))$('combat-weapon').value=prior;
  $('combat-skill').value='auto';$('combat-athletics').value='auto';
  const previousArmor=$('opponent-armor').value,previousEnemy=$('opponent-weapon').value;
  options($('opponent-armor'),[{id:'none',name:'No armor'},...data.combat.armors]);
  options($('opponent-weapon'),data.combat.weapons);
  if(sameBuild&&data.combat.armors.some(a=>a.id===previousArmor))$('opponent-armor').value=previousArmor;
  else $('opponent-armor').value=data.combat.armors[0]?.id||'none';
  if(sameBuild&&data.combat.weapons.some(w=>w.id===previousEnemy))$('opponent-weapon').value=previousEnemy;
  activeWeapon='';key=nextKey;
 }
 draw();
}
function draw(){
 if(!state?.data.combat)return;
 const {data,job,rows,age}=state,{weapons,rules:r}=data.combat;
 const weapon=weapons.find(w=>w.id===$('combat-weapon').value)||weapons[0];
 const twoAllowed=!!weapon.intents.two.length,oneAllowed=!!weapon.intents.one.length;
 $('combat-grip').options[0].disabled=!oneAllowed;$('combat-grip').options[1].disabled=!twoAllowed;
 if(!oneAllowed)$('combat-grip').value='two';else if(!twoAllowed)$('combat-grip').value='one';
 const two=$('combat-grip').value==='two',intentKey=weapon.id+'|'+two;
 if(activeWeapon!==intentKey){options($('combat-intent'),weapon.intents[two?'two':'one']);activeWeapon=intentKey;}
 const intent=weapon.intents[two?'two':'one'].find(x=>x.id===$('combat-intent').value);
 if(!intent)return;
 const defaultSkill=classSkill(job,weapon,r);
 const skill=$('combat-skill').value==='auto'?defaultSkill:Number($('combat-skill').value);
 const athletics=$('combat-athletics').value==='auto'?(job.skillsKnown?(job.skills['/datum/skill/misc/athletics']||0):null):Number($('combat-athletics').value);
 const autoText=defaultSkill===null?'Class default (unknown)':`Class: ${defaultSkill} ${rank[defaultSkill]||'effective'}`;
 $('combat-skill').options[0].text=autoText;
 $('combat-athletics').options[0].text=athletics===null?'Class default (unknown)':`Class: ${job.skills['/datum/skill/misc/athletics']||0}`;
 const warn=[];
 if(skill===null||athletics===null){$('combat-warning').textContent='This class has no imported skill list. Set weapon skill and athletics manually.';$('combat-metrics').replaceChildren();$('opponent-metrics').replaceChildren();$('target-rows').replaceChildren();$('fatigue-metrics').replaceChildren();$('fatigue-verdict').textContent='Set manual skills to run the fatigue comparison.';return;}
 const scenario=$('combat-scenario').value;
 const vectors=rows.map(row=>scenario==='base'?row.base:row.buffs[Number(scenario)]);
 const ranged=vectors.some(v=>v[0]!==v[1]);
 const enemy={speed:num('combat-enemy-speed',1,20),perception:num('combat-enemy-perception',1,20),intelligence:num('combat-enemy-intelligence',1,20)};
 const opt={two,enemy,energy:num('combat-energy',0,100),light:$('combat-light').checked,trained:$('combat-trained').checked,enemySwift:data.combat.weapons.find(w=>w.id===$('opponent-weapon').value)?.wbalance===1,enemyLight:$('combat-enemy-light').checked,zone:$('combat-zone').value,old:age.id==='old',mage:$('combat-mage').checked};
 // Enumerate actual integer combinations, not just both range endpoints: parry is not monotonic in all stats.
 const relevant=['strength','willpower','speed','perception','intelligence'];
 const dimensions=relevant.map(stat=>{const i=rows.findIndex(x=>x.stat===stat);const [lo,hi]=vectors[i].map(v=>Math.min(20,Math.max(1,v)));return Array.from({length:Math.max(1,hi-lo+1)},(_,j)=>lo+j);});
 const results=[],opponentResults=[];
 const armor=data.combat.armors.find(a=>a.id===$('opponent-armor').value)||null;
 const condition=num('opponent-condition',0,100);
 const enemyWeapon=weapons.find(w=>w.id===$('opponent-weapon').value)||weapons[0];
 $('opponent-grip').options[0].disabled=!enemyWeapon.intents.one.length;
 $('opponent-grip').options[1].disabled=!enemyWeapon.intents.two.length;
 if(!enemyWeapon.intents.one.length)$('opponent-grip').value='two';
 else if(!enemyWeapon.intents.two.length)$('opponent-grip').value='one';
 const enemyTwo=$('opponent-grip').value==='two';
 const enemySkill=num('combat-enemy-skill',0,6);
 const enemyStats={...enemy,strength:num('opponent-str',1,20),willpower:num('enemy-will',1,20),fortune:num('enemy-fortune',1,20)};
 const selectedZone=$('opponent-zone').value,stance=$('combat-stance').value;
 const enemyStance=$('enemy-stance').value;
 const eiKey=enemyWeapon.id+'|'+enemyTwo;
 if(enemyIntentKey!==eiKey){options($('enemy-intent'),enemyWeapon.intents[enemyTwo?'two':'one']);enemyIntentKey=eiKey;}
 const enemyIntent=enemyWeapon.intents[enemyTwo?'two':'one'].find(x=>x.id===$('enemy-intent').value);
 const enemyOptions={light:opt.enemyLight,enemyLight:opt.light,old:$('opponent-age').value==='old',mage:$('opponent-mage').checked,trained:$('opponent-trained').checked};
 const fortuneRow=rows.findIndex(x=>x.stat==='fortune');
 const fortuneBounds=vectors[fortuneRow].map(v=>Math.min(20,Math.max(1,v)));
 const yourOptions={...opt,enemySwift:enemyWeapon.wbalance===1};
 let nominal=null;

 function each(index,stats){if(index===relevant.length){
  const base=estimate(stats,weapon,intent,skill,athletics,enemySkill,yourOptions,r);
  const attack=stanceAttack(stats,weapon,intent,two,stance,r);
  const raw={...base,...attack,attacks:attack.cost>0?Math.max(0,Math.ceil(base.pool/attack.cost)-1):Infinity};
  results.push(raw);
  for(const fortune of [...new Set(fortuneBounds)]){
   opponentResults.push({...versusTarget({...stats,fortune},weapon,intent,skill,stance,two,enemyStats,enemyWeapon,enemyTwo,enemySkill,selectedZone,armor,condition,num('opponent-contact',0,100)/100,enemyOptions,r),yourParry:base.chance});
  }
  return;
 }for(const v of dimensions[index])each(index+1,{...stats,[relevant[index]]:v});}
 each(0,{});
 const midStats=Object.fromEntries(relevant.map((name,i)=>[name,dimensions[i][Math.floor((dimensions[i].length-1)/2)]]));
 midStats.fortune=Math.floor((fortuneBounds[0]+fortuneBounds[1])/2);
 nominal=versusTarget(midStats,weapon,intent,skill,stance,two,enemyStats,enemyWeapon,enemyTwo,enemySkill,selectedZone,armor,condition,num('opponent-contact',0,100)/100,enemyOptions,r);
 const rawNominal=stanceAttack(midStats,weapon,intent,two,stance,r);
 const enemyAttack=stanceAttack(enemyStats,enemyWeapon,enemyIntent,enemyTwo,enemyStance,r);
 const youParry=parry(midStats,enemyStats,weapon,two,skill,enemySkill,yourOptions,r).chance;
 const yourStamina=stamina(midStats.willpower,athletics,opt.energy,r);
 const theirStamina=stamina(enemyStats.willpower,num('enemy-athletics',0,6),num('enemy-energy',0,100),r);
 const you={...rawNominal,pool:yourStamina.pool,maxEnergy:yourStamina.energy,startFatigue:num('your-fatigue',0,99),energyPercent:opt.energy,
  active:accuracy(midStats,weapon,intent,skill,selectedZone,stance,r).reachable,miss:criticalMiss(midStats),contact:num('opponent-contact',0,100)/100,
  parryChance:youParry,parryCost:parryDrain(enemyStats,midStats,enemyWeapon,opt.trained,r)};
 const them={...enemyAttack,pool:theirStamina.pool,maxEnergy:theirStamina.energy,startFatigue:num('enemy-fatigue',0,99),energyPercent:num('enemy-energy',0,100),
  active:$('enemy-behavior').value==='attack',miss:criticalMiss(enemyStats),contact:1,parryChance:nominal.enemyParry,
  parryCost:parryDrain(midStats,enemyStats,weapon,enemyOptions.trained,r)};
 const race=fatigueRace(you,them,r);
 const fmt=(n,d=1)=>Number.isFinite(n)?n.toLocaleString(undefined,{maximumFractionDigits:d}):'Never';
 const value=(field,d=1)=>{const vals=results.map(x=>x[field]);const lo=Math.min(...vals),hi=Math.max(...vals);return lo===hi?fmt(lo,d):`${fmt(lo,d)}–${fmt(hi,d)}`;};
 const metrics=[['dps','Raw DPS',1],['hit','Raw damage / hit',0],['pool','Stamina / fatigue pool',1],['energy','Maximum energy',0],['regen',`Recovery / eligible ${r.tickSeconds}s tick`,0],['interval','Attack interval (s)',2],['attacks','Fresh attacks before exhaustion¹',0]];
 $('combat-metrics').replaceChildren();
 for(const [field,label,d] of metrics){const card=document.createElement('div');card.className='combat-metric';const strong=document.createElement('strong');strong.textContent=value(field,d)+(field==='chance'?'%':'');const small=document.createElement('span');small.textContent=label;card.append(strong,small);$('combat-metrics').append(card);}
 $('opponent-metrics').replaceChildren();
 const opponentMetrics=[['healthDps','HP DPS while armor intact',1],['healthHit','HP damage / landed hit',1],['yourParry','Your parry vs enemy (%)',1],['enemyParry','Enemy eligible parry roll (%)',1],['effectiveParry','Enemy parry after cooldown (%)',1],['exactLandedPercent','Selected part / swing (%)',1],['armorWear','Armor wear / landed hit',1],['armorDps','Expected armor wear / second',1],['breakHits','Landed hits to armor break',0],['breakSeconds','Expected seconds to armor break',1]];
 for(const [field,label,d] of opponentMetrics){
  const vals=opponentResults.map(x=>x[field]);const lo=Math.min(...vals),hi=Math.max(...vals);
  const card=document.createElement('div');card.className='combat-metric';
  const strong=document.createElement('strong');strong.textContent=(lo===hi?fmt(lo,d):`${fmt(lo,d)}–${fmt(hi,d)}`)+(['yourParry','enemyParry','effectiveParry','exactLandedPercent'].includes(field)?'%':'');
  const small=document.createElement('span');small.textContent=label;card.append(strong,small);$('opponent-metrics').append(card);
 }
 $('target-rows').replaceChildren();
 const perIndex=relevant.indexOf('perception');
 for(const zone of ZONES){
  const opts=Array.from(dimensions[perIndex],perception=>accuracy({...midStats,perception},weapon,intent,skill,zone.id,stance,r));
  const pct=field=>{const ns=opts.map(x=>x[field]*100),lo=Math.min(...ns),hi=Math.max(...ns);return lo===hi?fmt(lo)+'%':fmt(lo)+'–'+fmt(hi)+'%';};
  const tr=document.createElement('tr');if(zone.id===selectedZone)tr.className='selected';
  for(const text of [zone.name,opts[0].reachable?'Yes':'No',pct('exact'),pct('parent'),pct('chest')]){const td=document.createElement('td');td.textContent=text;tr.append(td);}
  $('target-rows').append(tr);
 }
 $('fatigue-metrics').replaceChildren();
 const fatigueFields=[['Your fatigue cost / enemy parry',you.parryCost],['Enemy fatigue cost / your parry',them.parryCost],['Your fatigue % at first exhaustion / limit',race.yourFatigue],['Enemy fatigue % at first exhaustion / limit',race.enemyFatigue]];
 for(const [label,value] of fatigueFields){const card=document.createElement('div');card.className='combat-metric';const strong=document.createElement('strong');strong.textContent=fmt(value);const span=document.createElement('span');span.textContent=label;card.append(strong,span);$('fatigue-metrics').append(card);}
 let verdict='Neither reaches exhaustion within 180s.';
 if(Number.isFinite(race.enemyTime)&&Number.isFinite(race.yourTime))verdict=`Both reach expected exhaustion at about ${fmt(Math.min(race.enemyTime,race.yourTime))}s.`;
 else if(Number.isFinite(race.enemyTime))verdict=`Enemy reaches expected exhaustion first at about ${fmt(race.enemyTime)}s; you have ${fmt(100-race.yourFatigue)}% fatigue budget left.`;
 else if(Number.isFinite(race.yourTime))verdict=`You reach expected exhaustion first at about ${fmt(race.yourTime)}s; enemy has ${fmt(100-race.enemyFatigue)}% fatigue budget left.`;
 $('fatigue-verdict').textContent=verdict+' Expected-fatigue scenario, not a win probability. Includes attack costs, successful-parry costs, heavy STR-gap drain, 1.2s parry cooldown, mob recovery ticks and energy spend. No HP death, injuries, tempo, special traits or weapon breakage. Stops at the first expected exhaustion; further recovery is not simulated.'+(ranged?' Random statpack: stamina race uses lower-middle integer stats; DPS/accuracy show ranges.':'');
 const balanceName=w=>w.wbalance===1?'swift':w.wbalance===-1?'heavy':'normal';
 $('opponent-note').textContent=`Target: ${zoneOf(selectedZone).name}. Your ${weapon.name}: ${balanceName(weapon)} balance; enemy ${enemyWeapon.name}: ${balanceName(enemyWeapon)} balance. Armor: ${armor?armor.name:'none'}, ${condition}% condition. Accuracy fallback is routed to its actual bodypart for coverage; unprotected parts are not treated as wearing chest armor. Contact after fortune and cooldown-adjusted parry: ${nominal.landPercent.toFixed(1)}%. The armor card tracks the selected piece only, without underlayers. Fixed-sharpness break-time estimate does not include fatigue pauses; see the separate stamina race. Enemy stats are final values.`;
 if(!nominal.aimed.reachable)warn.push('Selected body part is unreachable with this weapon while both characters stand. Choose a long/great weapon for feet.');
 if(ranged)warn.push('Random stats: ranges show all integer rolls; results are not a single predicted character.');
 if(!job.skillsKnown)warn.push('Manual skills required.');
 const strMin=dimensions[0][0];if(strMin<(two?Math.max(1,weapon.minstr/2):weapon.minstr))warn.push('Minimum STR not met for some/all rolls: source damage penalty applied.');
 $('combat-warning').textContent=warn.join(' ');
 const first=results[0];
 $('combat-explanation').textContent=`Weapon skill ${skill}; WDEF ${weapon.wdefense+(two?weapon.wdefense_wbonus:0)}; ${stance} stance; ${rawNominal.cost} fatigue per swing that passes the critical-miss check. Swift/heavy weapon balance is distinct from swift/strong attack stance. Poor fortune can cause true misses; failed precision rolls instead redirect to parent limb or chest. Eligible parry is a roll chance; effective parry also accounts for the normal cooldown at this cadence. Normal player-like opponents, standing and conscious. Shared links retain character stats, not combat controls.`;
 $('combat-sources').replaceChildren();
 for(const [label,url] of Object.entries({...data.combat.sources,Weapon:weapon.source,Intent:intent.source,Class:job.source,...(armor?{'Enemy armor':armor.source}:{})})){const a=document.createElement('a');a.href=url;a.textContent=label;a.target='_blank';a.rel='noopener noreferrer';$('combat-sources').append(a,document.createTextNode(' · '));}
}
