import { parseSisalPdf, SERIE_A_TEAMS, SERIE_A_TEAM_SEASON, getSerieATeamLines, setSerieATeamLines, resetSerieATeamLines } from './js/parser.js?v=sb-v22-20261030';
import { generateSystem } from './js/generator.js?v=sb-v22-20261030';
import { applyFilters, classifyColumns, collectVariableOutcomes, maxOutcomeCount, minOutcomeCount } from './js/filters.js?v=sb-v22-20261030';
import { formatEuro, formatQuota, summarizeColumnRange } from './js/calculator.js?v=sb-v22-20261030';
import { MAX_MATCHES, MAX_LOADED_MATCHES, MAX_CHOICES_PER_MATCH, MAX_SYSTEM_COLUMNS } from './js/config.js?v=sb-v22-20261030';
import { exportCSV, exportText, printWithMode, stampaTabella, PRINT_COLUMNS_PER_PAGE, splitPrintRows } from './js/exporter.js?v=sb-v22-20261030';
import { createBackupPayload, validateBackupPayload, validateStoredState } from './js/backup.js?v=sb-v22-20261030';
import { normalizeMatchSelection, normalizeMatchList, toggleMatchOutcome, clearMatchSelections, selectionMarketKey } from './js/selection.js?v=sb-v22-20261030';
import { buildQuoteSheetGroups, matchesQuoteColumn } from './js/quote-sheet.js?v=sb-v22-20261030';
import { fairProbabilities, isExclusiveSystem } from './js/probability.js?v=sb-v22-20261030';
import { calculateStakeAllocation, formatEuroPrecise } from './js/stake.js?v=sb-v22-20261030';
import { assessMinimumCoverage, estimateBonusFraction, hasUnprofitableDoublePartner, isHighQuote } from './js/coverage.js?v=sb-v22-20261030';

const $ = id => document.getElementById(id);
const state = { matches: [], rawColumns: [], finalColumns: [], coverageColumns: [], lastGenerated: false, exclusive: false, outcomeFilterLimits: {}, restoreNotice: '', source: '', pdfDiagnostics: null, legacyAdjustedCount: 0 };
const savedKey = 'sistema-scommesse-builder-v1';
let filterUpdateTimeout = null;
let stakeSaveTimeout = null;
let stakeRenderTimeout = null;
let lastDynamicFilterSignature = null;
const debouncedUpdateCounter = () => {
  clearTimeout(filterUpdateTimeout);
  filterUpdateTimeout = setTimeout(() => { saveState(); updateCounter(); }, 300);
};

function status(message, type = '') {
  const el = $('status'); el.textContent = message; el.className = `status ${type}`.trim();
}
function getStakeAllocation(columnCount = state.finalColumns.length) {
  return calculateStakeAllocation({
    mode: $('stakeMode')?.value || 'per-column',
    perColumnInput: $('stake')?.value ?? '0.10',
    totalBudgetInput: $('systemBudget')?.value ?? '10.00',
    columnCount
  });
}
function updateStakeModeVisibility() {
  const budgetMode = $('stakeMode')?.value === 'total-budget';
  $('stakePerColumnField').hidden = budgetMode;
  $('systemBudgetField').hidden = !budgetMode;
}
function hasActiveOutcomeFilters() {
  return Object.values(state.outcomeFilterLimits || {}).some(limits =>
    ['min', 'max'].some(key => limits?.[key] != null && String(limits[key]).trim() !== '')
  );
}
function updateClearQuotesButton() {
  const button = $('clearQuotes');
  const hasSelections = state.matches.some(match => Array.isArray(match.selezionati) && match.selezionati.length > 0);
  if (button) button.disabled = !hasSelections && !hasActiveOutcomeFilters();
}
function invalidateGeneratedSystem(message = 'Le selezioni sono cambiate. Premi “Genera sistema” per ricalcolare le colonne.') {
  state.rawColumns = [];
  state.finalColumns = [];
  state.coverageColumns = [];
  state.lastGenerated = false;
  state.exclusive = false;
  state.columnsSig = null;
  state.renderSig = null;
  state.visibleRows = 100;
  $('tableWrap').innerHTML = `<p class="empty-state">${escapeHtml(message)}</p>`;
  $('summary').textContent = message;
  $('printTableWrap').innerHTML = '';
  $('integralPrint').innerHTML = '';
  $('exportCsv').disabled = true;
  $('exportText').disabled = true;
  $('printTable').disabled = true;
  $('printIntegral').disabled = true;
  renderStakePreview(0);
}
function renderStakePreview(columnCount = (state.lastGenerated ? state.finalColumns.length : 0)) {
  const node = $('stakePreview');
  if (!node) return;
  const allocation = getStakeAllocation(columnCount);
  if (!allocation.valid) {
    node.classList.add('stake-preview-error');
    node.textContent = allocation.error;
    return;
  }
  node.classList.remove('stake-preview-error');
  if (columnCount <= 0) {
    node.textContent = allocation.mode === 'total-budget'
      ? `Budget impostato: ${formatEuro(allocation.inputBudget)}. Nessuna colonna effettiva: il budget resta inutilizzato finché il sistema non contiene colonne dopo i filtri.`
      : 'Genera il sistema per calcolare la spesa effettiva.';
    return;
  }
  if (allocation.mode === 'total-budget') {
    node.textContent = `Colonne effettive: ${columnCount.toLocaleString('it-IT')} · Importo teorico/colonna: ${formatEuroPrecise(allocation.theoreticalPerColumn)} · Puntata applicabile/colonna: ${formatEuro(allocation.perColumn)} · Spesa effettiva: ${formatEuro(allocation.total)} · Residuo non utilizzato: ${formatEuro(allocation.residue)}.`;
  } else {
    node.textContent = `Colonne effettive: ${columnCount.toLocaleString('it-IT')} · Puntata/colonna: ${formatEuro(allocation.perColumn)} · Spesa totale: ${formatEuro(allocation.total)}.`;
  }
}
function getStakeModeLabel(allocation) {
  return allocation?.mode === 'total-budget' ? 'Budget totale' : 'Importo per colonna';
}
function renderMinimumCoverageCheck(columns = state.coverageColumns, errorMessage = '') {
  const root = $('minimumCoverageCheck');
  if (!root) return;
  const activeCount = state.matches.filter(match => (match.selezionati || []).length > 0).length;
  const render = (kind, icon, heading, detail, note = '') => {
    root.className = `minimum-coverage-check is-${kind}`;
    root.innerHTML = `<span class="coverage-checkbox" aria-hidden="true">${icon}</span><div class="coverage-copy"><strong>${heading}</strong><p>${detail}</p>${note ? `<small>${note}</small>` : ''}</div>`;
  };
  if (!activeCount) {
    render('idle', '☐', 'CONTROLLO COPERTURA MINIMA', 'Seleziona le quote per confrontare il ritorno lordo teorico minimo con la spesa totale, usando il moltiplicatore e il bonus selezionato.', 'Questo controllo non garantisce che una colonna vinca.');
    return;
  }
  if (errorMessage) {
    render('warning', '!', 'CONTROLLO NON DISPONIBILE', escapeHtml(errorMessage), 'Correggi le selezioni prima di valutare la copertura della spesa.');
    return;
  }
  const allocation = getStakeAllocation(Array.isArray(columns) ? columns.length : 0);
  const result = assessMinimumCoverage(columns, allocation, Boolean($('sisalBonus')?.checked));
  if (result.status === 'no-columns') {
    render('uncovered', '!', 'RITORNO MINIMO NON SUFFICIENTE', 'Non ci sono colonne valide dopo i filtri: non è possibile coprire la spesa con il sistema attuale.', 'Modifica o azzera i filtri. Il controllo non garantisce che una colonna vinca.');
    return;
  }
  if (!result.valid) {
    const message = allocation?.valid ? 'Le colonne contengono quote non valide.' : allocation?.error || 'Inserisci una puntata valida.';
    render('warning', '!', 'CONTROLLO NON DISPONIBILE', escapeHtml(message), 'Il sistema deve avere colonne valide e una spesa calcolabile.');
    return;
  }
  const covered = result.status === 'covered';
  const bonusText = $('sisalBonus')?.checked
    ? `Bonus stimato sulla colonna con ritorno minimo: ${(result.minBonusFraction * 100).toLocaleString('it-IT', { maximumFractionDigits: 2 })}%.`
    : 'Bonus Multipla disattivato.';
  render(covered ? 'covered' : 'uncovered', covered ? '✓' : '!',
    covered ? 'RITORNO MINIMO SUFFICIENTE A COPRIRE LA SPESA' : 'RITORNO MINIMO INSUFFICIENTE A COPRIRE LA SPESA',
    `Ritorno lordo minimo teorico: ${formatEuroPrecise(result.minReturn)} · Spesa effettiva: ${formatEuro(result.totalStake)} · Differenza: ${result.difference >= 0 ? '+' : '−'}${formatEuroPrecise(Math.abs(result.difference))}. ${bonusText}`,
    `Calcolo su ${result.columnCount} colonne dopo i filtri. È un confronto teorico del ritorno di una colonna vincente, non una garanzia che una colonna vinca.`);
}
const reviewedSeasonKey = 'sistema-scommesse-serie-a-reviewed-season-v1';
function currentSeason() {
  const now = new Date();
  const startYear = now.getMonth() >= 7 ? now.getFullYear() : now.getFullYear() - 1;
  return `${startYear}/${String(startYear + 1).slice(-2)}`;
}
function renderTeamListEditor() {
  $('teamListInput').value = getSerieATeamLines().join('\n');
  const resetButton = $('resetTeamList');
  if (resetButton) resetButton.textContent = `Ripristina base ufficiale ${SERIE_A_TEAM_SEASON}`;
}
function normalizeTeamName(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('it-IT').replace(/[^a-z0-9]/g, '');
}
function preserveAliasesForOfficialTeams(officialTeams, existingLines) {
  const previous = existingLines.map(line => String(line).split('|').map(part => part.trim()).filter(Boolean));
  return officialTeams.map(name => {
    const key = normalizeTeamName(name);
    const aliases = previous
      .filter(parts => parts.some(part => normalizeTeamName(part) === key))
      .flatMap(parts => parts)
      .filter(alias => normalizeTeamName(alias) !== key);
    const uniqueAliases = [...new Set(aliases)];
    return uniqueAliases.length ? `${name} | ${uniqueAliases.join(' | ')}` : name;
  });
}
$('refreshOfficialTeams').addEventListener('click', async () => {
  const button = $('refreshOfficialTeams');
  const previousText = button.textContent;
  button.disabled = true;
  button.textContent = 'Caricamento elenco…';
  $('officialTeamStatus').textContent = 'Leggo il file di riferimento incluso nell’app…';
  try {
    // File same-origin: funziona anche su GitHub Pages senza dipendere dal CORS della Lega.
    const url = new URL('./data/serie-a-teams.json', window.location.href);
    url.searchParams.set('v', String(Date.now()));
    const response = await fetch(url, { cache: 'no-store' });
    if (!response.ok) throw new Error(`File elenco non disponibile (HTTP ${response.status}).`);
    const data = await response.json();
    const official = Array.isArray(data.teams) ? data.teams.map(x => String(x).trim()).filter(Boolean) : [];
    const normalized = official.map(normalizeTeamName);
    if (official.length !== 20 || normalized.some((value, i) => !value || normalized.indexOf(value) !== i)) {
      throw new Error('L’elenco di riferimento non supera il controllo di integrità; non ho modificato i tuoi dati.');
    }
    const merged = preserveAliasesForOfficialTeams(official, getSerieATeamLines());
    $('teamListInput').value = merged.join('\n');
    $('officialTeamStatus').textContent = `Elenco di riferimento ${data.season || 'corrente'} caricato (${official.length} squadre, verificato il ${data.verifiedAt || '—'}). Controlla il risultato e premi “Salva elenco” per applicarlo. Fonte: Lega Serie A.`;
    $('teamListStatus').textContent = 'L’elenco è stato caricato nella casella di modifica ma non è ancora salvato: nessuna partita o quota è stata modificata.';
    $('teamListInput').scrollIntoView({ behavior: 'smooth', block: 'center' });
  } catch (error) {
    $('officialTeamStatus').textContent = `${error?.message || 'Aggiornamento non riuscito.'} Nessun dato è stato modificato.`;
  } finally {
    button.disabled = false;
    button.textContent = previousText;
  }
});

