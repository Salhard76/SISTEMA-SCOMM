import { parseManualInput, parseSisalPdf, SISAL_DEFAULT_URL } from './js/parser.js';
import { generateSystem } from './js/generator.js';
import { applyFilters, maxPareggi, minPareggi, maxGoalSi, maxEsitiAlti, quotaMin, quotaMax, probabilitaMin } from './js/filters.js';
import { formatEuro, formatQuota, profittoNetto, vincitaMinima, vincitaMassima } from './js/calculator.js';
import { exportCSV, exportText, stampaTabella } from './js/exporter.js';

const $ = id => document.getElementById(id);
const state = { matches: [], rawColumns: [], finalColumns: [], lastGenerated: false };
const savedKey = 'sistema-scommesse-builder-v1';
const MAX_MATCHES = 10;
const MAX_CHOICES_PER_MATCH = 2;
let filterUpdateTimeout = null;
const debouncedUpdateCounter = () => {
  clearTimeout(filterUpdateTimeout);
  filterUpdateTimeout = setTimeout(updateCounter, 300);
};

function status(message, type = '') {
  const el = $('status'); el.textContent = message; el.className = `status ${type}`.trim();
}
function saveState() {
  try {
    localStorage.setItem(savedKey, JSON.stringify({ manualInput: $('manualInput').value, stake: $('stake').value, maxColumns: $('maxColumns').value, matches: state.matches, theme: document.documentElement.dataset.theme || 'light' }));
  } catch { /* localStorage può essere disabilitato: l'app continua a funzionare. */ }
}
function restoreState() {
  try {
    const data = JSON.parse(localStorage.getItem(savedKey) || 'null');
    if (!data) return;
    $('manualInput').value = data.manualInput || '';
    $('stake').value = data.stake || '0.10';
    $('maxColumns').value = data.maxColumns || '32768';
    if (Array.isArray(data.matches)) state.matches = data.matches.slice(0, MAX_MATCHES).map(m => ({ ...m, selezionati: (m.selezionati || []).slice(0, MAX_CHOICES_PER_MATCH) }));
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
function renderMatches() {
  const root = $('matches');
  if (!state.matches.length) { root.innerHTML = ''; updateCounter(); return; }
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
  const add = (id, label, fn) => { const v = $(id).value.trim(); if (v !== '' && Number.isFinite(Number(v))) fs.push({ nome: label, test: fn(Number(v)) }); };
  add('maxDraws','Pareggi massimi',maxPareggi);
  add('minDraws','Pareggi minimi',minPareggi);
  add('maxGoals','Goal Sì massimi',maxGoalSi);
  if ($('maxHigh').value.trim() !== '') fs.push({ nome:'Quote alte massime', test:maxEsitiAlti(Number($('maxHigh').value), Number($('highOdds').value) || 3) });
  add('minQuota','Quota minima',quotaMin);
  add('maxQuota','Quota massima',quotaMax);
  add('minProb','Probabilità minima',probabilitaMin);
  return fs;
}
function buildBase() {
  const events = readEvents();
  if (!events.length) return { error: 'Seleziona almeno un esito in una o più partite.' };
  for (const e of events) {
    if (e.tipo === 'fissa' && e.esiti.length > 1) e.esiti = [e.esiti[0]];
    if (e.tipo === 'doppia' && e.esiti.length < 2) return { error: `La partita "${e.nome}" è impostata come doppia: seleziona almeno due esiti.` };
  }
  const result = generateSystem(events, Number($('maxColumns').value));
  if (result.exceeded) return { error: `Sistema troppo grande: ${result.theoretical.toLocaleString('it-IT')} colonne, limite ${Number($('maxColumns').value).toLocaleString('it-IT')}. Riduci le doppie o aumenta il limite.` };
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
async function loadPdfJs() {
  if (globalThis.pdfjsLib) return globalThis.pdfjsLib;
  await new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
    script.onload = resolve;
    script.onerror = () => reject(new Error('CDN PDF.js non raggiungibile'));
    document.head.appendChild(script);
  });
  if (!globalThis.pdfjsLib) throw new Error('PDF.js non è stato caricato correttamente.');
  globalThis.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  return globalThis.pdfjsLib;
}
function clearImportedMatches(message) {
  state.matches = []; state.rawColumns = []; state.finalColumns = []; state.lastGenerated = false;
  renderMatches(); saveState();
  $('tableWrap').innerHTML = '<p class="empty-state">Nessuna partita importata. Inserisci o importa nuove quote.</p>';
  $('summary').textContent = message;
}
function loadMatches(matches, source) {
  if (!matches.length) { status('Nessuna partita riconosciuta. Controlla il formato o il contenuto del PDF.', 'error'); return; }
  const isPdfSource = /pdf/i.test(source);
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
  state.matches = matches.map(m => ({ ...m, tipo:'fissa', selezionati:m.esiti.slice(0,1).map(o => `${o.market}:${o.outcome}`) }));
  state.lastGenerated = false;
  renderMatches(); saveState();
  status(`${matches.length} di ${filteredFound} ${isPdfSource ? 'partite di Serie A' : 'partite'} caricate da ${source}${isPdfSource && filteredFound !== totalFound ? ` (filtrate da ${totalFound} partite riconosciute)` : ''}. Limite app: ${MAX_MATCHES} partite; massimo ${MAX_CHOICES_PER_MATCH} scelte per partita. Seleziona gli esiti.`, 'success');
  $('tableWrap').innerHTML = '<p class="empty-state">Premi “Genera sistema” per vedere le colonne.</p>';
}
function switchTab(which) {
  const manual = which === 'manual';
  $('manualPanel').hidden = !manual; $('pdfPanel').hidden = manual;
  $('manualTab').classList.toggle('active', manual); $('pdfTab').classList.toggle('active', !manual);
  $('manualTab').setAttribute('aria-selected', String(manual)); $('pdfTab').setAttribute('aria-selected', String(!manual));
}
$('manualTab').addEventListener('click', () => switchTab('manual'));
$('pdfTab').addEventListener('click', () => switchTab('pdf'));
$('parseManual').addEventListener('click', () => {
  const matches = parseManualInput($('manualInput').value);
  if (!matches.length) { status('Non ho riconosciuto partite valide. Usa: Casa - Trasferta; quota 1; quota X; quota 2; mercati opzionali come O2.5=1.90.', 'error'); return; }
  loadMatches(matches, 'input manuale');
});
$('clearInput').addEventListener('click', () => { $('manualInput').value = ''; status('Testo svuotato.'); saveState(); });
$('importPdf').addEventListener('click', async () => {
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
      state.matches = []; state.rawColumns = []; state.finalColumns = []; state.lastGenerated = false;
      renderMatches(); saveState();
      $('tableWrap').innerHTML = '<p class="empty-state">Nessuna partita importata. Inserisci o importa nuove quote.</p>';
      $('summary').textContent = 'Nessuna partita riconosciuta nel PDF.';
      status('PDF letto, ma non sono state riconosciute righe valide di Serie A con tutte le 21 quote previste. Le partite precedenti sono state rimosse per evitare confusione. Puoi inserire le quote manualmente nella sezione 1.', 'error');
    } else loadMatches(matches, 'PDF da URL');
  } catch (error) {
    console.warn('Importazione PDF non riuscita:', error);
    status('Impossibile scaricare il PDF da questo browser (possibile blocco CORS). Scarica il file sul dispositivo e usa “Scegli file PDF…”.', 'error');
  } finally { button.disabled = false; button.textContent = 'Importa Quote da PDF'; }
});
$('loadPdfFile').addEventListener('click', () => $('pdfFile').click());
$('pdfFile').addEventListener('change', async event => {
  const file = event.target.files?.[0];
  if (!file) return;
  $('pdfFileName').textContent = file.name;
  const button = $('loadPdfFile');
  const originalText = button.textContent;
  button.disabled = true;
  button.textContent = 'Elaborazione…';
  status('Lettura del PDF locale in corso…');
  try {
    if (file.type && file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      throw new Error('Il file selezionato non sembra essere un PDF.');
    }
    await loadPdfJs();
    const matches = await parseSisalPdf(await file.arrayBuffer());
    if (!matches.length) {
      clearImportedMatches('Nessuna partita riconosciuta nel PDF.');
      status('PDF letto, ma non sono state riconosciute partite con quote 1X2 nelle sezioni supportate.', 'error');
    } else {
      loadMatches(matches, 'file PDF locale');
    }
  } catch (error) {
    console.error('Errore durante la lettura del PDF locale:', error);
    status(error?.message || 'Errore durante la lettura del PDF. Verifica che sia valido e non protetto da password.', 'error');
  } finally {
    button.disabled = false;
    button.textContent = originalText;
    event.target.value = '';
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
      const extra = match.esiti.find(o => !match.selezionati.includes(`${o.market}:${o.outcome}`));
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
for (const id of ['maxDraws','minDraws','maxGoals','highOdds','maxHigh','minQuota','maxQuota','minProb']) $(id).addEventListener('input', debouncedUpdateCounter);
$('stake').addEventListener('input', () => { saveState(); if (state.lastGenerated) renderTable(); });
$('sisalBonus').addEventListener('change', () => { if (state.lastGenerated) renderTable(); });
$('maxColumns').addEventListener('change', updateCounter);
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
  document.body.dataset.printMode = 'integral'; window.print(); delete document.body.dataset.printMode;
});
$('themeToggle').addEventListener('click', () => {
  document.documentElement.dataset.theme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  saveState();
});
$('reset').addEventListener('click', () => {
  if (!confirm('Vuoi cancellare partite, filtri e sistema generato?')) return;
  state.matches = []; state.rawColumns = []; state.finalColumns = []; state.lastGenerated = false;
  $('manualInput').value = ''; $('stake').value = '0.10'; $('maxColumns').value = '32768';
  for (const id of ['maxDraws','minDraws','maxGoals','maxHigh','minQuota','maxQuota','minProb']) $(id).value = '';
  $('highOdds').value = '3.00'; localStorage.removeItem(savedKey);
  renderMatches(); $('summary').textContent = 'Seleziona almeno una partita e i relativi esiti.';
  $('tableWrap').innerHTML = '<p class="empty-state">La tabella del sistema apparirà qui.</p>';
  $('exportCsv').disabled = $('printTable').disabled = $('exportText').disabled = $('printIntegral').disabled = true;
  status('Sistema azzerato.');
});
restoreState();
if (state.matches.length) { renderMatches(); status('Sessione ripristinata dal dispositivo.'); }
else $('pdfUrl').value = SISAL_DEFAULT_URL;
