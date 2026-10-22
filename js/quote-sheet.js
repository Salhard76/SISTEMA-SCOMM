/* Schema del foglio quote: segue i mercati e l'ordine del bollettino Sisal. */
export const QUOTE_GROUPS = [
  { label: 'Esito Finale', columns: [
    { label: '1', markets: ['Esito Finale', '1X2'], outcomes: ['1'] },
    { label: 'X', markets: ['Esito Finale', '1X2'], outcomes: ['X'] },
    { label: '2', markets: ['Esito Finale', '1X2'], outcomes: ['2'] }
  ]},
  { label: '1X2 Handicap', columns: [
    { label: 'H', staticField: 'handicap', markets: [], outcomes: [] },
    { label: '1', markets: ['Handicap', '1X2 Handicap'], outcomes: ['H1', '1'] },
    { label: 'X', markets: ['Handicap', '1X2 Handicap'], outcomes: ['HX', 'X'] },
    { label: '2', markets: ['Handicap', '1X2 Handicap'], outcomes: ['H2', '2'] }
  ]},
  { label: 'Doppia Chance', columns: [
    { label: '1X', markets: ['Doppia Chance'], outcomes: ['1X'] },
    { label: 'X2', markets: ['Doppia Chance'], outcomes: ['X2'] },
    { label: '12', markets: ['Doppia Chance'], outcomes: ['12'] }
  ]},
  { label: 'Under / Over 1,5', columns: [
    { label: 'U', markets: ['Under/Over 1.5', 'Under/Over 1,5', 'Under 1.5'], outcomes: ['U 1.5', 'Under 1.5', 'U 1,5'] },
    { label: 'O', markets: ['Under/Over 1.5', 'Under/Over 1,5', 'Over 1.5'], outcomes: ['O 1.5', 'Over 1.5', 'O 1,5'] }
  ]},
  { label: 'Under / Over 2,5', columns: [
    { label: 'U', markets: ['Under/Over 2.5', 'Under/Over 2,5', 'Under 2.5'], outcomes: ['U 2.5', 'Under 2.5', 'U 2,5'] },
    { label: 'O', markets: ['Under/Over 2.5', 'Under/Over 2,5', 'Over 2.5'], outcomes: ['O 2.5', 'Over 2.5', 'O 2,5'] }
  ]},
  { label: 'Under / Over 3,5', columns: [
    { label: 'U', markets: ['Under/Over 3.5', 'Under/Over 3,5', 'Under 3.5'], outcomes: ['U 3.5', 'Under 3.5', 'U 3,5'] },
    { label: 'O', markets: ['Under/Over 3.5', 'Under/Over 3,5', 'Over 3.5'], outcomes: ['O 3.5', 'Over 3.5', 'O 3,5'] }
  ]},
  { label: 'Goal / NoGoal', columns: [
    { label: 'G', markets: ['Goal/NoGoal', 'Goal', 'NoGoal'], outcomes: ['Goal', 'G', 'SI'] },
    { label: 'NG', markets: ['Goal/NoGoal', 'Goal', 'NoGoal'], outcomes: ['NoGoal', 'NG', 'No Goal'] }
  ]},
  { label: 'Segna Goal Casa', columns: [
    { label: 'SI', markets: ['Segna Goal Casa'], outcomes: ['SI Casa', 'SI'] },
    { label: 'NO', markets: ['Segna Goal Casa'], outcomes: ['NO Casa', 'NO'] }
  ]},
  { label: 'Segna Goal Ospite', columns: [
    { label: 'SI', markets: ['Segna Goal Ospite'], outcomes: ['SI Ospite', 'SI'] },
    { label: 'NO', markets: ['Segna Goal Ospite'], outcomes: ['NO Ospite', 'NO'] }
  ]}
];

export function normalizeQuoteToken(value) {
  return String(value ?? '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('it-IT').replace(/\s+/g, ' ').trim();
}

export function matchesQuoteColumn(outcome, column) {
  if (!outcome || !column || column.staticField || !Array.isArray(column.markets) || !Array.isArray(column.outcomes)) return false;
  return column.markets.some(market => normalizeQuoteToken(market) === normalizeQuoteToken(outcome?.market))
    && column.outcomes.some(label => normalizeQuoteToken(label) === normalizeQuoteToken(outcome?.outcome)
      || normalizeQuoteToken(label) === normalizeQuoteToken(outcome?.label));
}

export function buildQuoteSheetGroups(matches) {
  const groups = QUOTE_GROUPS.map(group => ({
    label: group.label,
    columns: group.columns.map(column => ({ ...column, extra: false }))
  }));
  const standardColumns = groups.flatMap(group => group.columns);
  const extras = new Map();
  for (const match of Array.isArray(matches) ? matches : []) {
    for (const outcome of Array.isArray(match?.esiti) ? match.esiti : []) {
      if (standardColumns.some(column => matchesQuoteColumn(outcome, column))) continue;
      const market = String(outcome.market || 'Altri mercati').trim();
      const key = `${market}\u0000${outcome.outcome}`;
      if (!extras.has(key)) extras.set(key, {
        label: outcome.label || outcome.outcome,
        markets: [market],
        outcomes: [outcome.outcome, outcome.label],
        extra: true
      });
    }
  }
  const byMarket = new Map();
  for (const column of extras.values()) {
    const market = column.markets[0];
    if (!byMarket.has(market)) byMarket.set(market, []);
    byMarket.get(market).push(column);
  }
  for (const [label, columns] of byMarket) groups.push({ label, columns });
  return groups;
}

export function flattenQuoteSheetColumns(groups) {
  return (Array.isArray(groups) ? groups : []).flatMap(group => Array.isArray(group?.columns) ? group.columns : []);
}
