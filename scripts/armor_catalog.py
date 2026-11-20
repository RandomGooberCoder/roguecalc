"""Discover wearable melee armor from resolved Dream Maker type definitions."""
import re
from collections import Counter

# Key, UI label, and DM equip flag. Order here is the UI order, not hit order.
SLOTS = [
    ('body', 'Body armor', 'ARMOR'), ('shirt', 'Underlayer', 'SHIRT'),
    ('head', 'Headgear', 'HEAD'), ('mask', 'Facewear', 'MASK'),
    ('neck', 'Neckwear', 'NECK'), ('cloak', 'Cloak', 'CLOAK'),
    ('wrists', 'Bracers', 'WRISTS'), ('arms', 'Gloves', 'GLOVES'),
    ('legs', 'Legwear', 'PANTS'), ('feet', 'Footwear', 'SHOES'),
    ('belt', 'Belt', 'BELT'), ('backr', 'Right back', 'BACK_R'),
    ('backl', 'Left back', 'BACK_L'), ('ring', 'Ring', 'RING'),
    ('glasses', 'Eyewear', 'GLASSES'), ('ears', 'Earwear', 'EARS'),
]
COVERAGE = 'HEAD CHEST ARM_LEFT ARM_RIGHT LEG_LEFT LEG_RIGHT HAND_LEFT HAND_RIGHT FOOT_LEFT FOOT_RIGHT LEFT_EYE RIGHT_EYE NOSE MOUTH EARS HAIR NECK GROIN VITALS'.split()
TYPES = ('blunt', 'slash', 'stab', 'piercing', 'fire', 'acid', 'bullet')


def catalog(definitions, resolve, number, defines, link):
    def expand(value):
        seen = set()
        while value in defines and value not in seen:
            seen.add(value)
            value = defines[value]
        return value

    by_flag = [(key, number('ITEM_SLOT_' + flag)) for key, _, flag in SLOTS if 'ITEM_SLOT_' + flag in defines]
    coverage_flags = [(name, number(name)) for name in COVERAGE]
    pieces, skipped = [], Counter()
    for path in sorted(definitions):
        if not path.startswith('/obj/item/clothing/'):
            continue
        raw = expand(resolve(path, 'armor') or '')
        if raw in ('', 'null', '0'):
            continue
        values = dict(re.findall(r'"([a-z_]+)"\s*=\s*([^,)\n]+)', raw))
        if not any(key in values for key in TYPES[:3]):
            skipped['unsupported rating expression'] += 1
            continue
        try:
            ratings = {key: number(values.get(key, '0')) for key in TYPES}
            if not any(ratings[key] > 0 for key in TYPES[:3]):
                continue
            mask = number(resolve(path, 'body_parts_covered') or '0')
            flags = number(resolve(path, 'slot_flags') or '0')
            slots = [key for key, flag in by_flag if flags & flag]
            coverage = [name for name, flag in coverage_flags if mask & flag]
            if not slots or not coverage:
                skipped['no supported worn slot or melee coverage'] += 1
                continue
            integrity = number(resolve(path, 'max_integrity') or '0')
            failure = number(resolve(path, 'integrity_failure') or '0')
            deflection = number(resolve(path, 'damage_deflection') or '0')
            armor_class = number(resolve(path, 'armor_class') or 'ARMOR_CLASS_NONE')
        except (ValueError, TypeError, KeyError, SyntaxError, ArithmeticError):
            skipped['unresolved static field'] += 1
            continue
        name = (resolve(path, 'name') or '').strip('"').replace(r'\"', '"')
        if not name:
            skipped['unnamed type'] += 1
            continue
        pieces.append(dict(id=path, name=name, slot=slots[0], slots=slots, armorClass=armor_class,
                           ratings=ratings, coverage=coverage, integrity=integrity, failure=failure,
                           deflection=deflection, source=link(path)))
    return pieces, [{'id': key, 'name': label} for key, label, _ in SLOTS if any(key in x['slots'] for x in pieces)], dict(skipped)
