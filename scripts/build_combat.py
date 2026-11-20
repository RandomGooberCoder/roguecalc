"""Append source-derived melee combat data to a stat snapshot."""
import ast
import json
from pathlib import Path
import re
import subprocess
import sys
from build_data import strip_comments, list_body


def build(root, snapshot):
    def read(path):
        return subprocess.check_output(['git', '-C', str(root), 'show', 'HEAD:' + path], text=True)
    files = subprocess.check_output(['git', '-C', str(root), 'ls-tree', '-r', '--name-only', 'HEAD'], text=True).splitlines()
    defines = {}
    for file in files:
        if file.startswith('code/__DEFINES/') and file.endswith('.dm'):
            # Only relevant define files, avoiding a full-tree download.
            if not any(x in file for x in ('combat', 'roguetown', 'skills', 'armor', 'inventory')):
                continue
            for key, value in re.findall(r'^#define\s+(\w+)\s+([^\n]+)', strip_comments(read(file)), re.M):
                defines[key] = value.strip()
    defines.update(TRUE='1', FALSE='0')
    def number(value, seen=()):
        value = value.strip()
        if value in defines and value not in seen:
            return number(defines[value], (*seen, value))
        node = ast.parse(value, mode='eval').body
        def ev(n):
            if isinstance(n, ast.Constant) and isinstance(n.value, (int,float)): return n.value
            if isinstance(n, ast.Name): return number(n.id, seen)
            if isinstance(n, ast.UnaryOp) and isinstance(n.op, ast.USub): return -ev(n.operand)
            if isinstance(n, ast.BinOp):
                a,b = ev(n.left),ev(n.right)
                if isinstance(n.op, ast.Add): return a+b
                if isinstance(n.op, ast.Sub): return a-b
                if isinstance(n.op, ast.Mult): return a*b
                if isinstance(n.op, ast.Div): return a/b
            raise ValueError(value)
        return ev(node)
    definitions = {}
    sources = [f for f in files if f.endswith('.dm') and (f.startswith('code/game/objects/items/rogueweapons/') or f.startswith('code/modules/jobs/job_types/roguetown/'))]
    sources.extend(['code/game/objects/items.dm','code/modules/clothing/clothing.dm','code/modules/clothing/rogueclothes/feet.dm'])
    sources.extend(f for f in files if f.startswith('code/modules/clothing/rogueclothes/armor/') and f.endswith('.dm'))
    sources.extend(f for f in files if re.match(r'code/modules/clothing/rogueclothes/(headwear/|pants/|gloves/|shoes/|wrists/)', f) and f.endswith('.dm'))
    for file in sources:
        text = strip_comments(read(file))
        for key,value in re.findall(r'^#define[ \t]+(\w+)[ \t]+([^\n]+)',text,re.M):
            defines[key]=value.strip()
        headers = list(re.finditer(r'^(/[\w/]+)[ 	]*$', text, re.M))
        for i,m in enumerate(headers):
            end = headers[i+1].start() if i+1<len(headers) else len(text)
            body = re.split(r'^/[^\n]*', text[m.end():end], maxsplit=1, flags=re.M)[0]
            entry = definitions.setdefault(m[1], {})
            entry.update(file=file,line=text[:m.start()].count('\n')+1)
            for field,value in re.findall(r'^	(?:var/(?:list/)?)?(\w+)[ 	]*=[ 	]*([^\n]+)', body, re.M):
                entry[field] = value.strip()
            for field in ('possible_item_intents','gripped_intents','subclass_skills','secondary_skills'):
                match = re.search(r'^	'+field+r'\s*=\s*list\s*\(',body,re.M)
                if match:entry[field]= 'list('+list_body(body,body.index('(',match.start()))+')'
    def resolve(path, field, seen=()):
        if not path or path in seen:return None
        entry=definitions.get(path,{})
        if field in entry:return entry[field]
        return resolve(entry.get('parent_type',path.rsplit('/',1)[0]),field,(*seen,path))
    def num(path,field):
        raw=resolve(path,field)
        if raw is None:raise ValueError(f'Missing {path}.{field}')
        return number(raw)
    data=json.loads(snapshot.read_text())
    def link(path):
        e=definitions[path]
        return f"{data['repository']}/blob/{data['commit']}/{e['file']}#L{e['line']}"
    weapons=[]
    candidates=['sword','sword/long','sword/short','sword/sabre','sword/rapier','mace/steel','mace/warhammer/steel','flail/sflail','greataxe/steel','spear','spear/boar','halberd','knife/dagger/steel']
    for suffix in candidates:
        path='/obj/item/rogueweapon/'+suffix
        if path not in definitions:continue
        try:
            fields={k:num(path,k) for k in ['force','force_wielded','wdefense','wdefense_wbonus','minstr','wbalance','can_parry','intdamage_factor']}
        except (ValueError,TypeError,SyntaxError,KeyError):continue
        if not fields['can_parry']:continue
        item=dict(id=path,name=resolve(path,'name').strip('"'),skill=resolve(path,'associated_skill'),source=link(path),**fields)
        item['sharp']=bool(num(path,'sharpness'))
        item['wlength']=num(path,'wlength')
        item['secondarySkills']={}
        secondary=resolve(path,'secondary_skills') or ''
        for skill,value in re.findall(r'(/datum/skill/[\w/]+)\s*=\s*([\d.]+)',secondary):item['secondarySkills'][skill]=float(value)
        item['intents']={}
        for mode,field in [('one','possible_item_intents'),('two','gripped_intents')]:
            raw=resolve(path,field) or ''
            if raw in defines:raw=defines[raw]
            intents=[]
            for ipath in re.findall(r'/datum/intent/[\w/]+',raw):
                try:
                    vals={k:num(ipath,k) for k in ['damfactor','clickcd','swingdelay','chargetime','releasedrain','penfactor','intent_intdamage_factor']}
                except (ValueError,TypeError,SyntaxError,KeyError):continue
                if 'Azure-Peak/Azure-Peak' in data['repository']:
                    vals.update(minDamage=num(ipath,'min_intent_damage'), maxDamage=num(ipath,'max_intent_damage'))
                # Exact standard repeat cadence only: charge/windup intent overrides excluded.
                if vals['chargetime'] or vals['swingdelay'] or vals['clickcd']<=0:continue
                vals['bladeClass']=(resolve(ipath,'blade_class') or 'BCLASS_BLUNT')
                vals['accuracy']=num(ipath,'accuracy_modifier')
                vals['misscost']=num(ipath,'misscost')
                azure_build='Azure-Peak/Azure-Peak' in data['repository']
                vals['parryable']=bool(num(ipath,'canparry' if azure_build else 'parriable_intent'))
                vals['dodgeable']=bool(num(ipath,'candodge' if azure_build else 'dodgeable_intent'))
                vals['damageType']=(resolve(ipath,'item_d_type') or '"blunt"').strip('"')
                intents.append(dict(id=ipath,name=(resolve(ipath,'name') or ipath.rsplit('/',1)[1]).strip('"'),source=link(ipath),**vals))
            item['intents'][mode]=intents
        if any(item['intents'].values()):weapons.append(item)
    for job in data['jobs']:
        raw=resolve(job['id'],'subclass_skills')
        job['skillsKnown']=raw is not None
        job['skills']={}
        if raw:
            for skill,value in re.findall(r'(/datum/skill/[\w/]+)\s*=\s*(SKILL_LEVEL_\w+|\d+)',raw):
                job['skills'][skill]=number(value)
    def constant(key):return number(key)
    rules={k:constant(k) for k in ['STRENGTH_SOFTCAP','STRENGTH_MULT','STRENGTH_CAPPEDMULT','BASE_PARRY_STAMINA_DRAIN','SWIFTCAP_CHEST','SWIFTCAP_LIMBS','SWIFTCAP_PRECISE']}
    azure='Azure-Peak/Azure-Peak' in data['repository']
    rules.update(azure=azure,skillParry=constant('PARRY_PER_SKILL_LEVEL') if azure else 20,wdefParry=constant('PARRY_PER_WDEF_POINT') if azure else 10,oldParry=0 if azure else 20)
    if azure:rules.update(staminaBase=constant('WILLPOWER_STARTING_STAMINA'),staminaPerWill=constant('WILLPOWER_MODIFIER'))
    tick = re.search(r'^\s*wait\s*=\s*(\d+)', read('code/controllers/subsystem/mobs.dm').split('/datum/controller/')[0], re.M)
    if not tick: tick = re.search(r'var/wait\s*=\s*(\d+)',read('code/controllers/subsystem.dm'))
    if not tick: raise ValueError('Unknown mob tick interval')
    rules['tickSeconds']=int(tick[1])/10
    data['combat']={'weapons':sorted(weapons,key=lambda x:x['name']),'rules':rules,'sources':{k:f"{data['repository']}/blob/{data['commit']}/{v}" for k,v in {'Damage':'code/_onclick/item_attack.dm','Parry':'code/modules/mob/living/combat/parry.dm','Stamina':'code/modules/mob/living/carbon/energystamina.dm','Tick':'code/controllers/subsystem.dm','Constants':'code/__DEFINES/combat.dm'}.items()}}
    armors=[]
    armor_paths=[('body','suit/roguetown/armor/'+suffix) for suffix in ['plate','plate/iron','chainmail','chainmail/hauberk','brigandine','leather','gambeson']]
    armor_paths += [('head','head/roguetown/helmet'+suffix) for suffix in ['', '/kettle', '/heavy/barbute']]
    armor_paths += [('legs','under/roguetown/platelegs'+suffix) for suffix in ['', '/iron']]
    armor_paths += [('arms','gloves/roguetown/plate'+suffix) for suffix in ['', '/iron']]
    armor_paths += [('feet','shoes/roguetown/boots'+suffix) for suffix in ['/armor','/leather/reinforced']]
    for slot,suffix in armor_paths:
        path='/obj/item/clothing/'+suffix
        if path not in definitions:continue
        raw=resolve(path,'armor') or ''
        if raw in defines:raw=defines[raw]
        ratings={k:number(v) for k,v in re.findall(r'"(blunt|slash|stab)"\s*=\s*(\w+)',raw)}
        if len(ratings)!=3:continue
        armors.append(dict(id=path,slot=slot,armorClass=(resolve(path,'armor_class') or 'ARMOR_CLASS_NONE'),name=resolve(path,'name').strip('"'),ratings=ratings,
            integrity=num(path,'max_integrity'),failure=num(path,'integrity_failure'),
            deflection=number(resolve(path,'damage_deflection') or '0'),source=link(path)))
    def coverage_names(value, seen=()):
        names=set(re.findall(r'\b[A-Z][A-Z_]+\b',value))
        result=set()
        for name in names:
            if name in defines and name not in seen:
                result.update(coverage_names(defines[name],(*seen,name)))
            result.add(name)
        return result
    for armor in armors:
        armor['coverage']=sorted(coverage_names(resolve(armor['id'],'body_parts_covered') or 'CHEST'))
    rules['accuracy']={k:constant(k) for k in defines if k.startswith('ACC_') and re.fullmatch(r'ACC_(MAJOR_ZONE_BONUS|FACE_SUBZONE_PENALTY|PER_BONUS_PER_POINT|PER_BONUS_CAP|PER_PENALTY_PER_POINT|SKILL_BONUS_PER_LEVEL|STAB_BONUS|PICK_BONUS|CUT_BONUS|BLUNT_PRECISE_PENALTY|SHORT_WEAPON_BONUS|AIMED_BONUS|SWIFT_PENALTY|MIN|MAX)',k)}
    for k in ['STAM_DRAIN_PER_STR_DIFF_HEAVY_BAL','CLICK_CD_MOD_SWIFT','CLICK_CD_MOD_AIMED','CLICK_CD_INTENTCAP','EXTRA_STAMDRAIN_SWIFSTRONG','STRONG_STANCE_DMG_BONUS']:
        rules[k]=constant(k)
    rules['parryCooldown']=1.2
    for label,file in [('Accuracy','code/modules/mob/living/combat/accuracy_checks.dm'),('Target mapping','code/modules/mob/mob_helpers.dm'),('Target reach','code/modules/mob/living/living.dm'),('Stances','code/_onclick/click.dm')]:
        data['combat']['sources'][label]=f"{data['repository']}/blob/{data['commit']}/{file}"

    shield_paths=[f'/obj/item/rogueweapon/shield/{kind}' for kind in ['wood','iron','tower','heater','buckler']]
    data['combat']['shields']=[dict(id=path,name=resolve(path,'name').strip('"'),wdefense=num(path,'wdefense'),source=link(path),buckler=path.endswith('/buckler')) for path in shield_paths if path in definitions]
    rules['dodge']={k:constant(k) for k in ['CLICK_CD_DODGE','CLICK_CD_FAST','CLICK_CD_HEAVY','MAX_DODGE_FLOOR','MAX_DODGE_CEIL','MAX_DODGE_CLAMP']}
    rules['dodge']['base']=int(re.search(r'var/defprob\s*=\s*(\d+)',read('code/modules/mob/living/living_defines.dm'))[1])
    for label,path in [('Dodge','code/modules/mob/living/combat/dodge.dm'),('Defend intent','code/game/objects/items/rogueweapons/rmb_intents.dm')]:
        data['combat']['sources'][label]=f"{data['repository']}/blob/{data['commit']}/{path}"
    data['combat']['armors']=armors
    data['combat']['rules']['armorMinimum']=constant('PEN_PASSTHROUGH_MINIMUM')
    data['combat']['rules']['armorRatio']=constant('PEN_PASSTHROUGH_RATIO')
    data['combat']['rules']['bluntDR']=0.2 if azure else constant('BLUNT_DR_COEFFICIENT')
    for label,file in [('Armor','code/modules/mob/living/carbon/human/human_defense.dm'),('Penetration','code/modules/mob/living/living_defense.dm'),('Break threshold','code/game/objects/obj_defense.dm')]:
        data['combat']['sources'][label]=f"{data['repository']}/blob/{data['commit']}/{file}"

    if not weapons:raise ValueError('No supported combat weapons')
    snapshot.write_text(json.dumps(data,indent=2)+'\n')
    print(f'{snapshot}: {len(weapons)} melee weapons; {sum(j["skillsKnown"] for j in data["jobs"])} class skill lists')

if __name__=='__main__':build(Path(sys.argv[1]),Path(sys.argv[2]))
