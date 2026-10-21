/* Calcoli puri per quote e colonne. */
export function quotaTotale(esiti) {
  return esiti.reduce((tot, e) => tot * Number(e.quota || 1), 1);
}
export function probabilitaImplicita(quota) {
  const q = Number(quota);
  return q > 0 ? 1 / q : 0;
}
export function vincitaNetta(quota, puntata) {
  return Number(quota) * Number(puntata);
}
// Nel riepilogo "vincita netta" è usata in senso comune come ritorno lordo
// (quota × puntata); il profitto al netto della puntata è calcolato a parte.
export function profittoNetto(quota, puntata) {
  return vincitaNetta(quota, puntata) - Number(puntata);
}
export function vincitaMinima(colonne, puntata) {
  if (!colonne.length) return 0;
  return Math.min(...colonne.map(c => vincitaNetta(c.quotaTotale, puntata)));
}
export function vincitaMassima(colonne, puntata) {
  if (!colonne.length) return 0;
  return Math.max(...colonne.map(c => vincitaNetta(c.quotaTotale, puntata)));
}
export function formatEuro(value) {
  return new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(value);
}
export function formatQuota(value) {
  return Number(value).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 3 });
}
