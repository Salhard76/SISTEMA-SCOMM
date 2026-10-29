/** Controlli economici preliminari condivisi dal foglio quote e dal sistema generato. */

/**
 * Evidenzia una quota sotto 2.00 quando nella stessa partita esiste almeno
 * un'altra quota giocabile, distinta, anch'essa sotto 2.00. In questo modo
 * entrambe le quote di una potenziale doppia che non rispetta il criterio
 * COMPENSAZIONE vengono evidenziate in rosso.
 */
export function hasUnprofitableDoublePartner(outcome, outcomes, threshold = 2) {
  const odd = Number(outcome?.quota);
  if (!Number.isFinite(odd) || odd <= 1 || odd >= threshold) return false;
  return (Array.isArray(outcomes) ? outcomes : []).some(other => {
    if (!other || other === outcome) return false;
    const otherOdd = Number(other.quota);
    return Number.isFinite(otherOdd) && otherOdd > 1 && otherOdd < threshold;
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
