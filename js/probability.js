/* Probabilità stimate "senza aggio" e mutua esclusività delle colonne. */
import { selectionMarketKey } from './selection.js?v=sb-v21-20261030';

// Numero di esiti che formano una partizione completa del mercato (le probabilità sommano a 1,
// tranne la Doppia Chance dove sommano a 2).
const PARTITION_SIZE = {
  'esito finale': 3, '1x2': 3, 'handicap': 3, 'doppia chance': 3,
  'under-over-1.5': 2, 'under-over-2.5': 2, 'under-over-3.5': 2,
  'goal-nogoal': 2, 'segna goal casa': 2, 'segna goal ospite': 2
};

/* Per ogni quota di un mercato completo: probabilità = (1/q) ÷ somma(1/q), cioè il margine del bookmaker
   viene tolto in modo proporzionale. Restituisce una Map "mercato:esito" → probabilità.
   I mercati incompleti o con quote anomale (somma < 99%) non vengono corretti. */
export function fairProbabilities(match) {
  const groups = new Map();
  for (const outcome of Array.isArray(match?.esiti) ? match.esiti : []) {
    const key = selectionMarketKey(outcome);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(outcome);
  }
  const result = new Map();
  for (const [key, outcomes] of groups) {
    if (PARTITION_SIZE[key] !== outcomes.length) continue;
    const outcomeKeys = outcomes.map(o => String(o.outcome ?? '').trim().toLocaleLowerCase('it-IT'));
    if (outcomeKeys.some(value => !value) || new Set(outcomeKeys).size !== outcomeKeys.length) continue;
    const odds = outcomes.map(o => Number(o.quota));
    if (odds.some(odd => !Number.isFinite(odd) || odd <= 1)) continue;
    const mass = key === 'doppia chance' ? 2 : 1;
    const impliedSum = odds.reduce((total, odd) => total + 1 / odd, 0);
    const normalizationSum = impliedSum / mass;
    // Mercati incompleti o quote con overround anomalo: non applicare una correzione fuorviante.
    if (!Number.isFinite(normalizationSum) || normalizationSum < 0.99) continue;
    const probabilities = odds.map(odd => (1 / odd) / normalizationSum);
    if (probabilities.some(probability => !Number.isFinite(probability) || probability <= 0 || probability > 1)) continue;
    outcomes.forEach((outcome, index) => result.set(`${outcome.market}:${outcome.outcome}`, probabilities[index]));
  }
  return result;
}

/* Le colonne sono sicuramente mutuamente esclusive solo se le scelte alternative di ogni doppia
   rappresentano esiti dello stesso mercato esclusivi tra loro. Mercati diversi vengono trattati
   in modo prudenziale come potenzialmente sovrapposti (es. 1 + Over 2.5). Anche gli esiti Doppia
   Chance possono sovrapporsi tra loro (es. 1X e X2 sulla X). */
export function isExclusiveSystem(events) {
  return (Array.isArray(events) ? events : []).every(event => {
    if (event.tipo === 'fissa') return true;
    const outcomes = Array.isArray(event.esiti) ? event.esiti : [];
    if (outcomes.some(outcome => selectionMarketKey(outcome) === 'doppia chance')) return false;
    return outcomes.every(outcome => selectionMarketKey(outcome) === selectionMarketKey(outcomes[0]));
  });
}

export function columnProbability(column) {
  return (column?.esiti || []).reduce((p, e) => p * (Number.isFinite(e.prob) ? e.prob : 1 / Number(e.quota)), 1);
}
