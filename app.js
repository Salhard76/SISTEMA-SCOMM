import { parseManualInput, parseSisalPdf, SISAL_DEFAULT_URL, SERIE_A_TEAMS, getSerieATeamLines, setSerieATeamLines, resetSerieATeamLines } from './js/parser.js?v=auditfix-20261022-v2';
import { generateSystem } from './js/generator.js?v=auditfix-20261022-v2';
import { applyFilters, describeOutcome, maxEsitiAlti, maxOutcomeCount, minOutcomeCount, probabilitaMin } from './js/filters.js?v=auditfix-20261022-v2';
import { formatEuro, formatQuota } from './js/calculator.js?v=auditfix-20261022-v2';
import { MAX_MATCHES, MAX_CHOICES_PER_MATCH, MAX_SYSTEM_COLUMNS } from './js/config.js?v=auditfix-20261022-v2';
import { exportCSV, exportText, printWithMode, stampaTabella } from './js/exporter.js?v=auditfix-20261022-v2';

const $ = id => document.getElementById(id);
const state = { matches: [], rawColumns: [], finalColumns: [], lastGenerated: false, outcomeFilterLimits: {} };
const savedKey = 'sistema-scommesse-builder-v1';
let filterUpdateTimeout = null;
let stakeSaveTimeout = null;
let lastDynamicFilterSignature = null;
const debouncedUpdateCounter = () => {
  clearTimeout(filterUpdateTimeout);
  filterUpdateTimeout = setTimeout(updateCounter, 300);
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
    $('teamManager').open = true;
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
$('openTeamManager').addEventListener('click', () => {
  $('teamManager').open = true;
  $('teamManager').scrollIntoView({ behavior: 'smooth', block: 'start' });
  $('teamListInput').focus({ preventScroll: true });
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
function saveState() {
  try {
    localStorage.setItem(savedKey, JSON.stringify({ manualInput: $('manualInput').value, stake: $('stake').value, matches: state.matches, outcomeFilterLimits: state.outcomeFilterLimits, theme: document.documentElement.dataset.theme || 'light' }));
  } catch { /* localStorage può essere disabilitato: l'app continua a funzionare. */ }
}
function restoreState() {
  try {
    const data = JSON.parse(localStorage.getItem(savedKey) || 'null');
    if (!data) return;
    $('manualInput').value = data.manualInput || '';
    $('stake').value = data.stake || '0.10';
    if (Array.isArray(data.matches)) state.matches = data.matches.slice(0, MAX_MATCHES).map(m => ({ ...m, selezionati: (m.selezionati || []).slice(0, MAX_CHOICES_PER_MATCH) }));
    if (data.outcomeFilterLimits && typeof data.outcomeFilterLimits === 'object') state.outcomeFilterLimits = data.outcomeFilterLimits;
    document.documentElement.dataset.theme = data.theme === 'dark' ? 'dark' : 'light';
  } catch { /* Stato salvato corrotto: partenza pulita. */ }
}
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
  const catalog = new Map();
  for (const match of state.matches) {
    const selected = (match.selezionati || []).map(key => match.esiti.find(o => `${o.market}:${o.outcome}` === key)).filter(Boolean);
    for (const outcome of selected) {
      const descriptor = describeOutcome(outcome);
      if (!catalog.has(descriptor.key)) catalog.set(descriptor.key, { ...descriptor, occurrences: 0 });
      catalog.get(descriptor.key).occurrences += 1;
    }
  }
  const items = [...catalog.values()].sort((a, b) => a.label.localeCompare(b.label, 'it'));
  const signature = items.map(item => `${item.key}:${item.occurrences}`).join('|');
  if (signature === lastDynamicFilterSignature) return;
  lastDynamicFilterSignature = signature;
  if (!items.length) {
    root.innerHTML = '<p class="help">Seleziona gli esiti delle partite: compariranno qui i limiti disponibili per ciascun esito.</p>';
    return;
  }
  root.innerHTML = items.map((item, index) => {
    const saved = state.outcomeFilterLimits[item.key] || {};
    const key = encodeURIComponent(item.key);
    return `<div class="dynamic-filter-row" data-filter-row="${key}">
      <div class="dynamic-filter-name"><strong>${escapeHtml(item.label)}</strong><small>Disponibile in ${item.occurrences} selezioni</small></div>
      <div class="dynamic-filter-inputs">
        <label for="dyn-min-${index}">Min <input id="dyn-min-${index}" type="number" min="0" max="${item.occurrences}" step="1" placeholder="—" data-dynamic-limit="min" data-filter-key="${key}" value="${saved.min ?? ''}"></label>
        <label for="dyn-max-${index}">Max <input id="dyn-max-${index}" type="number" min="0" max="${item.occurrences}" step="1" placeholder="—" data-dynamic-limit="max" data-filter-key="${key}" value="${saved.max ?? ''}"></label>
      </div>
    </div>`;
  }).join('');
}
function renderMatches() {
  const root = $('matches');
  if (!state.matches.length) { root.innerHTML = ''; renderDynamicFilters(); updateCounter(); return; }
  root.innerHTML = state.matches.map((m, mi) => {
    const groups = outcomeGroups(m);
    const selected = (m.selezionati || []).slice(0, MAX_CHOICES_PER_MATCH);
    const fixed = m.tipo === 'fissa';
    return `<article class="match-card" data-match="${escapeHtml(m.id)}">
      <div class="match-top"><div><div class="match-name">${escapeHtml(m.casa)} – ${escapeHtml(m.trasferta)}</div><div class="match-meta">${escapeHtml([m.competizione,m.data,m.ora].filter(Boolean).join(' · ') || 'Competizione non specificata')}</div></div>
      <div class="match-controls"><label><input type="radio" name="tipo-${mi}" value="fissa" ${fixed?'checked':''}> Fissa</label><label><input type="radio" name="tipo-${mi}" value="doppia" ${!fixed?'checked':''}> Doppia</label><button type="button" class="button secondary remove-match" data-id="${escapeHtml(m.id)}">Rimuovi</button></div></div>
      ${groups.map(([market, outcomes]) => `<div class="market-title">${escapeHtml(market)}</div><div class="outcomes">${outcomes.map((o, oi) => {
        const key = `${o.market}:${o.outcome}`;
        const checked = selected.includes(key);
        return `<div class="outcome ${checked?'':'disabled'}"><label><input type="checkbox" data-match-id="${escapeHtml(m.id)}" data-outcome-key="${escapeHtml(key)}" ${checked?'checked':''}><span>${escapeHtml(o.label)}</span></label><span class="odd">${formatQuota(o.quota)}</span></div>`;
      }).join('')}</div>`).join('')}
      <p class="match-meta">Massimo 2 scelte per partita. Una fissa usa 1 esito; una doppia usa 2 alternative.</p>
    </article>`;
  }).join('');
  renderDynamicFilters();
  updateCounter();
}
function readEvents() {
  const events = [];
  for (const m of state.matches) {
    const selected = (m.selezionati || []).map(key => m.esiti.find(o => `${o.market}:${o.outcome}` === key)).filter(Boolean);
    if (!selected.length) continue;
    events.push({ id: m.id, nome: `${m.casa} - ${m.trasferta}`, tipo: m.tipo || (selected.length > 1 ? 'doppia' : 'fissa'), esiti: selected });
  }
  return events;
}
function collectFilters() {
  const fs = [];
  const currentCatalog = new Map();
  for (const match of state.matches) {
    const selected = (match.selezionati || []).map(selectedKey => match.esiti.find(o => `${o.market}:${o.outcome}` === selectedKey)).filter(Boolean);
    for (const outcome of selected) {
      const descriptor = describeOutcome(outcome);
      if (!currentCatalog.has(descriptor.key)) currentCatalog.set(descriptor.key, descriptor);
    }
  }
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
  if ($('maxHigh').value.trim() !== '' && Number.isFinite(Number($('maxHigh').value))) {
    fs.push({ nome: 'Quote singole sopra soglia · Max', test: maxEsitiAlti(Number($('maxHigh').value), Number($('highOdds').value) || 3) });
  }
  if ($('minProb').value.trim() !== '' && Number.isFinite(Number($('minProb').value))) {
    fs.push({ nome: 'Probabilità implicita minima', test: probabilitaMin(Number($('minProb').value)) });
  }
  return fs;
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
  return { result };
}
function updateCounter() {
  const built = buildBase();
  if (built.error) {
    $('beforeCount').textContent = '—'; $('afterCount').textContent = '—';
    if (state.lastGenerated) $('summary').textContent = built.error;
    return;
  }
  const result = built.result;
  const filtered = applyFilters(result.colonne, collectFilters());
  $('beforeCount').textContent = result.colonne.length.toLocaleString('it-IT');
  $('afterCount').textContent = filtered.colonneDopo.toLocaleString('it-IT');
  if (state.lastGenerated) {
    state.rawColumns = result.colonne; state.finalColumns = filtered.colonne;
    renderTable();
  }
}
function renderTable() {
  const cols = state.finalColumns;
  const stake = Math.max(0, Number($('stake').value) || 0);
  $('exportCsv').disabled = $('printTable').disabled = $('exportText').disabled = $('printIntegral').disabled = cols.length === 0;
  if (!cols.length) {
    $('tableWrap').innerHTML = '<p class="empty-state">Nessuna colonna dopo i filtri. Modifica i filtri o le selezioni.</p>';
    $('summary').textContent = `Prima: ${state.rawColumns.length.toLocaleString('it-IT')} colonne · Dopo: 0 colonne · Puntata totale: ${formatEuro(0)}.`;
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
  $('summary').textContent = `Colonne integrali: ${state.rawColumns.length.toLocaleString('it-IT')} · Colonne finali: ${cols.length.toLocaleString('it-IT')} · Puntata totale del sistema: ${formatEuro(totalStake)} · Ritorno stimato per colonna: ${formatEuro(minReturn)} – ${formatEuro(maxReturn)}. ${bonusOn ? `${eligibleCount} colonne su ${cols.length} rispettano la soglia stimata per il Bonus Multipla.` : 'Stima Bonus Multipla disattivata.'} Il ritorno include la puntata; importi bonus non garantiti.`;
  const rows = cols.map((c, i) => `<tr><td>${c.id}</td><td>${c.esiti.map(e => `${escapeHtml(e.partita)}: ${escapeHtml(e.label)}`).join('<br>')}</td><td class="num">${formatQuota(c.quotaTotale)}</td><td class="num">${(100/c.quotaTotale).toLocaleString('it-IT',{maximumFractionDigits:3})}%</td><td class="num">${bonusOn && bonuses[i] ? (bonuses[i]*100).toLocaleString('it-IT',{maximumFractionDigits:1})+'%' : '—'}</td><td class="num">${formatEuro(returns[i])}</td><td class="num">${formatEuro(returns[i]-stake)}</td></tr>`).join('');
  $('tableWrap').innerHTML = `<table class="results-table"><thead><tr><th>N°</th><th>Esiti selezionati</th><th>Quota totale</th><th>Prob. implicita</th><th>Bonus stimato</th><th>Ritorno lordo stimato</th><th>Profitto teorico stimato</th></tr></thead><tbody>${rows}</tbody></table>`;
}
let pdfJsBase = '';
let pdfJsLoadPromise = null;
async function loadPdfJs() {
  if (globalThis.pdfjsLib) return globalThis.pdfjsLib;
  if (pdfJsLoadPromise) return pdfJsLoadPromise;

  pdfJsLoadPromise = (async () => {
    const cdns = [
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
  state.matches = []; state.rawColumns = []; state.finalColumns = []; state.lastGenerated = false;
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
  matches = matches.slice(0, MAX_MATCHES);
  if (isPdfSource) showPdfDiagnostics(diagnostics, matches.length);
  state.matches = matches.map(m => ({ ...m, tipo:'fissa', selezionati:m.esiti.slice(0,1).map(o => `${o.market}:${o.outcome}`) }));
  state.lastGenerated = false;
  renderMatches(); saveState();
  status(`${matches.length} di ${filteredFound} ${isPdfSource ? 'partite di Serie A' : 'partite'} caricate da ${source}${isPdfSource && filteredFound !== totalFound ? ` (filtrate da ${totalFound} partite riconosciute)` : ''}. Limite app: ${MAX_MATCHES} partite; massimo ${MAX_CHOICES_PER_MATCH} scelte per partita. Seleziona gli esiti.`, 'success');
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
$('importPdf').addEventListener('click', async () => {
  showPdfDiagnostics(null);
  const url = $('pdfUrl').value.trim();
  if (!url) { status('Inserisci un URL PDF valido.', 'error'); return; }
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') throw new Error('Protocollo non valido');
  } catch { status('URL non valido. Inserisci un indirizzo http o https.', 'error'); return; }
  const button = $('importPdf'); button.disabled = true; button.textContent = 'Importazione…';
  try {
    await loadPdfJs();
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const buffer = await response.arrayBuffer();
    const matches = await parseSisalPdf(buffer);
    if (!matches.length) {
      showPdfDiagnostics(matches.diagnostics, 0);
      state.matches = []; state.rawColumns = []; state.finalColumns = []; state.lastGenerated = false;
      renderMatches(); saveState();
      $('tableWrap').innerHTML = '<p class="empty-state">Nessuna partita importata. Inserisci o importa nuove quote.</p>';
      $('summary').textContent = 'Nessuna partita riconosciuta nel PDF.';
      status('PDF letto, ma non sono state riconosciute righe valide di Serie A con tutte le 21 quote previste. Le partite precedenti sono state rimosse per evitare confusione. Puoi inserire le quote manualmente nella sezione 1.', 'error');
    } else loadMatches(matches, 'PDF da URL', matches.diagnostics);
  } catch (error) {
    console.warn('Importazione PDF non riuscita:', error);
    status('Importazione diretta non riuscita (il sito Sisal può bloccare CORS). Tocca “Apri / scarica PDF ufficiale Sisal”, scegli “Scarica”, poi seleziona il PDF salvato qui sotto.', 'error');
  } finally { button.disabled = false; button.textContent = 'Tenta importazione diretta'; }
});
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

$('matches').addEventListener('change', event => {
  const target = event.target;
  const card = target.closest('.match-card');
  if (!card) return;
  const match = state.matches.find(m => m.id === card.dataset.match);
  if (!match) return;
  if (target.matches('input[type=radio]')) {
    match.tipo = target.value;
    if (match.tipo === 'fissa' && match.selezionati.length > 1) match.selezionati = match.selezionati.slice(0,1);
    if (match.tipo === 'doppia' && match.selezionati.length < 2) {
      const first = match.esiti.find(o => match.selezionati.includes(`${o.market}:${o.outcome}`));
      // Quando si attiva una doppia, preferisce l'alternativa dello stesso mercato
      // (per esempio Over 2.5 + Under 2.5 invece di aggiungere automaticamente 1/X/2).
      const extra = match.esiti.find(o => first && o.market === first.market && !match.selezionati.includes(`${o.market}:${o.outcome}`))
        || match.esiti.find(o => !match.selezionati.includes(`${o.market}:${o.outcome}`));
      if (extra) match.selezionati.push(`${extra.market}:${extra.outcome}`);
    }
    match.selezionati = match.selezionati.slice(0, MAX_CHOICES_PER_MATCH);
    renderMatches(); saveState(); updateCounter(); return;
  }
  if (target.matches('input[type=checkbox][data-outcome-key]')) {
    const key = target.dataset.outcomeKey;
    if (target.checked) {
      if (match.tipo === 'fissa') match.selezionati = [key];
      else if (!match.selezionati.includes(key)) {
        if (match.selezionati.length >= MAX_CHOICES_PER_MATCH) {
          status(`Puoi selezionare al massimo ${MAX_CHOICES_PER_MATCH} esiti per partita.`, 'error');
          renderMatches();
          return;
        }
        match.selezionati.push(key);
      }
    } else match.selezionati = match.selezionati.filter(x => x !== key);
    renderMatches(); saveState(); updateCounter();
  }
});
$('matches').addEventListener('click', event => {
  const button = event.target.closest('.remove-match');
  if (!button) return;
  state.matches = state.matches.filter(m => m.id !== button.dataset.id);
  renderMatches(); saveState(); updateCounter();
});
for (const id of ['highOdds','maxHigh','minProb']) $(id).addEventListener('input', debouncedUpdateCounter);
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
$('stake').addEventListener('input', () => {
  clearTimeout(stakeSaveTimeout);
  stakeSaveTimeout = setTimeout(saveState, 250);
  if (state.lastGenerated) renderTable();
});
$('stake').addEventListener('change', () => {
  clearTimeout(stakeSaveTimeout);
  saveState();
});
$('sisalBonus').addEventListener('change', () => { if (state.lastGenerated) renderTable(); });
$('generate').addEventListener('click', () => {
  const built = buildBase();
  if (built.error) { status(built.error, 'error'); return; }
  state.rawColumns = built.result.colonne;
  state.finalColumns = applyFilters(state.rawColumns, collectFilters()).colonne;
  state.lastGenerated = true;
  renderTable();
  status('Sistema generato. Puoi esportare il CSV leggibile, stampare il sistema integrale o le singole colonne.', 'success');
});
$('exportCsv').addEventListener('click', () => exportCSV(state.finalColumns));
$('exportText').addEventListener('click', () => exportText(state.finalColumns, Math.max(0, Number($('stake').value) || 0)));
$('printTable').addEventListener('click', stampaTabella);
$('printIntegral').addEventListener('click', () => {
  const matches = state.matches.filter(m => (m.selezionati || []).length);
  const integral = $('integralPrint');
  const choices = matches.map((m, i) => {
    const selected = (m.selezionati || []).map(key => m.esiti.find(o => `${o.market}:${o.outcome}` === key)).filter(Boolean);
    return `<article class="integral-match"><span class="integral-number">${i+1}</span><div><strong>${escapeHtml(m.casa)} – ${escapeHtml(m.trasferta)}</strong><small>${escapeHtml([m.competizione,m.data,m.ora].filter(Boolean).join(' · '))}</small><p>${selected.map(o => `${escapeHtml(o.label)} <b>@ ${formatQuota(o.quota)}</b>`).join(' &nbsp; / &nbsp; ')}</p></div><em>${m.tipo === 'doppia' ? 'DOPPIA' : 'FISSA'}</em></article>`;
  }).join('');
  integral.innerHTML = `<h1>Sistema integrale</h1><p class="integral-subtitle">Selezioni complete · ${matches.length} partite · ${state.rawColumns.length.toLocaleString('it-IT')} colonne teoriche</p>${choices}<div class="integral-note">Questo foglio riepiloga tutte le selezioni del sistema, senza stampare l'elenco delle singole colonne. Quote indicative, soggette a variazione.</div>`;
  printWithMode('integral');
});
$('themeToggle').addEventListener('click', () => {
  document.documentElement.dataset.theme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  saveState();
});
$('reset').addEventListener('click', () => {
  if (!confirm('Vuoi cancellare partite, filtri e sistema generato?')) return;
  state.matches = []; state.rawColumns = []; state.finalColumns = []; state.lastGenerated = false;
  $('manualInput').value = ''; $('stake').value = '0.10';
  for (const id of ['maxHigh','minProb']) $(id).value = '';
  state.outcomeFilterLimits = {};
  renderDynamicFilters();
  $('highOdds').value = '3.00'; localStorage.removeItem(savedKey);
  renderMatches(); $('summary').textContent = 'Seleziona almeno una partita e i relativi esiti.';
  $('tableWrap').innerHTML = '<p class="empty-state">La tabella del sistema apparirà qui.</p>';
  $('exportCsv').disabled = $('printTable').disabled = $('exportText').disabled = $('printIntegral').disabled = true;
  status('Sistema azzerato.');
});
restoreState();
renderTeamListEditor();
updateSeasonReminder();
if (state.matches.length) { renderMatches(); status('Sessione ripristinata dal dispositivo.'); }
else $('pdfUrl').value = SISAL_DEFAULT_URL;
