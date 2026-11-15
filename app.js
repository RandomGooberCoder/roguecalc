import { initCombat, renderCombat } from './combat-ui.js?v=targeting-1';
import { LABELS, calculate, display } from './calc.mjs';

const $ = id => document.getElementById(id);
const groups = { race: 'races', job: 'jobs', statpack: 'statpacks' };
let data;
let activeBuild = 'ratwood';
const builds = {ratwood: {name:'Ratwood', file:'stats.json'}, azure: {name:'Azure Peak', file:'azure.json'}};
let loadSequence = 0;
let chosen = {};

function defaults() {
  return {
    race: data.races.find(x => x.name === 'Humen')?.id ?? data.races[0].id,
    job: data.jobs.find(x => x.name === 'Foot Knight')?.id ?? data.jobs[0].id,
    statpack: data.statpacks.find(x => x.name === 'Foresighted')?.id ?? data.statpacks[0].id,
    age: 'adult', choice: ''
  };
}
function readHash() {
  const params = new URLSearchParams(location.hash.slice(1));
  chosen = defaults();
  for (const [key, group] of Object.entries(groups)) {
    if (data[group].some(item => item.id === params.get(key))) chosen[key] = params.get(key);
  }
  if (data.ages.some(x => x.id === params.get('age'))) chosen.age = params.get('age');
  chosen.choice = params.get('choice') ?? '';
}
function raceChoices() {
  return data.races.find(x => x.id === chosen.race)?.choices ?? [];
}
function syncExtra() {
  const choices = raceChoices();
  if (!choices.some(x => x.id === chosen.choice)) chosen.choice = '';
  $('choice-field').hidden = !choices.length;
  $('choice').replaceChildren(new Option('No bonus selected', ''));
  for (const item of choices) $('choice').add(new Option(item.name, item.id));
  $('choice').value = chosen.choice;
  $('age').value = chosen.age;
}
function options(key) {
  const select = $(key);
  const filter = key === 'job' ? $('job-search').value.toLowerCase().trim() : '';
  const items = data[groups[key]].filter(item => `${item.name} ${item.id}`.toLowerCase().includes(filter));
  const names = new Map();
  for (const item of data[groups[key]]) names.set(item.name, (names.get(item.name) || 0) + 1);
  select.replaceChildren();
  for (const item of items) {
    const label = names.get(item.name) > 1 ? `${item.name} (${item.id.split('/').slice(3).join(' / ')})` : item.name;
    select.add(new Option(label, item.id, false, item.id === chosen[key]));
  }
  // Filtering never changes the active build until the user chooses an option.
  if (items.length && !items.some(x => x.id === chosen[key])) select.selectedIndex = -1;
  if (!items.length) select.add(new Option('No matching jobs', ''));
  select.disabled = !items.length;
}
function cell(tag, value, className = '') {
  const el = document.createElement(tag);
  el.textContent = value;
  if (className) el.className = className;
  return el;
}
function render() {
  const selected = Object.fromEntries(Object.entries(groups).map(([key, group]) => [key, data[group].find(x => x.id === chosen[key])]));
  for (const key of Object.keys(groups)) $(key + '-source').href = selected[key].source;
  $('pack-description').textContent = selected.statpack.description || 'No fixed stat bonuses for this statpack.';
  syncExtra();
  const age = data.ages.find(x => x.id === chosen.age);
  const choice = raceChoices().find(x => x.id === chosen.choice);
  $('age-source').href = age.source;
  const rows = calculate(data, selected.race, selected.job, selected.statpack, age, choice);
  $('stats-body').replaceChildren();
  $('breakdown-body').replaceChildren();
  for (const row of rows) {
    const [code, name] = LABELS[row.stat];
    const tr = document.createElement('tr');
    const heading = document.createElement('th');
    heading.scope = 'row';
    const label = cell('span', '', 'stat-label');
    label.append(cell('span', code, 'stat-code'), cell('span', name));
    heading.append(label);
    tr.append(heading);
    // Reserve the same badge space in each scenario to align the numbers.
    const base = cell('td', display(row.base));
    const placeholder = cell('span', '+0', 'delta empty');
    placeholder.setAttribute('aria-hidden', 'true');
    base.append(placeholder);
    tr.append(base);
    row.buffs.forEach((value, i) => {
      const td = cell('td', display(value));
      const bonus = data.buffs[i].stats[row.stat] ?? 0;
      const badge = cell('span', display(bonus, true), `delta ${i === 1 ? 'warden-delta' : ''} ${bonus ? '' : 'empty'}`);
      if (bonus) badge.setAttribute('aria-label', `${display(bonus, true)} from area buff`);
      else badge.setAttribute('aria-hidden', 'true');
      td.append(badge);
      tr.append(td);
    });
    $('stats-body').append(tr);
    const detail = document.createElement('tr');
    const detailHeading = cell('th', name);
    detailHeading.scope = 'row';
    detail.append(detailHeading);
    row.parts.forEach((part, i) => detail.append(cell('td', display(part, i !== 0))));
    detail.append(cell('td', display(row.base)));
    $('breakdown-body').append(detail);
  }
  renderCombat(data, selected.job, rows, age);
}
function writeHash() {
  history.replaceState(null, '', '#' + new URLSearchParams({build: activeBuild, ...chosen}).toString());
}

