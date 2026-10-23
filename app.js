import { parseManualInput, parseSisalPdf, SERIE_A_TEAMS, getSerieATeamLines, setSerieATeamLines, resetSerieATeamLines } from './js/parser.js?v=android-print-v8-20261023';
import { generateSystem } from './js/generator.js?v=android-print-v8-20261023';
import { applyFilters, classifyColumns, collectVariableOutcomes, maxOutcomeCount, minOutcomeCount } from './js/filters.js?v=android-print-v8-20261023';
import { formatEuro, formatQuota, summarizeColumnRange } from './js/calculator.js?v=android-print-v8-20261023';
import { MAX_MATCHES, MAX_LOADED_MATCHES, MAX_CHOICES_PER_MATCH, MAX_SYSTEM_COLUMNS } from './js/config.js?v=android-print-v8-20261023';
import { exportCSV, exportText, printWithMode, stampaTabella, PRINT_COLUMNS_PER_PAGE, splitPrintRows } from './js/exporter.js?v=android-print-v8-20261023';
import { createBackupPayload, validateBackupPayload } from './js/backup.js?v=android-print-v8-20261023';
import { normalizeMatchSelection, normalizeMatchList, toggleMatchOutcome, selectionMarketKey } from './js/selection.js?v=android-print-v8-20261023';
import { buildQuoteSheetGroups, matchesQuoteColumn } from './js/quote-sheet.js?v=android-print-v8-20261023';
import { fairProbabilities, isExclusiveSystem } from './js/probability.js?v=android-print-v8-20261023';

const $ = id => document.getElementById(id);
const state = { matches: [], rawColumns: [], finalColumns: [], lastGenerated: false, exclusive: false, outcomeFilterLimits: {}, source: '', pdfDiagnostics: null, legacyAdjustedCount: 0 };
const savedKey = 'sistema-scommesse-builder-v1';
let filterUpdateTimeout = null;
let stakeSaveTimeout = null;
let lastDynamicFilterSignature = null;
const debouncedUpdateCounter = () => {
  clearTimeout(filterUpdateTimeout);
  filterUpdateTimeout = setTimeout(() => { saveState(); updateCounter(); }, 300);
};

