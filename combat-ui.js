import {classSkill, stamina} from './combat.mjs?v=armor-catalog-1';
import {ZONES,zoneOf,accuracy,stanceAttack,criticalMiss,attackMatch,fatigueRace} from './targeting.mjs?v=armor-catalog-1';
const $=id=>document.getElementById(id);
let state=null,key='',activeWeapon='',enemyIntentKey='';
const sides=['your','enemy'];
const defaultEnemyArmor='/obj/item/clothing/suit/roguetown/armor/plate';
const none={id:'none',name:'None'};
const balance=w=>w.wbalance===1?'swift':w.wbalance===-1?'heavy':'normal';
const rank=['None','Novice','Apprentice','Journeyman','Expert','Master','Legendary'];
const num=(id,min,max)=>Math.min(max,Math.max(min,Number($(id).value)||0));
function options(el,items){el.replaceChildren(...items.map(x=>new Option(x.name,x.id)));}
export function initCombat(){
 options($('opponent-zone'),ZONES);options($('combat-zone'),ZONES);
 for(const id of ['combat-skill','combat-athletics']){
  $(id).add(new Option('Class default','auto'));
  rank.forEach((name,i)=>$(id).add(new Option(`${i} - ${name}`,String(i))));
 }
 $('stats-tab').addEventListener('click',()=>tab(false));
 $('combat-tab').addEventListener('click',()=>tab(true));
 $('combat-view').addEventListener('input',event=>{
  const side=sides.find(side=>event.target.id===`${side}-armor-filter`);
  if(side)refreshArmorOptions(side);
  else draw();
 });
}
function tab(combat){
 $('stats-view').hidden=combat;$('combat-view').hidden=!combat;
 $('stats-tab').setAttribute('aria-pressed',String(!combat));$('combat-tab').setAttribute('aria-pressed',String(combat));
}
function refreshArmorOptions(side){
 const {armors,armorSlots}=state.data.combat;
 const query=$(`${side}-armor-filter`).value.trim().toLowerCase();
 for(const {id} of armorSlots){
  const el=$(`${side}-${id}`),selected=el.value||'none';
  const items=armors.filter(a=>a.slots.includes(id));
  const counts=new Map();for(const a of items)counts.set(a.name,(counts.get(a.name)||0)+1);
  items.sort((a,b)=>a.name.localeCompare(b.name)||a.id.localeCompare(b.id));
  options(el,[none,...items.filter(a=>a.id===selected||`${a.name} ${a.id}`.toLowerCase().includes(query)).map(a=>({id:a.id,
    name:counts.get(a.name)>1?`${a.name} — ${a.id.split('/').slice(-3).join('/')}`:a.name}))]);
  el.value=Array.from(el.options).some(o=>o.value===selected)?selected:'none';
 }
}
function buildArmorControls(side,previous){
 const parent=$(`${side}-armor-controls`), slots=state.data.combat.armorSlots;
 parent.replaceChildren(...slots.map(({id,name})=>{
  const before=previous.get(id), selected=before?.selected||(side==='enemy'&&id==='body'?defaultEnemyArmor:'none');
  const div=document.createElement('div');div.className='combat-controls';
  const slot=document.createElement('label'), condition=document.createElement('label');slot.textContent=name;condition.textContent='Condition (%)';
  const select=document.createElement('select');select.id=`${side}-${id}`;select.add(new Option('',selected));slot.append(select);
  const input=document.createElement('input');input.type='number';input.id=`${side}-${id}-condition`;input.min=0;input.max=100;input.value=before?.condition??100;condition.append(input);
  div.append(slot,condition);return div;
 }));
 refreshArmorOptions(side);
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
  const refresh=(id,items,fallback)=>{const prior=$(id).value;options($(id),items);if(items.some(x=>x.id===prior))$(id).value=prior;else if(fallback)$(id).value=fallback;};
  refresh('opponent-weapon',data.combat.weapons);
  for(const side of sides){
   refresh(`${side}-shield`,[none,...data.combat.shields]);
   const previous=new Map([...$(`${side}-armor-controls`).querySelectorAll('select')].map(el=>[el.id.slice(side.length+1),{selected:el.value,condition:$(`${el.id}-condition`).value}]));
   buildArmorControls(side,previous);
  }
  enemyIntentKey='';
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
 const clear=['combat-metrics','opponent-metrics','armor-results','target-rows','fatigue-metrics'];
 if(skill===null||athletics===null){clear.forEach(id=>$(id).replaceChildren());$('combat-warning').textContent='This class has no imported skill list. Set weapon skill and athletics manually.';$('fatigue-verdict').textContent='';$('opponent-note').textContent='';$('combat-explanation').textContent='';$('your-combat-stats').textContent='';return;}
 const scenario=$('combat-scenario').value;
 const dims=Object.fromEntries(rows.map(row=>[row.stat,(scenario==='base'?row.base:row.buffs[Number(scenario)]).map(v=>Math.min(20,Math.max(1,v)))]));
 const ranged=Object.values(dims).some(([a,b])=>a!==b);
 const mid=Object.fromEntries(Object.entries(dims).map(([k,[lo,hi]])=>[k,Math.floor((lo+hi)/2)]));
 const enemyWeapon=weapons.find(w=>w.id===$('opponent-weapon').value)||weapons[0];
 const enemyGrip=$('opponent-grip');
 enemyGrip.options[0].disabled=!enemyWeapon.intents.one.length;enemyGrip.options[1].disabled=!enemyWeapon.intents.two.length;
 if(!enemyWeapon.intents.one.length)enemyGrip.value='two';else if(!enemyWeapon.intents.two.length)enemyGrip.value='one';
 const enemyTwo=enemyGrip.value==='two';
 const eiKey=enemyWeapon.id+'|'+enemyTwo;
 if(enemyIntentKey!==eiKey){options($('enemy-intent'),enemyWeapon.intents[enemyTwo?'two':'one']);enemyIntentKey=eiKey;}
 const enemyIntent=enemyWeapon.intents[enemyTwo?'two':'one'].find(x=>x.id===$('enemy-intent').value);
 const enemyStats={strength:num('opponent-str',1,20),speed:num('combat-enemy-speed',1,20),perception:num('combat-enemy-perception',1,20),intelligence:num('combat-enemy-intelligence',1,20),willpower:num('enemy-will',1,20),fortune:num('enemy-fortune',1,20),constitution:num('enemy-con',1,20)};
 const enemySkill=num('combat-enemy-skill',0,6);
 function loadout(side,two,old){
  const gear=data.combat.armorSlots.flatMap(({id:slot})=>{const el=$(`${side}-${slot}`);const item=data.combat.armors.find(a=>a.id===el.value);const condition=$(`${side}-${slot}-condition`);condition.disabled=!item;return item?[{item:{...item,slot},condition:num(condition.id,0,100)}]:[];});
  const shieldSelect=$(`${side}-shield`);shieldSelect.disabled=two;
  const shield=!two?data.combat.shields.find(x=>x.id===shieldSelect.value):null;
  $(`${side}-shield-skill`).disabled=!shield||shield.buckler;
  const trained=$(side==='your'?'combat-trained':'opponent-trained').checked;
  const mode=$(`${side}-mode`).value;
  $(`${side}-match-skill`).disabled=mode!=='dodge';
  const light=gear.every(({item})=>!(['body','shirt','legs'].includes(item.slot)||(r.azure&&item.slot==='head'&&!trained))||item.armorClass<=r.lightArmorClass);
  return {gear,opts:{mode,light,trained,old,mage:$(side==='your'?'combat-mage':'opponent-mage').checked,expert:$(`${side}-expert`).checked,shield,shieldSkill:num(`${side}-shield-skill`,0,6),matchSkill:num(`${side}-match-skill`,0,6)}};
 }
 const you={...loadout('your',two,age.id==='old'),stats:mid,weapon,intent,two,skill,zone:$('opponent-zone').value,stance:'defend',contact:num('opponent-contact',0,100)/100};
 const them={...loadout('enemy',enemyTwo,$('opponent-age').value==='old'),stats:enemyStats,weapon:enemyWeapon,intent:enemyIntent,two:enemyTwo,skill:enemySkill,zone:$('combat-zone').value,stance:'defend',contact:num('enemy-contact',0,100)/100};
 const enemyActive=$('enemy-behavior').value==='attack';
 const outgoing=attackMatch(you,them,r),incoming=attackMatch(them,you,r);
 const fmt=(n,d=1)=>Number.isFinite(n)?n.toLocaleString(undefined,{maximumFractionDigits:d}):'Never';
 const span=(lo,hi)=>lo===hi?fmt(lo):`${fmt(lo)}–${fmt(hi)}`;
 const codes={strength:'STR',speed:'SPD',perception:'PER',intelligence:'INT',willpower:'WIL',constitution:'CON',fortune:'LCK'};
 $('your-combat-stats').textContent=Object.entries(codes).map(([k,v])=>`${v} ${span(...dims[k])}`).join(' · ');
 for(const [side,actor] of [['your',you],['enemy',them]]){
  $(`${side}-balance`).textContent=`Weapon balance: ${balance(actor.weapon)}${actor.opts.shield?' · '+actor.opts.shield.name+' equipped':''}.`;
  if(actor.opts.mode==='dodge'&&!actor.opts.trained)warn.push(`${side==='your'?'You cannot':'Enemy cannot'} dodge in untrained armor.`);
 }
 if(!outgoing.aim.reachable||enemyActive&&!incoming.aim.reachable)warn.push('An attack target is outside the weapon’s standing reach. Short and normal weapons cannot target feet.');
 if(ranged)warn.push('Random statpack: matchup and stamina race use integer midpoint stats; the aiming table and clean DPS show ranges.');
 const ourStam=stamina(mid.willpower,athletics,num('combat-energy',0,100),r);
 const theirStam=stamina(enemyStats.willpower,num('enemy-athletics',0,6),num('enemy-energy',0,100),r);
 const actor=(profile,attack,budget,active,energyId,fatigueId)=>({...attack,profile,pool:budget.pool,maxEnergy:budget.energy,startFatigue:num(fatigueId,0,99),energyPercent:num(energyId,0,100),active:active&&attack.aim.reachable,miss:criticalMiss(profile.stats),contact:profile.contact});
 const race=fatigueRace(actor(you,outgoing,ourStam,true,'combat-energy','your-fatigue'),actor(them,incoming,theirStam,enemyActive,'enemy-energy','enemy-fatigue'),r);
 function cards(id,entries){
  $(id).replaceChildren(...entries.map(([label,value])=>{const card=document.createElement('div');card.className='combat-metric';const s=document.createElement('strong'),l=document.createElement('span');s.textContent=value;l.textContent=label;card.append(s,l);return card;}));
 }
 const clean=dims.strength.map(strength=>stanceAttack({...mid,strength},weapon,intent,two,'defend',r));
 cards('combat-metrics',[
  ['Raw DPS',span(...clean.map(x=>x.dps))],['Raw damage / hit',span(...clean.map(x=>x.hit))],['Swing interval',`${fmt(outgoing.interval,2)} s`],['Your stamina pool',fmt(ourStam.pool)],['Enemy stamina pool',fmt(theirStam.pool)],['Your fatigue / swing',fmt(outgoing.cost)],['Enemy fatigue / swing',fmt(incoming.cost)],['Your recovery / eligible tick',fmt(ourStam.regen)]]);
 const modeName=x=>x.opts.mode==='dodge'?'dodge':'block / parry';
 cards('opponent-metrics',[
  ['Your HP DPS vs enemy',fmt(outgoing.healthDps)],['Enemy HP DPS vs you',enemyActive?fmt(incoming.healthDps):'0 · defend only'],
  [`Your opening ${modeName(you)}`,fmt(incoming.defense.chance)+'%'],[`Enemy opening ${modeName(them)}`,fmt(outgoing.defense.chance)+'%'],
  ['Your exact target / swing',fmt(outgoing.exactLandedPercent)+'%'],['Enemy exact target / swing',enemyActive?fmt(incoming.exactLandedPercent)+'%':'—']]);
 $('opponent-note').textContent='Opening matchup values, with selected armor intact at its starting condition. Dodge chance changes during the stamina race. Blocking uses the stronger eligible hand; shields are unavailable in two-handed grip.';
 const armorResult=(parts,title,active)=>{const section=document.createElement('section');section.className='armor-result';const h=document.createElement('h3');h.textContent=title;section.append(h);const list=document.createElement('ul');section.append(list);
  if(!parts.length){const li=document.createElement('li');li.textContent='No armor equipped';list.append(li);}
  for(const x of parts){const li=document.createElement('li');li.textContent=`${x.item.name} · ${!active?'no incoming attacks':x.breakTime===0?'already broken':`${fmt(x.wearRate)} wear/s · ${Number.isFinite(x.breakTime)?`~${fmt(x.breakTime)} s to break`:'no break at opening rate'}`}`;list.append(li);}return section;};
 $('armor-results').replaceChildren(armorResult(incoming.pieces,'Your armor',enemyActive),armorResult(outgoing.pieces,'Enemy armor',true));
 $('target-rows').replaceChildren(...ZONES.map(zone=>{
  const values=Array.from({length:dims.perception[1]-dims.perception[0]+1},(_,i)=>accuracy({...mid,perception:dims.perception[0]+i},weapon,intent,skill,zone.id,'defend',r));
  const pct=k=>span(Math.min(...values.map(x=>x[k]*100)),Math.max(...values.map(x=>x[k]*100)))+'%';
  const tr=document.createElement('tr');if(zone.id===you.zone)tr.className='selected';
  for(const text of [zone.name,values[0].reachable?'Yes':'No',pct('exact'),pct('parent'),pct('chest')]){const td=document.createElement('td');td.textContent=text;tr.append(td);}return tr;
 }));
 cards('fatigue-metrics',[
  [`Your fatigue / opening ${modeName(you)}`,fmt(incoming.defense.cost)], [`Enemy fatigue / opening ${modeName(them)}`,fmt(outgoing.defense.cost)],
  ['Your cumulative defense fatigue',fmt(race.yourDefSpend)],['Enemy cumulative defense fatigue',fmt(race.enemyDefSpend)],
  ['Your fatigue at first exhaustion / limit',fmt(race.yourFatigue)+'%'],['Enemy fatigue at first exhaustion / limit',fmt(race.enemyFatigue)+'%']]);
 const verdict=Number.isFinite(race.yourTime)&&Number.isFinite(race.enemyTime)?`Both reach expected exhaustion at ${fmt(race.yourTime)} s.`:Number.isFinite(race.yourTime)?`You exhaust first at about ${fmt(race.yourTime)} s.`:Number.isFinite(race.enemyTime)?`Enemy exhausts first at about ${fmt(race.enemyTime)} s.`:'Neither reaches expected exhaustion within 180 s.';
 $('fatigue-verdict').textContent=verdict+' This estimates stamina pressure, not who wins the duel. Heavy STR advantage raises block cost. Swift balance changes defense odds, and repeated dodges can change their own odds and cadence. Costs apply on successful rolls.';
 $('combat-warning').textContent=warn.join(' ');
 $('combat-explanation').textContent=`Defense equipment: ${you.opts.mode==='dodge'?'you dodge':incoming.defense.usesShield?'you block with your shield':'you parry with your main weapon'}; ${them.opts.mode==='dodge'?'enemy dodges':outgoing.defense.usesShield?'enemy blocks with their shield':'enemy parries with their main weapon'}. Both use Defend, not the active Guard special. Enemy CON is informational in this stamina-only race; HP depletion does not end it.`;
 $('combat-sources').replaceChildren();
 for(const [label,url] of Object.entries({...data.combat.sources,'Your weapon':weapon.source,'Enemy weapon':enemyWeapon.source,'Your attack':intent.source,'Enemy attack':enemyIntent.source,...Object.fromEntries([...you.gear,...them.gear].map(({item})=>[item.name,item.source]))})){const a=document.createElement('a');a.href=url;a.textContent=label;a.target='_blank';a.rel='noopener noreferrer';$('combat-sources').append(a,document.createTextNode(' · '));}
}