function metadata() {
  document.querySelector('.repo-link').href = data.repository;
  document.title = `${builds[activeBuild].name} | Stat Calculator`;
  document.querySelector('.brand').childNodes[1].textContent = ' ' + builds[activeBuild].name.toUpperCase() + ' ';
  $('buff-sources').replaceChildren();
    const commit = document.createElement('a');
    commit.href = `${data.repository}/commit/${data.commit}`;
    commit.textContent = data.commit.slice(0, 7);
    commit.target = '_blank';
    commit.rel = 'noopener noreferrer';
    $('data-info').replaceChildren(document.createTextNode(`Data: ${new Date(data.generatedAt).toISOString().slice(0, 10)} / `), commit);
    $('buff-sources').append(document.createTextNode('Buff definitions: '));
    data.buffs.forEach((buff, i) => {
      const link = cell('a', buff.name);
      link.href = buff.source;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      if (i) $('buff-sources').append(document.createTextNode(' / '));
      $('buff-sources').append(link);
    });

}
async function loadBuild(id, useHash = false) {
  const seq = ++loadSequence;
  $('build').disabled = true;
  $('calculator').inert = true;
  $('status').hidden = false;
  $('status').textContent = 'Loading ' + builds[id].name + ' data...';
  try {
    const response = await fetch('./data/' + builds[id].file, {cache:'no-cache'});
    if (!response.ok) throw new Error(`Data request failed (${response.status})`);
    const next = await response.json();
    if (!['races','jobs','statpacks','buffs','stats','ages'].every(k => Array.isArray(next[k]) && next[k].length)) throw new Error('Incomplete build snapshot');
    if (seq !== loadSequence) return;
    data = next;
    activeBuild = id;
    $('build').value = id;
    if (useHash) readHash(); else chosen = defaults();
    $('job-search').value = '';
    $('age').replaceChildren();
    for (const age of data.ages) $('age').add(new Option(age.name, age.id));
    Object.keys(groups).forEach(options);
    metadata();
    render();
    $('calculator').hidden = false;
    $('status').hidden = true;
    if (!useHash) writeHash();
  } catch (error) {
    $('build').value = activeBuild;
    $('status').textContent = 'Could not load build: ' + error.message;
  } finally {
    if (seq === loadSequence) { $('build').disabled = false; $('calculator').inert = false; }
  }
}
async function init() {
  initCombat();
  $('breakdown-toggle').addEventListener('click', () => {
    const open = $('breakdown-panel').hidden;
    $('breakdown-panel').hidden = !open;
    $('breakdown-toggle').setAttribute('aria-expanded', String(open));
    $('breakdown-label').textContent = open ? 'Hide the stat breakdown' : 'See the stat breakdown';
  });
  try {
    await loadBuild(builds[new URLSearchParams(location.hash.slice(1)).get('build')] ? new URLSearchParams(location.hash.slice(1)).get('build') : 'ratwood', true);
    if (!data) return;
    $('build').addEventListener('change', () => loadBuild($('build').value));
    for (const key of Object.keys(groups)) {
      options(key);
      $(key).addEventListener('change', () => {
        if (!$(key).value) return;
        chosen[key] = $(key).value;
        render();
        writeHash();
      });
    }
    for (const key of ['age', 'choice']) $(key).addEventListener('change', () => {
      chosen[key] = $(key).value;
      render();
      writeHash();
    });
    $('job-search').addEventListener('input', () => options('job'));
    $('reset').addEventListener('click', () => {
      chosen = defaults();
      $('job-search').value = '';
      Object.keys(groups).forEach(options);
      syncExtra();
      writeHash();
      render();
    });
    $('share').addEventListener('click', async () => {
      writeHash();
      try {
        await navigator.clipboard.writeText(location.href);
        $('share').textContent = 'Link copied';
        setTimeout(() => { $('share').textContent = 'Copy build link'; }, 2200);
      } catch {
        // The URL is updated even when clipboard access is unavailable.
        $('status').textContent = 'Your build is saved in the address bar. Copy that URL to share it.';
        $('status').hidden = false;
      }
    });
    addEventListener('hashchange', () => {
      const id = new URLSearchParams(location.hash.slice(1)).get('build');
      loadBuild(builds[id] ? id : 'ratwood', true);
    });
    render();
    $('status').hidden = true;
    $('calculator').hidden = false;
  } catch (error) {
    $('status').textContent = `Could not load calculator data. ${error.message}. For local use, serve this folder with "python -m http.server 8000" and open http://localhost:8000.`;
    console.error(error);
  }
}
init();
