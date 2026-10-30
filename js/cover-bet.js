/* Copertura dell'ultima partita: complementi di esito e calcolo della puntata. */
const clean = value => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .toLocaleLowerCase('it-IT').replace(/\s+/g, ' ').trim();
const outcomeKey = outcome => `${outcome?.market ?? ''}:${outcome?.outcome ?? ''}`;

function findOutcome(match, market, outcome) {
  const targetMarket = clean(market);
  const targetOutcome = clean(outcome);
  return (match?.esiti ?? []).find(item => clean(item.market) === targetMarket
    && (clean(item.outcome) === targetOutcome || clean(item.label) === targetOutcome)) ?? null;
}

/* Famiglie di esiti mutuamente esclusivi: ogni esito "copre" uno o più risultati finali della famiglia.
   Funziona sia con i nomi di mercato del PDF Sisal (Under/Over 2.5, Goal/NoGoal) sia con quelli delle
   quote scritte a mano (Over 2.5, Under 2.5, Goal, NoGoal): prima, con le quote manuali, non veniva
   trovata alcuna controparte. */
const RESULTS_1X2 = ['1', 'x', '2'];
const COVERS_1X2 = { '1': ['1'], 'x': ['x'], '2': ['2'], '1x': ['1', 'x'], 'x2': ['x', '2'], '12': ['1', '2'] };
export function describeCoverOutcome(outcome) {
  if (!outcome) return null;
  const market = clean(outcome.market);
  const text = clean(outcome.outcome);
  const label = clean(outcome.label);
  if (['esito finale', '1x2', 'doppia chance'].includes(market)) {
    const covers = COVERS_1X2[text] || COVERS_1X2[label];
    return covers ? { family: '1x2', results: RESULTS_1X2, covers } : null;
  }
  const total = market.match(/^(?:under\s*\/\s*over|under|over)\s*(1[.,]5|2[.,]5|3[.,]5)$/);
  if (total) {
    const side = /^u/.test(text) || /^u/.test(label) ? 'u' : /^o/.test(text) || /^o/.test(label) ? 'o' : null;
    return side ? { family: `uo-${total[1].replace(',', '.')}`, results: ['u', 'o'], covers: [side] } : null;
  }
  if (['goal/nogoal', 'goal/no goal', 'goal', 'nogoal', 'no goal'].includes(market)) {
    const side = /^no/.test(text) || /^no/.test(label) ? 'nogoal' : 'goal';
    return { family: 'goal', results: ['goal', 'nogoal'], covers: [side] };
  }
  if (['segna goal casa', 'segna goal ospite'].includes(market)) {
    const side = /^no/.test(text) || /^no/.test(label) ? 'no' : 'si';
    return { family: market, results: ['si', 'no'], covers: [side] };
  }
  return null;
}
const RESULT_LABELS = { goal: { goal: 'Goal', nogoal: 'NoGoal' }, u: 'Under', o: 'Over', si: 'SÌ', no: 'NO' };
export function coverResultLabel(family, result) {
  if (family === '1x2') return result.toUpperCase();
  if (family.startsWith('uo-')) return `${RESULT_LABELS[result]} ${family.slice(3)}`;
  if (family === 'goal') return RESULT_LABELS.goal[result];
  return `${RESULT_LABELS[result]} ${family.endsWith('casa') ? 'Casa' : 'Ospite'}`;
}

/** Trova quote che coprono esattamente l'esito selezionato, non semplici correlazioni. */
export function findExactCoverCandidates(match, selectedOutcome) {
  if (!match || !selectedOutcome) return [];
  const selected = describeCoverOutcome(selectedOutcome);
  if (!selected) return [];
  const needed = selected.results.filter(result => !selected.covers.includes(result));
  if (!needed.length) return [];
  const pairs = [];
  for (const item of match.esiti ?? []) {
    const candidate = describeCoverOutcome(item);
    if (!candidate || candidate.family !== selected.family || Number(item.quota) <= 1) continue;
    if (candidate.covers.length !== needed.length || !needed.every(result => candidate.covers.includes(result))) continue;
    pairs.push({
      outcome: item,
      exact: true,
      reason: selected.family === '1x2'
        ? (candidate.covers.length > 1 ? 'Doppia chance che copre tutti gli esiti contrari' : 'Controparte esatta della doppia chance')
        : 'Esito opposto dello stesso mercato binario'
    });
  }
  return [...new Map(pairs.map(item => [outcomeKey(item.outcome), item])).values()];
}

