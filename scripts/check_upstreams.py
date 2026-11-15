"""Compare both upstream heads; emit workflow outputs without third-party packages."""
import json
import os
from pathlib import Path
import re
import subprocess

SOURCES = [
    ('commit', 'Rotwood-Vale/Ratwood-2.0', 'data/stats.json'),
    ('azure_commit', 'Azure-Peak/Azure-Peak', 'data/azure.json'),
]
refresh = os.environ.get('EVENT_NAME') != 'schedule'
outputs = []
for key, repo, snapshot in SOURCES:
    result = subprocess.check_output(
        ['git', 'ls-remote', f'https://github.com/{repo}.git', 'refs/heads/main'], text=True)
    sha = result.split()[0] if result.split() else ''
    if not re.fullmatch(r'[0-9a-f]{40}', sha):
        raise ValueError(f'Could not resolve {repo} main')
    path = Path(snapshot)
    previous = json.loads(path.read_text()).get('commit') if path.exists() else None
    refresh = refresh or sha != previous
    outputs.append(f'{key}={sha}')
    print(f'{repo}: {sha}; changed={sha != previous}')
outputs.append(f'refresh={str(refresh).lower()}')
with open(os.environ['GITHUB_OUTPUT'], 'a') as f:
    f.write('\n'.join(outputs) + '\n')
with open(os.environ['GITHUB_STEP_SUMMARY'], 'a') as f:
    f.write('Refreshing both build snapshots.' if refresh else 'Both upstreams unchanged; skipping deployment.')
