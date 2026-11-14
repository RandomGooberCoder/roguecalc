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
