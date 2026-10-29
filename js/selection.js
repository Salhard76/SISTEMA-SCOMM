/* Selezione quote: 1 quota = fissa; 2 quote, anche di mercati diversi, = doppia del sistema. */
import { MAX_CHOICES_PER_MATCH } from './config.js?v=sb-v17-20261029';

export function selectionMarketKey(outcome) {
  const market = String(outcome?.market ?? '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('it-IT').replace(/,/g, '.')
    .replace(/\s*\/\s*/g, '/').replace(/\s+/g, ' ').trim();
  const total = market.match(/^(?:under\/over|under|over|u|o)\s*([1-3])\.5$/);
  if (total) return `under-over-${total[1]}.5`;
  if (/^(?:goal\/nogoal|goal|nogoal|no goal)$/.test(market)) return 'goal-nogoal';
  if (/^(?:1x2\s+)?handicap$/.test(market)) return 'handicap';
  return market;
}
export function normalizeMatchSelection(match) {
  const options = Array.isArray(match?.esiti) ? match.esiti : [];
  const source = Array.isArray(match?.selezionati) ? match.selezionati : [];
  const valid = [...new Set(source.map(value => String(value ?? '')).filter(key =>
    options.some(outcome => `${outcome.market}:${outcome.outcome}` === key)
  ))].slice(0, MAX_CHOICES_PER_MATCH);
  match.selezionati = valid;
  match.tipo = valid.length === 2 ? 'doppia' : 'fissa';
  return match;
}

export function toggleMatchOutcome(match, key) {
  const normalized = normalizeMatchSelection(match);
  const target = normalized.esiti?.find(outcome => `${outcome.market}:${outcome.outcome}` === key);
  if (!target) return { changed: false, message: 'Quota non disponibile.' };
  const selected = [...normalized.selezionati];
  if (selected.includes(key)) {
    normalized.selezionati = selected.filter(value => value !== key);
    normalizeMatchSelection(normalized);
    return { changed: true, kind: normalized.tipo, count: normalized.selezionati.length };
  }
  if (selected.length >= MAX_CHOICES_PER_MATCH) {
    return { changed: false, message: `Per ogni partita puoi selezionare al massimo ${MAX_CHOICES_PER_MATCH} quote, anche di mercati diversi. Deselezionane una prima di aggiungerne un'altra.` };
  }
  // Due selezioni possono appartenere allo stesso mercato oppure a mercati diversi
  // (per esempio 1 + X2, oppure 1 + Over 2.5).
  normalized.selezionati = [...selected, key];
  normalizeMatchSelection(normalized);
  return { changed: true, kind: normalized.tipo, count: normalized.selezionati.length };
}

export function normalizeMatchList(matches) {
  let adjustedCount = 0;
  const normalizedMatches = (Array.isArray(matches) ? matches : []).map(source => {
    const match = { ...source, selezionati: Array.isArray(source?.selezionati) ? [...source.selezionati] : [] };
    const before = JSON.stringify(match.selezionati);
    normalizeMatchSelection(match);
    if (JSON.stringify(match.selezionati) !== before) adjustedCount += 1;
    return match;
  });
  return { matches: normalizedMatches, adjustedCount };
}