function status(message, type = '') {
  const el = $('status'); el.textContent = message; el.className = `status ${type}`.trim();
}
const reviewedSeasonKey = 'sistema-scommesse-serie-a-reviewed-season-v1';
function currentSeason() {
  const now = new Date();
  const startYear = now.getMonth() >= 7 ? now.getFullYear() : now.getFullYear() - 1;
  return `${startYear}/${String(startYear + 1).slice(-2)}`;
}
function renderTeamListEditor() {
  $('teamListInput').value = getSerieATeamLines().join('\n');
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
  $('teamListStatus').textContent = `Ripristinato l’elenco base della stagione 2026/27: ${SERIE_A_TEAMS.length} squadre.`;
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
      manualInput: $('manualInput').value,
      stake: $('stake').value,
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
    const data = JSON.parse(localStorage.getItem(savedKey) || 'null');
    if (!data) return;
    $('manualInput').value = data.manualInput || '';
    $('stake').value = data.stake || '0.10';
    $('sisalBonus').checked = data.sisalBonus !== false;
    if (Array.isArray(data.matches)) {
      const normalized = normalizeMatchList(data.matches.slice(0, MAX_LOADED_MATCHES));
      state.matches = normalized.matches;
      state.legacyAdjustedCount = normalized.adjustedCount;
    }
    if (data.outcomeFilterLimits && typeof data.outcomeFilterLimits === 'object') state.outcomeFilterLimits = data.outcomeFilterLimits;
    state.source = typeof data.source === 'string' ? data.source : '';
    state.pdfDiagnostics = data.pdfDiagnostics && typeof data.pdfDiagnostics === 'object' ? data.pdfDiagnostics : null;
    document.documentElement.dataset.theme = data.theme === 'dark' ? 'dark' : 'light';
    if (state.legacyAdjustedCount) saveState();
  } catch { /* Stato salvato corrotto: partenza pulita. */ }
}
function getBackupData() {
  return {
    manualInput: $('manualInput').value,
    stake: $('stake').value,
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
  lastDynamicFilterSignature = null;
  // L’elenco viene scritto prima di modificare lo stato dell’interfaccia: se lo storage non è disponibile,
  // il ripristino si interrompe senza sostituire le partite correnti.
  if (Array.isArray(data.teamLines)) setSerieATeamLines(data.teamLines);
  const normalizedMatches = normalizeMatchList(data.matches);
  state.matches = normalizedMatches.matches;
  state.legacyAdjustedCount = normalizedMatches.adjustedCount;
  state.rawColumns = [];
  state.finalColumns = [];
  state.lastGenerated = false;
  state.outcomeFilterLimits = data.outcomeFilterLimits;
  state.source = data.source || '';
  state.pdfDiagnostics = data.pdfDiagnostics || null;
  $('manualInput').value = data.manualInput;
  $('stake').value = data.stake;
  $('sisalBonus').checked = data.sisalBonus;
  document.documentElement.dataset.theme = data.theme;
  try {
    if (data.reviewedSeason) localStorage.setItem(reviewedSeasonKey, data.reviewedSeason);
    else localStorage.removeItem(reviewedSeasonKey);
  } catch { /* Il promemoria resta comunque visibile nella sessione corrente. */ }
  renderTeamListEditor();
  updateSeasonReminder();
  showPdfDiagnostics(state.pdfDiagnostics, state.matches.length);
  renderMatches();
  $('tableWrap').innerHTML = '<p class="empty-state">Backup ripristinato. Premi “Genera sistema” per ricostruire le colonne.</p>';
  $('summary').textContent = 'Dati ripristinati. Il sistema va rigenerato per aggiornare conteggi e colonne.';
  $('exportCsv').disabled = $('printTable').disabled = $('exportText').disabled = $('printIntegral').disabled = true;
  saveState();
  $('backupStatus').textContent = `Ripristino completato: ${state.matches.length} partite, elenco squadre e impostazioni caricate.${state.legacyAdjustedCount ? ` ${state.legacyAdjustedCount} doppie tra mercati diversi di un vecchio backup sono state convertite in fisse mantenendo la prima quota selezionata.` : ''} Premi “Genera sistema” per ricalcolare le colonne.`;
  status(state.legacyAdjustedCount ? `Backup ripristinato con avviso: ${state.legacyAdjustedCount} vecchie doppie tra mercati diversi sono state convertite in fisse. Controlla il foglio quote.` : 'Backup ripristinato correttamente. Controlla i dati e genera nuovamente il sistema.', state.legacyAdjustedCount ? 'warning' : 'success');
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
    root.innerHTML = '<p class="help">Seleziona due esiti in almeno una partita doppia. I filtri delle fisse non compaiono perché un esito fisso è presente in tutte le colonne e non può ridurre il sistema.</p>'; 
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
      const selectionLabel = match.selezionati?.length === 2 ? 'Doppia automatica' : 'Fissa automatica';
      return `<td class="quote-cell"><button type="button" class="odds-cell ${className}" data-match-id="${escapeHtml(match.id)}" data-outcome-key="${escapeHtml(key)}" aria-pressed="${className ? 'true' : 'false'}" aria-label="${escapeHtml(`${match.casa} - ${match.trasferta}: ${outcome.label}, quota ${formatQuota(outcome.quota)}${className ? `, selezionata come ${selectionLabel}` : ''}`)}" title="${escapeHtml(`${outcome.label} · ${formatQuota(outcome.quota)}`)}">${escapeHtml(formatQuota(outcome.quota))}</button></td>`;
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
    </tr><tr>${outcomeHeaders}</tr></thead><tbody>${rows}</tbody></table></div><p class="quote-sheet-help">Tocca una quota per selezionarla. Una quota attiva è una <strong>fissa</strong>; due quote dello stesso mercato formano automaticamente una <strong>doppia</strong>. Tocca di nuovo una quota per deselezionarla. Scorri orizzontalmente per vedere tutti i mercati.</p>`;
  const scroller = root.querySelector('.quote-sheet-scroll');
  if (scroller && keepScroll) { scroller.scrollLeft = keepScroll.left; scroller.scrollTop = keepScroll.top; }
  if (focused) {
    const again = [...root.querySelectorAll('button[data-outcome-key][data-match-id]')].find(b => b.dataset.matchId === focused.matchId && b.dataset.outcomeKey === focused.key);
    again?.focus({ preventScroll: true });
  }
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
  const stake = Number($('stake').value);
  if (!Number.isFinite(stake) || stake < 0.01) errors.push('La puntata per colonna deve essere almeno 0,01 €.');
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
    if (selected.length === 2 && selectionMarketKey(selected[0]) !== selectionMarketKey(selected[1])) errors.push(`La doppia ${match.casa} – ${match.trasferta} deve contenere due esiti dello stesso mercato.`);
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
      const quoteRejects = (state.pdfDiagnostics.rejects || []).filter(row => row.reason === 'quote_count' || row.reason === 'invalid_odds').length;
      let detail = '';
      if (teamRejects) detail += ` ${teamRejects} righe potrebbero avere nomi squadra non riconosciuti.`;
      if (quoteRejects) detail += ` ${quoteRejects} righe hanno quote mancanti o non valide.`;
      warnings.push(`Il PDF ha scartato ${rejects} righe.${detail} Apri la diagnostica PDF per controllare prima di proseguire.`);
    }
    if (duplicates > 0) warnings.push(`Il parser ha rimosso ${duplicates} riga/e duplicate dal PDF.`);
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
    if (state.lastGenerated) {
      // Non lasciare esportabile la tabella precedente dopo una modifica invalida.
      state.rawColumns = []; state.finalColumns = []; state.lastGenerated = false;
      $('exportCsv').disabled = $('printTable').disabled = $('exportText').disabled = $('printIntegral').disabled = true;
      $('tableWrap').innerHTML = '<p class="empty-state">Sistema non aggiornato: correggi le selezioni prima di generare di nuovo.</p>';
      $('printTableWrap').innerHTML = ''; 
      $('summary').textContent = built.error;
    }
    return;
  }
  const result = built.result;
  const filtered = applyFilters(result.colonne, collectFilters());
  $('beforeCount').textContent = result.colonne.length.toLocaleString('it-IT');
  $('afterCount').textContent = filtered.colonneDopo.toLocaleString('it-IT');
  if (state.lastGenerated) {
    state.rawColumns = result.colonne; state.finalColumns = filtered.colonne; state.exclusive = built.exclusive;
    renderTable();
  }
}
function renderTable() {
  const cols = state.finalColumns;
  const stake = Math.max(0, Number($('stake').value) || 0);
  $('exportCsv').disabled = $('exportText').disabled = $('printIntegral').disabled = cols.length === 0;
  // La stampa conserva tutte le combinazioni: quelle escluse dai filtri vengono grigiate.
  $('printTable').disabled = state.rawColumns.length === 0;
  if (!cols.length) {
    $('tableWrap').innerHTML = '<p class="empty-state">Nessuna colonna dopo i filtri. Modifica i filtri. La stampa colonne resta disponibile e mostrerà in grigio tutte le colonne escluse.</p>';
    $('printTableWrap').innerHTML = '';
    $('summary').textContent = `Colonne sviluppate: ${state.rawColumns.length.toLocaleString('it-IT')} · Colonne considerate: 0 · Colonne escluse dai filtri: ${state.rawColumns.length.toLocaleString('it-IT')} · Puntata totale considerata: ${formatEuro(0)}.`;
    return;
  }
  const totalStake = cols.length * stake;
  const bonusOn = $('sisalBonus')?.checked;
  const bonusRate = c => {
    // La FAQ Sisal descrive un fattore 1,04 dal quinto evento idoneo; stima limitata al 177%.
    const eligible = c.esiti.filter(e => Number(e.quota) >= 1.25).length;
    if (!bonusOn || eligible < 5) return 0;
    return Math.min(Math.pow(1.04, eligible - 4) - 1, 1.77);
  };
  const bonuses = cols.map(bonusRate);
  // Allego i campi calcolati alle colonne così CSV/testo esportano la stessa stima mostrata a video.
  cols.forEach((c, i) => { c.bonusPercentuale = bonuses[i] * 100; c.ritornoStimato = c.quotaTotale * stake * (1 + bonuses[i]); c.profittoStimato = c.ritornoStimato - stake; });
  const eligibleCount = bonuses.filter(x => x > 0).length;
  const returns = cols.map((c, i) => c.quotaTotale * stake * (1 + bonuses[i]));
  const minReturn = Math.min(...returns), maxReturn = Math.max(...returns);
  const approx = cols.some(c => c.esiti.some(e => e.probFair === false));
  const hit = state.exclusive ? cols.reduce((t, c) => t + c.prob, 0) : null;
  const expected = state.exclusive ? cols.reduce((t, c) => t + c.prob * c.quotaTotale * stake, 0) / totalStake : null;
  const probLine = hit !== null
    ? ` Stima probabilità che almeno una colonna vinca: ${(Math.min(hit, 1) * 100).toLocaleString('it-IT', { maximumFractionDigits: 1 })}% · ritorno atteso (senza bonus) ${(expected * 100).toLocaleString('it-IT', { maximumFractionDigits: 0 })}% della puntata totale${approx ? ' · per alcune quote il mercato non è completo: aggio non rimosso, stima ottimistica' : ''}. Stime con partite indipendenti.`
    : ' Probabilità complessiva non calcolata: la Doppia Chance rende le colonne non mutuamente esclusive.';
  $('summary').textContent = `Colonne integrali: ${state.rawColumns.length.toLocaleString('it-IT')} · Colonne finali: ${cols.length.toLocaleString('it-IT')} · Puntata totale del sistema: ${formatEuro(totalStake)} · Ritorno stimato per colonna: ${formatEuro(minReturn)} – ${formatEuro(maxReturn)}. ${bonusOn ? `${eligibleCount} colonne su ${cols.length} rispettano la soglia stimata per il Bonus Multipla.` : 'Stima Bonus Multipla disattivata.'} Il ritorno include la puntata; importi bonus non garantiti.${probLine}`;
  const rows = cols.map((c, i) => `<tr><td data-label="Colonna n.">${c.id}</td><td data-label="Esiti selezionati">${c.esiti.map(e => `${escapeHtml(e.partita)}: ${escapeHtml(e.label)}`).join('<br>')}</td><td class="num" data-label="Quota totale">${formatQuota(c.quotaTotale)}</td><td class="num" data-label="Prob. implicita (con aggio)">${(100/c.quotaTotale).toLocaleString('it-IT',{maximumFractionDigits:3})}%</td><td class="num" data-label="Prob. stimata (senza aggio)">${(c.prob*100).toLocaleString('it-IT',{maximumFractionDigits:3})}%</td><td class="num" data-label="Bonus stimato">${bonusOn && bonuses[i] ? (bonuses[i]*100).toLocaleString('it-IT',{maximumFractionDigits:1})+'%' : '—'}</td><td class="num" data-label="Ritorno lordo stimato">${formatEuro(returns[i])}</td><td class="num" data-label="Profitto teorico stimato">${formatEuro(returns[i]-stake)}</td></tr>`).join('');
  $('tableWrap').innerHTML = `<table class="results-table"><thead><tr><th>N°</th><th>Esiti selezionati</th><th>Quota totale</th><th>Prob. implicita (con aggio)</th><th>Prob. stimata (senza aggio)</th><th>Bonus stimato</th><th>Ritorno lordo stimato</th><th>Profitto teorico stimato</th></tr></thead><tbody>${rows}</tbody></table>`;
  $('printTableWrap').innerHTML = '';   // costruita solo quando serve (buildPrintTable): dimezza il DOM con 1.024 colonne
}
function buildPrintTable() {
  const allCols = state.rawColumns;
  if (!allCols.length) { $('printTableWrap').innerHTML = ''; return; }
  const classifiedColumns = classifyColumns(allCols, state.finalColumns);
  const includedCount = classifiedColumns.filter(item => item.included).length;
  const excludedCount = Math.max(0, allCols.length - includedCount);
  const stake = Math.max(0, Number($('stake').value) || 0);
  const totalStake = includedCount * stake;
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
        return `<td>${event.tipo === 'fissa' ? `<strong>${label}</strong>` : label}</td>`;
      }).join('');
      const netWin = column.quotaTotale * stake - stake;
      return `<tr class="${rowClass}" data-column-id="${escapeHtml(column.id)}"><td>${column.id}</td>${eventCells}<td class="num">${formatQuota(column.quotaTotale)}</td><td class="num">${formatEuro(netWin)}</td></tr>`;
    }).join('');
    return `<section class="print-page-table" data-print-page="${pageIndex + 1}" data-print-rows="${pageRows.length}">
      <h1 class="print-title">Sistema Scommesse Builder — colonne</h1>
      <p class="print-meta">Foglio ${pageIndex + 1}/${pages.length} · Colonne ${firstId}–${lastId} · Totale sviluppate ${allCols.length} · considerate ${includedCount} · escluse ${excludedCount} · Puntata/colonna ${formatEuro(stake)} · Costo sistema ridotto ${formatEuro(totalStake)}</p>
      ${pageIndex === 0 ? legend : ''}
      <table class="print-results-table"><thead><tr><th>N°</th>${printHeaders}<th>Quota totale</th><th>Vincita netta</th></tr></thead><tbody>${printRows}</tbody></table>
    </section>`;
  }).join('');
  $('printTableWrap').innerHTML = pageMarkup;
}

// Ricalcola direttamente dai valori correnti dei filtri prima di esportare o stampare,
// senza dipendere dal debounce dell'evento input (ad esempio un tocco rapido su Stampa).
function refreshGeneratedColumnsNow() {
  if (!state.lastGenerated) return false;
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
  if (diagnostics.rejects?.length) {
    const quoteCounts = {};
    let unknownTeams = 0, invalidOdds = 0, structure = 0;
    for (const row of diagnostics.rejects) {
      if (row.reason === 'quote_count') quoteCounts[row.foundOdds] = (quoteCounts[row.foundOdds] || 0) + 1;
      else if (row.reason === 'teams') unknownTeams += 1;
      else if (row.reason === 'invalid_odds') invalidOdds += 1;
      else structure += 1;
    }
    const details = [];
    for (const [count, n] of Object.entries(quoteCounts)) details.push(`${n} riga/e con ${count} quote decimali (attese 21)`);
    if (unknownTeams) details.push(`${unknownTeams} riga/e con nomi squadra non riconosciuti`);
    if (invalidOdds) details.push(`${invalidOdds} riga/e con quote non valide`);
    if (structure) details.push(`${structure} riga/e con struttura inattesa`);
    lines.push(`Righe scartate: ${diagnostics.rejects.length}${details.length ? ` — ${details.join('; ')}` : ''}.`);
    const examples = diagnostics.rejects.slice(0, 3).map(row => `${row.data}: ${row.reason === 'quote_count' ? `trovate ${row.foundOdds} quote, attese 21` : row.reason === 'teams' ? 'nomi squadra non riconosciuti' : row.reason === 'invalid_odds' ? 'quote non valide' : 'struttura non riconosciuta'}`);
    if (examples.length) lines.push(`Esempi: ${examples.join(' | ')}.`);
  } else if (diagnostics.seriesAFound && diagnostics.candidateRows > 0) {
    lines.push('Nessuna riga dati scartata per il formato.');
  }
  $('pdfDiagnosticsText').textContent = lines.join(' ');
  $('pdfDiagnosticsSummary').textContent = `Diagnostica PDF · ${importedCount} partite caricate, ${diagnostics.rejects?.length || 0} righe scartate, ${diagnostics.duplicateRows || 0} duplicate`;
  panel.hidden = false;
}

function clearImportedMatches(message) {
  state.matches = []; state.rawColumns = []; state.finalColumns = []; state.lastGenerated = false; state.source = ''; state.pdfDiagnostics = null; state.legacyAdjustedCount = 0;
  renderMatches(); saveState();
  $('tableWrap').innerHTML = '<p class="empty-state">Nessuna partita importata. Inserisci o importa nuove quote.</p>';
  $('summary').textContent = message;
}
function loadMatches(matches, source, diagnostics = matches?.diagnostics || null) {
  const isPdfSource = /pdf/i.test(source);
  if (!isPdfSource) showPdfDiagnostics(null);
  if (!matches.length) { status('Nessuna partita riconosciuta. Controlla il formato o il contenuto del PDF.', 'error'); return; }
  const totalFound = matches.length;
  if (isPdfSource) {
    const serieA = matches.filter(m => String(m.competizione || '').trim().toLocaleLowerCase('it-IT') === 'serie a');
    if (!serieA.length) {
      clearImportedMatches('Il PDF non contiene partite di Serie A riconosciute.');
      status('PDF letto, ma non sono state trovate partite di Serie A. Le partite precedenti sono state rimosse; puoi caricare un altro PDF o inserire le quote manualmente.', 'error');
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
  state.lastGenerated = false;
  renderMatches(); saveState();
  status(`${matches.length} di ${filteredFound} ${isPdfSource ? 'partite di Serie A' : 'partite'} caricate da ${source}${isPdfSource && filteredFound !== totalFound ? ` (filtrate da ${totalFound} partite riconosciute)` : ''}. Puoi selezionare al massimo ${MAX_MATCHES} partite, con ${MAX_CHOICES_PER_MATCH} scelte per partita.${filteredFound > MAX_LOADED_MATCHES ? ` Attenzione: ${filteredFound - MAX_LOADED_MATCHES} partite oltre il limite di ${MAX_LOADED_MATCHES} non sono state caricate.` : ''}`, filteredFound > MAX_LOADED_MATCHES ? 'warning' : 'success');
  $('tableWrap').innerHTML = '<p class="empty-state">Premi “Genera sistema” per vedere le colonne.</p>';
}
// Entrambe le modalità restano visibili: nessuna scheda da attivare su Android.
$('parseManual').addEventListener('click', () => {
  const matches = parseManualInput($('manualInput').value);
  showPdfDiagnostics(null);
  if (!matches.length) { status('Non ho riconosciuto partite valide. Usa: Casa - Trasferta; quota 1; quota X; quota 2; mercati opzionali come O2.5=1.90.', 'error'); return; }
  loadMatches(matches, 'input manuale');
});
$('clearInput').addEventListener('click', () => { $('manualInput').value = ''; status('Testo svuotato.'); saveState(); });
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
    state.lastGenerated = false;
    renderMatches(); saveState(); updateCounter();
    status('Partita rimossa dal foglio quote.');
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
  state.lastGenerated = false;
  state.rawColumns = []; state.finalColumns = [];
  $('tableWrap').innerHTML = '<p class="empty-state">Selezioni modificate. Premi “Genera sistema” per ricalcolare le colonne.</p>';
  $('printTableWrap').innerHTML = '';
  $('exportCsv').disabled = $('printTable').disabled = $('exportText').disabled = $('printIntegral').disabled = true;
  renderMatches(); saveState(); updateCounter();
  if (match.selezionati.length === 2) status(`Doppia automatica: ${match.casa} – ${match.trasferta}, mercato ${outcome.market}.`, 'success');
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
let stakeRenderTimeout = null;
$('stake').addEventListener('input', () => {
  clearTimeout(stakeSaveTimeout);
  stakeSaveTimeout = setTimeout(saveState, 250);
  clearTimeout(stakeRenderTimeout);
  stakeRenderTimeout = setTimeout(() => { if (state.lastGenerated) renderTable(); }, 300);
});
$('stake').addEventListener('change', () => {
  clearTimeout(stakeSaveTimeout);
  clearTimeout(stakeRenderTimeout);
  saveState();
  if (state.lastGenerated) renderTable();
});
$('sisalBonus').addEventListener('change', () => { saveState(); if (state.lastGenerated) renderTable(); });
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
  renderTable();
  status('Sistema generato. Puoi esportare il CSV leggibile, stampare il sistema integrale o le singole colonne.', 'success');
});
$('exportCsv').addEventListener('click', () => {
  if (refreshGeneratedColumnsNow() && state.finalColumns.length) exportCSV(state.finalColumns);
});
$('exportText').addEventListener('click', () => {
  if (refreshGeneratedColumnsNow() && state.finalColumns.length) exportText(state.finalColumns, Math.max(0, Number($('stake').value) || 0));
});
$('printTable').addEventListener('click', () => {
  if (!refreshGeneratedColumnsNow() || !state.rawColumns.length) return;
  buildPrintTable();
  stampaTabella();
});
function integralRangeMarkup(title, range, isReduced = false) {
  if (!range) return `<section class="integral-range"><h3>${escapeHtml(title)}</h3><p class="integral-range-empty">Nessuna colonna disponibile con i filtri attuali.</p></section>`;
  return `<section class="integral-range ${isReduced ? 'integral-range-reduced' : ''}">
    <div class="integral-range-heading"><h3>${escapeHtml(title)}</h3><span>${range.count.toLocaleString('it-IT')} colonne</span></div>
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
  const stake = Math.max(0, Number($('stake').value) || 0);
  const fullRange = summarizeColumnRange(state.rawColumns, stake);
  const reducedRange = summarizeColumnRange(state.finalColumns, stake);
  const choices = matches.map((m, i) => {
    const selected = (m.selezionati || []).map(key => m.esiti.find(o => `${o.market}:${o.outcome}` === key)).filter(Boolean);
    const usesHandicap = selected.some(outcome => selectionMarketKey(outcome) === 'handicap');
    const meta = [m.competizione, m.data, m.ora, usesHandicap && String(m.handicap || '').trim() ? `Handicap ${m.handicap}` : ''].filter(Boolean).join(' · ');
    const kind = selected.length === 2 ? 'integral-double' : 'integral-fixed';
    const outcomeChips = selected.map(o => `<span class="integral-outcome"><span>${escapeHtml(o.label)}</span><strong>${formatQuota(o.quota)}</strong></span>`).join('');
    return `<article class="integral-match ${kind}"><span class="integral-number">${i+1}</span><div class="integral-match-content"><div class="integral-match-heading"><strong>${escapeHtml(m.casa)} <span class="integral-versus">–</span> ${escapeHtml(m.trasferta)}</strong><em>${selected.length === 2 ? 'DOPPIA' : 'FISSA'}</em></div><small>${escapeHtml(meta || 'Dettagli partita non disponibili')}</small><div class="integral-outcomes">${outcomeChips}</div></div></article>`;
  }).join('');
  const sameRanges = state.rawColumns.length === state.finalColumns.length;
  integral.innerHTML = `<header class="integral-header"><div class="integral-brand-mark">SB</div><div class="integral-heading"><p class="integral-overline">SISTEMA SCOMMESSE BUILDER</p><h1>Sistema integrale</h1><p class="integral-subtitle">${matches.length} partite selezionate · ${state.rawColumns.length.toLocaleString('it-IT')} colonne sviluppate · ${state.finalColumns.length.toLocaleString('it-IT')} considerate · Puntata per colonna ${formatEuro(stake)}</p></div><div class="integral-count"><strong>${matches.length}</strong><span>PARTITE</span></div></header>
    <div class="integral-section-title"><h2>Riepilogo delle selezioni</h2><span>Quota singola per esito</span></div>
    <div class="integral-match-list">${choices}</div>
    <section class="integral-economics"><div class="integral-section-title"><h2>Quote e vincite minime / massime</h2><span>Importi teorici · senza bonus</span></div><div class="integral-ranges">${integralRangeMarkup('Sistema integrale', fullRange)}${integralRangeMarkup('Sistema ridotto', reducedRange, true)}</div>${sameRanges ? '<p class="integral-range-caption">In assenza di colonne escluse, il sistema integrale e quello ridotto coincidono.</p>' : '<p class="integral-range-caption">Il sistema integrale include tutte le combinazioni sviluppate; il ridotto considera soltanto quelle che superano i filtri.</p>'}</section>
    <div class="integral-note"><strong>Nota di calcolo.</strong> Vincita netta = (quota totale × puntata per colonna) − puntata. Le cifre sono stime, non includono eventuali bonus e dipendono dalle quote effettive accettate.</div>`;
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

$('reset').addEventListener('click', () => {
  if (!confirm('Vuoi cancellare partite, filtri e sistema generato?')) return;
  state.matches = []; state.rawColumns = []; state.finalColumns = []; state.lastGenerated = false; state.source = ''; state.pdfDiagnostics = null; state.legacyAdjustedCount = 0;
  $('manualInput').value = ''; $('stake').value = '0.10';
  state.outcomeFilterLimits = {};
  renderDynamicFilters();
  try { localStorage.removeItem(savedKey); } catch { /* storage non disponibile */ }
  renderMatches(); $('summary').textContent = 'Seleziona le quote dal foglio e genera il sistema.';
  $('printTableWrap').innerHTML = ''; state.rawColumns = []; state.finalColumns = []; state.lastGenerated = false;
  $('tableWrap').innerHTML = '<p class="empty-state">La tabella del sistema apparirà qui.</p>';
  $('printTableWrap').innerHTML = '';
  $('exportCsv').disabled = $('printTable').disabled = $('exportText').disabled = $('printIntegral').disabled = true;
  status('Sistema azzerato.');
});
restoreState();
renderTeamListEditor();
updateSeasonReminder();
if (state.matches.length) {
  renderMatches();
  status(state.legacyAdjustedCount ? `Sessione ripristinata. ${state.legacyAdjustedCount} vecchie doppie tra mercati diversi sono state convertite in fisse mantenendo la prima quota: controlla le selezioni.` : 'Sessione ripristinata dal dispositivo.', state.legacyAdjustedCount ? 'warning' : '');
}
