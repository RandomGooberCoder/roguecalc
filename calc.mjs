export const LABELS = {
  strength: ['STR', 'Strength'], perception: ['PER', 'Perception'],
  intelligence: ['INT', 'Intelligence'], constitution: ['CON', 'Constitution'],
  willpower: ['WIL', 'Endurance / Willpower'], speed: ['SPD', 'Speed'], fortune: ['LCK', 'Fortune']
};
export function range(value = 0) { return Array.isArray(value) ? value : [value, value]; }
export function add(...values) {
  return values.reduce(([lo, hi], value) => { const r = range(value); return [lo + r[0], hi + r[1]]; }, [0, 0]);
}
export function display(value, signed = false) {
  const [lo, hi] = range(value);
  const fmt = n => signed && n > 0 ? `+${n}` : String(n);
  return lo === hi ? fmt(lo) : `${fmt(lo)} to ${fmt(hi)}`;
}
export function calculate(data, race, job, pack, age = { stats: {} }, choice = null) {
  return data.stats.map(stat => {
    const parts = [data.base, race.stats[stat] ?? 0, job.stats[stat] ?? 0, pack.stats[stat] ?? 0, age.stats[stat] ?? 0, choice?.stats[stat] ?? 0];
    const base = add(...parts);
    return { stat, parts, base, buffs: data.buffs.map(buff => add(base, buff.stats[stat] ?? 0)) };
  });
}

export function weightedTotal(stats, baseline = 0) {
  return add(...Object.keys(LABELS).map(stat => {
    const weight = stat === 'fortune' ? 0 : ['strength', 'speed'].includes(stat) ? 2 : 1;
    return range(stats[stat] ?? baseline).map(n => (n - baseline) * weight);
  }));
}

// Prioritize Max stats first, then spend Dump stats to break ties. Keep the
// remaining stats as healthy as possible without overriding either priority.
export function rankStatpacks(packs, priorities, stats = Object.keys(LABELS)) {
  if (!stats.some(stat => ['max', 'dump'].includes(priorities[stat]))) return [];
  return packs.map(pack => {
    const scores = {max: 0, dump: 0, neutral: 0};
    for (const stat of stats) {
      const priority = priorities[stat];
      const [lo, hi] = range(pack.stats[stat]);
      scores[priority === 'max' || priority === 'dump' ? priority : 'neutral'] += (lo + hi) / 2;
    }
    return {pack, scores};
  }).sort((a, b) => b.scores.max - a.scores.max || a.scores.dump - b.scores.dump ||
    b.scores.neutral - a.scores.neutral || a.pack.name.localeCompare(b.pack.name, 'en') || a.pack.id.localeCompare(b.pack.id, 'en'));
}
