"""Append source-derived melee combat data to a stat snapshot."""
import ast
import json
from pathlib import Path
import re
import subprocess
import sys
from armor_catalog import catalog
from build_data import strip_comments, list_body


def build(root, snapshot):
    def read(path):
        return subprocess.check_output(['git', '-C', str(root), 'show', 'HEAD:' + path], text=True)
    files = subprocess.check_output(['git', '-C', str(root), 'ls-tree', '-r', '--name-only', 'HEAD'], text=True).splitlines()
    defines = {}
    for file in files:
        if file.startswith('code/__DEFINES/') and file.endswith('.dm'):
            # Only relevant define files, avoiding a full-tree download.
            if not any(x in file for x in ('combat', 'roguetown', 'skills', 'armor', 'inventory', 'clothing')):
                continue
            for key, value in re.findall(r'^#define[ \t]+(\w+)[ \t]+([^\n]+)', strip_comments(read(file)).replace('\\\n', ' '), re.M):
                defines[key] = strip_comments(value).strip()
    defines.update(TRUE='1', FALSE='0')
    def number(value, seen=()):
        value = value.strip()
        if value in seen or value == "null":
            if value == "null": return 0
            raise ValueError(f"Circular constant: {value}")
        if value in defines and value not in seen:
            return number(defines[value], (*seen, value))
        if '//' in value or '"' in value: raise ValueError(value)
        node = ast.parse(value, mode='eval').body
        def ev(n):
            if isinstance(n, ast.Constant) and isinstance(n.value, (int,float)): return n.value
            if isinstance(n, ast.Name) and n.id in defines: return number(n.id, seen)
            if isinstance(n, ast.UnaryOp) and isinstance(n.op, ast.USub): return -ev(n.operand)
            if isinstance(n, ast.UnaryOp) and isinstance(n.op, ast.Invert): return ~ev(n.operand)
            if isinstance(n, ast.BinOp):
                a,b = ev(n.left),ev(n.right)
                if isinstance(n.op, ast.Add): return a+b
                if isinstance(n.op, ast.Sub): return a-b
                if isinstance(n.op, ast.Mult): return a*b
                if isinstance(n.op, ast.Div): return a/b
                if isinstance(n.op, ast.BitOr): return a|b
                if isinstance(n.op, ast.BitAnd): return a&b
                if isinstance(n.op, ast.BitXor): return a^b
                if isinstance(n.op, ast.LShift): return a<<b
                if isinstance(n.op, ast.RShift): return a>>b
            raise ValueError(value)
        return ev(node)
    definitions = {}
    sources = [f for f in files if f.endswith('.dm') and (f.startswith('code/game/objects/items/rogueweapons/') or f.startswith('code/modules/jobs/job_types/roguetown/'))]
    # Search the whole game tree for clothing declarations, including event gear outside the clothing folder.
    clothing = subprocess.run(['git','-C',str(root),'grep','-l','-E',r'^/obj/item/clothing(/|[[:space:]]|$)','HEAD','--','*.dm'], capture_output=True, text=True, check=True)
    sources = sorted(set(sources + [line.split(':',1)[1] for line in clothing.stdout.splitlines()] + ['code/game/objects/items.dm','code/game/objects/objs.dm']))
    for file in sources:
        text = strip_comments(read(file))
        for key,value in re.findall(r'^#define[ \t]+(\w+)[ \t]+([^\n]+)',text,re.M):
            defines[key]=strip_comments(value).strip()
        headers = list(re.finditer(r'^(/[\w/]+)[ 	]*$', text, re.M))
        for i,m in enumerate(headers):
            end = headers[i+1].start() if i+1<len(headers) else len(text)
            body = re.split(r'^/[^\n]*', text[m.end():end], maxsplit=1, flags=re.M)[0]
            entry = definitions.setdefault(m[1], {})
            entry.update(file=file,line=text[:m.start()].count('\n')+1)
            for field,value in re.findall(r'^	(?:var/(?:list/)?)?(\w+)[ 	]*=[ 	]*([^\n]+)', body, re.M):
                entry[field] = strip_comments(value).strip()
            armor_list = re.search(r'^\tarmor[ \t]*=[ \t]*list[ \t]*\(', body, re.M)
            if armor_list:
                entry['armor'] = 'list('+list_body(body, armor_list.end()-1)+')'
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
    armors, armor_slots, armor_skipped = catalog(definitions, resolve, number, defines, link)
    data['combat']['armorSlots'] = armor_slots
    data['combat']['armorSkipped'] = armor_skipped
    rules['lightArmorClass'] = constant('ARMOR_CLASS_LIGHT')
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

    if not armors:raise ValueError('No wearable melee armor discovered')
    if not weapons:raise ValueError('No supported combat weapons')
    snapshot.write_text(json.dumps(data,indent=2)+'\n')
    print(f'{snapshot}: {len(weapons)} melee weapons; {len(armors)} armor types ({armor_skipped}); {sum(j["skillsKnown"] for j in data["jobs"])} class skill lists')

if __name__=='__main__':build(Path(sys.argv[1]),Path(sys.argv[2]))
