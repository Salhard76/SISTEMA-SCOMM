/* Probabilità stimate "senza aggio" e mutua esclusività delle colonne. */
import { selectionMarketKey } from './selection.js';

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
    const mass = key === 'doppia chance' ? 2 : 1;
    const sum = outcomes.reduce((total, o) => total + 1 / Number(o.quota), 0) / mass;
    if (!(sum >= 0.99)) continue;
    for (const o of outcomes) result.set(`${o.market}:${o.outcome}`, (1 / Number(o.quota)) / sum);
  }
  return result;
}

/* Le colonne sono mutuamente esclusive (al massimo una può vincere) se ogni doppia è composta da
   esiti incompatibili tra loro: non vale per la Doppia Chance (1X e X2 si sovrappongono sulla X). */
export function isExclusiveSystem(events) {
  return (Array.isArray(events) ? events : []).every(event =>
    event.tipo === 'fissa' || event.esiti.every(outcome => selectionMarketKey(outcome) !== 'doppia chance'));
}

export function columnProbability(column) {
  return (column?.esiti || []).reduce((p, e) => p * (Number.isFinite(e.prob) ? e.prob : 1 / Number(e.quota)), 1);
}