/** Ordina le partite selezionate per data e ora locale del palinsesto. */
export function getLastChronologicalMatch(matches) {
  const active = (Array.isArray(matches) ? matches : []).filter(match => (match.selezionati ?? []).length > 0);
  if (!active.length) return null;
  const now = new Date();
  const year = now.getFullYear();
  const stamp = (match, index) => {
    const dm = String(match.data ?? '').match(/(\d{1,2})\s*[\/.-]\s*(\d{1,2})/);
    const tm = String(match.ora ?? '').match(/(\d{1,2})[.:](\d{2})/);
    if (!dm) return Number.NEGATIVE_INFINITY + index;
    let y = year;
    const month = Number(dm[2]);
    if (month < now.getMonth() + 1 - 6) y += 1;
    if (month > now.getMonth() + 1 + 6) y -= 1;
    return new Date(y, month - 1, Number(dm[1]), Number(tm?.[1] ?? 0), Number(tm?.[2] ?? 0)).getTime();
  };
  return active.map((match, index) => ({ match, stamp: stamp(match, index), index }))
    .sort((a, b) => a.stamp - b.stamp || a.index - b.index).at(-1)?.match ?? active.at(-1);
}

/** Colonne ancora vive dopo i risultati effettivi delle partite precedenti (null se non tutti registrati). */
function liveColumnsFor(columns, previousMatches, lastMatch) {
  const previous = (previousMatches ?? []).filter(match => match.id !== lastMatch.id);
  if (previous.some(match => !match.esitoEffettivo || match.esitoEffettivo === '__lost__')) return null;
  return columns.filter(column => previous.every(match => {
    const leg = (column.esiti ?? []).find(item => item.eventId === match.id);
    if (!leg) return false;
    return match.esitoEffettivo === '__both__'
      ? (match.selezionati ?? []).includes(outcomeKey(leg))
      : outcomeKey(leg) === match.esitoEffettivo;
  }));
}

/** Ritorno lordo delle colonne ancora vive, per ogni esito possibile dell'ultima partita. */
export function calculateLiveReturns({ columns, previousMatches, lastMatch, perColumnStake, bonusForColumn }) {
  const stake = Number(perColumnStake);
  if (!Array.isArray(columns) || !columns.length || !lastMatch || !Number.isFinite(stake) || stake <= 0) return [];
  const live = liveColumnsFor(columns, previousMatches, lastMatch);
  if (!live) return [];
  const finalSelections = (lastMatch.selezionati ?? []).map(key =>
    (lastMatch.esiti ?? []).find(item => outcomeKey(item) === key)
  ).filter(Boolean);
  return finalSelections.map(selected => {
    const winningColumns = live.filter(column => {
      const leg = (column.esiti ?? []).find(item => item.eventId === lastMatch.id);
      return leg && outcomeKey(leg) === outcomeKey(selected);
    });
    const grossReturn = winningColumns.reduce((sum, column) => {
      const bonus = typeof bonusForColumn === 'function' ? Number(bonusForColumn(column)) || 0 : 0;
      return sum + Number(column.quotaTotale) * stake * (1 + bonus);
    }, 0);
    return { selected, grossReturn, winningColumns: winningColumns.length, liveColumns: live.length };
  });
}

/** Puntata che pareggia il ritorno lordo tra esito originale e controparte. */
export function calculateCoverStake(targetGrossReturn, coverOdds) {
  const target = Number(targetGrossReturn);
  const odds = Number(coverOdds);
  if (!Number.isFinite(target) || target <= 0 || !Number.isFinite(odds) || odds <= 1) return null;
  const stake = target / odds;
  return {
    stake,
    coverGrossReturn: stake * odds,
    balancedGrossAfterCoverStake: target - stake,
    netOnCoverAfterStake: stake * (odds - 1)
  };
}

