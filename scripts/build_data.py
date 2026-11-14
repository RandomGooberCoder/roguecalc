#!/usr/bin/env python3
"""Extract the calculator's declarative DM fields; standard library only."""
import argparse
import datetime as dt
import json
from pathlib import Path
import re
import subprocess

REPO = 'https://github.com/Rotwood-Vale/Ratwood-2.0'
ROOTS = {
    'races': 'code/modules/mob/living/carbon/human/species_types',
    'jobs': 'code/modules/jobs/job_types/roguetown',
    'statpacks': 'modular_azurepeak/statpacks',
}
KEYS = dict(zip(['STR', 'PER', 'INT', 'CON', 'WIL', 'SPD', 'LCK'],
                ['strength', 'perception', 'intelligence', 'constitution', 'willpower', 'speed', 'fortune']))
STATS = list(KEYS.values())


def strip_comments(text):
    # Keep strings intact (descriptions can contain // and escaped quotes).
    return re.sub(r'"(?:\\.|[^"\\])*"|//[^\n]*|/\*[\s\S]*?\*/',
                  lambda m: m[0] if m[0].startswith('"') else '\n' * m[0].count('\n'), text)


def list_body(text, start):
    depth, quoted, escaped = 0, False, False
    for i in range(start, len(text)):
        c = text[i]
        if escaped:
            escaped = False
            continue
        if c == '\\' and quoted:
            escaped = True
            continue
        if c == '"':
            quoted = not quoted
        if not quoted:
            depth += (c == '(') - (c == ')')
            if depth == 0:
                return text[start + 1:i]
    raise ValueError('Unclosed DM list')


def parse_stats(body):
    body = re.sub(r'//[^\n]*|/\*[\s\S]*?\*/', '', body)
    result = {}
    pattern = r'(STAT_[A-Z]+|STATKEY_[A-Z]+|"(?:strength|perception|intelligence|constitution|willpower|speed|fortune)")\s*=\s*(list\(\s*-?\d+\s*,\s*-?\d+\s*\)|-?\d+)'
    matches = list(re.finditer(pattern, body))
    rest = re.sub(pattern, '', body).replace(',', '').replace('\\', '').strip()
    if rest:
        raise ValueError(f'Unsupported stat expression: {rest!r}')
    for m in matches:
        token, value = m.groups()
        key = token.strip('"') if token.startswith('"') else (KEYS[token[8:]] if token.startswith('STATKEY_') else token[5:].lower())
        if key not in STATS:
            raise ValueError(f'Unknown stat: {token}')
        result[key] = list(map(int, re.findall(r'-?\d+', value))) if value.startswith('list') else int(value)
    return result


def parse_choices(body):
    choices = []
    for label, token in re.findall(r'"([^"]+)"\s*=\s*(STATKEY_[A-Z]+|STAT_[A-Z]+)', body):
        stat = KEYS[token[8:]] if token.startswith('STATKEY_') else token[5:].lower()
        if stat not in STATS:
            raise ValueError(f'Unknown choice stat: {token}')
        choices.append({'id': stat, 'name': label, 'stats': {stat: 1}})
    if not choices and body.strip():
        raise ValueError('Unsupported species custom_selection')
    return choices


def extract_ages(text):
    text = strip_comments(text)
    match = re.search(r'^\t\tswitch\(H.age\)\n((?:\t{3,}[^\n]*\n|[ \t]*\n)+)', text, re.M)
    if not match:
        raise ValueError('Age stat switch not found')
    result = [{'id': 'adult', 'name': 'Adult', 'stats': {}}]
    for token, name, key in [('AGE_MIDDLEAGED', 'Middle-Aged', 'middleaged'), ('AGE_OLD', 'Old', 'old')]:
        block = re.search(r'\t{3}if\(' + token + r'\)\n((?:\t{4,}[^\n]*\n|[ \t]*\n)+)', match[1])
        if not block:
            raise ValueError(f'Age branch missing: {token}')
        calls = re.findall(r'change_stat\((STATKEY_[A-Z]+),\s*(-?\d+)\)', block[1])
        rest = re.sub(r'change_stat\(STATKEY_[A-Z]+,\s*-?\d+\)', '', block[1]).strip()
        if rest or not calls:
            raise ValueError(f'Unsupported age changes: {token}')
        result.append({'id': key, 'name': name, 'stats': parse_stats(','.join(f'{k}={v}' for k,v in calls))})
    return result