function updateSeasonReminder() {
  const now = new Date();
  // Da agosto fino alla conferma: se l'utente non apre l'app in agosto, il promemoria resta visibile.
  let checkedSeason = '';
  try { checkedSeason = globalThis.localStorage?.getItem(reviewedSeasonKey) || ''; } catch { /* Ignora storage non disponibile. */ }
  $('seasonTeamReminder').hidden = !(now.getMonth() >= 7 && checkedSeason !== currentSeason());
}
function markTeamListReviewed() {
  try { localStorage.setItem(reviewedSeasonKey, currentSeason()); } catch { /* Il promemoria rimane solo nella sessione corrente. */ }
  updateSeasonReminder();
}
$('saveTeamList').addEventListener('click', () => {
  try {
    const lines = $('teamListInput').value.split(/\r?\n/).map(x => x.trim()).filter(Boolean);
    const saved = setSerieATeamLines(lines);
    renderTeamListEditor();
    markTeamListReviewed();
    $('teamListStatus').textContent = saved.length < 15
      ? `Elenco salvato: ${saved.length} voci squadra/alias. Avviso: una lista così corta può impedire il riconoscimento di molte partite del PDF Serie A. Controlla di aver inserito tutte le squadre e gli alias necessari.`
      : `Elenco salvato: ${saved.length} voci squadra/alias. Sarà usato dalla prossima importazione PDF.`;
    if (saved.length < 15) console.warn(`Elenco squadre corto: ${saved.length} voci.`);
    status('Elenco squadre Serie A aggiornato sul dispositivo.', 'success');
  } catch (error) {
    $('teamListStatus').textContent = error?.message || 'Non riesco a salvare l’elenco.';
    status($('teamListStatus').textContent, 'error');
  }
});
$('resetTeamList').addEventListener('click', () => {
  resetSerieATeamLines();
  renderTeamListEditor();
  updateSeasonReminder();
  $('teamListStatus').textContent = `Ripristinato l’elenco base incluso (${SERIE_A_TEAM_SEASON}): ${SERIE_A_TEAMS.length} squadre. Se è iniziata una nuova stagione, verifica il promemoria stagionale e aggiorna l’elenco prima di importare il PDF.`;
  status('Ripristinato l’elenco squadre base. Le modifiche si applicheranno alla prossima importazione PDF.', 'success');
});
const teamDialog = $('teamDialog');
let teamDialogReturnFocus = $('openTeamManager');
function closeTeamDialog() {
  if (!teamDialog) return;
  if (typeof teamDialog.close === 'function' && teamDialog.open) teamDialog.close();
  else teamDialog.removeAttribute('open');
  delete teamDialog.dataset.fallbackOpen;
  document.body.classList.remove('team-dialog-fallback');
  teamDialogReturnFocus?.focus({ preventScroll: true });
}
function openTeamDialog(trigger) {
  if (!teamDialog) return;
  teamDialogReturnFocus = trigger || $('openTeamManager');
  if (typeof teamDialog.showModal === 'function') teamDialog.showModal();
  else {
    teamDialog.dataset.fallbackOpen = 'true';
    document.body.classList.add('team-dialog-fallback');
    teamDialog.setAttribute('open', '');
  }
  $('teamListInput')?.focus({ preventScroll: true });
}
$('openTeamManager').addEventListener('click', event => openTeamDialog(event.currentTarget));
$('openTeamManagerReminder')?.addEventListener('click', event => openTeamDialog(event.currentTarget));
$('closeTeamDialog').addEventListener('click', closeTeamDialog);
$('closeTeamDialogTop').addEventListener('click', closeTeamDialog);
teamDialog?.addEventListener('click', event => {
  if (event.target === teamDialog) closeTeamDialog();
});
teamDialog?.addEventListener('close', () => {
  delete teamDialog.dataset.fallbackOpen;
  document.body.classList.remove('team-dialog-fallback');
  teamDialogReturnFocus?.focus({ preventScroll: true });
});
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && teamDialog?.open && teamDialog.dataset.fallbackOpen === 'true') closeTeamDialog();
});
$('confirmTeamList').addEventListener('click', () => {
  const draft = $('teamListInput').value.split(/\r?\n/).map(x => x.trim()).filter(Boolean);
  const saved = getSerieATeamLines();
  if (JSON.stringify(draft) !== JSON.stringify(saved)) {
    $('teamListStatus').textContent = 'L’editor contiene modifiche non salvate. Premi “Salva elenco” per applicarle oppure ripristina il testo salvato prima di confermare.';
    status('Prima salva le modifiche all’elenco o ripristina la versione salvata.', 'error');
    return;
  }
  markTeamListReviewed();
  $('teamListStatus').textContent = `Elenco confermato per la stagione ${currentSeason()}. Puoi comunque modificarlo in qualsiasi momento.`;
  status(`Elenco squadre confermato per ${currentSeason()}.`, 'success');
});
function getReviewedSeason() {
  try { return localStorage.getItem(reviewedSeasonKey) || ''; } catch { return ''; }
}
function saveState() {
  try {
    localStorage.setItem(savedKey, JSON.stringify({
      manualInput: $('manualInput')?.value || '',
      stake: $('stake').value,
      stakeMode: $('stakeMode').value,
      systemBudget: $('systemBudget').value,
      matches: state.matches,
      outcomeFilterLimits: state.outcomeFilterLimits,
      theme: document.documentElement.dataset.theme || 'light',
      sisalBonus: $('sisalBonus').checked,
      source: state.source,
      pdfDiagnostics: state.pdfDiagnostics
    }));
  } catch { /* localStorage può essere disabilitato: l'app continua a funzionare. */ }
}
function restoreState() {
  try {
    const raw = JSON.parse(localStorage.getItem(savedKey) || 'null');
    if (!raw) return;
    // Il salvataggio locale è persistente ma non attendibile: usa la stessa
    // validazione del backup prima di assegnare dati a stato e interfaccia.
    const data = validateStoredState(raw);
    if ($('manualInput')) $('manualInput').value = data.manualInput || '';
    $('stake').value = data.stake;
    $('stakeMode').value = data.stakeMode;
    $('systemBudget').value = data.systemBudget;
    updateStakeModeVisibility();
    $('sisalBonus').checked = data.sisalBonus;
    state.matches = data.matches;
    state.legacyAdjustedCount = data.legacyAdjustedCount;
    state.outcomeFilterLimits = data.outcomeFilterLimits;
    state.source = data.source;
    state.pdfDiagnostics = data.pdfDiagnostics;
    document.documentElement.dataset.theme = data.theme;
    const notes = [];
    if (data.discardedMatches) notes.push(`${data.discardedMatches} ${data.discardedMatches === 1 ? 'partita non valida è stata scartata' : 'partite non valide sono state scartate'}`);
    if (data.sanitizedFields.length) notes.push(`valori non validi riportati al predefinito (${data.sanitizedFields.join(', ')})`);
    if (state.legacyAdjustedCount || notes.length) {
      notes.push('il salvataggio originale non è stato modificato automaticamente; la prossima modifica lo aggiornerà');
    }
    state.restoreNotice = notes.join('; ');
    // Non riscrivere automaticamente il salvataggio originale durante il ripristino tollerante.
    // Il primo salvataggio successivo a un'azione dell'utente persisterà i dati già normalizzati;
    // intanto la sessione originale resta intatta in localStorage.
  } catch (error) {
    // Non tentare di usare dati parziali o malformati. Lascia il valore originale
    // disponibile finché l'utente non salva una nuova sessione o importa un backup.
    console.warn('Stato locale non valido; avvio con una sessione vuota.', error);
    status('I dati salvati sul dispositivo non sono validi: avvio con una sessione vuota. Puoi importare un backup JSON per recuperare i dati.', 'warning');
  }
}
function getBackupData() {
  return {
    manualInput: $('manualInput')?.value || '',
    stake: $('stake').value,
    stakeMode: $('stakeMode').value,
    systemBudget: $('systemBudget').value,
    matches: state.matches,
    outcomeFilterLimits: state.outcomeFilterLimits,
    theme: document.documentElement.dataset.theme || 'light',
    sisalBonus: $('sisalBonus').checked,
    teamLines: getSerieATeamLines(),
    reviewedSeason: getReviewedSeason(),
    source: state.source,
    pdfDiagnostics: state.pdfDiagnostics
  };
}
function downloadBackup() {
  const payload = createBackupPayload(getBackupData());
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `sistema-scommesse-backup-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
  $('backupStatus').textContent = 'Backup creato. Conserva il file JSON in una cartella sicura o trasferiscilo sul dispositivo dove vuoi ripristinare i dati.';
}
function applyBackup(data) {
  clearTimeout(filterUpdateTimeout); filterUpdateTimeout = null;
  clearTimeout(stakeSaveTimeout); stakeSaveTimeout = null;
    clearTimeout(stakeRenderTimeout); stakeRenderTimeout = null;
  lastDynamicFilterSignature = null;
  // L’elenco viene scritto prima di modificare lo stato dell’interfaccia: se lo storage non è disponibile,
  // il ripristino si interrompe senza sostituire le partite correnti.
  if (Array.isArray(data.teamLines)) setSerieATeamLines(data.teamLines);
  const normalizedMatches = normalizeMatchList(data.matches);
  state.matches = normalizedMatches.matches;
  state.legacyAdjustedCount = normalizedMatches.adjustedCount;
  state.rawColumns = [];
  state.finalColumns = [];
  state.coverageColumns = [];
  state.lastGenerated = false;
  state.outcomeFilterLimits = data.outcomeFilterLimits;
  state.source = data.source || '';
  state.pdfDiagnostics = data.pdfDiagnostics || null;
  if ($('manualInput')) $('manualInput').value = data.manualInput || '';
  $('stake').value = data.stake;
  $('stakeMode').value = data.stakeMode === 'total-budget' ? 'total-budget' : 'per-column';
  $('systemBudget').value = data.systemBudget || '10.00';
  updateStakeModeVisibility();
  $('sisalBonus').checked = data.sisalBonus;
  document.documentElement.dataset.theme = data.theme;
  try {
    if (data.reviewedSeason) localStorage.setItem(reviewedSeasonKey, data.reviewedSeason);
    else localStorage.removeItem(reviewedSeasonKey);
  } catch { /* Il promemoria resta comunque visibile nella sessione corrente. */ }
  renderTeamListEditor();
  updateSeasonReminder();
  showPdfDiagnostics(state.pdfDiagnostics, state.matches.length);
  invalidateGeneratedSystem('Backup ripristinato. Premi “Genera sistema” per ricostruire le colonne.');
  renderMatches();
  $('summary').textContent = 'Dati ripristinati. Il sistema va rigenerato per aggiornare conteggi e colonne.';
  saveState();
  $('backupStatus').textContent = `Ripristino completato: ${state.matches.length} partite, elenco squadre e impostazioni caricate.${state.legacyAdjustedCount ? ` ${state.legacyAdjustedCount} selezioni non più valide sono state corrette durante il ripristino: controlla il foglio quote.` : ''} Premi “Genera sistema” per ricalcolare le colonne.`;
  status(state.legacyAdjustedCount ? `Backup ripristinato con avviso: ${state.legacyAdjustedCount} selezioni non più valide sono state corrette. Controlla il foglio quote.` : 'Backup ripristinato correttamente. Controlla i dati e genera nuovamente il sistema.', state.legacyAdjustedCount ? 'warning' : 'success');
}
$('exportBackup').addEventListener('click', () => {
  try { downloadBackup(); }
  catch (error) { $('backupStatus').textContent = error?.message || 'Non è stato possibile creare il backup JSON.'; }
});
$('selectBackup').addEventListener('click', () => $('backupFile').click());
$('backupFile').addEventListener('change', async event => {
  const file = event.target.files?.[0];
  if (!file) return;
  try {
    if (file.size > 2 * 1024 * 1024) throw new Error('Il file supera 2 MB: seleziona un backup JSON valido.');
    const payload = JSON.parse(await file.text());
    const data = validateBackupPayload(payload);
    if (!confirm(`Ripristinare il backup del ${String(payload.exportedAt || 'data non specificata').slice(0, 10)}? Partite, filtri, preferenze ed elenco squadre locali saranno sostituiti dai dati del file.`)) return;
    applyBackup(data);
  } catch (error) {
    $('backupStatus').textContent = error?.message || 'Backup non valido: nessun dato è stato importato.';
    status($('backupStatus').textContent, 'error');
  } finally { event.target.value = ''; }
});
function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
}
function outcomeGroups(match) {
  const map = new Map();
  for (const o of match.esiti) {
    if (!map.has(o.market)) map.set(o.market, []);
    map.get(o.market).push(o);
  }
  return [...map.entries()];
}
function renderDynamicFilters() {
  const root = $('dynamicFilters');
  const items = collectVariableOutcomes(state.matches);
  const signature = items.map(item => `${item.key}:${item.occurrences}`).join('|');
  if (signature === lastDynamicFilterSignature) return;
  lastDynamicFilterSignature = signature;
  if (!items.length) {
    root.innerHTML = '<p class="help">Seleziona due esiti in almeno una partita doppia. Le due quote possono appartenere anche a mercati diversi. I filtri delle fisse non compaiono perché un esito fisso è presente in tutte le colonne e non può ridurre il sistema.</p>'; 
    return;
  }
  root.innerHTML = items.map((item, index) => {
    const saved = state.outcomeFilterLimits[item.key] || {};
    const key = encodeURIComponent(item.key);
    return `<div class="dynamic-filter-row" data-filter-row="${key}">
      <div class="dynamic-filter-name"><strong>${escapeHtml(item.label)}</strong><small>Esito variabile in ${item.occurrences} selezioni delle doppie</small></div>
      <div class="dynamic-filter-inputs">
        <label for="dyn-min-${index}">Min <input id="dyn-min-${index}" type="number" min="0" max="${item.occurrences}" step="1" placeholder="—" data-dynamic-limit="min" data-filter-key="${key}" value="${escapeHtml(saved.min ?? '')}"></label>
        <label for="dyn-max-${index}">Max <input id="dyn-max-${index}" type="number" min="0" max="${item.occurrences}" step="1" placeholder="—" data-dynamic-limit="max" data-filter-key="${key}" value="${escapeHtml(saved.max ?? '')}"></label>
      </div>
    </div>`;
  }).join('');
}
function selectedClass(match, key) {
  const selected = match.selezionati || [];
  if (!selected.includes(key)) return '';
  return selected.length > 1 ? 'is-double' : 'is-fixed';
}
function renderMatches() {
  const root = $('matches');
  if (!state.matches.length) {
    root.innerHTML = '<p class="empty-state">Carica le partite per visualizzare il foglio quote.</p>';
    updateClearQuotesButton();
    renderDynamicFilters(); updateCounter(); return;
  }
  // La griglia viene ridisegnata a ogni tocco: senza questo ripristino lo scorrimento orizzontale
  // tornava a zero e dopo ogni selezione bisognava ririscorrere fino al mercato desiderato.
  const previousScroll = root.querySelector('.quote-sheet-scroll');
  const keepScroll = previousScroll ? { left: previousScroll.scrollLeft, top: previousScroll.scrollTop } : null;
  const focused = document.activeElement?.matches?.('button[data-outcome-key][data-match-id]')
    ? { matchId: document.activeElement.dataset.matchId, key: document.activeElement.dataset.outcomeKey } : null;
  const groups = buildQuoteSheetGroups(state.matches);
  const groupHeaders = groups.map(group => `<th class="quote-group" colspan="${group.columns.length}">${escapeHtml(group.label)}</th>`).join('');
  const quoteColumns = groups.flatMap(group => group.columns);
  const outcomeHeaders = quoteColumns.map(column => `<th class="quote-outcome-head" title="${escapeHtml(column.markets.join(' / '))}">${escapeHtml(column.label)}</th>`).join('');
  const rows = state.matches.map(match => {
    normalizeMatchSelection(match);
    const quoteCells = quoteColumns.map(column => {
      if (column.staticField) {
        const value = match[column.staticField];
        return `<td class="quote-cell quote-cell-static"><span>${escapeHtml(value || '—')}</span></td>`;
      }
      const outcome = (match.esiti || []).find(item => matchesQuoteColumn(item, column));
      if (!outcome) return '<td class="quote-cell quote-cell-empty"><span aria-hidden="true">—</span></td>';
      const key = `${outcome.market}:${outcome.outcome}`;
      const className = selectedClass(match, key);
      const lowDoubleRisk = hasUnprofitableDoublePartner(outcome, match.esiti);
      const highQuote = isHighQuote(outcome);
      const buttonClasses = ['odds-cell', className, lowDoubleRisk ? 'odds-low-double-risk' : '', highQuote ? 'odds-high-quote' : ''].filter(Boolean).join(' ');
      const selectionLabel = match.selezionati?.length === 2 ? 'Doppia automatica' : 'Fissa automatica';
      const riskNotice = lowDoubleRisk ? ' · Coppia di mercato a due esiti: entrambe le quote sono pari o inferiori a 2,00' : '';
      const highQuoteNotice = highQuote ? ' · Quota superiore a 3,00' : '';
      return `<td class="quote-cell"><button type="button" class="${buttonClasses}" data-match-id="${escapeHtml(match.id)}" data-outcome-key="${escapeHtml(key)}" aria-pressed="${className ? 'true' : 'false'}" aria-label="${escapeHtml(`${match.casa} - ${match.trasferta}: ${outcome.label}, quota ${formatQuota(outcome.quota)}${className ? `, selezionata come ${selectionLabel}` : ''}${lowDoubleRisk ? ', coppia binaria con entrambe le quote pari o inferiori a 2' : ''}${highQuote ? ', quota superiore a 3' : ''}`)}" title="${escapeHtml(`${outcome.label} · ${formatQuota(outcome.quota)}${riskNotice}${highQuoteNotice}`)}">${escapeHtml(formatQuota(outcome.quota))}</button></td>`;
    }).join('');
    const matchName = `${match.casa} – ${match.trasferta}`;
    const metaTitle = [match.data, match.ora, match.palinsesto || match.pal, match.avvenimento || match.avv].filter(Boolean).join(' · ');
    return `<tr class="quote-match-row ${match.selezionati?.length ? 'has-selection' : ''}" data-match="${escapeHtml(match.id)}" title="${escapeHtml(metaTitle)}">
      <th scope="row" class="quote-team team1-cell">${escapeHtml(match.casa)}</th>
      <td class="quote-team team2-cell">${escapeHtml(match.trasferta)}</td>
      ${quoteCells}
      <td class="quote-date quote-meta-col">${escapeHtml(match.data || '—')}<button type="button" class="remove-match" data-id="${escapeHtml(match.id)}" aria-label="Rimuovi ${escapeHtml(matchName)}" title="Rimuovi partita">×</button></td>
      <td class="quote-time quote-meta-col">${escapeHtml(match.ora || '—')}</td>
      <td class="quote-code quote-meta-col">${escapeHtml(match.palinsesto || match.pal || '—')}</td>
      <td class="quote-code quote-meta-col">${escapeHtml(match.avvenimento || match.avv || '—')}</td>
    </tr>`;
  }).join('');
  root.innerHTML = `<div class="quote-sheet-scroll" role="region" aria-label="Foglio quote selezionabile" tabindex="0"><table class="quote-sheet"><thead><tr>
    <th class="quote-team quote-fixed-head quote-team-head team1-head" rowspan="2">Squadra 1</th><th class="quote-team quote-fixed-head quote-team-head team2-head" rowspan="2">Squadra 2</th>${groupHeaders}<th class="quote-fixed-head quote-meta-col quote-meta-head quote-date-head" rowspan="2">Data</th><th class="quote-fixed-head quote-meta-col quote-meta-head quote-time-head" rowspan="2">Ora</th><th class="quote-fixed-head quote-meta-col quote-meta-head quote-code" rowspan="2">Pal.</th><th class="quote-fixed-head quote-meta-col quote-meta-head quote-code" rowspan="2">Avv.</th>
    </tr><tr>${outcomeHeaders}</tr></thead><tbody>${rows}</tbody></table></div><p class="quote-sheet-help">Tocca una quota per selezionarla. Una quota attiva è una <strong>fissa</strong>; due quote formano automaticamente una <strong>doppia</strong>, anche se appartengono a mercati diversi (per esempio 1 + X2 o 1 + Over 2.5). Sono consentite al massimo due quote per partita. Tocca di nuovo una quota per deselezionarla. Scorri orizzontalmente per vedere tutti i mercati. Le quote in rosso appartengono a mercati binari riconosciuti in cui entrambe le quote sono pari o inferiori a 2,00; le quote superiori a 3,00 sono evidenziate in blu.</p>`;
  const scroller = root.querySelector('.quote-sheet-scroll');
  if (scroller && keepScroll) { scroller.scrollLeft = keepScroll.left; scroller.scrollTop = keepScroll.top; }
  if (focused) {
    const again = [...root.querySelectorAll('button[data-outcome-key][data-match-id]')].find(b => b.dataset.matchId === focused.matchId && b.dataset.outcomeKey === focused.key);
    again?.focus({ preventScroll: true });
  }
  updateClearQuotesButton();
  renderDynamicFilters();
  updateCounter();
}
function readEvents() {
  const events = [];
  for (const m of state.matches) {
    const fair = fairProbabilities(m);
    const selected = (m.selezionati || []).map(key => {
      const outcome = m.esiti.find(o => `${o.market}:${o.outcome}` === key);
      return outcome ? { ...outcome, prob: fair.get(key) ?? 1 / Number(outcome.quota), probFair: fair.has(key) } : null;
    }).filter(Boolean);
    if (!selected.length) continue;
    const usesHandicap = selected.some(outcome => selectionMarketKey(outcome) === 'handicap');
    const handicapSuffix = usesHandicap && String(m.handicap || '').trim() ? ` (handicap ${m.handicap})` : '';
    events.push({ id: m.id, nome: `${m.casa} - ${m.trasferta}${handicapSuffix}`, tipo: selected.length === 2 ? 'doppia' : 'fissa', esiti: selected });
  }
  return events;
}
function collectFilters() {
  const fs = [];
  const currentCatalog = new Map(collectVariableOutcomes(state.matches).map(item => [item.key, item]));
  // Limiti salvati per tipi di esito non più selezionati restano memorizzati,
  // ma sono inattivi finché l'esito non torna presente nel sistema.
  for (const [key, limits] of Object.entries(state.outcomeFilterLimits || {})) {
    const current = currentCatalog.get(key);
    if (!current) continue;
    if (limits.min !== '' && limits.min != null && Number.isFinite(Number(limits.min))) {
      fs.push({ nome: `${current.label} · Min`, test: minOutcomeCount(key, Number(limits.min)) });
    }
    if (limits.max !== '' && limits.max != null && Number.isFinite(Number(limits.max))) {
      fs.push({ nome: `${current.label} · Max`, test: maxOutcomeCount(key, Number(limits.max)) });
    }
  }
  return fs;
}
function getPreflightReport() {
  const errors = [];
  const warnings = [];
  const budgetMode = $('stakeMode').value === 'total-budget';
  const amount = Number(budgetMode ? $('systemBudget').value : $('stake').value);
  if (!Number.isFinite(amount) || amount < 0.01 || amount > 100000) errors.push(budgetMode
    ? 'Il budget totale deve essere compreso tra 0,01 € e 100.000,00 €.'
    : 'La puntata per colonna deve essere compresa tra 0,01 € e 100.000,00 €.');
  const active = state.matches.filter(match => (match.selezionati || []).length > 0);
  if (!active.length) errors.push('Seleziona almeno un esito prima di generare.');
  if (active.length > MAX_MATCHES) errors.push(`Sono selezionate ${active.length} partite: il limite è ${MAX_MATCHES}.`);

  const seen = new Map();
  const allowedSerieATeams = new Set(getSerieATeamLines().flatMap(line => String(line).split('|').map(part => normalizeTeamName(part.trim())).filter(Boolean)));
  for (const match of active) {
    const fixture = `${normalizeTeamName(match.casa)}|${normalizeTeamName(match.trasferta)}|${String(match.data || '').trim()}|${String(match.ora || '').trim()}`;
    if (!normalizeTeamName(match.casa) || !normalizeTeamName(match.trasferta)) errors.push(`Partita senza entrambi i nomi delle squadre (ID ${match.id || 'sconosciuto'}).`);
    else if (normalizeTeamName(match.casa) === normalizeTeamName(match.trasferta)) errors.push(`La partita ${match.casa} – ${match.trasferta} riporta la stessa squadra due volte.`);
    if (seen.has(fixture)) errors.push(`Partita duplicata: ${match.casa} – ${match.trasferta}${match.data ? ` del ${match.data}` : ''}. Rimuovi il doppione prima di generare.`);
    else seen.set(fixture, match.id);

    const selectedKeys = match.selezionati || [];
    const selected = selectedKeys.map(key => match.esiti?.find(outcome => `${outcome.market}:${outcome.outcome}` === key)).filter(Boolean);
    if (selected.length !== selectedKeys.length) errors.push(`La partita ${match.casa} – ${match.trasferta} contiene una selezione non collegata a una quota.`);
    if (!selected.length) errors.push(`La partita ${match.casa} – ${match.trasferta} non ha esiti validi selezionati.`);
    if (selected.length > 2) errors.push(`La partita ${match.casa} – ${match.trasferta} supera il limite di due esiti.`);
    for (const outcome of selected) {
      if (!Number.isFinite(Number(outcome.quota)) || Number(outcome.quota) <= 1) errors.push(`Quota mancante o non valida: ${match.casa} – ${match.trasferta}, ${outcome.label || outcome.outcome}.`);
    }
    if (/pdf/i.test(state.source) && String(match.competizione || '').toLocaleLowerCase('it-IT') === 'serie a') {
      for (const team of [match.casa, match.trasferta]) {
        if (!allowedSerieATeams.has(normalizeTeamName(team))) errors.push(`Squadra non presente nell’elenco Serie A salvato: “${team}”. Controlla l’anagrafica prima di generare.`);
      }
    }
  }

  if (state.pdfDiagnostics) {
    const rejects = Number(state.pdfDiagnostics.rejectedRows ?? state.pdfDiagnostics.rejects?.length ?? 0);
    const duplicates = Number(state.pdfDiagnostics.duplicateRows || 0);
    if (rejects > 0) {
      const teamRejects = (state.pdfDiagnostics.rejects || []).filter(row => row.reason === 'teams').length;
      const quoteRejects = (state.pdfDiagnostics.rejects || []).filter(row => ['quote_count', 'quote_alignment', 'invalid_odds'].includes(row.reason)).length;
      let detail = '';
      if (teamRejects) detail += ` ${teamRejects} righe potrebbero avere nomi squadra non riconosciuti.`;
      if (quoteRejects) detail += ` ${quoteRejects} righe hanno quote mancanti o non valide.`;
      warnings.push(`Il PDF ha scartato ${rejects} righe.${detail} Apri la diagnostica PDF per controllare prima di proseguire.`);
    }
    if (duplicates > 0) warnings.push(`Il parser ha rimosso ${duplicates} riga/e duplicate dal PDF.`);
    const partialRows = Array.isArray(state.pdfDiagnostics.partialRows) ? state.pdfDiagnostics.partialRows : [];
    if (partialRows.length > 0) {
      const examples = partialRows.slice(0, 2).map(row => `${row.casa} – ${row.trasferta} (${(row.missing || []).join(', ')})`).join('; ');
      warnings.push(`${partialRows.length} partita/e importata/e con una o più quote assenti; i mercati senza quota restano vuoti e non selezionabili${examples ? `: ${examples}` : ''}.`);
    }
  }
  return { errors: [...new Set(errors)], warnings: [...new Set(warnings)] };
}
function renderPreflightReport() {
  const root = $('preflightReport');
  if (!state.matches.length) { root.hidden = true; root.textContent = ''; root.className = 'preflight-report'; return; }
  const report = getPreflightReport();
  const lines = [];
  if (report.errors.length) lines.push(`DA CORREGGERE: ${report.errors.join(' ')}`);
  if (report.warnings.length) lines.push(`AVVISI: ${report.warnings.join(' ')}`);
  if (!lines.length) {
    const activeCount = state.matches.filter(match => (match.selezionati || []).length > 0).length;
    lines.push(activeCount ? `Controllo preliminare superato: ${activeCount} partite attive, nomi e quote selezionate validi.` : 'Seleziona gli esiti delle partite che vuoi includere.');
  }
  root.textContent = lines.join(' ');
  root.className = `preflight-report ${report.errors.length ? 'error' : report.warnings.length ? 'warning' : 'success'}`;
  root.hidden = false;
}

function buildBase() {
  const events = readEvents();
  if (!events.length) return { error: 'Seleziona almeno un esito in una o più partite.' };
  for (const e of events) {
    if (e.tipo === 'fissa' && e.esiti.length > 1) e.esiti = [e.esiti[0]];
    if (e.tipo === 'doppia' && e.esiti.length < 2) return { error: `La partita "${e.nome}" è impostata come doppia: seleziona almeno due esiti.` };
  }
  if (events.length > MAX_MATCHES) {
    return { error: `Il sistema ammette al massimo ${MAX_MATCHES} partite.` };
  }
  if (events.some(e => e.tipo !== 'fissa' && e.esiti.length > MAX_CHOICES_PER_MATCH)) {
    return { error: `Ogni partita può contenere al massimo ${MAX_CHOICES_PER_MATCH} esiti selezionati.` };
  }
  const result = generateSystem(events, MAX_SYSTEM_COLUMNS);
  if (result.exceeded) {
    if (result.reason === 'too_many_matches') return { error: `Limite superato: massimo ${MAX_MATCHES} partite per sistema.` };
    if (result.reason === 'too_many_choices') return { error: `Limite superato: massimo ${MAX_CHOICES_PER_MATCH} esiti per partita.` };
    if (result.reason === 'invalid_double') return { error: 'Ogni doppia deve avere esattamente due esiti selezionati.' };
    return { error: `Sistema oltre il limite matematico di ${MAX_SYSTEM_COLUMNS.toLocaleString('it-IT')} colonne. Controlla le selezioni.` };
  }
  return { result, exclusive: isExclusiveSystem(events) };
}
function updateCounter() {
  renderPreflightReport();
  const built = buildBase();
  if (built.error) {
    $('beforeCount').textContent = '—'; $('afterCount').textContent = '—';
    state.coverageColumns = [];
    const hasSelections = state.matches.some(match => (match.selezionati || []).length > 0);
    renderMinimumCoverageCheck([], hasSelections ? built.error : '');
    if (state.lastGenerated) {
      // Non lasciare esportabile la tabella precedente dopo una modifica invalida.
      state.rawColumns = []; state.finalColumns = []; state.coverageColumns = []; state.lastGenerated = false;
      $('exportCsv').disabled = $('printTable').disabled = $('exportText').disabled = $('printIntegral').disabled = true;
      $('tableWrap').innerHTML = '<p class="empty-state">Sistema non aggiornato: correggi le selezioni prima di generare di nuovo.</p>';
      $('printTableWrap').innerHTML = ''; 
      $('summary').textContent = built.error;
      renderStakePreview(0);
    }
    return;
  }
  const result = built.result;
  const filtered = applyFilters(result.colonne, collectFilters());
  state.coverageColumns = filtered.colonne;
  $('beforeCount').textContent = result.colonne.length.toLocaleString('it-IT');
  $('afterCount').textContent = filtered.colonneDopo.toLocaleString('it-IT');
  renderStakePreview(filtered.colonneDopo);
  renderMinimumCoverageCheck(filtered.colonne);
  if (state.lastGenerated) {
    state.rawColumns = result.colonne; state.finalColumns = filtered.colonne; state.exclusive = built.exclusive;
    state.columnsSig = columnsSignature();
    renderTable();
  }
}
const TABLE_PAGE_SIZE = 100;
function renderTable() {
  state.renderSig = stakeSignature();
  const cols = state.finalColumns;
  const allocation = getStakeAllocation(cols.length);
  state.coverageColumns = cols;
  renderStakePreview(cols.length);
  renderMinimumCoverageCheck(cols);
  $('exportCsv').disabled = $('exportText').disabled = $('printIntegral').disabled = cols.length === 0 || !allocation.valid;
  // La stampa conserva tutte le combinazioni: quelle escluse dai filtri vengono grigiate.
  $('printTable').disabled = state.rawColumns.length === 0 || !allocation.valid;
  if (!cols.length) {
    $('tableWrap').innerHTML = '<p class="empty-state">Nessuna colonna dopo i filtri. Modifica i filtri. La stampa colonne resta disponibile e mostrerà in grigio tutte le colonne escluse.</p>';
    $('printTableWrap').innerHTML = '';
    const zeroCost = allocation.mode === 'total-budget' ? `Budget impostato: ${formatEuro(allocation.inputBudget || 0)} · Spesa effettiva: ${formatEuro(0)} · Residuo non utilizzato: ${formatEuro(allocation.residue || 0)}` : `Puntata totale considerata: ${formatEuro(0)}`;
    $('summary').textContent = `Colonne sviluppate: ${state.rawColumns.length.toLocaleString('it-IT')} · Colonne considerate: 0 · Colonne escluse dai filtri: ${state.rawColumns.length.toLocaleString('it-IT')} · ${zeroCost}.`;
    return;
  }
  if (!allocation.valid) {
    $('tableWrap').innerHTML = `<p class="empty-state">${escapeHtml(allocation.error)} Modifica il budget o i filtri e riprova.</p>`;
    $('printTableWrap').innerHTML = '';
    $('summary').textContent = `Colonne integrali: ${state.rawColumns.length.toLocaleString('it-IT')} · Colonne finali: ${cols.length.toLocaleString('it-IT')} · Budget non sufficiente per assegnare almeno 0,01 € a ogni colonna. Le esportazioni economiche sono disattivate finché la puntata non è valida.`;
    return;
  }
  const stake = allocation.perColumn;
  const totalStake = allocation.total;
  const bonusOn = $('sisalBonus')?.checked;
  const bonuses = cols.map(column => estimateBonusFraction(column, bonusOn));
  // Allego i campi calcolati alle colonne così CSV/testo esportano la stessa stima mostrata a video.
  cols.forEach((c, i) => { c.bonusPercentuale = bonuses[i] * 100; c.ritornoStimato = c.quotaTotale * stake * (1 + bonuses[i]); c.profittoStimato = c.ritornoStimato - stake; });
  const eligibleCount = bonuses.filter(x => x > 0).length;
  const returns = cols.map((c, i) => c.quotaTotale * stake * (1 + bonuses[i]));
  const minReturn = Math.min(...returns), maxReturn = Math.max(...returns);
  const approx = cols.some(c => c.esiti.some(e => e.probFair === false));
  const hit = state.exclusive ? cols.reduce((t, c) => t + c.prob, 0) : null;
  const expected = state.exclusive && totalStake > 0 ? cols.reduce((t, c) => t + c.prob * c.quotaTotale * stake, 0) / totalStake : null;
  const probLine = hit !== null && expected !== null
    ? ` Stima probabilità che almeno una colonna vinca: ${(Math.min(hit, 1) * 100).toLocaleString('it-IT', { maximumFractionDigits: 1 })}% · ritorno atteso (senza bonus) ${(expected * 100).toLocaleString('it-IT', { maximumFractionDigits: 0 })}% della spesa effettiva${approx ? ' · per alcune quote il mercato non è completo: aggio non rimosso, stima ottimistica' : ''}. Stime con partite indipendenti.`
    : ' Probabilità complessiva non calcolata: la Doppia Chance o le doppie che combinano mercati diversi possono generare colonne non mutuamente esclusive.';
  const allocationText = allocation.mode === 'total-budget'
    ? `Budget impostato: ${formatEuro(allocation.inputBudget)} · Puntata effettiva/colonna: ${formatEuro(stake)} · Residuo non utilizzato: ${formatEuro(allocation.residue)}`
    : `Puntata/colonna: ${formatEuro(stake)}`;
  $('summary').textContent = `Colonne integrali: ${state.rawColumns.length.toLocaleString('it-IT')} · Colonne finali: ${cols.length.toLocaleString('it-IT')} · ${allocationText} · Spesa effettiva del sistema: ${formatEuro(totalStake)} · Ritorno stimato per colonna: ${formatEuro(minReturn)} – ${formatEuro(maxReturn)}. ${bonusOn ? `${eligibleCount} colonne su ${cols.length} rispettano la soglia stimata per il Bonus Multipla.` : 'Stima Bonus Multipla disattivata.'} Il ritorno include la puntata; importi bonus non garantiti.${probLine}`;
  const visibleCount = Math.min(cols.length, Math.max(TABLE_PAGE_SIZE, state.visibleRows || TABLE_PAGE_SIZE));
  const rows = cols.slice(0, visibleCount).map((c, i) => `<tr><td data-label="Colonna n.">${c.id}</td><td data-label="Esiti selezionati">${c.esiti.map(e => `${escapeHtml(e.partita)}: ${escapeHtml(e.label)}`).join('<br>')}</td><td class="num" data-label="Quota totale">${formatQuota(c.quotaTotale)}</td><td class="num" data-label="Prob. implicita (con aggio)">${(100/c.quotaTotale).toLocaleString('it-IT',{maximumFractionDigits:3})}%</td><td class="num" data-label="Prob. stimata (senza aggio)">${(c.prob*100).toLocaleString('it-IT',{maximumFractionDigits:3})}%</td><td class="num" data-label="Bonus stimato">${bonusOn && bonuses[i] ? (bonuses[i]*100).toLocaleString('it-IT',{maximumFractionDigits:1})+'%' : '—'}</td><td class="num" data-label="Ritorno lordo stimato">${formatEuro(returns[i])}</td><td class="num" data-label="Profitto teorico stimato">${formatEuro(returns[i]-stake)}</td></tr>`).join('');
  $('tableWrap').innerHTML = `<table class="results-table"><thead><tr><th>N°</th><th>Esiti selezionati</th><th>Quota totale</th><th>Prob. implicita (con aggio)</th><th>Prob. stimata (senza aggio)</th><th>Bonus stimato</th><th>Ritorno lordo stimato</th><th>Profitto teorico stimato</th></tr></thead><tbody>${rows}</tbody></table>${visibleCount < cols.length ? `<div class="table-more"><p>Mostrate ${visibleCount.toLocaleString('it-IT')} di ${cols.length.toLocaleString('it-IT')} colonne. CSV, testo e stampe contengono tutte le colonne.</p><div class="button-row"><button id="showMoreRows" class="button secondary" type="button">Mostra altre ${TABLE_PAGE_SIZE}</button><button id="showAllRows" class="button secondary" type="button">Mostra tutte (${cols.length.toLocaleString('it-IT')})</button></div></div>` : ''}`;
  $('printTableWrap').innerHTML = '';   // costruita solo quando serve (buildPrintTable): dimezza il DOM con 1.024 colonne
}
function buildPrintTable() {
  const allCols = state.rawColumns;
  if (!allCols.length) { $('printTableWrap').innerHTML = ''; return; }
  const classifiedColumns = classifyColumns(allCols, state.finalColumns);
  const includedCount = classifiedColumns.filter(item => item.included).length;
  const excludedCount = Math.max(0, allCols.length - includedCount);
  const allocation = getStakeAllocation(includedCount);
  if (!allocation.valid) { $('printTableWrap').innerHTML = ''; status(allocation.error, 'error'); return; }
  const stake = allocation.perColumn;
  const totalStake = allocation.total;
  const activeEvents = readEvents();
  const printHeaders = activeEvents.map((event, index) => `<th title="${escapeHtml(event.nome)}"><span class="print-column-header">${index + 1}. ${escapeHtml(event.nome)}</span></th>`).join('');
  const printMethodNote = '<span class="print-method-note">Vincita netta = quota × puntata − puntata; bonus esclusi.</span>';
  const legend = excludedCount
    ? `<p class="print-legend"><strong>Fondo grigio = colonne escluse dai filtri e non considerate nel sistema ridotto.</strong> Colonne considerate: ${includedCount}; escluse: ${excludedCount}.${printMethodNote}</p>`
    : `<p class="print-legend">Nessuna colonna esclusa dai filtri. Tutte le ${includedCount} colonne sono considerate.${printMethodNote}</p>`;
  const pages = splitPrintRows(classifiedColumns, PRINT_COLUMNS_PER_PAGE);
  const pageMarkup = pages.map((pageRows, pageIndex) => {
    const firstId = pageRows[0]?.column.id ?? 0;
    const lastId = pageRows.at(-1)?.column.id ?? 0;
    const printRows = pageRows.map(({ column, included }) => {
      const rowClass = included ? 'considered-column' : 'excluded-column';
      const selectedByEvent = new Map(column.esiti.map(outcome => [outcome.eventId, outcome]));
      const eventCells = activeEvents.map(event => {
        const label = escapeHtml(selectedByEvent.get(event.id)?.label || '—');
        return `<td${event.tipo === 'fissa' ? ' class="print-fixed"' : ''}>${event.tipo === 'fissa' ? `<strong>${label}</strong>` : label}</td>`;
      }).join('');
      const netWin = column.quotaTotale * stake - stake;
      return `<tr class="${rowClass}" data-column-id="${escapeHtml(column.id)}"><td>${column.id}</td>${eventCells}<td class="num">${formatQuota(column.quotaTotale)}</td><td class="num">${formatEuro(netWin)}</td></tr>`;
    }).join('');
    return `<section class="print-page-table" data-print-page="${pageIndex + 1}" data-print-rows="${pageRows.length}">
      <h1 class="print-title">Sistema Scommesse Builder — colonne</h1>
      <p class="print-meta"><svg class="print-sb-mark" viewBox="0 0 64 64" aria-hidden="true"><rect x="4" y="4" width="56" height="56" rx="12" fill="none" stroke="currentColor" stroke-width="4"/><text x="32" y="39" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="22" font-weight="800" fill="none" stroke="currentColor" stroke-width="1.4" paint-order="stroke">SB</text></svg><span>Foglio ${pageIndex + 1}/${pages.length} · Colonne ${firstId}–${lastId} · Totale sviluppate ${allCols.length} · considerate ${includedCount} · escluse ${excludedCount} · ${getStakeModeLabel(allocation)}/colonna ${formatEuro(stake)} · Costo sistema ridotto ${formatEuro(totalStake)}${allocation.mode === 'total-budget' ? ` · Budget ${formatEuro(allocation.inputBudget)} · Residuo ${formatEuro(allocation.residue)}` : ''}</span></p>
      ${pageIndex === 0 ? legend : ''}
      <table class="print-results-table"><thead><tr><th>N°</th>${printHeaders}<th>Quota totale</th><th>Vincita netta</th></tr></thead><tbody>${printRows}</tbody></table>
    </section>`;
  }).join('');
  $('printTableWrap').innerHTML = pageMarkup;
}

// Ricalcola direttamente dai valori correnti dei filtri prima di esportare o stampare,
// senza dipendere dal debounce dell'evento input (ad esempio un tocco rapido su Stampa).
// Firme degli ingressi: permettono di sapere se colonne e tabella sono già allineate a selezioni, filtri e puntata.
// Prima ogni esportazione/stampa rigenerava le 1.024 colonne e ridisegnava la tabella (circa 5 s su smartphone).
function columnsSignature() {
  return JSON.stringify([state.matches.map(m => [m.id, m.selezionati || []]), state.outcomeFilterLimits || {}]);
}
function stakeSignature() {
  return JSON.stringify([$('stakeMode')?.value, $('stake')?.value, $('systemBudget')?.value, Boolean($('sisalBonus')?.checked)]);
}
function refreshGeneratedColumnsNow() {
  if (!state.lastGenerated) return false;
  if (state.columnsSig === columnsSignature()) {
    if (state.renderSig !== stakeSignature()) renderTable();   // solo puntata/bonus cambiati: niente rigenerazione
    return true;
  }
  const built = buildBase();
  if (built.error) {
    status(built.error, 'error');
    return false;
  }
  state.rawColumns = built.result.colonne;
  const filtered = applyFilters(state.rawColumns, collectFilters());
  state.finalColumns = filtered.colonne;
  state.exclusive = built.exclusive;
  $('beforeCount').textContent = filtered.colonnePrima.toLocaleString('it-IT');
  $('afterCount').textContent = filtered.colonneDopo.toLocaleString('it-IT');
  state.columnsSig = columnsSignature();
  renderTable();
  return true;
}

let pdfJsBase = '';
let pdfJsLoadPromise = null;
async function loadPdfJs() {
  if (globalThis.pdfjsLib) return globalThis.pdfjsLib;
  if (pdfJsLoadPromise) return pdfJsLoadPromise;

  pdfJsLoadPromise = (async () => {
    const cdns = [
      new URL('./vendor/pdfjs', document.baseURI).href,   // copia inclusa nel progetto: nessun CDN e funziona anche offline
      'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174',
      'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build'
    ];
    let lastError;
    for (const base of cdns) {
      try {
        await new Promise((resolve, reject) => {
          const script = document.createElement('script');
          script.src = `${base}/pdf.min.js`;
          script.async = true;
          script.onload = () => resolve();
          script.onerror = () => { script.remove(); reject(new Error('Libreria PDF non raggiungibile')); };
          document.head.appendChild(script);
        });
        if (globalThis.pdfjsLib) { pdfJsBase = base; break; }
        lastError = new Error('Libreria PDF.js caricata senza inizializzarsi');
      } catch (error) { lastError = error; }
    }
    if (!globalThis.pdfjsLib) {
      throw new Error(`Impossibile caricare il lettore PDF. Controlla la connessione e riprova. ${lastError?.message || ''}`.trim());
    }
    globalThis.pdfjsLib.GlobalWorkerOptions.workerSrc = `${pdfJsBase}/pdf.worker.min.js`;
    return globalThis.pdfjsLib;
  })();

  try {
    return await pdfJsLoadPromise;
  } catch (error) {
    pdfJsLoadPromise = null;
    throw error;
  }
}
function showPdfDiagnostics(diagnostics, importedCount = 0) {
  const panel = $('pdfDiagnostics');
  if (!diagnostics) { panel.hidden = true; return; }
  const lines = [];
  if (!diagnostics.seriesAFound) lines.push('Intestazione "ITA Serie A" non trovata.');
  lines.push(`Righe dati esaminate: ${diagnostics.candidateRows}. Righe riconosciute: ${diagnostics.recognizedRows}. Partite disponibili dopo deduplicazione: ${diagnostics.importedRows ?? 0}. Partite caricate nell’app: ${importedCount}.`);
  if (diagnostics.seriesAFound && diagnostics.candidateRows === 0) lines.push('Non ho trovato righe dati nel formato atteso: il bollettino potrebbe avere un layout diverso o il testo potrebbe non essere estraibile.');
  if (diagnostics.duplicateRows) lines.push(`Righe duplicate scartate: ${diagnostics.duplicateRows}.`);
  const partialRows = Array.isArray(diagnostics.partialRows) ? diagnostics.partialRows : [];
  if (partialRows.length) {
    const examples = partialRows.slice(0, 4).map(row => `${row.casa} – ${row.trasferta}: quote assenti per ${(row.missing || []).join(', ')}`);
    lines.push(`${partialRows.length} partita/e importata/e con alcune quote assenti. I mercati senza quota restano vuoti e non selezionabili. ${examples.join(' | ')}.`);
  }
  if (diagnostics.rejects?.length) {
    const quoteCounts = {};
    let unknownTeams = 0, invalidOdds = 0, quoteAlignment = 0, structure = 0;
    for (const row of diagnostics.rejects) {
      if (row.reason === 'quote_count') quoteCounts[row.foundOdds] = (quoteCounts[row.foundOdds] || 0) + 1;
      else if (row.reason === 'teams') unknownTeams += 1;
      else if (row.reason === 'invalid_odds') invalidOdds += 1;
      else if (row.reason === 'quote_alignment') quoteAlignment += 1;
      else structure += 1;
    }
    const details = [];
    for (const [count, n] of Object.entries(quoteCounts)) details.push(`${n} riga/e con ${count} quote decimali rilevate (21 colonne previste)`);
    if (unknownTeams) details.push(`${unknownTeams} riga/e con nomi squadra non riconosciuti`);
    if (invalidOdds) details.push(`${invalidOdds} riga/e con quote non valide`);
    if (quoteAlignment) details.push(`${quoteAlignment} riga/e con quote non associabili con sicurezza alle colonne`);
    if (structure) details.push(`${structure} riga/e con struttura inattesa`);
    lines.push(`Righe scartate: ${diagnostics.rejects.length}${details.length ? ` — ${details.join('; ')}` : ''}.`);
    const examples = diagnostics.rejects.slice(0, 3).map(row => `${row.data}: ${row.reason === 'quote_count' ? `trovate ${row.foundOdds} quote decimali` : row.reason === 'quote_alignment' ? 'posizioni delle quote non riconoscibili con sicurezza' : row.reason === 'teams' ? 'nomi squadra non riconosciuti' : row.reason === 'invalid_odds' ? 'quote non valide' : 'struttura non riconosciuta'}`);
    if (examples.length) lines.push(`Esempi: ${examples.join(' | ')}.`);
  } else if (diagnostics.seriesAFound && diagnostics.candidateRows > 0) {
    lines.push('Nessuna riga dati scartata per il formato.');
  }
  $('pdfDiagnosticsText').textContent = lines.join(' ');
  $('pdfDiagnosticsSummary').textContent = `Diagnostica PDF · ${importedCount} partite caricate, ${diagnostics.rejects?.length || 0} righe scartate, ${diagnostics.duplicateRows || 0} duplicate, ${(diagnostics.partialRows || []).length} con quote assenti`;
  panel.hidden = false;
}

function clearImportedMatches(message) {
  state.matches = []; state.source = ''; state.pdfDiagnostics = null; state.legacyAdjustedCount = 0;
  invalidateGeneratedSystem(message);
  renderMatches(); saveState();
}
function loadMatches(matches, source, diagnostics = matches?.diagnostics || null) {
  const isPdfSource = /pdf/i.test(source);
  if (!isPdfSource) showPdfDiagnostics(null);
  if (!matches.length) { status('Nessuna partita riconosciuta. Controlla il formato o il contenuto del PDF.', 'error'); return; }
  const totalFound = matches.length;
  if (isPdfSource) {
    const serieA = matches.filter(m => String(m.competizione || '').trim().toLocaleLowerCase('it-IT') === 'serie a');
    if (!serieA.length) {
      showPdfDiagnostics(diagnostics, 0);
      clearImportedMatches('Il PDF non contiene partite di Serie A riconosciute.');
      status('PDF letto, ma non sono state trovate partite di Serie A. Le partite precedenti sono state rimosse; puoi verificare il bollettino e selezionare un altro PDF.', 'error');
      return;
    }
    matches = serieA;
  }
  const filteredFound = matches.length;
  matches = matches.slice(0, MAX_LOADED_MATCHES);
  if (isPdfSource) showPdfDiagnostics(diagnostics, matches.length);
  state.matches = matches.map(m => normalizeMatchSelection({ ...m, tipo:'fissa', selezionati:[] }));
  state.legacyAdjustedCount = 0;
  state.source = source;
  state.pdfDiagnostics = isPdfSource ? (diagnostics || null) : null;
  invalidateGeneratedSystem('Partite caricate. Seleziona le quote e premi “Genera sistema” per calcolare le colonne.');
  renderMatches(); saveState();
  status(`${matches.length} di ${filteredFound} ${isPdfSource ? 'partite di Serie A' : 'partite'} caricate da ${source}${isPdfSource && filteredFound !== totalFound ? ` (filtrate da ${totalFound} partite riconosciute)` : ''}. Puoi selezionare al massimo ${MAX_MATCHES} partite, con ${MAX_CHOICES_PER_MATCH} scelte per partita.${filteredFound > MAX_LOADED_MATCHES ? ` Attenzione: ${filteredFound - MAX_LOADED_MATCHES} partite oltre il limite di ${MAX_LOADED_MATCHES} non sono state caricate.` : ''}`, filteredFound > MAX_LOADED_MATCHES ? 'warning' : 'success');
}
// Importazione quote: il flusso dell’interfaccia parte dal PDF Sisal locale.
$('pdfFile').addEventListener('change', async event => {
  showPdfDiagnostics(null);
  const file = event.target.files?.[0];
  if (!file) return;
  $('pdfFileName').textContent = file.name;
  const input = $('pdfFile');
  input.disabled = true;
  status('Lettura del PDF locale in corso…');
  try {
    if (file.type && file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      throw new Error('Il file selezionato non sembra essere un PDF.');
    }
    await loadPdfJs();
    const matches = await parseSisalPdf(await file.arrayBuffer());
    if (!matches.length) {
      showPdfDiagnostics(matches.diagnostics, 0);
      clearImportedMatches('Nessuna partita riconosciuta nel PDF.');
      status('Il PDF si apre, ma il formato non è stato riconosciuto. Verifica di aver scaricato il bollettino “Calcio base per manifestazione” aggiornato.', 'error');
    } else {
      loadMatches(matches, 'file PDF locale', matches.diagnostics);
    }
  } catch (error) {
    console.error('Errore durante la lettura del PDF locale:', error);
    status(error?.message || 'Errore durante la lettura del PDF. Verifica che sia valido e non protetto da password.', 'error');
  } finally {
    input.disabled = false;
    input.value = ''; 
  }
});

$('matches').addEventListener('click', event => {
  const removeButton = event.target.closest('.remove-match');
  if (removeButton) {
    state.matches = state.matches.filter(match => match.id !== removeButton.dataset.id);
    invalidateGeneratedSystem('Partita rimossa. Premi “Genera sistema” per ricostruire le colonne.');
    renderMatches(); saveState();
    status('Partita rimossa dal foglio quote. Il sistema precedente è stato invalidato.');
    return;
  }
  const quoteButton = event.target.closest('button[data-outcome-key][data-match-id]');
  if (!quoteButton) return;
  const match = state.matches.find(item => item.id === quoteButton.dataset.matchId);
  if (!match) return;
  const outcome = match.esiti.find(item => `${item.market}:${item.outcome}` === quoteButton.dataset.outcomeKey);
  if (!outcome) {
    status('Quota non più disponibile per questa partita. Ricarica la scheda.', 'error');
    return;
  }
  const activeCount = state.matches.filter(item => (item.selezionati || []).length > 0).length;
  if (!(match.selezionati || []).length && activeCount >= MAX_MATCHES) {
    status(`Hai già ${MAX_MATCHES} partite selezionate: è il massimo del sistema. Deseleziona una partita prima di sceglierne un'altra.`, 'error');
    return;
  }
  const result = toggleMatchOutcome(match, quoteButton.dataset.outcomeKey);
  if (!result.changed) {
    status(result.message || 'Non è stato possibile modificare la selezione.', 'error');
    return;
  }
  invalidateGeneratedSystem('Selezioni modificate. Premi “Genera sistema” per ricalcolare le colonne.');
  renderMatches(); saveState();
  if (match.selezionati.length === 2) {
    const selectedLabels = match.selezionati.map(key => match.esiti.find(item => `${item.market}:${item.outcome}` === key)?.label || key);
    status(`Doppia automatica: ${match.casa} – ${match.trasferta}: ${selectedLabels.join(' + ')} (sono ammesse anche quote di mercati diversi).`, 'success');
  }
  else if (match.selezionati.length === 1) {
    const fixedKey = match.selezionati[0];
    const fixedOutcome = match.esiti.find(item => `${item.market}:${item.outcome}` === fixedKey);
    status(`Fissa automatica: ${match.casa} – ${match.trasferta}, ${fixedOutcome?.label || ''}, quota ${formatQuota(fixedOutcome?.quota)}.`, 'success');
  } else status(`Selezioni rimosse da ${match.casa} – ${match.trasferta}.`);
});
$('dynamicFilters').addEventListener('input', event => {
  const input = event.target.closest('input[data-dynamic-limit]');
  if (!input) return;
  let key;
  try { key = decodeURIComponent(input.dataset.filterKey || ''); } catch { return; }
  if (!key) return;
  state.outcomeFilterLimits[key] ||= { min: '', max: '' };
  state.outcomeFilterLimits[key][input.dataset.dynamicLimit] = input.value;
  saveState();
  debouncedUpdateCounter();
});
// Con 1.024 colonne il ridisegno costa mezzo secondo: lo si fa a fine digitazione, non a ogni tasto.
function scheduleStakeUpdate() {
  clearTimeout(stakeSaveTimeout);
  stakeSaveTimeout = setTimeout(saveState, 250);
  clearTimeout(stakeRenderTimeout);
  stakeRenderTimeout = setTimeout(() => {
    updateStakeModeVisibility();
    if (state.lastGenerated) renderTable();
    else { renderStakePreview(Number(String($('afterCount').textContent).replace(/\D/g, '')) || 0); renderMinimumCoverageCheck(state.coverageColumns); }
  }, 180);
}
for (const id of ['stake', 'systemBudget']) {
  $(id).addEventListener('input', scheduleStakeUpdate);
  $(id).addEventListener('change', () => {
    clearTimeout(stakeSaveTimeout);
    clearTimeout(stakeRenderTimeout);
    updateStakeModeVisibility();
    saveState();
    if (state.lastGenerated) renderTable();
    else { renderStakePreview(Number(String($('afterCount').textContent).replace(/\D/g, '')) || 0); renderMinimumCoverageCheck(state.coverageColumns); }
  });
}
$('stakeMode').addEventListener('change', () => {
  updateStakeModeVisibility();
  saveState();
  if (state.lastGenerated) renderTable();
  else { renderStakePreview(Number(String($('afterCount').textContent).replace(/\D/g, '')) || 0); renderMinimumCoverageCheck(state.coverageColumns); }
});
$('sisalBonus').addEventListener('change', () => { saveState(); if (state.lastGenerated) renderTable(); else renderMinimumCoverageCheck(state.coverageColumns); });
$('generate').addEventListener('click', () => {
  const report = getPreflightReport();
  if (report.errors.length) {
    renderPreflightReport();
    status(report.errors.join(' '), 'error');
    $('preflightReport').scrollIntoView({ behavior: 'smooth', block: 'center' });
    return;
  }
  if (report.warnings.length && !confirm(`Prima di generare controlla questi avvisi:

${report.warnings.join('\n\n')}

Vuoi procedere comunque?`)) return;
  const built = buildBase();
  if (built.error) { status(built.error, 'error'); return; }
  state.rawColumns = built.result.colonne;
  state.finalColumns = applyFilters(state.rawColumns, collectFilters()).colonne;
  state.exclusive = built.exclusive;
  state.lastGenerated = true;
  state.columnsSig = columnsSignature();
  state.visibleRows = TABLE_PAGE_SIZE;
  renderTable();
  status('Sistema generato. Puoi esportare il CSV leggibile, stampare il sistema integrale o le singole colonne.', 'success');
});
$('exportCsv').addEventListener('click', () => {
  if (!refreshGeneratedColumnsNow() || !state.finalColumns.length) return;
  const allocation = getStakeAllocation(state.finalColumns.length);
  if (allocation.valid) exportCSV(state.finalColumns, allocation);
});
$('exportText').addEventListener('click', () => {
  if (!refreshGeneratedColumnsNow() || !state.finalColumns.length) return;
  const allocation = getStakeAllocation(state.finalColumns.length);
  if (allocation.valid) exportText(state.finalColumns, allocation.perColumn, allocation);
});
$('tableWrap').addEventListener('click', event => {
  const more = event.target.closest('#showMoreRows, #showAllRows');
  if (!more) return;
  state.visibleRows = more.id === 'showAllRows' ? Infinity : (state.visibleRows || TABLE_PAGE_SIZE) + TABLE_PAGE_SIZE;
  renderTable();
});
$('printTable').addEventListener('click', () => {
  if (!refreshGeneratedColumnsNow() || !state.rawColumns.length) return;
  if (!getStakeAllocation(state.finalColumns.length).valid) return;
  buildPrintTable();
  if (!$('printTableWrap').children.length) return;
  stampaTabella();
});
function integralRangeMarkup(title, range, isReduced = false, emptyMessage = 'Nessuna colonna disponibile con i filtri attuali.') {
  if (!range) return `<section class="integral-range"><h3>${escapeHtml(title)}</h3><p class="integral-range-empty">${escapeHtml(emptyMessage)}</p></section>`;
  return `<section class="integral-range ${isReduced ? 'integral-range-reduced' : ''}">
    <div class="integral-range-heading"><h3>${escapeHtml(title)}</h3></div>
    <div class="integral-metric-grid">
      <div class="integral-metric"><span>Quota minima</span><strong>${formatQuota(range.minQuota)}</strong></div>
      <div class="integral-metric"><span>Quota massima</span><strong>${formatQuota(range.maxQuota)}</strong></div>
      <div class="integral-metric"><span>Vincita netta minima</span><strong>${formatEuro(range.minNet)}</strong></div>
      <div class="integral-metric"><span>Vincita netta massima</span><strong>${formatEuro(range.maxNet)}</strong></div>
    </div>
  </section>`;
}
$('printIntegral').addEventListener('click', () => {
  if (!refreshGeneratedColumnsNow() || !state.finalColumns.length) return;
  const matches = state.matches.filter(m => (m.selezionati || []).length);
  const integral = $('integralPrint');
  const allocation = getStakeAllocation(state.finalColumns.length);
  if (!allocation.valid) { status(allocation.error, 'error'); return; }
  const fullAllocation = getStakeAllocation(state.rawColumns.length);
  const stake = allocation.perColumn;
  // In modalità budget totale ogni scenario usa l'intero budget sul proprio numero di colonne:
  // sistema integrale = tutte le colonne; sistema ridotto = solo quelle rimaste dopo i filtri.
  const fullRange = fullAllocation.valid ? summarizeColumnRange(state.rawColumns, fullAllocation.perColumn) : null;
  const reducedRange = summarizeColumnRange(state.finalColumns, allocation.perColumn);
  const fullRangeEmptyMessage = fullAllocation.valid
    ? 'Nessuna colonna disponibile con i filtri attuali.'
    : `Il budget non consente di assegnare almeno 0,01 € a ognuna delle ${state.rawColumns.length.toLocaleString('it-IT')} colonne integrali.`;
  const choices = matches.map((m, i) => {
    const selected = (m.selezionati || []).map(key => m.esiti.find(o => `${o.market}:${o.outcome}` === key)).filter(Boolean);
    const usesHandicap = selected.some(outcome => selectionMarketKey(outcome) === 'handicap');
    const meta = [m.competizione, m.data, m.ora, usesHandicap && String(m.handicap || '').trim() ? `Handicap ${m.handicap}` : ''].filter(Boolean).join(' · ');
    const kind = selected.length === 2 ? 'integral-double' : 'integral-fixed';
    const outcomeChips = selected.map(o => `<span class="integral-outcome"><span>${escapeHtml(o.label)}</span><strong>${formatQuota(o.quota)}</strong></span>`).join('');
    return `<article class="integral-match ${kind}"><span class="integral-number">${i+1}</span><div class="integral-match-content"><div class="integral-match-heading"><strong>${escapeHtml(m.casa)} <span class="integral-versus">–</span> ${escapeHtml(m.trasferta)}</strong><em>${selected.length === 2 ? 'DOPPIA' : 'FISSA'}</em></div><small>${escapeHtml(meta || 'Dettagli partita non disponibili')}</small><div class="integral-outcomes">${outcomeChips}</div></div></article>`;
  }).join('');
  const sameRanges = state.rawColumns.length === state.finalColumns.length;
  integral.innerHTML = `<header class="integral-header"><div class="integral-brand-mark" role="img" aria-label="Logo SB"><svg viewBox="0 0 64 64" aria-hidden="true"><rect x="4" y="4" width="56" height="56" rx="12" fill="none" stroke="currentColor" stroke-width="3.5"/><text x="32" y="39" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="22" font-weight="800" fill="none" stroke="currentColor" stroke-width="1.2" paint-order="stroke">SB</text></svg></div><div class="integral-heading"><p class="integral-overline">SISTEMA SCOMMESSE BUILDER</p><h1>Sistema integrale</h1></div><div class="integral-count"><strong>${matches.length}</strong><span>PARTITE</span></div></header>
    <div class="integral-section-title"><h2>Riepilogo delle selezioni</h2><span>Quota singola per esito</span></div>
    <div class="integral-match-list">${choices}</div>
    <section class="integral-economics"><div class="integral-section-title"><h2>Quote e vincite minime / massime</h2><span>Importi teorici · senza bonus</span></div><div class="integral-ranges">${integralRangeMarkup('Sistema integrale', fullRange, false, fullRangeEmptyMessage)}${integralRangeMarkup('Sistema ridotto', reducedRange, true)}</div>${sameRanges ? '<p class="integral-range-caption">In assenza di colonne escluse, il sistema integrale e quello ridotto coincidono.</p>' : '<p class="integral-range-caption">Il sistema integrale include tutte le combinazioni sviluppate; il ridotto considera soltanto quelle che superano i filtri.</p>'}</section>
    <div class="integral-note"><strong>Nota di calcolo.</strong> Vincita netta = (quota totale × puntata effettiva per colonna) − puntata effettiva. Le cifre sono stime, non includono eventuali bonus e dipendono dalle quote effettive accettate.${allocation.mode === 'total-budget' ? ` Budget totale impostato: ${formatEuro(allocation.inputBudget)}. Sistema integrale: ${fullAllocation.valid ? `puntata effettiva/colonna ${formatEuro(fullAllocation.perColumn)}, spesa ${formatEuro(fullAllocation.total)}, residuo ${formatEuro(fullAllocation.residue)}` : `importo teorico/colonna ${formatEuroPrecise(fullAllocation.theoreticalPerColumn)}, ma budget insufficiente per giocare tutte le colonne a un minimo di 0,01 € ciascuna`}. Sistema ridotto: importo teorico/colonna ${formatEuroPrecise(allocation.theoreticalPerColumn)}, puntata effettiva/colonna ${formatEuro(allocation.perColumn)}, spesa ${formatEuro(allocation.total)}, residuo ${formatEuro(allocation.residue)}.` : ''}</div>
    <section class="integral-footer-summary" aria-label="Riepilogo colonne e spesa">
      <div class="integral-footer-metric"><span>Nr colonne massime giocabili:</span><strong>${state.rawColumns.length.toLocaleString('it-IT')}</strong></div>
      <div class="integral-footer-metric"><span>Colonne Giocate (se ridotto):</span><strong>${state.finalColumns.length.toLocaleString('it-IT')}</strong></div>
      <div class="integral-footer-metric"><span>Quota per colonna effettiva:</span><strong>${formatEuro(stake)}</strong></div>
      <div class="integral-footer-metric"><span>Totale Spesa effettiva:</span><strong>${formatEuro(allocation.total)}</strong></div>
    </section>`;
  printWithMode('integral');
});
// Finestra Info: dialog nativo, chiudibile da pulsante, backdrop o tasto Esc.
const infoButton = $('infoButton');
const infoDialog = $('infoDialog');
function closeInfoDialog() {
  if (!infoDialog) return;
  if (typeof infoDialog.close === 'function' && infoDialog.open) infoDialog.close();
  else infoDialog.removeAttribute('open');
  delete infoDialog.dataset.fallbackOpen;
  document.body.classList.remove('info-dialog-fallback');
  infoButton?.focus({ preventScroll: true });
}
infoButton?.addEventListener('click', () => {
  if (!infoDialog) return;
  if (typeof infoDialog.showModal === 'function') infoDialog.showModal();
  else {
    infoDialog.dataset.fallbackOpen = 'true';
    document.body.classList.add('info-dialog-fallback');
    infoDialog.setAttribute('open', '');
  }
  $('closeInfoTop')?.focus({ preventScroll: true });
});
$('closeInfo')?.addEventListener('click', closeInfoDialog);
$('closeInfoTop')?.addEventListener('click', closeInfoDialog);
infoDialog?.addEventListener('click', event => {
  if (event.target === infoDialog) closeInfoDialog();
});
infoDialog?.addEventListener('close', () => {
  delete infoDialog.dataset.fallbackOpen;
  document.body.classList.remove('info-dialog-fallback');
  if (infoButton) infoButton.focus({ preventScroll: true });
});
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && infoDialog?.open && infoDialog.dataset.fallbackOpen === 'true') closeInfoDialog();
});

