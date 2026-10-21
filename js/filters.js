/* Filtri componibili: ogni filtro è una funzione che restituisce un nuovo array. */
export const maxPareggi = n => c => c.pareggi <= Number(n);
export const minPareggi = n => c => c.pareggi >= Number(n);
export const maxGoalSi = n => c => c.goalSi <= Number(n);
export const maxEsitiAlti = (n, soglia = 3) => c => c.esiti.filter(e => Number(e.quota) > Number(soglia)).length <= Number(n);
export const quotaMin = q => c => c.quotaTotale >= Number(q);
export const quotaMax = q => c => c.quotaTotale <= Number(q);
export const probabilitaMin = p => c => (1 / c.quotaTotale) * 100 >= Number(p);

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
