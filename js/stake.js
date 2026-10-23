/** Calcola puntata per colonna e spesa effettiva senza superare il budget. */
const parseAmount = value => {
  const normalized = String(value ?? '').trim().replace(',', '.');
  return normalized === '' ? NaN : Number(normalized);
};

export function calculateStakeAllocation({ mode = 'per-column', perColumnInput = '0.10', totalBudgetInput = '10.00', columnCount = 0 } = {}) {
  const count = Number.isFinite(Number(columnCount)) ? Math.max(0, Math.floor(Number(columnCount))) : 0;
  const selectedMode = mode === 'total-budget' ? 'total-budget' : 'per-column';

  if (selectedMode === 'per-column') {
    const inputAmount = parseAmount(perColumnInput);
    if (!Number.isFinite(inputAmount) || inputAmount < 0.01 || inputAmount > 100000) {
      return { valid: false, error: 'La puntata per colonna deve essere compresa tra 0,01 € e 100.000,00 €.', mode: selectedMode, columnCount: count };
    }
    const centsPerColumn = Math.round(inputAmount * 100);
    const perColumn = centsPerColumn / 100;
    const totalCents = centsPerColumn * count;
    return {
      valid: true, mode: selectedMode, columnCount: count,
      inputBudget: null, theoreticalPerColumn: perColumn, perColumn,
      total: totalCents / 100, residue: 0, budgetCents: null,
      totalCents
    };
  }

  const inputBudget = parseAmount(totalBudgetInput);
  if (!Number.isFinite(inputBudget) || inputBudget < 0.01 || inputBudget > 100000) {
    return { valid: false, error: 'Il budget totale deve essere compreso tra 0,01 € e 100.000,00 €.', mode: selectedMode, columnCount: count };
  }
  // Il budget è monetario e viene gestito in centesimi interi per non sforare mai.
  const budgetCents = Math.floor(inputBudget * 100 + 1e-7);
  const normalizedBudget = budgetCents / 100;
  if (count === 0) {
    return {
      valid: true, mode: selectedMode, columnCount: count,
      inputBudget: normalizedBudget, theoreticalPerColumn: 0, perColumn: 0,
      total: 0, residue: normalizedBudget, budgetCents, totalCents: 0
    };
  }
  const centsPerColumn = Math.floor(budgetCents / count);
  const totalCents = centsPerColumn * count;
  const perColumn = centsPerColumn / 100;
  const theoreticalPerColumn = normalizedBudget / count;
  const residue = (budgetCents - totalCents) / 100;
  if (centsPerColumn < 1) {
    return {
      valid: false,
      error: `Il budget di ${normalizedBudget.toLocaleString('it-IT', { style: 'currency', currency: 'EUR' })} non consente una puntata minima di 0,01 € su ciascuna delle ${count.toLocaleString('it-IT')} colonne effettive. Aumenta il budget o applica ulteriori riduzioni.`,
      mode: selectedMode, columnCount: count, inputBudget: normalizedBudget,
      theoreticalPerColumn, perColumn, total: 0, residue: normalizedBudget,
      budgetCents, totalCents: 0
    };
  }
  return {
    valid: true, mode: selectedMode, columnCount: count,
    inputBudget: normalizedBudget, theoreticalPerColumn, perColumn,
    total: totalCents / 100, residue, budgetCents, totalCents
  };
}

export function formatEuroPrecise(value) {
  return `${Number(value || 0).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 4 })} €`;
}