$('themeToggle').addEventListener('click', () => {
  document.documentElement.dataset.theme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  saveState();
});
let deferredInstallPrompt = null;
const installButton = $('installApp');
function setInstallButtonLabel(label) {
  const node = $('installButtonLabel');
  const icon = installButton?.querySelector('span[aria-hidden="true"]');
  if (icon) icon.textContent = label === 'Installa app' ? '＋' : '✓';
  if (node) node.textContent = label;
  else installButton.textContent = label;
}
function isStandaloneApp() {
  return Boolean(window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone === true);
}
function showInstallHelp(message = 'Il browser non ha proposto l’installazione automatica. Segui le istruzioni qui sotto.') {
  const help = $('installHelp');
  help.hidden = false;
  help.open = true;
  $('installStatus').textContent = message;
  help.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
if (isStandaloneApp()) {
  setInstallButtonLabel('App installata');
  installButton.disabled = true;
  $('installStatus').textContent = 'Sistema Scommesse Builder è già installata.';
}
window.addEventListener('beforeinstallprompt', event => {
  event.preventDefault();
  deferredInstallPrompt = event;
  installButton.hidden = false;
  setInstallButtonLabel('Installa app');
  $('installStatus').textContent = 'Installazione dell’app disponibile.';
});
installButton.addEventListener('click', async () => {
  if (isStandaloneApp()) {
    $('installStatus').textContent = 'L’app è già aperta in modalità installata.';
    return;
  }
  if (!deferredInstallPrompt) {
    showInstallHelp();
    return;
  }
  const promptEvent = deferredInstallPrompt;
  deferredInstallPrompt = null;
  try {
    await promptEvent.prompt();
    const choice = await promptEvent.userChoice;
    if (choice?.outcome === 'accepted') {
      $('installStatus').textContent = 'Richiesta di installazione accettata. Completa il passaggio richiesto dal browser.';
      setInstallButtonLabel('Installazione richiesta');
    } else {
      $('installStatus').textContent = 'Installazione annullata. Puoi riprovare dal menu del browser.';
      showInstallHelp('Hai annullato l’installazione automatica; le istruzioni manuali sono qui sotto.');
    }
  } catch (error) {
    console.warn('Prompt installazione PWA non riuscito:', error);
    showInstallHelp();
  }
});
window.addEventListener('appinstalled', () => {
  deferredInstallPrompt = null;
  setInstallButtonLabel('App installata');
  installButton.disabled = true;
  $('installStatus').textContent = 'Sistema Scommesse Builder è stata installata.';
  $('installHelp').hidden = true;
  $('installHelp').open = false;
});

$('clearQuotes').addEventListener('click', () => {
  clearTimeout(filterUpdateTimeout); filterUpdateTimeout = null;
  const selectionCount = state.matches.reduce((count, match) => count + (Array.isArray(match.selezionati) ? match.selezionati.length : 0), 0);
  const filterCount = Object.values(state.outcomeFilterLimits || {}).reduce((count, limits) =>
    count + ['min', 'max'].filter(key => limits?.[key] != null && String(limits[key]).trim() !== '').length, 0
  );
  if (!selectionCount && !filterCount) {
    updateClearQuotesButton();
    status('Non ci sono selezioni o filtri da azzerare. Le partite e le quote importate sono intatte.');
    return;
  }
  state.matches = clearMatchSelections(state.matches);
  state.outcomeFilterLimits = {};
  lastDynamicFilterSignature = null;
  invalidateGeneratedSystem('Selezioni e filtri azzerati. Le partite e le quote importate restano disponibili: seleziona nuovi esiti e genera il sistema.');
  renderMatches();
  $('beforeCount').textContent = '0';
  $('afterCount').textContent = '0';
  saveState();
  status(`Azzera quote: rimosse ${selectionCount} selezioni e azzerati ${filterCount} filtri di riduzione. Le partite, le quote importate e le impostazioni della puntata sono state conservate.`, 'success');
});

$('reset').addEventListener('click', () => {
  if (!confirm('Vuoi cancellare partite, filtri e sistema generato?')) return;
  clearTimeout(filterUpdateTimeout); filterUpdateTimeout = null;
  clearTimeout(stakeSaveTimeout); stakeSaveTimeout = null;
    clearTimeout(stakeRenderTimeout); stakeRenderTimeout = null;
  state.matches = []; state.source = ''; state.pdfDiagnostics = null; state.legacyAdjustedCount = 0; state.restoreNotice = '';
  if ($('manualInput')) $('manualInput').value = ''; $('stake').value = '0.10'; $('stakeMode').value = 'per-column'; $('systemBudget').value = '10.00'; updateStakeModeVisibility();
  state.outcomeFilterLimits = {};
  lastDynamicFilterSignature = null;
  try { localStorage.removeItem(savedKey); } catch { /* storage non disponibile */ }
  invalidateGeneratedSystem('Seleziona le quote dal foglio e genera il sistema.');
  renderMatches();
  $('beforeCount').textContent = '0'; $('afterCount').textContent = '0';
  $('pdfFileName').textContent = 'Nessun file selezionato.';
  showPdfDiagnostics(null);
  $('summary').textContent = 'Seleziona le quote dal foglio e genera il sistema.';
  status('Sistema azzerato.');
});
restoreState();
updateStakeModeVisibility();
renderStakePreview(0);
renderTeamListEditor();
updateSeasonReminder();
if (state.matches.length) {
  renderMatches();
  status(state.legacyAdjustedCount ? `Sessione ripristinata. ${state.legacyAdjustedCount} selezioni non più valide sono state corrette: controlla il foglio quote.${state.restoreNotice ? ` Inoltre: ${state.restoreNotice}.` : ''}` : state.restoreNotice ? `Sessione ripristinata. Attenzione: ${state.restoreNotice}. Controlla i dati.` : 'Sessione ripristinata dal dispositivo.', state.legacyAdjustedCount || state.restoreNotice ? 'warning' : '');
} else if (state.restoreNotice) {
  status(`Sessione ripristinata. Attenzione: ${state.restoreNotice}. Controlla i dati.`, 'warning');
}

// Cache offline dell'app shell: non memorizza né inventa quote online. Richiede HTTPS o localhost.
if ('serviceWorker' in navigator && window.isSecureContext) {
  const serviceWorkerUrl = new URL('./sw.js', import.meta.url);
  serviceWorkerUrl.searchParams.set('v', 'sb-v22-20261030');
  // Il nuovo service worker prende il controllo subito, ma la pagina aperta resta con il codice vecchio: avvisa.
  const hadController = Boolean(navigator.serviceWorker.controller);
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (hadController) status('Aggiornamento installato: chiudi e riapri l’app (o ricarica la pagina) per usare la nuova versione.', 'warning');
  });
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(serviceWorkerUrl.href)
      .catch(error => console.warn('Cache offline non disponibile; l’app continua a funzionare online:', error));
  }, { once: true });
}
