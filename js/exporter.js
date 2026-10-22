/* Esportazioni leggibili in Excel e stampa. */
export const PRINT_COLUMNS_PER_PAGE = 32;

/** Divide le combinazioni per il layout di stampa: 32 colonne (righe) per foglio. */
export function splitPrintRows(rows, pageSize = PRINT_COLUMNS_PER_PAGE) {
  if (!Array.isArray(rows)) throw new TypeError('Le righe di stampa devono essere un array.');
  if (!Number.isInteger(pageSize) || pageSize < 1) throw new RangeError('La dimensione della pagina deve essere un intero positivo.');
  const pages = [];
  for (let i = 0; i < rows.length; i += pageSize) pages.push(rows.slice(i, i + pageSize));
  return pages;
}
function csvText(value) { return `"${String(value ?? '').replace(/"/g, '""')}"`; }
// Numeri con virgola decimale e senza virgolette: Excel in italiano li legge come numeri
// (con il punto decimale, o tra virgolette, restavano testo e le somme non funzionavano).
function csvNum(value, decimals = 2) {
  const n = Number(value);
  return Number.isFinite(n) ? n.toFixed(decimals).replace('.', ',') : '';
}
function download(content, type, filename) {
  const blob = new Blob([content], { type }); const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function buildCsv(colonne) {
  const head = ['N. colonna', ...Array.from({ length: 10 }, (_, i) => `Partita ${i + 1} / esito`), 'Quota totale', 'Probabilità implicita con aggio (%)', 'Probabilità stimata senza aggio (%)', 'Bonus Sisal stimato (%)', 'Ritorno lordo stimato (€)', 'Profitto teorico stimato (€)'];
  const rows = [
    [csvText('SISTEMA SCOMMESSE BUILDER')],
    [csvText('Nota'), csvText('Una riga corrisponde a una colonna del sistema. Importi, probabilità e bonus sono stime, non garantiti.')],
    [],
    head.map(csvText)
  ];
  for (const c of colonne) {
    const esiti = c.esiti.map(e => csvText(`${e.partita}: ${e.label} (quota ${String(e.quota).replace('.', ',')})`));
    while (esiti.length < 10) esiti.push('');
    const prob = Number.isFinite(c.prob) ? c.prob : 1 / c.quotaTotale;
    rows.push([csvNum(c.id, 0), ...esiti.slice(0, 10), csvNum(c.quotaTotale), csvNum(100 / c.quotaTotale), csvNum(prob * 100), csvNum(c.bonusPercentuale || 0), csvNum(c.ritornoStimato || 0), csvNum(c.profittoStimato || 0)]);
  }
  return '\ufeff' + rows.map(row => row.join(';')).join('\r\n');
}
export function exportCSV(colonne) {
  download(buildCsv(colonne), 'text/csv;charset=utf-8;', 'sistema-scommesse-leggibile.csv');
}
export function exportText(colonne, puntata) {
  const lines = ['SISTEMA SCOMMESSE BUILDER', `Puntata per colonna: ${puntata.toFixed(2)} €`, `Colonne esportate: ${colonne.length}`, 'Nota: bonus e ritorni sono stime non garantite.', ''];
  for (const c of colonne) lines.push(`COLONNA ${c.id}`, ...c.esiti.map(e => `  • ${e.partita}: ${e.label} (quota ${e.quota})`), `  Quota totale: ${Number(c.quotaTotale).toFixed(2)} | Prob. stimata: ${((Number.isFinite(c.prob) ? c.prob : 1 / c.quotaTotale) * 100).toFixed(3)}% | Bonus stimato: ${(Number(c.bonusPercentuale)||0).toFixed(2)}% | Ritorno lordo: ${Number(c.ritornoStimato||0).toFixed(2)} € | Profitto teorico: ${Number(c.profittoStimato||0).toFixed(2)} €`, '');
  download(lines.join('\n'), 'text/plain;charset=utf-8', 'sistema-scommesse-dettaglio.txt');
}
export function printWithMode(mode) {
  const pageRule = document.getElementById?.('runtimePrintPageRule');
  const previousPageRule = pageRule?.textContent ?? '';
  // Regola @page globale: mantiene lo stesso orientamento nel browser desktop e nel print manager mobile.
  if (pageRule) pageRule.textContent = mode === 'table'
    ? '@page { size: A4 landscape; margin: 5mm; }'
    : '@page { size: A4 portrait; margin: 6mm; }';
  document.body.dataset.printMode = mode;
  // Forza il ricalcolo sincrono di orientamento e contenuto prima del print manager mobile.
  void document.documentElement?.offsetHeight;
  let cleaned = false;
  let timeoutId = null;
  const clear = () => {
    if (cleaned) return;
    cleaned = true;
    delete document.body.dataset.printMode;
    if (pageRule) pageRule.textContent = previousPageRule;
    window.removeEventListener('afterprint', clear);
    if (timeoutId !== null) window.clearTimeout(timeoutId);
  };
  window.addEventListener('afterprint', clear);
  // Android/alcuni browser non inviano sempre afterprint dopo Annulla.
  timeoutId = window.setTimeout(clear, 60000);
  try { window.print(); } catch (error) { clear(); throw error; }
}
export function stampaTabella() { printWithMode('table'); }
