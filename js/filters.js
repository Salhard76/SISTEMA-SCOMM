/* Filtri combinabili. I filtri sugli esiti sono costruiti dinamicamente in base
   a ciò che è stato selezionato nelle partite, non su X o Goal predefiniti. */
function normalizeToken(value) {
  return String(value ?? '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('it-IT')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeDecimal(value) {
  const n = Number(String(value).replace(',', '.'));
  return Number.isFinite(n) ? n.toLocaleString('en-US', { maximumFractionDigits: 2, useGrouping: false }) : String(value);
}

export function describeOutcome(esito) {
  const raw = String(esito?.outcome ?? esito?.label ?? '').trim().replace(/\s+/g, ' ');
  const market = String(esito?.market ?? '').trim();
  let match = raw.match(/^(?:O|OVER)\s*(\d+(?:[.,]\d+)?)$/i);
  if (match) {
    const total = normalizeDecimal(match[1]);
    return { key: `totals|over|${total}`, label: `Over ${total}` };
  }
  match = raw.match(/^(?:U|UNDER)\s*(\d+(?:[.,]\d+)?)$/i);
  if (match) {
    const total = normalizeDecimal(match[1]);
    return { key: `totals|under|${total}`, label: `Under ${total}` };
  }

  const norm = normalizeToken(raw);
  const marketNorm = normalizeToken(market);
  if (norm === 'goal' || norm === 'si goal') return { key: 'goal|goal', label: 'Goal' };
  if (norm === 'nogoal' || norm === 'no goal') return { key: 'goal|nogoal', label: 'NoGoal' };
  if (['1', 'x', '2'].includes(norm) && /1x2|esito finale/.test(marketNorm)) {
    return { key: `1x2|${norm}`, label: `Esito finale · ${norm.toUpperCase()}` };
  }

  const label = raw || market || 'Esito';
  return { key: `${marketNorm || 'altro'}|${normalizeToken(raw)}`, label: market ? `${market} · ${label}` : label };
}


// Catalogo dei filtri riduzione solo sugli esiti variabili delle doppie.
// Gli esiti delle fisse sono presenti in ogni colonna: filtrarli non riduce il sistema
// in modo utile e un limite incompatibile può azzerare tutte le colonne.
export function collectVariableOutcomes(matches) {
  const catalog = new Map();
  for (const match of Array.isArray(matches) ? matches : []) {
    const selectedKeys = Array.isArray(match.selezionati) ? match.selezionati : [];
    if ((match.tipo || (selectedKeys.length > 1 ? 'doppia' : 'fissa')) !== 'doppia' || selectedKeys.length !== 2) continue;
    const selected = selectedKeys.map(key => (match.esiti || []).find(o => `${o.market}:${o.outcome}` === key)).filter(Boolean);
    for (const outcome of selected) {
      const descriptor = describeOutcome(outcome);
      if (!catalog.has(descriptor.key)) catalog.set(descriptor.key, { ...descriptor, occurrences: 0 });
      catalog.get(descriptor.key).occurrences += 1;
    }
  }
  return [...catalog.values()].sort((a, b) => a.label.localeCompare(b.label, 'it'));
}

export const maxOutcomeCount = (key, n) => c => c.esiti.filter(e => describeOutcome(e).key === key).length <= Number(n);
export const minOutcomeCount = (key, n) => c => c.esiti.filter(e => describeOutcome(e).key === key).length >= Number(n);

export function applyFilters(colonne, filters) {
  let result = colonne;
  const conteggi = [];
  for (const filtro of filters) {
    const prima = result.length;
    result = result.filter(filtro.test);
    conteggi.push({ nome: filtro.nome, colonnePrima: prima, colonneDopo: result.length });
  }
  return { colonne: result, colonnePrima: colonne.length, colonneDopo: result.length, conteggi };
}
