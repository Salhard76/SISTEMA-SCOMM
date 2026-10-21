/* Generatore iterativo: evita ricorsione e interrompe se supera il limite richiesto. */
import { quotaTotale } from './calculator.js';

export function generateSystem(events, maxColumns = 32768) {
  const valid = events.filter(e => Array.isArray(e.esiti) && e.esiti.length > 0);
  if (!valid.length) return { colonne: [], quotaBaseFissa: 1, exceeded: false };
  const doubles = valid.filter(e => e.tipo !== 'fissa' && e.esiti.length > 1);
  const theoretical = doubles.reduce((n, e) => n * e.esiti.length, 1);
  if (theoretical > maxColumns) {
    return { colonne: [], quotaBaseFissa: 1, exceeded: true, theoretical };
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
    ...c, id: i + 1, quotaTotale: quotaTotale(c.esiti),
    pareggi: c.esiti.filter(e => e.outcome === 'X').length,
    goalSi: c.esiti.filter(e => e.outcome === 'Goal').length,
    quoteAlte: c.esiti.filter(e => Number(e.quota) > 3).length
  }));
  return { colonne, quotaBaseFissa, exceeded: false, theoretical };
}
