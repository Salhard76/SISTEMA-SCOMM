/** Controlli economici preliminari condivisi dal foglio quote e dal sistema generato. */

/**
 * Restituisce la chiave del mercato binario supportato dal controllo visivo.
 * I mercati a tre esiti (1X2, Handicap, Doppia Chance) e quelli non riconosciuti
 * non vengono mai considerati coppie Under/Over o Goal/NoGoal.
 */
function binaryMarketKey(outcome) {
  const market = String(outcome?.market ?? '').normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('it-IT')
    .replace(/\s+/g, ' ').trim();
  const total = market.match(/^(?:under\s*\/\s*over|under|over)\s*(1[.,]5|2[.,]5|3[.,]5)$/);
  if (total) return `under-over-${total[1].replace(',', '.')}`;
  if (['goal/nogoal', 'goal/no goal', 'goal', 'nogoal', 'no goal'].includes(market)) return 'goal-nogoal';
  if (market === 'segna goal casa') return 'segna-goal-casa';
  if (market === 'segna goal ospite') return 'segna-goal-ospite';
  return null;
}

/**
 * Evidenzia entrambe le quote solo se appartengono a un mercato binario
 * riconosciuto (Under/Over, Goal/NoGoal, Segna Goal Casa/Ospite), il mercato
 * contiene esattamente due esiti distinti e tutte e due le quote sono <= 2.00.
 * Non dipende dalle selezioni attive: segnala la coppia importata nel foglio.
 */
export function hasUnprofitableDoublePartner(outcome, outcomes, threshold = 2) {
  const marketKey = binaryMarketKey(outcome);
  if (!marketKey) return false;
  const marketOutcomes = (Array.isArray(outcomes) ? outcomes : [])
    .filter(item => item && binaryMarketKey(item) === marketKey);
  if (marketOutcomes.length !== 2) return false;
  const distinctOutcomes = new Set(marketOutcomes.map(item => String(item.outcome ?? item.label ?? '').trim().toLocaleLowerCase('it-IT')));
  if (distinctOutcomes.size !== 2 || !marketOutcomes.includes(outcome)) return false;
  return marketOutcomes.every(item => {
    const odd = Number(item.quota);
    return Number.isFinite(odd) && odd > 1 && odd <= threshold;
  });
}

/** Stessa stima bonus usata nelle righe della tabella, inclusa la soglia e il tetto. */
export function estimateBonusFraction(column, enabled = true) {
  if (!enabled) return 0;
  const eligible = (Array.isArray(column?.esiti) ? column.esiti : [])
    .filter(outcome => Number(outcome?.quota) >= 1.25).length;
  if (eligible < 5) return 0;
  return Math.min(Math.pow(1.04, eligible - 4) - 1, 1.77);
}

/**
 * Confronta il ritorno lordo teorico minimo di una singola colonna vincente
 * con la spesa complessiva effettiva. Non stima la probabilità che una colonna
 * vinca e quindi non è una garanzia di vincita.
 */
export function assessMinimumCoverage(columns, allocation, bonusEnabled = true) {
  if (!Array.isArray(columns) || columns.length === 0) {
    return { status: 'no-columns', valid: false, minReturn: 0, totalStake: 0, difference: null, minBonusFraction: 0 };
  }
  if (!allocation?.valid || !Number.isFinite(Number(allocation.perColumn)) || Number(allocation.perColumn) <= 0
    || !Number.isFinite(Number(allocation.total)) || Number(allocation.total) <= 0) {
    return { status: 'invalid-stake', valid: false, minReturn: null, totalStake: Number(allocation?.total) || 0, difference: null, minBonusFraction: 0 };
  }

  let minReturn = Infinity;
  let minBonusFraction = 0;
  let minColumnId = null;
  for (const column of columns) {
    const oddsMultiplier = Number(column?.quotaTotale);
    if (!Number.isFinite(oddsMultiplier) || oddsMultiplier <= 0) {
      return { status: 'invalid-columns', valid: false, minReturn: null, totalStake: Number(allocation.total), difference: null, minBonusFraction: 0 };
    }
    const bonusFraction = estimateBonusFraction(column, bonusEnabled);
    const grossReturn = oddsMultiplier * Number(allocation.perColumn) * (1 + bonusFraction);
    if (!Number.isFinite(grossReturn) || grossReturn < 0) {
      return { status: 'invalid-columns', valid: false, minReturn: null, totalStake: Number(allocation.total), difference: null, minBonusFraction: 0 };
    }
    if (grossReturn < minReturn) {
      minReturn = grossReturn;
      minBonusFraction = bonusFraction;
      minColumnId = column.id ?? null;
    }
  }
  const totalStake = Number(allocation.total);
  const difference = minReturn - totalStake;
  return {
    status: difference >= -1e-9 ? 'covered' : 'uncovered',
    valid: true,
    minReturn,
    totalStake,
    difference,
    minBonusFraction,
    minColumnId,
    columnCount: columns.length
  };
}