/**
 * Migliore copertura SINGOLA sull'ultima partita, calcolata sul risultato netto di ogni possibile esito finale.
 * Per ciascun risultato r: netto = ritorno del sistema se r - spesa del sistema - puntata di copertura
 * + (puntata x quota, se la copertura comprende r). Per ogni quota disponibile della stessa famiglia
 * (1X2/Doppia Chance oppure un mercato binario) si sceglie la puntata che massimizza il caso peggiore.
 * Con due esiti selezionati nell'ultima partita copre l'esito rimanente invece di proteggere ogni ramo a parte
 * (richiedeva puntate molto più alte). Restituisce null se la copertura non è calcolabile in modo univoco
 * (per esempio esiti di mercati diversi nell'ultima partita).
 */
export function calculateBestSingleCover({ columns, previousMatches, lastMatch, perColumnStake, totalSpend, bonusForColumn }) {
  const stake = Number(perColumnStake);
  const spend = Number(totalSpend);
  if (!Array.isArray(columns) || !columns.length || !lastMatch || !(stake > 0) || !(spend > 0)) return null;
  const selected = (lastMatch.selezionati ?? []).map(key => (lastMatch.esiti ?? []).find(item => outcomeKey(item) === key)).filter(Boolean);
  const described = selected.map(describeCoverOutcome);
  if (!described.length || described.some(item => !item) || new Set(described.map(item => item.family)).size !== 1) return null;
  const { family, results } = described[0];
  const live = liveColumnsFor(columns, previousMatches, lastMatch);
  if (!live) return null;
  const systemReturn = Object.fromEntries(results.map(result => [result, 0]));
  for (const column of live) {
    const leg = (column.esiti ?? []).find(item => item.eventId === lastMatch.id);
    const legInfo = describeCoverOutcome(leg);
    if (!legInfo || legInfo.family !== family) return null;
    const bonus = typeof bonusForColumn === 'function' ? Number(bonusForColumn(column)) || 0 : 0;
    const gross = Number(column.quotaTotale) * stake * (1 + bonus);
    for (const result of legInfo.covers) systemReturn[result] += gross;
  }
  const without = Object.fromEntries(results.map(result => [result, systemReturn[result] - spend]));
  const worstWithout = Math.min(...Object.values(without));
  const options = [];
  for (const item of lastMatch.esiti ?? []) {
    const info = describeCoverOutcome(item);
    const odds = Number(item.quota);
    if (!info || info.family !== family || !(odds > 1) || info.covers.length >= results.length) continue;
    const inside = Math.min(...info.covers.map(result => without[result]));
    const outside = Math.min(...results.filter(result => !info.covers.includes(result)).map(result => without[result]));
    if (!(outside > inside + 1e-9)) continue;                    // coprire non migliora il caso peggiore
    // L'intersezione teorica massimizza il caso peggiore con puntate continue.
    // Con puntate ai centesimi, però, il valore migliore può essere il centesimo sotto
    // oppure quello sopra (la pendenza dei due scenari non è simmetrica). Valutiamo entrambi.
    const exactCents = ((outside - inside) / odds) * 100;
    const centCandidates = [...new Set([
      Math.floor(exactCents) / 100,
      Math.ceil(exactCents) / 100
    ])].filter(value => value > 0);
    for (const coverStake of centCandidates) {
      const nets = Object.fromEntries(results.map(result => [
        result, without[result] - coverStake + (info.covers.includes(result) ? coverStake * odds : 0)
      ]));
      const worst = Math.min(...Object.values(nets));
      if (worst > worstWithout + 0.005) options.push({ outcome: item, odds, stake: coverStake, covers: info.covers, nets, worst });
    }
  }
  options.sort((a, b) => b.worst - a.worst || a.stake - b.stake);
  return { family, results, systemReturn, spend, without, worstWithout, best: options[0] ?? null, alternatives: options.slice(1, 3) };
}

function outcomeKeyLocal(outcome) { return `${outcome?.market ?? ''}:${outcome?.outcome ?? ''}`; }
