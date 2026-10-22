/* Selezione quote della griglia: 1 quota = fissa, 2 quote dello stesso mercato = doppia. */

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
  ))].slice(0, 2);
  if (valid.length === 2) {
    const first = options.find(outcome => `${outcome.market}:${outcome.outcome}` === valid[0]);
    const second = options.find(outcome => `${outcome.market}:${outcome.outcome}` === valid[1]);
    if (!first || !second || selectionMarketKey(first) !== selectionMarketKey(second)) valid.splice(1, 1);
  }
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
  if (selected.length === 0) {
    normalized.selezionati = [key];
  } else {
    const first = normalized.esiti.find(outcome => `${outcome.market}:${outcome.outcome}` === selected[0]);
    if (!first || selectionMarketKey(first) !== selectionMarketKey(target)) {
      // Un mercato differente sostituisce la scelta precedente, non crea una doppia artificiale.
      normalized.selezionati = [key];
    } else if (selected.length === 1) {
      normalized.selezionati = [selected[0], key];
    } else {
      return { changed: false, message: 'Sono già selezionate due quote in questo mercato. Deselezionane una per cambiarle.' };
    }
  }
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
