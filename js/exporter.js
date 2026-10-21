/* Esportazione CSV conforme a Excel in locale italiana e stampa browser. */
function csvCell(value) {
  const text = String(value ?? '');
  return `"${text.replace(/"/g, '""')}"`;
}
export function exportCSV(colonne) {
  const rows = [['Colonna','Esiti','Quota totale','Probabilità implicita (%)']];
  for (const c of colonne) rows.push([c.id, c.esiti.map(e => `${e.partita}: ${e.label} @ ${e.quota}`).join(' | '), c.quotaTotale.toFixed(4), (100 / c.quotaTotale).toFixed(4)]);
  const csv = '\ufeff' + rows.map(row => row.map(csvCell).join(';')).join('\r\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = 'sistema-scommesse.csv'; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function exportText(colonne, puntata) {
  const lines = ['SISTEMA SCOMMESSE BUILDER', `Puntata per colonna: ${puntata.toFixed(2)} €`, ''];
  for (const c of colonne) lines.push(`${c.id}. ${c.esiti.map(e => `${e.partita}: ${e.label}`).join(' | ')} | quota ${c.quotaTotale.toFixed(3)} | ritorno ${(c.quotaTotale * puntata).toFixed(2)} €`);
  const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = 'sistema-scommesse.txt'; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function stampaTabella() { window.print(); }
