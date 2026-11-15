import {classSkill, estimate} from './combat.mjs?v=combat-1';
const $=id=>document.getElementById(id);
let state=null,key='',activeWeapon='';
const rank=['None','Novice','Apprentice','Journeyman','Expert','Master','Legendary'];
const num=(id,min,max)=>Math.min(max,Math.max(min,Number($(id).value)||0));
function options(el,items){el.replaceChildren(...items.map(x=>new Option(x.name,x.id)));}
export function initCombat(){
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
 if(skill===null||athletics===null){$('combat-warning').textContent='This class has no imported skill list. Set weapon skill and athletics manually.';$('combat-metrics').replaceChildren();return;}
 const scenario=$('combat-scenario').value;
 const vectors=rows.map(row=>scenario==='base'?row.base:row.buffs[Number(scenario)]);
 const ranged=vectors.some(v=>v[0]!==v[1]);
 const enemy={speed:num('combat-enemy-speed',1,20),perception:num('combat-enemy-perception',1,20),intelligence:num('combat-enemy-intelligence',1,20)};
 const opt={two,enemy,energy:num('combat-energy',0,100),light:$('combat-light').checked,trained:$('combat-trained').checked,enemySwift:$('combat-enemy-swift').checked,enemyLight:$('combat-enemy-light').checked,zone:$('combat-zone').value,old:age.id==='old',mage:$('combat-mage').checked};
 // Enumerate actual integer combinations, not just both range endpoints: parry is not monotonic in all stats.
 const relevant=['strength','willpower','speed','perception','intelligence'];
 const dimensions=relevant.map(stat=>{const i=rows.findIndex(x=>x.stat===stat);const [lo,hi]=vectors[i].map(v=>Math.min(20,Math.max(1,v)));return Array.from({length:Math.max(1,hi-lo+1)},(_,j)=>lo+j);});
 const results=[];
 function each(index,stats){if(index===relevant.length){results.push(estimate(stats,weapon,intent,skill,athletics,num('combat-enemy-skill',0,6),opt,r));return;}for(const v of dimensions[index])each(index+1,{...stats,[relevant[index]]:v});}
 each(0,{});
 const fmt=(n,d=1)=>Number.isFinite(n)?n.toLocaleString(undefined,{maximumFractionDigits:d}):'Unlimited';
 const value=(field,d=1)=>{const vals=results.map(x=>x[field]);const lo=Math.min(...vals),hi=Math.max(...vals);return lo===hi?fmt(lo,d):`${fmt(lo,d)}–${fmt(hi,d)}`;};
 const metrics=[['dps','Raw DPS',1],['hit','Raw damage / hit',0],['chance','Parry roll %',1],['pool','Stamina / fatigue pool',1],['energy','Maximum energy',0],['regen',`Recovery / eligible ${r.tickSeconds}s tick`,0],['interval','Attack interval (s)',2],['attacks','Fresh attacks before exhaustion¹',0]];
 $('combat-metrics').replaceChildren();
 for(const [field,label,d] of metrics){const card=document.createElement('div');card.className='combat-metric';const strong=document.createElement('strong');strong.textContent=value(field,d)+(field==='chance'?'%':'');const small=document.createElement('span');small.textContent=label;card.append(strong,small);$('combat-metrics').append(card);}
 if(ranged)warn.push('Random stats: ranges show all integer rolls; results are not a single predicted character.');
 if(!job.skillsKnown)warn.push('Manual skills required.');
 const strMin=dimensions[0][0];if(strMin<(two?Math.max(1,weapon.minstr/2):weapon.minstr))warn.push('Minimum STR not met for some/all rolls: source damage penalty applied.');
 $('combat-warning').textContent=warn.join(' ');
 const first=results[0];
 $('combat-explanation').textContent=`${weapon.name} • ${intent.name} • skill ${skill} • WDEF ${weapon.wdefense+(two?weapon.wdefense_wbonus:0)}. Swift penalty: ${value('penalty')} percentage points; old-age bonus: ${first.oldBonus}. Regen starts after >2s without spending stamina. ¹ ${intent.releasedrain} fatigue/attack; no regen while continuously attacking. Recovery also resets the fatigue timestamp; the >2s delay applies before another recovery update. Stats clamped to in-game 1–20. Combat controls are local; shared links retain character stats, not combat settings.`;
 $('combat-sources').replaceChildren();
 for(const [label,url] of Object.entries({...data.combat.sources,Weapon:weapon.source,Intent:intent.source,Class:job.source})){const a=document.createElement('a');a.href=url;a.textContent=label;a.target='_blank';a.rel='noopener noreferrer';$('combat-sources').append(a,document.createTextNode(' · '));}
}
