/* Esportazioni leggibili in Excel e stampa. */
function csvCell(value) { return `"${String(value ?? '').replace(/"/g, '""')}"`; }
function download(content, type, filename) {
  const blob = new Blob([content], { type }); const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function exportCSV(colonne) {
  const rows = [
    ['SISTEMA SCOMMESSE BUILDER'],
    ['Nota', 'Una riga corrisponde a una colonna del sistema. Importi e bonus sono stime, non garantiti.'],
    [],
    ['N. colonna','Partita 1 / esito','Partita 2 / esito','Partita 3 / esito','Partita 4 / esito','Partita 5 / esito','Partita 6 / esito','Partita 7 / esito','Partita 8 / esito','Partita 9 / esito','Partita 10 / esito','Quota totale','Probabilità implicita (%)','Bonus Sisal stimato (%)','Ritorno lordo stimato (€)','Profitto teorico stimato (€)']
  ];
  for (const c of colonne) {
    const esiti = c.esiti.map(e => `${e.partita}: ${e.label} (quota ${e.quota})`);
    while (esiti.length < 10) esiti.push('');
    rows.push([c.id, ...esiti.slice(0,10), Number(c.quotaTotale).toFixed(2), (100 / c.quotaTotale).toFixed(2), Number(c.bonusPercentuale || 0).toFixed(2), Number(c.ritornoStimato || 0).toFixed(2), Number(c.profittoStimato || 0).toFixed(2)]);
  }
  download('\ufeff' + rows.map(row => row.map(csvCell).join(';')).join('\r\n'), 'text/csv;charset=utf-8;', 'sistema-scommesse-leggibile.csv');
}
export function exportText(colonne, puntata) {
  const lines = ['SISTEMA SCOMMESSE BUILDER', `Puntata per colonna: ${puntata.toFixed(2)} €`, `Colonne esportate: ${colonne.length}`, 'Nota: bonus e ritorni sono stime non garantite.', ''];
  for (const c of colonne) lines.push(`COLONNA ${c.id}`, ...c.esiti.map(e => `  • ${e.partita}: ${e.label} (quota ${e.quota})`), `  Quota totale: ${Number(c.quotaTotale).toFixed(2)} | Bonus stimato: ${(Number(c.bonusPercentuale)||0).toFixed(2)}% | Ritorno lordo: ${Number(c.ritornoStimato||0).toFixed(2)} € | Profitto teorico: ${Number(c.profittoStimato||0).toFixed(2)} €`, '');
  download(lines.join('\n'), 'text/plain;charset=utf-8', 'sistema-scommesse-dettaglio.txt');
}
export function stampaTabella() { document.body.dataset.printMode = 'table'; window.print(); delete document.body.dataset.printMode; }
