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

/** Trova quote che coprono esattamente l'esito selezionato, non semplici correlazioni. */
export function findExactCoverCandidates(match, selectedOutcome) {
  if (!match || !selectedOutcome) return [];
  const market = clean(selectedOutcome.market);
  const value = clean(selectedOutcome.outcome || selectedOutcome.label);
  const label = clean(selectedOutcome.label || selectedOutcome.outcome);
  const pairs = [];
  const add = (targetMarket, targetOutcome, reason) => {
    const found = findOutcome(match, targetMarket, targetOutcome);
    if (found && Number(found.quota) > 1) pairs.push({ outcome: found, reason, exact: true });
  };

  if (market === 'doppia chance') {
    const complement = ({ '1x': '2', 'x2': '1', '12': 'x' })[value] || ({ '1x': '2', 'x2': '1', '12': 'x' })[label];
    if (complement) add('esito finale', complement, 'Controparte esatta della doppia chance');
  } else if (market === 'esito finale') {
    const complement = ({ '1': 'x2', '2': '1x', 'x': '12' })[value] || ({ '1': 'x2', '2': '1x', 'x': '12' })[label];
    if (complement) add('doppia chance', complement, 'Doppia chance che copre tutti gli esiti contrari');
  } else if (market.startsWith('under/over ')) {
    const opposite = /^(?:u|under)\s*/.test(label) || /^under/.test(value) ? 'o' : 'u';
    const threshold = (selectedOutcome.market.match(/[1-3][.,]5/) || [])[0];
    if (threshold) {
      const target = findOutcome(match, selectedOutcome.market, `${opposite} ${threshold}`);
      if (target && Number(target.quota) > 1) pairs.push({ outcome: target, reason: 'Esito opposto dello stesso Under/Over', exact: true });
    }
  } else if (['goal/nogoal', 'segna goal casa', 'segna goal ospite'].includes(market)) {
    const isNo = /^(nogoal|no|no casa|no ospite)$/.test(value) || /^(nogoal|no)/.test(label);
    const opposite = isNo ? (market === 'goal/nogoal' ? 'goal' : market === 'segna goal casa' ? 'si casa' : 'si ospite')
      : (market === 'goal/nogoal' ? 'nogoal' : market === 'segna goal casa' ? 'no casa' : 'no ospite');
    const target = findOutcome(match, selectedOutcome.market, opposite);
    if (target && Number(target.quota) > 1) pairs.push({ outcome: target, reason: 'Esito opposto dello stesso mercato binario', exact: true });
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

/** Ritorno lordo delle colonne ancora vive, per ogni esito possibile dell'ultima partita. */
export function calculateLiveReturns({ columns, previousMatches, lastMatch, perColumnStake, bonusForColumn }) {
  const stake = Number(perColumnStake);
  if (!Array.isArray(columns) || !columns.length || !lastMatch || !Number.isFinite(stake) || stake <= 0) return [];
  const previous = (previousMatches ?? []).filter(match => match.id !== lastMatch.id);
  if (previous.some(match => !match.esitoEffettivo || match.esitoEffettivo === '__lost__')) return [];
  const live = columns.filter(column => previous.every(match => {
    const leg = (column.esiti ?? []).find(item => item.eventId === match.id);
    if (!leg) return false;
    return match.esitoEffettivo === '__both__'
      ? (match.selezionati ?? []).includes(outcomeKey(leg))
      : outcomeKey(leg) === match.esitoEffettivo;
  }));
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

function outcomeKeyLocal(outcome) { return `${outcome?.market ?? ''}:${outcome?.outcome ?? ''}`; }