def read_definitions(root):
    definitions = {}
    files = sorted({f for directory in ROOTS.values() for f in (root / directory).rglob('*.dm')})
    files.append(root / 'code/datums/status_effects/rogue/roguebuff.dm')
    for file in files:
        text = strip_comments(file.read_text(encoding='utf-8-sig'))
        # Only column-zero type declarations, never proc bodies.
        headers = list(re.finditer(r'^(/[\w/]+)\s*$', text, re.M))
        for i, header in enumerate(headers):
            path = header[1]
            end = headers[i + 1].start() if i + 1 < len(headers) else len(text)
            body = text[header.end():end]
            # A proc header terminates the preceding declaration too.
            body = re.split(r'^/[^\n]*', body, maxsplit=1, flags=re.M)[0]
            entry = definitions.setdefault(path, {'id': path})
            entry.update(source=file.relative_to(root).as_posix(), line=text[:header.start()].count('\n') + 1)
            for field in ('name', 'desc', 'parent_type', 'abstract_type'):
                m = re.search(r'^\t' + field + r'\s*=\s*("(?:\\.|[^"\\])*"|/[^\s]+)', body, re.M)
                if m:
                    entry[field] = m[1].strip('"').replace('\\"', '"').replace('\\n', ' ')
            for field in ('race_bonus', 'subclass_stats', 'stat_array', 'effectedstats'):
                m = re.search(r'^\t' + field + r'\s*=\s*(list\s*\(|null)', body, re.M)
                if m:
                    entry[field] = {} if m[1] == 'null' else parse_stats(list_body(body, body.index('(', m.start())))
            m = re.search(r'^\tcustom_selection\s*=\s*list\s*\(', body, re.M)
            if m:
                entry['choices'] = parse_choices(list_body(body, body.index('(', m.start())))
    return definitions


def resolve(definitions, path, field, seen=None):
    seen = set() if seen is None else seen
    if path in seen or not path:
        return None
    seen.add(path)
    entry = definitions.get(path, {})
    if field in entry:
        return entry[field]
    parent = entry.get('parent_type', path.rsplit('/', 1)[0])
    return resolve(definitions, parent, field, seen)


def build(root):
    definitions = read_definitions(root)
    sha = subprocess.check_output(['git', '-C', str(root), 'rev-parse', 'HEAD'], text=True).strip()
    data = {'repository': REPO, 'commit': sha, 'generatedAt': dt.datetime.now(dt.timezone.utc).isoformat(),
            'base': 10, 'stats': STATS}
    fields = {'races': ('/datum/species/', 'race_bonus'),
              'jobs': ('/datum/advclass/', 'subclass_stats'),
              'statpacks': ('/datum/statpack/', 'stat_array')}
    for group, (prefix, field) in fields.items():
        items = []
        for path, entry in definitions.items():
            if not path.startswith(prefix) or not entry['source'].startswith(ROOTS[group]):
                continue
            # Named concrete definitions only; preserve zero-bonus statpacks and races.
            if 'name' not in entry or entry.get('abstract_type') == path:
                continue
            stats = resolve(definitions, path, field)
            # Other definitions use bespoke runtime changes, outside this calculator.
            if stats is None and group != 'statpacks':
                continue
            stats = stats or {}
            choices = (resolve(definitions, path, 'choices') or []) if group == 'races' else []
            items.append({'id': path, 'name': entry['name'], 'stats': stats,
                          'choices': choices,
                          'description': re.sub('<[^>]+>', '', entry.get('desc', '')),
                          'source': f"{REPO}/blob/{sha}/{entry['source']}#L{entry['line']}",
                          'group': path.split('/')[3] if len(path.split('/')) > 3 else ''})
        data[group] = sorted(items, key=lambda item: (item['name'].casefold(), item['id']))
        if not items:
            raise ValueError(f'No {group} extracted')
    age_file = 'code/modules/mob/living/stats.dm'
    age_text = (root / age_file).read_text(encoding='utf-8-sig')
    data['ages'] = extract_ages(age_text)
    for age in data['ages']:
        age['source'] = f'{REPO}/blob/{sha}/{age_file}'
    data['buffs'] = []
    for key, name, path in [
        ('vigilant', 'Vigilant Guardsman', '/datum/status_effect/buff/guardbuffone'),
        ('warden', 'Warden', '/datum/status_effect/buff/wardenbuff')]:
        entry = definitions[path]
        data['buffs'].append({'id': key, 'name': name, 'stats': entry['effectedstats'],
                              'source': f"{REPO}/blob/{sha}/{entry['source']}#L{entry['line']}"})
    return data


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('source', type=Path, help='Local checkout of Ratwood-2.0')
    parser.add_argument('--output', type=Path, default=Path('data/stats.json'))
    args = parser.parse_args()
    data = build(args.source)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(data, indent=2, ensure_ascii=True) + '\n')
    print(', '.join(f'{len(data[k])} {k}' for k in ROOTS))
    print(f"Source commit: {data['commit']}")


if __name__ == '__main__':
    main()
