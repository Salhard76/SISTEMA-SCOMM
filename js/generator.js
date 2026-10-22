/* Generatore con limiti strutturali: massimo 10 partite, 2 esiti per partita e 1.024 colonne. */
import { quotaTotale } from './calculator.js?v=sticky-print-v6-20261022';
import { MAX_MATCHES, MAX_CHOICES_PER_MATCH, MAX_SYSTEM_COLUMNS } from './config.js?v=sticky-print-v6-20261022';

export { MAX_MATCHES, MAX_CHOICES_PER_MATCH, MAX_SYSTEM_COLUMNS };

export function generateSystem(events, maxColumns = MAX_SYSTEM_COLUMNS) {
  const sourceEvents = Array.isArray(events) ? events : [];
  if (sourceEvents.length > MAX_MATCHES) {
    return { colonne: [], quotaBaseFissa: 1, exceeded: true, reason: 'too_many_matches', theoretical: null };
  }
  const valid = sourceEvents.filter(e => Array.isArray(e.esiti) && e.esiti.length > 0);
  if (!valid.length) return { colonne: [], quotaBaseFissa: 1, exceeded: false, theoretical: 0 };

  for (const event of valid) {
    if (event.tipo !== 'fissa' && event.esiti.length > MAX_CHOICES_PER_MATCH) {
      return { colonne: [], quotaBaseFissa: 1, exceeded: true, reason: 'too_many_choices', theoretical: null };
    }
    if (event.tipo === 'doppia' && event.esiti.length !== 2) {
      return { colonne: [], quotaBaseFissa: 1, exceeded: true, reason: 'invalid_double', theoretical: null };
    }
  }

  // Non permettere mai che un valore passato dall'interfaccia superi il tetto
  // matematico assoluto dell'app (anche vecchie UI/cache con limite 65.536).
  const requestedLimit = Number(maxColumns);
  const limit = Number.isFinite(requestedLimit) && requestedLimit > 0
    ? Math.min(Math.floor(requestedLimit), MAX_SYSTEM_COLUMNS)
    : MAX_SYSTEM_COLUMNS;
  const theoretical = valid.reduce((n, event) => {
    const choices = event.tipo === 'fissa' ? 1 : event.esiti.length;
    return n * choices;
  }, 1);

  if (theoretical > limit) {
    return { colonne: [], quotaBaseFissa: 1, exceeded: true, reason: 'limit_exceeded', theoretical, limit };
  }

  let colonne = [{ esiti: [], scelte: [] }];
  for (const event of valid) {
    const options = event.tipo === 'fissa' ? [event.esiti[0]] : event.esiti;
    const next = [];
    for (const col of colonne) {
      for (const option of options) {
        next.push({
          esiti: [...col.esiti, { ...option, eventId: event.id, partita: event.nome }],
          scelte: [...col.scelte, { eventId: event.id, label: option.label, outcome: option.outcome }]
        });
      }
    }
    colonne = next;
  }

  const quotaBaseFissa = valid.filter(e => e.tipo === 'fissa')
    .reduce((q, e) => q * Number(e.esiti[0].quota), 1);
  colonne = colonne.map((c, i) => ({
    ...c,
    id: i + 1,
    quotaTotale: quotaTotale(c.esiti),
    // Probabilità stimata (aggio rimosso gamba per gamba quando il mercato è completo).
    prob: c.esiti.reduce((p, e) => p * (Number.isFinite(e.prob) ? e.prob : 1 / Number(e.quota)), 1)
  }));

  // Controllo finale anti-regressione: mai restituire più di 1.024 colonne.
  if (colonne.length > MAX_SYSTEM_COLUMNS) {
    return { colonne: [], quotaBaseFissa: 1, exceeded: true, reason: 'limit_exceeded', theoretical, limit: MAX_SYSTEM_COLUMNS };
  }
  return { colonne, quotaBaseFissa, exceeded: false, theoretical, limit };
}
