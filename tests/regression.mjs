import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { parseManualInput, parseSisalPdf, SERIE_A_TEAM_SEASON, SERIE_A_TEAMS, getSerieATeamLines } from '../js/parser.js';
import { generateSystem, MAX_MATCHES, MAX_CHOICES_PER_MATCH, MAX_SYSTEM_COLUMNS } from '../js/generator.js';
import { applyFilters, classifyColumns, describeOutcome, maxOutcomeCount, collectVariableOutcomes } from '../js/filters.js';
import { printWithMode, buildCsv, PRINT_COLUMNS_PER_PAGE, splitPrintRows } from '../js/exporter.js';
import { fairProbabilities, isExclusiveSystem } from '../js/probability.js';
import { summarizeColumnRange } from '../js/calculator.js';
import { assessMinimumCoverage, estimateBonusFraction, hasUnprofitableDoublePartner, isHighQuote } from '../js/coverage.js';
import { calculateStakeAllocation, formatEuroPrecise } from '../js/stake.js';
import { MAX_LOADED_MATCHES } from '../js/config.js';
import { createBackupPayload, validateBackupPayload, validateStoredState, BACKUP_FORMAT } from '../js/backup.js';
import { normalizeMatchSelection, normalizeMatchList, toggleMatchOutcome, clearMatchSelections, selectionMarketKey } from '../js/selection.js';
import { buildQuoteSheetGroups, flattenQuoteSheetColumns, matchesQuoteColumn } from '../js/quote-sheet.js';
import { findExactCoverCandidates, findExactCoverCandidatesForSelections, getLastChronologicalMatch, calculateLiveReturns, calculateCoverStake, calculateBestSingleCover, describeCoverOutcome } from '../js/cover-bet.js';

// I test async venivano lanciati senza await: un fallimento compariva dopo il "✓" (o mai).
// Ora si accodano e si eseguono in sequenza, attendendo ciascuno.
const queue = [];
function test(name, fn) { queue.push({ name, fn }); }


const pageHtml = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const pageJs = readFileSync(new URL('../app.js', import.meta.url), 'utf8');


test('Copertura: Doppia Chance 1X propone il 2 come controparte esatta', () => {
  const match = { esiti: [
    { market: 'Doppia Chance', outcome: '1X', label: '1X', quota: 1.10 },
    { market: 'Esito Finale', outcome: '2', label: '2', quota: 6.50 }
  ] };
  const candidates = findExactCoverCandidates(match, match.esiti[0]);
  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].outcome.outcome, '2');
  assert.equal(candidates[0].outcome.quota, 6.5);
});
test('Copertura: una doppia precedente può avere entrambe le selezioni vincenti', () => {
  const previous = { id: 'prev', esitoEffettivo: '__both__', selezionati: ['Goal/NoGoal:Goal', 'Under/Over 2.5:Over 2.5'] };
  const last = { id: 'last', selezionati: ['Doppia Chance:1X'], esiti: [{ market: 'Doppia Chance', outcome: '1X', label: '1X', quota: 1.1 }] };
  const columns = [
    { esiti: [{ eventId: 'prev', market: 'Goal/NoGoal', outcome: 'Goal' }, { eventId: 'last', market: 'Doppia Chance', outcome: '1X' }], quotaTotale: 10 },
    { esiti: [{ eventId: 'prev', market: 'Under/Over 2.5', outcome: 'Over 2.5' }, { eventId: 'last', market: 'Doppia Chance', outcome: '1X' }], quotaTotale: 20 }
  ];
  const result = calculateLiveReturns({ columns, previousMatches: [previous, last], lastMatch: last, perColumnStake: 1 });
  assert.equal(result[0].grossReturn, 30);
  assert.equal(result[0].winningColumns, 2);
});
test('Copertura: Segna Goal Casa SÌ propone NO e viceversa', () => {
  const match = { esiti: [
    { market: 'Segna Goal Casa', outcome: 'SI Casa', label: 'SI Casa', quota: 1.45 },
    { market: 'Segna Goal Casa', outcome: 'NO Casa', label: 'NO Casa', quota: 2.70 }
  ] };
  assert.equal(findExactCoverCandidates(match, match.esiti[0])[0].outcome.outcome, 'NO Casa');
  assert.equal(findExactCoverCandidates(match, match.esiti[1])[0].outcome.outcome, 'SI Casa');
});
test('Copertura: ultima partita individuata per data e ora, non per ordine di caricamento', () => {
  const earlier = { id: 'early', data: '31/10', ora: '15.00', selezionati: ['x'] };
  const later = { id: 'late', data: '2/11', ora: '20.45', selezionati: ['y'] };
  assert.equal(getLastChronologicalMatch([later, earlier]).id, 'late');
});
test('Copertura: risultati precedenti filtrano le colonne e calcolano ritorno e puntata', () => {
  const previous = { id: 'prev', esitoEffettivo: 'Esito Finale:1' };
  const last = { id: 'last', selezionati: ['Doppia Chance:1X'], esiti: [{ market: 'Doppia Chance', outcome: '1X', label: '1X', quota: 1.1 }] };
  const columns = [
    { esiti: [{ eventId: 'prev', market: 'Esito Finale', outcome: '1' }, { eventId: 'last', market: 'Doppia Chance', outcome: '1X' }], quotaTotale: 10 },
    { esiti: [{ eventId: 'prev', market: 'Esito Finale', outcome: '2' }, { eventId: 'last', market: 'Doppia Chance', outcome: '1X' }], quotaTotale: 99 }
  ];
  const returns = calculateLiveReturns({ columns, previousMatches: [previous, last], lastMatch: last, perColumnStake: 2, bonusForColumn: () => 0 });
  assert.equal(returns[0].grossReturn, 20);
  assert.equal(returns[0].winningColumns, 1);
  assert.equal(calculateCoverStake(200, 6.5).stake, 200 / 6.5);
});

test('UI V23: pannello copertura e indicatori ultima partita sono presenti', () => {
  assert.match(pageHtml, /id="smartCoveragePanel"/);
  assert.match(pageJs, /renderSmartCoveragePanel/);
  assert.match(pageJs, /odds-cover-suggested/);
  assert.match(pageJs, /getLastChronologicalMatch/);
});

test('Copertura UI: il pannello si aggiorna dopo la generazione e ogni ricalcolo della tabella', () => {
  const renderTable = pageJs.match(/function renderTable\(\) \{[\s\S]*?\n\}\nfunction buildPrintTable/);
  assert.ok(renderTable, 'renderTable deve essere individuabile');
  assert.ok((renderTable[0].match(/renderSmartCoveragePanel\(\)/g) || []).length >= 3, 'il pannello va aggiornato nei rami normale, senza colonne e con budget non valido');
  assert.match(pageJs, /\$\('generate'\)\.addEventListener\('click'[\s\S]*?state\.lastGenerated = true;[\s\S]*?renderTable\(\);/);
});
test('UI: Azzera quote è tra Genera sistema e Reset completo', () => {
  const generateIndex = pageHtml.indexOf('id="generate"');
  const clearIndex = pageHtml.indexOf('id="clearQuotes"');
  const resetIndex = pageHtml.indexOf('id="reset"');
  assert.ok(generateIndex >= 0 && clearIndex > generateIndex && resetIndex > clearIndex, 'ordine dei pulsanti non corretto');
  assert.match(pageHtml, /id="clearQuotes"[^>]*disabled[^>]*aria-label="Azzera quote selezionate senza eliminare le quote importate"/);
  assert.match(pageJs, /\$\('clearQuotes'\)\.addEventListener\('click'/);
  assert.match(pageJs, /state\.matches = clearMatchSelections\(state\.matches\)/);
  assert.match(pageJs, /state\.outcomeFilterLimits = \{\}/);
  assert.match(pageJs, /function hasActiveOutcomeFilters\([\s\S]*?return Object\.values\(state\.outcomeFilterLimits \|\| \{\}\)/);
  assert.match(pageJs, /azzerati \$\{filterCount\} filtri di riduzione/);
  assert.match(pageHtml, /Azzera quote<\/strong> cancella le selezioni e azzera anche i filtri dinamici/);
});
test('Azzera quote: rimuove soltanto le selezioni e mantiene partite, quote e metadati', () => {
  const source = {
    id: 'bologna-monza', casa: 'Bologna', trasferta: 'Monza', data: '31/10', ora: '15.00',
    pal: '36441', avv: '1447', competizione: 'Serie A', tipo: 'doppia',
    esiti: [
      { market: '1X2', outcome: '1', label: '1', quota: 1.67 },
      { market: 'Under/Over 2.5', outcome: 'Over 2.5', label: 'Over 2.5', quota: 1.80 }
    ],
    selezionati: ['1X2:1', 'Under/Over 2.5:Over 2.5']
  };
  const cleared = clearMatchSelections([source]);
  assert.equal(cleared.length, 1);
  assert.deepEqual(cleared[0].selezionati, []);
  assert.equal(cleared[0].tipo, 'fissa');
  assert.deepEqual(cleared[0].esiti, source.esiti);
  assert.equal(cleared[0].casa, 'Bologna');
  assert.equal(cleared[0].trasferta, 'Monza');
  assert.equal(cleared[0].pal, '36441');
  assert.deepEqual(source.selezionati, ['1X2:1', 'Under/Over 2.5:Over 2.5'], 'la funzione non deve mutare l’oggetto sorgente');
});
test('Evidenziazione rossa: solo coppie di mercati binari con entrambe le quote <= 2,00', () => {
  const totals = [
    { market: 'Under/Over 2.5', outcome: 'U 2.5', quota: 1.80 },
    { market: 'Under/Over 2.5', outcome: 'O 2.5', quota: 1.90 }
  ];
  assert.equal(hasUnprofitableDoublePartner(totals[0], totals), true, 'Under 1,80 e Over 1,90: entrambe rosse');
  assert.equal(hasUnprofitableDoublePartner(totals[1], totals), true);

  const goal = [
    { market: 'Goal/NoGoal', outcome: 'Goal', quota: 1.75 },
    { market: 'Goal/NoGoal', outcome: 'NoGoal', quota: 1.95 }
  ];
  assert.equal(hasUnprofitableDoublePartner(goal[0], goal), true, 'Goal 1,75 e NoGoal 1,95: entrambe rosse');
  assert.equal(hasUnprofitableDoublePartner(goal[1], goal), true);

  const mixed = [
    { market: 'Under/Over 2.5', outcome: 'U 2.5', quota: 1.80 },
    { market: 'Under/Over 2.5', outcome: 'O 2.5', quota: 2.10 }
  ];
  assert.equal(hasUnprofitableDoublePartner(mixed[0], mixed), false, 'una quota sotto 2 e una sopra 2: nessun rosso');
  assert.equal(hasUnprofitableDoublePartner(mixed[1], mixed), false);

  const triple = [
    { market: '1X2', outcome: '1', quota: 1.80 },
    { market: '1X2', outcome: 'X', quota: 1.90 },
    { market: '1X2', outcome: '2', quota: 2.10 }
  ];
  assert.equal(triple.some(item => hasUnprofitableDoublePartner(item, triple)), false, 'un mercato a tre esiti non viene mai marcato');
  const doubleChance = [
    { market: 'Doppia Chance', outcome: '1X', quota: 1.40 },
    { market: 'Doppia Chance', outcome: 'X2', quota: 1.80 },
    { market: 'Doppia Chance', outcome: '12', quota: 1.50 }
  ];
  assert.equal(doubleChance.some(item => hasUnprofitableDoublePartner(item, doubleChance)), false, 'la Doppia Chance è un mercato a tre esiti');

  const differentMarkets = [
    { market: 'Under/Over 2.5', outcome: 'U 2.5', quota: 1.80 },
    { market: 'Goal/NoGoal', outcome: 'Goal', quota: 1.90 }
  ];
  assert.equal(differentMarkets.some(item => hasUnprofitableDoublePartner(item, differentMarkets)), false, 'quote di mercati diversi non formano una coppia');

  const boundary = [
    { market: 'Under/Over 1.5', outcome: 'U 1.5', quota: 2.00 },
    { market: 'Under/Over 1.5', outcome: 'O 1.5', quota: 1.99 }
  ];
  assert.equal(hasUnprofitableDoublePartner(boundary[0], boundary), true, 'la soglia 2,00 è inclusa');
  assert.equal(hasUnprofitableDoublePartner(boundary[1], boundary), true);

  const incomplete = [{ market: 'Goal/NoGoal', outcome: 'Goal', quota: 1.75 }];
  assert.equal(hasUnprofitableDoublePartner(incomplete[0], incomplete), false, 'un mercato binario incompleto non viene marcato');

  assert.match(pageJs, /hasUnprofitableDoublePartner\(outcome, match\.esiti\)/);
  assert.match(pageJs, /odds-low-double-risk/);
  const css = readFileSync(new URL('../style.css', import.meta.url), 'utf8');
  assert.match(css, /\.odds-cell\.odds-low-double-risk\{color:#b4232d!important/);
  assert.match(css, /\.odds-cell\.odds-low-double-risk\.is-fixed\{color:#b4232d!important/, 'anche una quota evidenziata che viene selezionata mantiene il carattere rosso');
  assert.match(pageJs, /mercati binari riconosciuti in cui entrambe le quote sono pari o inferiori a 2,00/);
  const coverageSource = readFileSync(new URL('../js/coverage.js', import.meta.url), 'utf8');
  assert.match(coverageSource, /marketOutcomes\.length !== 2/);
  assert.match(coverageSource, /odd <= threshold/);
});

test('Controllo copertura: moltiplicatore, spesa totale e bonus Sisal stimato', () => {
  const column = { id: 1, quotaTotale: 62, esiti: Array.from({ length: 5 }, (_, i) => ({ quota: 1.25 + i * 0.01 })) };
  assert.ok(Math.abs(estimateBonusFraction(column, true) - 0.04) < 1e-12);
  assert.equal(estimateBonusFraction(column, false), 0);
  const allocation = { valid: true, perColumn: 0.10, total: 6.40 };
  const withBonus = assessMinimumCoverage([column], allocation, true);
  assert.equal(withBonus.status, 'covered', '62 × 0,10 × 1,04 = 6,448 €: supera la spesa di 6,40 €');
  assert.ok(Math.abs(withBonus.minReturn - 6.448) < 1e-9);
  assert.ok(Math.abs(withBonus.difference - 0.048) < 1e-9);
  const noBonus = assessMinimumCoverage([column], allocation, false);
  assert.equal(noBonus.status, 'uncovered', 'senza bonus il ritorno è 6,20 € e non copre 6,40 €');
  assert.equal(noBonus.minReturn, 6.2);
  assert.equal(assessMinimumCoverage([], allocation, true).status, 'no-columns');
  assert.equal(assessMinimumCoverage([column], { valid: false, error: 'budget non valido' }, true).status, 'invalid-stake');
  assert.match(pageHtml, /id="minimumCoverageCheck"[^>]*aria-live="polite"/);
  assert.match(pageJs, /renderMinimumCoverageCheck\(filtered\.colonne\)/);
  assert.match(pageJs, /renderMinimumCoverageCheck\(state\.coverageColumns\)/);
  assert.match(pageJs, /estimateBonusFraction\(column, bonusOn\)/);
  const css = readFileSync(new URL('../style.css', import.meta.url), 'utf8');
  assert.match(css, /\.minimum-coverage-check\.is-covered/);
  assert.match(css, /\.minimum-coverage-check\.is-uncovered/);
  assert.match(pageJs, /non una garanzia che una colonna vinca/);
});

test('UI: importazione parte direttamente dal PDF Sisal; inserimento manuale rimosso', () => {
  const pdfTitle = pageHtml.indexOf('Importa il PDF Sisal (consigliato su Android)');
  const pdfPanel = pageHtml.indexOf('id="pdfPanel"');
  const teamManager = pageHtml.indexOf('id="openTeamManager"');
  assert.ok(pdfTitle >= 0 && pdfPanel > 0 && teamManager > pdfPanel, 'il pannello PDF è il primo metodo di caricamento');
  assert.match(pageHtml, /<h2 id="pdf-title">Importa il PDF Sisal \(consigliato su Android\)<\/h2>/);
  assert.doesNotMatch(pageHtml, /id="manualPanel"|id="parseManual"|id="clearInput"|Incolla le quote manualmente|href="#manualPanel"/);
  assert.match(pageHtml, /<textarea id="manualInput" hidden aria-hidden="true" tabindex="-1"><\/textarea>/, 'campo legacy nascosto per compatibilità con vecchi backup');
  assert.doesNotMatch(pageJs, /parseManualInput|parseManual|clearInput/);
  assert.match(pageJs, /manualInput: \$\('manualInput'\)\?\.value \|\| ''/);
  assert.match(pageJs, /\$\('clearQuotes'\)\.addEventListener\('click',[\s\S]*?clearTimeout\(filterUpdateTimeout\)/);
});

test('Quote superiori a 3,00: evidenziazione blu strettamente maggiore di 3', () => {
  assert.equal(isHighQuote({ quota: 3.01 }), true);
  assert.equal(isHighQuote({ quota: 3 }), false, '3,00 esatto non è blu');
  assert.equal(isHighQuote({ quota: '3.50' }), true);
  assert.equal(isHighQuote({ quota: '3,50', market: '1X2', outcome: 'X' }), true, 'si applica anche a 1X2 e valori con virgola');
  assert.equal(isHighQuote({ quota: 3.25, market: 'Doppia Chance', outcome: 'X2' }), true, 'si applica anche alla Doppia Chance');
  assert.equal(isHighQuote({ quota: 3.10, market: 'Handicap', outcome: 'H2' }), true, 'si applica anche all’handicap');
  assert.equal(isHighQuote({ quota: 2.99 }), false);
  assert.equal(isHighQuote({ quota: 'non valida' }), false);
  assert.equal(isHighQuote(null), false);
  assert.match(pageJs, /const highQuote = isHighQuote\(outcome\)/);
  assert.match(pageJs, /highQuote \? 'odds-high-quote' : ''/);
  const css = readFileSync(new URL('../style.css', import.meta.url), 'utf8');
  assert.match(css, /\.odds-cell\.odds-high-quote\{color:#1558b5!important\}/);
  assert.match(css, /:root\[data-theme="dark"\] \.odds-cell\.odds-high-quote\{color:#88baff!important\}/);
  assert.match(css, /\.odds-cell\.odds-high-quote\.is-fixed\{color:#f4f8ff!important\}/, 'le quote blu restano leggibili sulle fisse selezionate');
  assert.match(css, /\.odds-cell\.odds-high-quote\.is-double\{color:#174b8d!important\}/, 'le quote blu restano leggibili sulle doppie selezionate');
  assert.match(css, /:root\[data-theme="dark"\] \.odds-cell\.odds-high-quote\.is-fixed\{color:#00356b!important\}/);
});
test('Le modifiche alle partite invalidano la tabella precedente e le esportazioni', () => {
  assert.match(pageJs, /function invalidateGeneratedSystem\([\s\S]*?state\.rawColumns = \[\][\s\S]*?state\.finalColumns = \[\][\s\S]*?state\.lastGenerated = false/);
  assert.match(pageJs, /\$\('exportCsv'\)\.disabled = true/);
  assert.match(pageJs, /\$\('integralPrint'\)\.innerHTML = ''/);
  assert.match(pageJs, /Partita rimossa\. Premi “Genera sistema” per ricostruire le colonne/);
  assert.match(pageJs, /invalidateGeneratedSystem\('Partite caricate\./);
});

test('UI: importazione automatica via URL rimossa e link diretto al foglio quote per manifestazione', () => {
  assert.doesNotMatch(pageHtml, /id="(?:pdfUrl|importPdf)"/);
  assert.doesNotMatch(pageJs, /importPdf/);
  assert.doesNotMatch(pageJs, /SISAL_DEFAULT_URL/);
  assert.match(pageHtml, /id="openSisalPdf"[^>]*href="https:\/\/landing\.sisal\.it\/volantini\/Scommesse_Sport\/Quote\/calcio%20base%20per%20manifestazione\.pdf"/);
});
test('Stampa Android: la modalità non viene cancellata da afterprint prima dell’anteprima', () => {
  const exporter = readFileSync(new URL('../js/exporter.js', import.meta.url), 'utf8');
  assert.match(exporter, /const isAndroid = \/Android\/i\.test/);
  assert.match(exporter, /if \(isAndroid\) \{[\s\S]*document\.addEventListener\('visibilitychange', onVisibility\)/);
  assert.match(exporter, /else \{\n    window\.addEventListener\('afterprint', clear, \{ once: true \}\);/);
});

test('Info: firma stilizzata SalHard accessibile e autore dichiarato', () => {
  assert.match(pageHtml, /<meta name="author" content="SalHard">/);
  assert.match(pageHtml, /class="info-author"[^>]*aria-label="Autore dell'applicazione: SalHard"/);
  assert.match(pageHtml, /<svg class="info-author-signature" viewBox="0 0 190 62" role="img"/);
  assert.match(pageHtml, /<title id="salhardSignatureTitle">Firma stilizzata dell'autore SalHard<\/title>/);
  assert.match(pageHtml, /<text x="8" y="43">SalHard<\/text>/);
  assert.match(readFileSync(new URL('../style.css', import.meta.url), 'utf8'), /\.info-author-signature text[^{]*\{[^}]*cursive/s);
});

test('Icone app: risorse colorate, favicon outline e logo stampa presenti', () => {
  for (const path of ['../icon-512.png', '../icon-192.png', '../icon-maskable-512.png', '../apple-touch-icon.png', '../favicon-32.png']) {
    assert.ok(existsSync(new URL(path, import.meta.url)), `icona mancante: ${path}`);
  }
  assert.match(pageHtml, /icon-192\.png\?v=sb-v27-20261031/);
  assert.match(pageHtml, /app-icon-192\.png\?v=sb-v27-20261031/);
  assert.match(pageHtml, /app-apple-touch-icon\.png\?v=sb-v27-20261031/);
  const manifest = JSON.parse(readFileSync(new URL('../manifest.webmanifest', import.meta.url), 'utf8'));
  assert.ok(manifest.icons.some(icon => icon.src.startsWith('app-icon-maskable-512.png') && icon.purpose === 'maskable'));
  for (const path of ['../app-icon-192.png', '../app-icon-512.png', '../app-icon-maskable-512.png', '../app-apple-touch-icon.png']) assert.ok(existsSync(new URL(path, import.meta.url)), `icona app mancante: ${path}`);
  assert.match(pageJs, /class=\"integral-brand-mark\" role=\"img\" aria-label=\"Logo SB\"[^>]*><svg/);
  assert.match(pageJs, /class=\"print-sb-mark\" viewBox=\"0 0 64 64\"/);
  const css = readFileSync(new URL('../style.css', import.meta.url), 'utf8');
  assert.match(css, /integral-brand-mark svg/);
  assert.match(css, /print-sb-mark/);
});

test('PWA: il service worker mette in cache la shell, serve l’HTML offline e supporta percorsi relativi', () => {
  const sw = readFileSync(new URL('../sw.js', import.meta.url), 'utf8');
  assert.match(pageJs, /navigator\.serviceWorker\.register\(serviceWorkerUrl\.href\)/);
  assert.match(sw, /cache\.addAll\(CORE_ASSETS/);
  assert.match(sw, /request\.mode === 'navigate'/);
  assert.match(sw, /networkFirst\(event, '\.\/index\.html'\)/);
  assert.match(sw, /if \(url\.origin !== scopeUrl\.origin/);
  assert.match(sw, /vendor\/pdfjs\/pdf\.worker\.min\.js/);
  assert.match(sw, /data\/serie-a-teams\.json/);
  const assetsBlock = sw.match(/const CORE_ASSETS = \[([\s\S]*?)\];/)?.[1];
  assert.ok(assetsBlock, 'il service worker deve dichiarare la shell da precaricare');
  const version = sw.match(/const RELEASE = '([^']+)'/)?.[1];
  const precachePaths = [...assetsBlock.matchAll(/`([^`]+)`|'([^']+)'/g)].map(match => (match[1] || match[2]).replace('${VERSION_QUERY}', `?v=${version}`).split('?')[0]);
  assert.ok(precachePaths.length >= 20, 'la shell deve includere moduli, PDF.js, dati e icone');
  for (const path of precachePaths) {
    const relative = path.replace(/^\.\//, '');
    const target = relative ? new URL(`../${relative}`, import.meta.url) : new URL('../', import.meta.url);
    assert.ok(existsSync(target), `risorsa del precache non trovata: ${path}`);
  }
});

test('Stagione squadre: la stagione del catalogo base è centralizzata e coerente con il JSON incluso', () => {
  const data = JSON.parse(readFileSync(new URL('../data/serie-a-teams.json', import.meta.url), 'utf8'));
  assert.equal(data.season, SERIE_A_TEAM_SEASON);
  assert.equal(data.teams.length, 20);
  assert.match(pageJs, /Ripristina base ufficiale \$\{SERIE_A_TEAM_SEASON\}/);
  assert.match(pageJs, /Ripristinato l’elenco base incluso \(\$\{SERIE_A_TEAM_SEASON\}\)/);
  assert.doesNotMatch(pageHtml, /Ripristina base ufficiale 2026\/27/);
  assert.doesNotMatch(pageJs, /stagione 2026\/27/);
});

test('Il collegamento GitHub generico è stato rimosso perché non identifica il repository del progetto', () => {
  assert.doesNotMatch(pageHtml, /href=\"https:\/\/github\.com\//);
});

test('UI: pulsante Info accessibile collegato alla finestra guida', () => {
  assert.match(pageHtml, /id="infoButton"[^>]*aria-haspopup="dialog"[^>]*aria-controls="infoDialog"/);
  assert.match(pageHtml, /<dialog id="infoDialog"[^>]*aria-labelledby="infoTitle"/);
  assert.match(pageHtml, /id="closeInfo"/);
  assert.match(pageJs, /infoButton\?\.addEventListener\('click'/);
  assert.match(pageJs, /infoDialog\?\.addEventListener\('click'/);
});
test('UI: nessun identificatore duplicato in index.html', () => {
  const ids = [...pageHtml.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
  assert.equal(ids.length, new Set(ids).size, 'Tutti gli id HTML devono essere univoci');
});
test('UI: rimosse le tre soglie statiche e presente la tabella dedicata alla stampa', () => {
  assert.doesNotMatch(pageHtml, /id="(?:highOdds|maxHigh|minProb)"/);
  assert.match(pageHtml, /id="printTableWrap"/);
  assert.doesNotMatch(pageJs, /\$\('(highOdds|maxHigh|minProb)'\)/);
});
test('Stampa integrale: design economico e riepilogo min/max per sistema pieno e ridotto', () => {
  const css = readFileSync(new URL('../style.css', import.meta.url), 'utf8');
  assert.match(css, /@page\{size:A4 portrait;margin:0\}/);
  assert.match(css, /integral-footer-summary\{display:grid!important;grid-template-columns:1\.3fr 1\.3fr 1fr 1\.1fr!important/);
  assert.match(pageJs, /<th>Quota totale<\/th><th>Vincita netta<\/th>/);
  assert.match(pageJs, /event\.tipo === 'fissa' \? `<strong>/);
  assert.match(pageJs, /const usesHandicap = selected\.some\(outcome => selectionMarketKey\(outcome\) === 'handicap'\)/);
  assert.match(pageJs, /const meta = \[m\.competizione, m\.data, m\.ora/);
  assert.match(pageJs, /integralRangeMarkup\('Sistema integrale', fullRange, false, fullRangeEmptyMessage\)/);
  assert.match(pageJs, /integralRangeMarkup\('Sistema ridotto', reducedRange, true\)/);
  assert.match(pageJs, /Quota minima/);
  assert.match(pageJs, /Quota massima/);
  assert.match(pageJs, /Vincita netta minima/);
  assert.match(pageJs, /Vincita netta massima/);
  assert.match(pageJs, /Nr colonne massime giocabili/);
  assert.match(pageJs, /Colonne Giocate \(se ridotto\)/);
  assert.match(pageJs, /Quota per colonna/);
  assert.match(pageJs, /Totale Spesa/);
  assert.match(pageJs, /formatEuro\(allocation\.total\)/);
  assert.match(pageJs, /const allocation = getStakeAllocation\(state\.finalColumns\.length\)/);
  assert.match(pageJs, /const fullAllocation = getStakeAllocation\(state\.rawColumns\.length\)/);
  assert.equal((pageJs.match(/<span>Quota massima<\/span>/g) || []).length, 1, 'la quota massima non deve essere duplicata');
  assert.doesNotMatch(pageJs, /range\.count\.toLocaleString\('it-IT'\)\} colonne/, 'i conteggi del footer non si ripetono nei titoli dei riepiloghi');
  assert.doesNotMatch(pageJs, /colonne sviluppate · \$\{state\.finalColumns\.length/, 'i conteggi non si ripetono nell’intestazione');
  assert.match(pageJs, /<span class="integral-outcome"><span>\$\{escapeHtml\(o\.label\)\}<\/span><strong>\$\{formatQuota\(o\.quota\)\}<\/strong>/);
  assert.doesNotMatch(pageJs, /<b>@ \$\{formatQuota\(o\.quota\)\}<\/b>/, 'la stampa integrale non usa chiocciole come prefisso delle quote');
  assert.doesNotMatch(pageJs, /fixedOutcome\?\.label \|\| ''\} @ \$\{formatQuota/);
  assert.match(pageJs, /function integralRangeMarkup\(/);
  assert.match(pageJs, /printWithMode\('integral'\)/);
});

test('Stampa multipiattaforma: massimo 32 colonne per foglio e nessun salto dopo l’ultima pagina', () => {
  assert.equal(PRINT_COLUMNS_PER_PAGE, 32);
  const source = Array.from({ length: 1024 }, (_, i) => i + 1);
  const pages = splitPrintRows(source);
  assert.equal(pages.length, 32);
  assert.ok(pages.every(page => page.length === 32));
  assert.deepEqual(pages[0], Array.from({ length: 32 }, (_, i) => i + 1));
  assert.deepEqual(pages.at(-1), Array.from({ length: 32 }, (_, i) => i + 993));
  assert.equal(splitPrintRows(source.slice(0, 33)).length, 2);
  assert.equal(splitPrintRows(source.slice(0, 33))[1].length, 1);
  assert.deepEqual(splitPrintRows([]), []);
  assert.throws(() => splitPrintRows(source, 0), /intero positivo/);
  assert.match(pageJs, /splitPrintRows\(classifiedColumns, PRINT_COLUMNS_PER_PAGE\)/);
  assert.match(pageJs, /data-print-rows="\$\{pageRows\.length\}"/);
  assert.match(pageJs, /printMethodNote = '<span class=\"print-method-note\">/);
  assert.doesNotMatch(pageJs, /pageIndex === pages\.length - 1 \? '<p class=\"print-footnote\"/);
  const css = readFileSync(new URL('../style.css', import.meta.url), 'utf8');
  assert.match(css, /body\[data-print-mode="table"\] \.print-page-table\{[^}]*break-after:avoid!important;page-break-after:avoid!important/);
  assert.match(css, /body\[data-print-mode="table"\] \.print-page-table\+\.print-page-table\{break-before:page!important;page-break-before:always!important/);
  assert.doesNotMatch(css, /body\[data-print-mode="table"\] \.print-page-table\{[^}]*break-after:page!important/);
  assert.doesNotMatch(css, /body\[data-print-mode="table"\]\{page:columns/);
  assert.equal((css.match(/@page/g) || []).length, 1, 'una sola dichiarazione @page nel CSS; l’orientamento viene aggiornato dal print mode');
  assert.match(css, /body\[data-print-mode="table"\] main\.container\{display:none!important/);
  assert.match(css, /body\[data-print-mode="table"\] #printTableWrap\{display:block!important/);
  assert.match(css, /height:4\.9mm!important/);
  assert.match(css, /white-space:nowrap!important;overflow:hidden!important;text-overflow:clip!important/);
  assert.match(pageJs, /class=\"print-column-header\"/);
  assert.ok(pageHtml.indexOf('</main>') < pageHtml.indexOf('id="printTableWrap"'), 'contenitore di stampa isolato fuori da main');
});

test('Foglio quote: squadre congelate a sinistra; metadati sono in fondo e intestazioni restano in alto', () => {
  assert.match(pageJs, /class="quote-team team1-cell"/);
  assert.match(pageJs, /class="quote-team team2-cell"/);
  assert.match(pageJs, /class="quote-team quote-fixed-head quote-team-head team1-head"/);
  assert.match(pageJs, /class="quote-team quote-fixed-head quote-team-head team2-head"/);
  assert.ok(pageJs.indexOf('quote-team team1-cell') < pageJs.indexOf('\$\{quoteCells\}'), 'le squadre sono bloccate prima delle quote');
  assert.ok(pageJs.indexOf('\$\{quoteCells\}') < pageJs.indexOf('quote-date quote-meta-col'), 'i metadati sono collocati dopo tutti i mercati e non spuntano tra squadre e quote');
  const css = readFileSync(new URL('../style.css', import.meta.url), 'utf8');
  assert.match(css, /\.quote-sheet thead th\{position:sticky;top:0/);
  assert.match(css, /\.quote-sheet tbody \.team1-cell,\.quote-sheet thead \.team1-head\{left:0\}/);
  assert.match(css, /\.quote-sheet tbody \.team2-cell,\.quote-sheet thead \.team2-head\{left:var\(--quote-team-width\)\}/);
  assert.match(css, /@media\(max-width:800px\)\{\.quote-sheet-scroll/);
  assert.match(css, /\.quote-sheet \.quote-code\{display:none\}/);
  assert.match(css, /\.quote-sheet-scroll\{--quote-team-width:118px;--quote-group-head-height:38px/);
  assert.match(css, /@media\(max-width:420px\)\{\.quote-sheet-scroll\{--quote-team-width:80px/);
});

test('Griglia quote: le intestazioni non si sovrappongono e le righe sono compatte senza barra verticale visibile', () => {
  const css = readFileSync(new URL('../style.css', import.meta.url), 'utf8');
  assert.match(css, /--quote-group-head-height:38px;--quote-head-total-height:65px/);
  assert.match(css, /scroll-snap-type:y proximity;scroll-padding-top:var\(--quote-head-total-height\)/);
  assert.match(css, /\.quote-sheet tbody tr\{scroll-snap-align:start\}/);
  assert.match(css, /top:var\(--quote-group-head-height\);z-index:49;height:27px/);
  assert.match(css, /\.quote-sheet thead\{position:relative;z-index:100\}\n\.quote-sheet tbody\{position:relative;z-index:1\}/);
  assert.match(css, /quote-sheet-scroll::-webkit-scrollbar:vertical\{width:0/);
  assert.match(css, /\.quote-sheet \.quote-cell\{padding:0;min-width:48px;width:48px;height:30px/);
  assert.match(css, /\.odds-cell\{display:flex;align-items:center;justify-content:center;width:100%;min-width:48px;height:32px/);
});

test('Calcolo riepilogo economico: quote e profitto netti min/max corretti e input malformati ignorati', () => {
  assert.deepEqual(summarizeColumnRange([
    { quotaTotale: 2 }, { quotaTotale: 3.5 }, { quotaTotale: 10 }
  ], 1), { minQuota: 2, maxQuota: 10, minNet: 1, maxNet: 9, count: 3 });
  assert.deepEqual(summarizeColumnRange([{ quotaTotale: 2 }, { quotaTotale: 4 }], 0.5), {
    minQuota: 2, maxQuota: 4, minNet: 0.5, maxNet: 1.5, count: 2
  });
  assert.deepEqual(summarizeColumnRange([{ quotaTotale: 4 }, { quotaTotale: 'no' }, { quotaTotale: -2 }], 1), {
    minQuota: 4, maxQuota: 4, minNet: 3, maxNet: 3, count: 1
  });
  assert.equal(summarizeColumnRange([], 1), null);
  assert.equal(summarizeColumnRange([{ quotaTotale: 0 }, { quotaTotale: NaN }], 1), null);
});

test('UI: gestione squadre compatta con finestra separata', () => {
  assert.match(pageHtml, /<dialog id="teamDialog"[^>]*aria-labelledby="teamDialogTitle"/);
  assert.match(pageHtml, /id="openTeamManager"[^>]*aria-haspopup="dialog"[^>]*aria-controls="teamDialog"/);
  assert.match(pageHtml, /id="teamListInput"/);
  assert.doesNotMatch(pageHtml, /<section class="input-method-card team-method"/);
  assert.match(pageJs, /function openTeamDialog\(trigger\)/);
  assert.match(pageJs, /openTeamManagerReminder/);
});
test('UI: griglia quote al posto dei controlli Fissa/Doppia', () => {
  assert.match(pageJs, /class=\"quote-sheet\"/);
  assert.match(pageJs, /data-outcome-key/);
  assert.doesNotMatch(pageJs, /name=\"tipo-\$\{mi\}\"/);
  assert.doesNotMatch(pageJs, /class=\"match-controls\"/);
  assert.doesNotMatch(pageHtml, /quote-sheet-intro|Il foglio quote riprende l’ordine del bollettino/);
  assert.match(pageHtml, /handicap numerico H è informativo/);
});
test('Selezione quote: consente doppie nello stesso mercato e tra mercati diversi', () => {
  const match = { id: 'm', casa: 'Torino', trasferta: 'Monza', esiti: [
    { market: '1X2', outcome: '1', label: '1', quota: 2.1 },
    { market: '1X2', outcome: 'X', label: 'X', quota: 3.2 },
    { market: 'Doppia Chance', outcome: 'X2', label: 'X2', quota: 1.6 },
    { market: 'Under/Over 2.5', outcome: 'Over 2.5', label: 'Over 2.5', quota: 1.9 }
  ], selezionati: [] };
  assert.equal(toggleMatchOutcome(match, '1X2:1').kind, 'fissa');
  assert.deepEqual(match.selezionati, ['1X2:1']);
  assert.equal(toggleMatchOutcome(match, '1X2:X').kind, 'doppia');
  assert.deepEqual(match.selezionati, ['1X2:1', '1X2:X']);
  const refusedWhileFull = toggleMatchOutcome(match, 'Doppia Chance:X2');
  assert.equal(refusedWhileFull.changed, false);
  assert.match(refusedWhileFull.message, /anche di mercati diversi/);
  toggleMatchOutcome(match, '1X2:X');
  assert.deepEqual(match.selezionati, ['1X2:1']);
  assert.equal(toggleMatchOutcome(match, 'Doppia Chance:X2').kind, 'doppia');
  assert.deepEqual(match.selezionati, ['1X2:1', 'Doppia Chance:X2']);
  toggleMatchOutcome(match, 'Doppia Chance:X2');
  assert.equal(toggleMatchOutcome(match, 'Under/Over 2.5:Over 2.5').kind, 'doppia');
  assert.deepEqual(match.selezionati, ['1X2:1', 'Under/Over 2.5:Over 2.5']);
  toggleMatchOutcome(match, '1X2:1');
  toggleMatchOutcome(match, 'Under/Over 2.5:Over 2.5');
  assert.deepEqual(match.selezionati, []);
});
test('Selezione quote: riconosce le opzioni dello stesso mercato anche nel parser manuale', () => {
  const [totals] = parseManualInput('Milan - Roma O2.5=1.90 U2.5=1.85');
  const over = totals.esiti.find(outcome => outcome.label === 'Over 2.5');
  const under = totals.esiti.find(outcome => outcome.label === 'Under 2.5');
  assert.notEqual(over.market, under.market, 'Il parser manuale può conservare etichette mercato diverse');
  assert.equal(selectionMarketKey(over), selectionMarketKey(under));
  assert.equal(toggleMatchOutcome(totals, `${over.market}:${over.outcome}`).kind, 'fissa');
  assert.equal(toggleMatchOutcome(totals, `${under.market}:${under.outcome}`).kind, 'doppia');
  assert.equal(totals.selezionati.length, 2);

  const [goalMatch] = parseManualInput('Milan - Roma Goal=1.70 NoGoal=2.00');
  const goal = goalMatch.esiti.find(outcome => outcome.label === 'Goal');
  const noGoal = goalMatch.esiti.find(outcome => outcome.label === 'NoGoal');
  assert.equal(selectionMarketKey(goal), selectionMarketKey(noGoal));
  assert.equal(selectionMarketKey({ market: '1X2 Handicap' }), selectionMarketKey({ market: 'Handicap' }));
  assert.equal(toggleMatchOutcome(goalMatch, `${goal.market}:${goal.outcome}`).kind, 'fissa');
  assert.equal(toggleMatchOutcome(goalMatch, `${noGoal.market}:${noGoal.outcome}`).kind, 'doppia');
});

test('Migrazione stato: conserva le doppie valide anche tra mercati diversi', () => {
  const result = normalizeMatchList([{ id: 'legacy', esiti: [
    { market: '1X2', outcome: '1' }, { market: 'Under/Over 2.5', outcome: 'Over 2.5' }
  ], selezionati: ['1X2:1', 'Under/Over 2.5:Over 2.5'] }]);
  assert.equal(result.adjustedCount, 0);
  assert.deepEqual(result.matches[0].selezionati, ['1X2:1', 'Under/Over 2.5:Over 2.5']);
  assert.equal(result.matches[0].tipo, 'doppia');
});
test('Selezione quote: non consente tre esiti ma ammette due mercati sovrapposti', () => {
  const match = { esiti: [
    { market: '1X2', outcome: '1' }, { market: '1X2', outcome: 'X' }, { market: '1X2', outcome: '2' },
    { market: 'Doppia Chance', outcome: 'X2' }, { market: 'Under/Over 2.5', outcome: 'Over 2.5' }
  ], selezionati: ['1X2:1', 'Under/Over 2.5:Over 2.5'] };
  normalizeMatchSelection(match);
  assert.deepEqual(match.selezionati, ['1X2:1', 'Under/Over 2.5:Over 2.5']);
  assert.equal(match.tipo, 'doppia');
  const noThird = toggleMatchOutcome(match, '1X2:X');
  assert.equal(noThird.changed, false);
  assert.match(noThird.message, /massimo 2 quote/);
  assert.deepEqual(match.selezionati, ['1X2:1', 'Under/Over 2.5:Over 2.5']);
});

test('UI: doppie tra mercati differenti sono documentate e non bloccate dal controllo preliminare', () => {
  assert.match(pageHtml, /mercati diversi.*1 \+ X2.*1 \+ Over 2\.5/i);
  assert.match(pageJs, /anche se appartengono a mercati diversi/);
  assert.doesNotMatch(pageJs, /deve contenere due esiti dello stesso mercato/);
});

const backupExample = createBackupPayload({
  manualInput: 'Milan - Roma; 2.10; 3.20; 3.60',
  stake: '0.10',
  stakeMode: 'total-budget',
  systemBudget: '25.00',
  sisalBonus: true,
  theme: 'dark',
  matches: [{ id: 'm1', casa: 'Milan', trasferta: 'Roma', data: '23/10', ora: '20:45', palinsesto: '36431', avvenimento: '1003', handicap: '1', competizione: '', tipo: 'fissa', esiti: [{ label: '1', outcome: '1', market: '1X2', quota: 2.1 }, { label: 'X', outcome: 'X', market: '1X2', quota: 3.2 }, { label: '2', outcome: '2', market: '1X2', quota: 3.6 }], selezionati: ['1X2:1'], esitoEffettivo: '1X2:1' }],
  outcomeFilterLimits: { 'Esito finale|1': { min: '', max: '2' } },
  teamLines: ['Squadra Uno', 'Squadra Due'],
  reviewedSeason: '2026/27',
  source: 'input manuale',
  pdfDiagnostics: null
}, '2026-10-22T08:00:00.000Z');
test('Backup JSON: esporta e valida impostazioni, partite e lista squadre', () => {
  const restored = validateBackupPayload(backupExample);
  assert.equal(backupExample.format, BACKUP_FORMAT);
  assert.equal(restored.matches.length, 1);
  assert.equal(restored.matches[0].casa, 'Milan');
  assert.equal(restored.matches[0].palinsesto, '36431');
  assert.equal(restored.matches[0].avvenimento, '1003');
  assert.equal(restored.matches[0].handicap, '1');
  assert.deepEqual(restored.matches[0].selezionati, ['1X2:1']);
  assert.equal(restored.matches[0].esitoEffettivo, '1X2:1');
  assert.deepEqual(restored.teamLines, ['Squadra Uno', 'Squadra Due']);
  assert.equal(restored.theme, 'dark');
  assert.equal(restored.sisalBonus, true);
  assert.equal(restored.stakeMode, 'total-budget');
  assert.equal(restored.systemBudget, '25.00');
});
test('Backup JSON: conserva una doppia composta da mercati diversi', () => {
  const crossMarket = structuredClone(backupExample);
  crossMarket.data.matches[0].esiti.push({ market: 'Under/Over 2.5', outcome: 'Over 2.5', label: 'Over 2.5', quota: 1.9 });
  crossMarket.data.matches[0].tipo = 'doppia';
  crossMarket.data.matches[0].selezionati = ['1X2:1', 'Under/Over 2.5:Over 2.5'];
  const restored = validateBackupPayload(crossMarket);
  assert.equal(restored.matches[0].tipo, 'doppia');
  assert.deepEqual(restored.matches[0].selezionati, ['1X2:1', 'Under/Over 2.5:Over 2.5']);
});
test('Backup JSON: rifiuta più di 30 partite caricate', () => {
  const invalid = structuredClone(backupExample);
  invalid.data.matches = Array.from({ length: 31 }, () => ({}));
  assert.throws(() => validateBackupPayload(invalid), /limite è 30/);
});
test('Backup JSON: rifiuta quote mancanti o non valide', () => {
  const invalid = structuredClone(backupExample);
  invalid.data.matches[0].esiti[0].quota = 1;
  assert.throws(() => validateBackupPayload(invalid), /quota o descrizione non valida/);
});
test('Backup JSON: rifiuta una fissa con due selezioni incoerenti', () => {
  const invalid = structuredClone(backupExample);
  invalid.data.matches[0].selezionati = ['1X2:1', '1X2:X'];
  assert.throws(() => validateBackupPayload(invalid), /una fissa può contenere una sola selezione/);
});
test('Backup JSON: rifiuta un formato/versione sconosciuti', () => {
  const invalid = structuredClone(backupExample);
  invalid.format = 'altro';
  assert.throws(() => validateBackupPayload(invalid), /non è un backup/);
});
test('Backup JSON: i valori numerici con tipo malformato restano rifiutati', () => {
  const invalidStake = structuredClone(backupExample);
  invalidStake.data.stake = true;
  assert.throws(() => validateBackupPayload(invalidStake), /puntata non valido/);
  const invalidFilter = structuredClone(backupExample);
  invalidFilter.data.outcomeFilterLimits['Esito finale|1'].max = true;
  assert.throws(() => validateBackupPayload(invalidFilter), /Limite del filtro/);
});

test('Stato locale: usa la validazione del backup e conserva i dati locali validi', () => {
  const stored = structuredClone(backupExample.data);
  delete stored.teamLines; // La lista squadre è salvata in una chiave separata.
  const restored = validateStoredState(stored);
  assert.equal(restored.matches.length, 1);
  assert.equal(restored.matches[0].casa, 'Milan');
  assert.equal(restored.stakeMode, 'total-budget');
  assert.equal(restored.systemBudget, '25.00');
  assert.equal(restored.legacyAdjustedCount, 0);
});
test('Stato locale: rifiuta dati strutturalmente corrotti e selezioni fuori catalogo senza usarli', () => {
  // Una partita con quota non valida viene scartata da sola (prima si perdeva l'intera sessione).
  const invalid = structuredClone(backupExample.data);
  invalid.matches[0].esiti[0].quota = 'non-un-numero';
  const partial = validateStoredState(invalid);
  assert.equal(partial.matches.length, 0);
  assert.equal(partial.discardedMatches, 1);
  assert.equal(partial.manualInput, backupExample.data.manualInput);

  const stale = structuredClone(backupExample.data);
  stale.matches[0].selezionati = ['Mercato inesistente:Esito'];
  const migrated = validateStoredState(stale);
  assert.equal(migrated.legacyAdjustedCount, 1);
  assert.deepEqual(migrated.matches[0].selezionati, []);
  assert.equal(migrated.matches[0].tipo, 'fissa');
});
test('Elenco squadre locale: JSON corrotto o nomi duplicati usano il catalogo base', () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  try {
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: { getItem: () => JSON.stringify(['Inter', 'Inter']) }
    });
    assert.deepEqual(getSerieATeamLines(), SERIE_A_TEAMS);
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: { getItem: () => '{non json' }
    });
    assert.deepEqual(getSerieATeamLines(), SERIE_A_TEAMS);
  } finally {
    if (previous) Object.defineProperty(globalThis, 'localStorage', previous);
    else delete globalThis.localStorage;
  }
});

test('Budget totale: ripartizione su colonne effettive, residuo ai centesimi e nessun superamento', () => {
  const three = calculateStakeAllocation({ mode: 'total-budget', totalBudgetInput: '10.00', columnCount: 3 });
  assert.equal(three.valid, true);
  assert.equal(three.theoreticalPerColumn, 10 / 3);
  assert.equal(three.perColumn, 3.33);
  assert.equal(three.total, 9.99);
  assert.equal(three.residue, 0.01);
  assert.ok(three.total <= three.inputBudget);

  const five = calculateStakeAllocation({ mode: 'total-budget', totalBudgetInput: '10.00', columnCount: 5 });
  assert.equal(five.perColumn, 2);
  assert.equal(five.total, 10);
  assert.equal(five.residue, 0);

  const reduced = calculateStakeAllocation({ mode: 'total-budget', totalBudgetInput: '10.00', columnCount: 2 });
  assert.equal(reduced.perColumn, 5);
  assert.equal(reduced.total, 10);

  const insufficient = calculateStakeAllocation({ mode: 'total-budget', totalBudgetInput: '1.00', columnCount: 101 });
  assert.equal(insufficient.valid, false);
  assert.match(insufficient.error, /puntata minima di 0,01/);

  const noColumns = calculateStakeAllocation({ mode: 'total-budget', totalBudgetInput: '10.00', columnCount: 0 });
  assert.equal(noColumns.valid, true);
  assert.equal(noColumns.total, 0);
  assert.equal(noColumns.residue, 10);
});

test('Puntata per colonna: spesa proporzionale al numero effettivo di colonne', () => {
  const allocation = calculateStakeAllocation({ mode: 'per-column', perColumnInput: '0.10', columnCount: 32 });
  assert.equal(allocation.valid, true);
  assert.equal(allocation.perColumn, 0.1);
  assert.equal(allocation.total, 3.2);
  assert.equal(allocation.residue, 0);
});

test('UI puntata: modalità, budget, anteprima e persistenza sono presenti', () => {
  assert.match(pageHtml, /id="stakeMode"/);
  assert.match(pageHtml, /value="total-budget"/);
  assert.match(pageHtml, /id="systemBudget"/);
  assert.match(pageHtml, /id="stakePreview"/);
  assert.match(pageJs, /stakeMode: \$\('stakeMode'\)\.value/);
  assert.match(pageJs, /systemBudget: \$\('systemBudget'\)\.value/);
  assert.match(pageJs, /const stake = allocation\.perColumn/);
  assert.match(pageJs, /Residuo non utilizzato/);
  assert.match(pageHtml, /budget non viene superato/i);
});

test('Budget totale: importo teorico mostra precisione maggiore dei centesimi', () => {
  assert.equal(formatEuroPrecise(10 / 3), '3,3333 €');
});

const manual = parseManualInput('Milan-Roma; 2.10; 3.20; 3.60');
test('Parser manuale: trattino senza spazi', () => {
  assert.equal(manual.length, 1);
  assert.equal(manual[0].casa, 'Milan');
  assert.equal(manual[0].trasferta, 'Roma');
  assert.deepEqual(manual[0].esiti.map(x => x.outcome), ['1', 'X', '2']);
});
test('Parser manuale: data e ora separate da punto e virgola', () => {
  const [match] = parseManualInput('23/10; 20:45; Milan; Roma; 2.10; 3.20; 3.60');
  assert.ok(match);
  assert.equal(match.data, '23/10');
  assert.equal(match.ora, '20:45');
  assert.equal(match.casa, 'Milan');
  assert.equal(match.trasferta, 'Roma');
  assert.equal(match.esiti.length, 3);
});
test('Parser manuale: soli mercati Over/Under, senza 1X2', () => {
  const [match] = parseManualInput('Milan - Roma O2.5=1.90 U2.5=1.85');
  assert.ok(match);
  assert.deepEqual(match.esiti.map(x => x.label), ['Over 2.5', 'Under 2.5']);
  assert.equal(match.esiti.length, 2);
});
test('Parser manuale: una sola quota non genera esiti inventati', () => {
  assert.equal(parseManualInput('Milan - Roma; 2.10').length, 0);
});
test('Parser manuale: NoGoal non viene interpretato come Goal', () => {
  const [match] = parseManualInput('Milan - Roma NoGoal=2.00');
  assert.ok(match);
  assert.equal(match.esiti[0].label, 'NoGoal');
});
test('Griglia quote: mercati manuali O/U 2.5 restano nelle colonne standard', () => {
  const [match] = parseManualInput('Milan - Roma O2.5=1.90 U2.5=1.85');
  const columns = flattenQuoteSheetColumns(buildQuoteSheetGroups([match]));
  assert.equal(columns.length, 22, 'I mercati standard O/U 2.5 non devono creare colonne duplicate; la colonna H è informativa');
  for (const outcome of match.esiti) assert.equal(columns.filter(column => matchesQuoteColumn(outcome, column)).length, 1);
});

function event(id, outcomes, tipo = 'doppia') {
  return {
    id,
    nome: `Partita ${id}`,
    tipo,
    esiti: outcomes.map(([label, quota]) => ({
      label,
      outcome: label,
      market: 'Under/Over 2.5',
      quota
    }))
  };
}
const ouPair = [['Over 2.5', 1.9], ['Under 2.5', 1.85]];
test('Generatore: 10 doppie producono massimo 1.024 colonne anche con limite richiesto enorme', () => {
  const result = generateSystem(Array.from({ length: 10 }, (_, i) => event(i + 1, ouPair)), 65536);
  assert.equal(MAX_MATCHES, 10);
  assert.equal(MAX_CHOICES_PER_MATCH, 2);
  assert.equal(MAX_SYSTEM_COLUMNS, 1024);
  assert.equal(result.exceeded, false);
  assert.equal(result.colonne.length, 1024);
});
test('Generatore: rifiuta 11 partite', () => {
  const result = generateSystem(Array.from({ length: 11 }, (_, i) => event(i + 1, ouPair)));
  assert.equal(result.exceeded, true);
  assert.equal(result.reason, 'too_many_matches');
});
test('Generatore: rifiuta più di due esiti per una partita variabile', () => {
  const result = generateSystem([event(1, [['1', 2.1], ['X', 3.2], ['2', 3.6]])]);
  assert.equal(result.exceeded, true);
  assert.equal(result.reason, 'too_many_choices');
});
test('Stampa colonne: classifica le escluse dai filtri mantenendo l’ordine integrale', () => {
  const all = [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }];
  const reduced = [all[0], all[2]];
  assert.deepEqual(classifyColumns(all, reduced).map(item => [item.column.id, item.included]), [
    [1, true], [2, false], [3, true], [4, false]
  ]);
  assert.equal(classifyColumns(all, []).filter(item => item.included).length, 0);
});
test('Filtri: max 3 Over su quattro doppie lascia 15 colonne, non 11', () => {
  const events = Array.from({ length: 4 }, (_, i) => event(i + 1, ouPair));
  const columns = generateSystem(events).colonne;
  const overKey = describeOutcome({ label: 'Over 2.5', outcome: 'Over 2.5', market: 'Under/Over 2.5' }).key;
  const filtered = applyFilters(columns, [{ nome: 'Over max 3', test: maxOutcomeCount(overKey, 3) }]);
  assert.equal(columns.length, 16);
  assert.equal(filtered.colonneDopo, 15);
});
test('Filtri: max 3 Over e max 3 Under lasciano 14 colonne', () => {
  const events = Array.from({ length: 4 }, (_, i) => event(i + 1, ouPair));
  const columns = generateSystem(events).colonne;
  const overKey = describeOutcome({ label: 'Over 2.5', outcome: 'Over 2.5', market: 'Under/Over 2.5' }).key;
  const underKey = describeOutcome({ label: 'Under 2.5', outcome: 'Under 2.5', market: 'Under/Over 2.5' }).key;
  const filtered = applyFilters(columns, [
    { nome: 'Over max 3', test: maxOutcomeCount(overKey, 3) },
    { nome: 'Under max 3', test: maxOutcomeCount(underKey, 3) }
  ]);
  assert.equal(filtered.colonneDopo, 14);
});
test('Filtri: gli esiti fissi non sono selezionabili nel catalogo di riduzione', () => {
  const fixed = { id: 'fixed', tipo: 'fissa', selezionati: ['1X2:1'], esiti: [{ market: '1X2', outcome: '1', label: '1', quota: 1.5 }] };
  const double = { id: 'double', tipo: 'doppia', selezionati: ['Under/Over 2.5:Over 2.5', 'Under/Over 2.5:Under 2.5'], esiti: [
    { market: 'Under/Over 2.5', outcome: 'Over 2.5', label: 'Over 2.5', quota: 1.9 },
    { market: 'Under/Over 2.5', outcome: 'Under 2.5', label: 'Under 2.5', quota: 1.85 }
  ] };
  const catalog = collectVariableOutcomes([fixed, double]);
  assert.equal(catalog.length, 2);
  assert.ok(catalog.every(item => !item.label.includes('Esito finale')));
  assert.deepEqual(catalog.map(item => item.label), ['Over 2.5', 'Under 2.5']);
});

function pdfItem(str, y) {
  return { str, transform: [1, 0, 0, 1, 10, y], width: str.length * 4, height: 10 };
}
const odds = ['2,15','3,25','3,40','4,00','3,50','1,62','1,28','1,67','1,30','3,25','1,27','1,80','1,90','1,30','3,10','1,65','2,10','1,20','3,90','1,33','2,85'];
const validSerieARow = `23/10 20.45 36431 1003 Milan Roma ${odds.slice(0, 3).join(' ')} 1 ${odds.slice(3).join(' ')}`;
const invalidSerieARow = `24/10 18.00 36432 1004 Como Sassuolo ${odds.slice(0, 3).join(' ')} 1 ${odds.slice(3, 20).join(' ')}`;
const validOtherCompetitionRow = `25/10 18.00 36433 1005 Milan Roma ${odds.slice(0, 3).join(' ')} 1 ${odds.slice(3).join(' ')}`;
test('Parser PDF: Serie D e Serie B chiudono la sezione Serie A; mostra diagnostica e duplicati', async () => {
  const rows = [
    'ITA Serie A',
    invalidSerieARow,
    validSerieARow,
    validSerieARow,
    'ITA Serie D',
    `26/10 18.00 36434 1006 ${validOtherCompetitionRow.slice(validOtherCompetitionRow.indexOf('Milan Roma'))}`,
    'ITA Serie B',
    `27/10 18.00 36435 1007 ${validOtherCompetitionRow.slice(validOtherCompetitionRow.indexOf('Milan Roma'))}`
  ];
  const items = rows.map((line, i) => pdfItem(line, 900 - i * 20));
  globalThis.pdfjsLib = {
    GlobalWorkerOptions: {},
    getDocument: () => ({ promise: Promise.resolve({
      numPages: 1,
      getPage: async () => ({ getTextContent: async () => ({ items }) })
    }) })
  };
  const matches = await parseSisalPdf(new ArrayBuffer(0));
  assert.equal(matches.length, 1);
  assert.equal(matches[0].competizione, 'Serie A');
  assert.equal(matches[0].casa, 'Milan');
  assert.equal(matches[0].palinsesto, '36431');
  assert.equal(matches[0].avvenimento, '1003');
  assert.equal(matches[0].handicap, '1');
  assert.equal(matches[0].esiti.length, 21);
  const sheetColumns = flattenQuoteSheetColumns(buildQuoteSheetGroups(matches));
  assert.equal(sheetColumns.length, 22, 'La griglia del PDF deve contenere 21 quote selezionabili più il valore Handicap non cliccabile');
  assert.ok(sheetColumns.some(column => column.staticField === 'handicap' && column.label === 'H'));
  for (const outcome of matches[0].esiti) {
    assert.equal(sheetColumns.filter(column => matchesQuoteColumn(outcome, column)).length, 1, `Mappatura univoca per ${outcome.market} / ${outcome.outcome}`);
  }
  assert.equal(matches.diagnostics.seriesAFound, true);
  assert.equal(matches.diagnostics.candidateRows, 3);
  assert.equal(matches.diagnostics.recognizedRows, 2);
  assert.equal(matches.diagnostics.rejects.length, 1);
  assert.equal(matches.diagnostics.rejects[0].reason, 'quote_count');
  assert.equal(matches.diagnostics.rejects[0].foundOdds, 20);
  assert.equal(matches.diagnostics.duplicateRows, 1);
  assert.equal(matches.diagnostics.importedRows, 1);
});
test('Parser PDF: conserva anche l’handicap negativo del foglio quote', async () => {
  const negativeRow = validSerieARow.replace(`${odds[2]} 1 ${odds[3]}`, `${odds[2]} -1 ${odds[3]}`);
  const items = [pdfItem('ITA Serie A', 900), pdfItem(negativeRow, 880)];
  globalThis.pdfjsLib = {
    GlobalWorkerOptions: {},
    getDocument: () => ({ promise: Promise.resolve({
      numPages: 1,
      getPage: async () => ({ getTextContent: async () => ({ items }) })
    }) })
  };
  const matches = await parseSisalPdf(new ArrayBuffer(0));
  assert.equal(matches.length, 1);
  assert.equal(matches[0].handicap, '-1');
  assert.equal(matches[0].esiti.length, 21);
});
test('Parser PDF: ricompone la quota 10,50 se il PDF la posiziona 1,08 pt più in basso', async () => {
  const y = 900;
  const items = [
    pdfItem('ITA Serie A', 1000),
    { ...pdfItem('25/10 12.30', y), transform: [1, 0, 0, 1, 16, y] },
    { ...pdfItem('36431', y), transform: [1, 0, 0, 1, 59, y] },
    { ...pdfItem('999', y), transform: [1, 0, 0, 1, 86, y] },
    { ...pdfItem('Inter', y), transform: [1, 0, 0, 1, 106, y] },
    { ...pdfItem('Fiorentina', y), transform: [1, 0, 0, 1, 179, y] },
    { ...pdfItem('1,33 5,25 8,00', y), transform: [1, 0, 0, 1, 260, y] },
    { ...pdfItem('1', y - 0.36), transform: [1, 0, 0, 1, 306, y - 0.36] },
    { ...pdfItem('1,80 3,75', y), transform: [1, 0, 0, 1, 312, y] },
    { ...pdfItem('3,10', y), transform: [1, 0, 0, 1, 342, y] },
    { ...pdfItem('1,07 3,25 1,13 5,50 1,10 2,90 1,40', y), transform: [1, 0, 0, 1, 357, y] },
    { ...pdfItem('1,72 1,95', y), transform: [1, 0, 0, 1, 462, y] },
    { ...pdfItem('1,65 2,10', y), transform: [1, 0, 0, 1, 492, y] },
    { ...pdfItem('1,01', y), transform: [1, 0, 0, 1, 522, y] },
    { ...pdfItem('10,50', y - 1.08), transform: [1, 0, 0, 1, 536, y - 1.08] },
    { ...pdfItem('1,48', y), transform: [1, 0, 0, 1, 552, y] },
    { ...pdfItem('2,40', y), transform: [1, 0, 0, 1, 567, y] }
  ];
  globalThis.pdfjsLib = {
    GlobalWorkerOptions: {},
    getDocument: () => ({ promise: Promise.resolve({
      numPages: 1,
      getPage: async () => ({ getTextContent: async () => ({ items }) })
    }) })
  };
  const matches = await parseSisalPdf(new ArrayBuffer(0));
  assert.equal(matches.length, 1);
  assert.equal(matches[0].data, '25/10');
  assert.equal(matches[0].ora, '12.30');
  assert.equal(matches[0].casa, 'Inter');
  assert.equal(matches[0].trasferta, 'Fiorentina');
  assert.equal(matches[0].esiti.length, 21);
  assert.equal(matches[0].esiti[18].quota, 10.5);
  assert.equal(matches.diagnostics.rejects.length, 0);
});

test('Parser PDF: gestisce esplicitamente PDF protetti da password', async () => {
  globalThis.pdfjsLib = {
    GlobalWorkerOptions: {},
    PasswordResponses: { NEED_PASSWORD: 1, INCORRECT_PASSWORD: 2 },
    getDocument: () => ({ promise: Promise.reject(Object.assign(new Error('password required'), { name: 'PasswordException', code: 1 })) })
  };
  await assert.rejects(() => parseSisalPdf(new ArrayBuffer(0)), /PDF è protetto da password/);
});
test('Parser PDF: non trasforma gli altri errori in errori di password', async () => {
  globalThis.pdfjsLib = {
    GlobalWorkerOptions: {},
    getDocument: () => ({ promise: Promise.reject(new Error('network/storage failure')) })
  };
  await assert.rejects(() => parseSisalPdf(new ArrayBuffer(0)), /network\/storage failure/);
});

test('Stampa: il modo viene ripulito dopo afterprint o tramite fallback', () => {
  const previousDocument = globalThis.document;
  const previousWindow = globalThis.window;
  const dataset = {};
  const pageRule = { textContent: '' };
  const handlers = new Map();
  const timers = [];
  globalThis.document = { body: { dataset }, getElementById: id => id === 'runtimePrintPageRule' ? pageRule : null };
  globalThis.window = {
    addEventListener: (name, handler) => handlers.set(name, handler),
    removeEventListener: name => handlers.delete(name),
    setTimeout: handler => { timers.push(handler); return timers.length; },
    clearTimeout: () => {},
    print: () => {}
  };
  try {
    printWithMode('table');
    assert.equal(dataset.printMode, 'table');
    assert.match(pageRule.textContent, /A4 landscape/);
    handlers.get('afterprint')();
    assert.equal(dataset.printMode, undefined);
    assert.equal(pageRule.textContent, '');
    printWithMode('integral');
    assert.equal(dataset.printMode, 'integral');
    assert.match(pageRule.textContent, /A4 portrait/);
    timers.at(-1)();
    assert.equal(dataset.printMode, undefined);
    assert.equal(pageRule.textContent, '');
  } finally {
    if (previousDocument === undefined) delete globalThis.document; else globalThis.document = previousDocument;
    if (previousWindow === undefined) delete globalThis.window; else globalThis.window = previousWindow;
  }
});

// ---------- Test aggiunti nella revisione v3 ----------
test('Probabilità senza aggio: 1X2 e Under/Over sommano a 1; un mercato incompleto non viene corretto', () => {
  const match = { esiti: [
    { market: '1X2', outcome: '1', label: '1', quota: 2.0 }, { market: '1X2', outcome: 'X', label: 'X', quota: 3.5 }, { market: '1X2', outcome: '2', label: '2', quota: 3.8 },
    { market: 'Over 2.5', outcome: 'Over 2.5', label: 'Over 2.5', quota: 1.9 }, { market: 'Under 2.5', outcome: 'Under 2.5', label: 'Under 2.5', quota: 1.9 },
    { market: 'Goal', outcome: 'Goal', label: 'Goal', quota: 1.75 }
  ] };
  const fair = fairProbabilities(match);
  const sum1x2 = ['1', 'X', '2'].reduce((t, o) => t + fair.get(`1X2:${o}`), 0);
  assert.ok(Math.abs(sum1x2 - 1) < 1e-9);
  assert.ok(fair.get('1X2:1') < 1 / 2.0, 'senza aggio la probabilità scende sotto 1/quota');
  assert.ok(Math.abs(fair.get('Over 2.5:Over 2.5') - 0.5) < 1e-9);
  assert.equal(fair.has('Goal:Goal'), false, 'Goal senza NoGoal: mercato incompleto');
});
test('Probabilità senza aggio: la Doppia Chance somma a 2 ed esclude la mutua esclusività', () => {
  const dc = { esiti: [
    { market: 'Doppia Chance', outcome: '1X', label: '1X', quota: 1.30 }, { market: 'Doppia Chance', outcome: 'X2', label: 'X2', quota: 1.60 }, { market: 'Doppia Chance', outcome: '12', label: '12', quota: 1.35 }
  ] };
  const fair = fairProbabilities(dc);
  const total = [...fair.values()].reduce((t, v) => t + v, 0);
  assert.ok(Math.abs(total - 2) < 1e-9);
  assert.equal(isExclusiveSystem([{ tipo: 'doppia', esiti: [dc.esiti[0], dc.esiti[1]] }]), false);
  assert.equal(isExclusiveSystem([{ tipo: 'doppia', esiti: [{ market: '1X2', outcome: '1' }, { market: 'Under/Over 2.5', outcome: 'Over 2.5' }] }]), false, 'quote selezionate su mercati diversi possono vincere contemporaneamente');
  assert.equal(isExclusiveSystem([{ tipo: 'doppia', esiti: [{ market: '1X2', outcome: '1' }, { market: '1X2', outcome: 'X' }] }, { tipo: 'fissa', esiti: [dc.esiti[0]] }]), true);
});
test('Probabilità senza aggio: quote non valide o esiti duplicati non producono stime numeriche', () => {
  const invalidOdds = fairProbabilities({ esiti: [
    { market: '1X2', outcome: '1', quota: 1 },
    { market: '1X2', outcome: 'X', quota: 3.1 },
    { market: '1X2', outcome: '2', quota: 4.2 }
  ] });
  assert.equal(invalidOdds.size, 0);
  const duplicates = fairProbabilities({ esiti: [
    { market: '1X2', outcome: '1', quota: 2.1 },
    { market: '1X2', outcome: '1', quota: 3.1 },
    { market: '1X2', outcome: '2', quota: 4.2 }
  ] });
  assert.equal(duplicates.size, 0);
});

test('Generatore: la probabilità di colonna è il prodotto delle probabilità delle gambe', () => {
  const ev = [
    { id: 'a', nome: 'A', tipo: 'doppia', esiti: [{ label: '1', outcome: '1', market: '1X2', quota: 2, prob: 0.4 }, { label: 'X', outcome: 'X', market: '1X2', quota: 3, prob: 0.3 }] },
    { id: 'b', nome: 'B', tipo: 'fissa', esiti: [{ label: '2', outcome: '2', market: '1X2', quota: 4, prob: 0.2 }] }
  ];
  const { colonne } = generateSystem(ev);
  assert.equal(colonne.length, 2);
  assert.ok(Math.abs(colonne[0].prob - 0.08) < 1e-12);
  assert.ok(Math.abs(colonne[1].prob - 0.06) < 1e-12);
});
test('Generatore: doppia tra mercati diversi produce colonne alternative senza combinare quote nello stesso evento', () => {
  const event = { id: 'cross-market', nome: 'Torino - Monza', tipo: 'doppia', esiti: [
    { label: '1', outcome: '1', market: '1X2', quota: 2.1, prob: 0.45 },
    { label: 'Over 2.5', outcome: 'Over 2.5', market: 'Under/Over 2.5', quota: 1.9, prob: 0.52 }
  ] };
  const result = generateSystem([event]);
  assert.equal(result.exceeded, false);
  assert.equal(result.colonne.length, 2);
  assert.deepEqual(result.colonne.map(column => column.esiti[0].label), ['1', 'Over 2.5']);
  assert.ok(result.colonne.every(column => column.esiti.length === 1));
  assert.equal(isExclusiveSystem([event]), false);
});

test('CSV: esporta modalità di puntata e riepilogo del budget effettivo', () => {
  const allocation = calculateStakeAllocation({ mode: 'total-budget', totalBudgetInput: '10.00', columnCount: 3 });
  const csv = buildCsv([{ id: 1, quotaTotale: 2, prob: 0.5, ritornoStimato: 6.66, profittoStimato: 3.33, esiti: [] }], allocation);
  assert.match(csv, /Budget totale impostato \(€\).*10,00/);
  assert.match(csv, /Importo effettivo per colonna \(€\).*3,33/);
  assert.match(csv, /Spesa effettiva \(€\).*9,99/);
  assert.match(csv, /Residuo non utilizzato \(€\).*0,01/);
});

test('CSV: testo che sembra una formula viene neutralizzato per fogli elettronici', () => {
  const csv = buildCsv([{ id: 1, quotaTotale: 2, prob: 0.5, esiti: [
    { partita: '=HYPERLINK(\"https://example.invalid\")', label: '1', quota: 2 },
    { partita: '+SUM(A1:A2)', label: 'X', quota: 3 }
  ] }]);
  assert.match(csv, /\"'=HYPERLINK/);
  assert.match(csv, /\"'\+SUM/);
});

test('CSV: numeri con virgola decimale e senza virgolette (leggibili da Excel in italiano)', () => {
  const csv = buildCsv([{ id: 3, quotaTotale: 12.345, prob: 0.0712, bonusPercentuale: 4, ritornoStimato: 1.2345, profittoStimato: 1.1345,
    esiti: [{ partita: 'Milan - Roma', label: '1', quota: 2.1 }] }]);
  const data = csv.split('\r\n')[4].split(';');
  assert.equal(data[0], '3');
  assert.equal(data[1], '"Milan - Roma: 1 (quota 2,1)"');
  assert.equal(data[11], '12,35');
  assert.equal(data[13], '7,12');
  assert.ok(data.slice(11).every(cell => !cell.includes('"') && !cell.includes('.')), 'nessun numero tra virgolette o con il punto');
});
test('Foglio quote: il ridisegno conserva scroll e focus; puntata con debounce; stampa costruita alla stampa', () => {
  assert.match(pageJs, /scroller\.scrollLeft = keepScroll\.left/);
  assert.match(pageJs, /again\?\.focus\(\{ preventScroll: true \}\)/);
  assert.match(pageJs, /function scheduleStakeUpdate\(\)/);
  assert.match(pageJs, /stakeRenderTimeout = setTimeout\(\(\) => \{/);
  assert.match(pageJs, /\$\('printTable'\)\.addEventListener\('click', \(\) => \{/);
  assert.match(pageJs, /refreshGeneratedColumnsNow\(\) \|\| !state\.rawColumns\.length/);
  assert.match(readFileSync(new URL('../js/exporter.js', import.meta.url), 'utf8'), /void document\.documentElement\?\.offsetHeight/);
  assert.match(pageJs, /buildPrintTable\(\);\s*if \(!\$\('printTableWrap'\)\.children\.length\) return;\s*stampaTabella\(\);/);
});
test('Limiti: si possono caricare più partite di quelle selezionabili, ma non più di 10 selezionate', () => {
  assert.ok(MAX_LOADED_MATCHES >= MAX_MATCHES);
  assert.match(pageJs, /activeCount >= MAX_MATCHES/);
  assert.match(pageJs, /matches\.slice\(0, MAX_LOADED_MATCHES\)/);
});
test('Parser PDF: Venezia-Inter viene importata se manca una quota e le quote successive restano nella colonna corretta', async () => {
  const values = [
    7.50, 5.25, 1.33, 3.10, 3.75, 1.80, 3.20, 1.07, 1.14,
    6.50, 1.07, 3.10, 1.33, 1.85, 1.80, 1.52, 2.40, 1.40, 2.60,
    null, 11.00
  ];
  const rowY = 900;
  const positioned = (str, x, y = rowY, width = String(str).length * 3.2) => ({
    str, transform: [1, 0, 0, 1, x, y], width, height: 10
  });
  const quoteX = index => index < 3 ? 260.5 + index * 15 : 312.2 + (index - 3) * 15;
  const items = [
    pdfItem('ITA Serie A', 960),
    positioned('28/10', 16.3), positioned('18.30', 39.2), positioned('36441', 59.6),
    positioned('1446', 84.5), positioned('Venezia', 106.6), positioned('Inter', 179.3),
    positioned('-1', 305.4),
    ...values.flatMap((value, index) => value == null ? [] : [positioned(value.toFixed(2).replace('.', ','), quoteX(index))])
  ];
  globalThis.pdfjsLib = {
    GlobalWorkerOptions: {},
    getDocument: () => ({ promise: Promise.resolve({ numPages: 1, getPage: async () => ({ getTextContent: async () => ({ items }) }) }) })
  };
  const matches = await parseSisalPdf(new ArrayBuffer(0));
  assert.equal(matches.length, 1);
  assert.equal(matches[0].casa, 'Venezia');
  assert.equal(matches[0].trasferta, 'Inter');
  assert.equal(matches[0].esiti.length, 20);
  assert.equal(matches[0].esiti.find(item => item.market === 'Segna Goal Ospite' && item.outcome === 'NO Ospite')?.quota, 11);
  assert.equal(matches[0].esiti.some(item => item.market === 'Segna Goal Ospite' && item.outcome === 'SI Ospite'), false);
  assert.deepEqual(matches.diagnostics.partialRows[0].missing, ['SI Ospite']);
  assert.equal(matches.diagnostics.rejects.length, 0);
});

test('Parser PDF: un bollettino con 12 partite le restituisce tutte (nessun taglio nel parser)', async () => {
  const teams = ['Atalanta','Bologna','Cagliari','Como','Fiorentina','Frosinone','Genoa','Inter','Juventus','Lazio','Lecce','Milan','Monza','Napoli','Parma','Roma','Sassuolo','Torino','Udinese','Venezia'];
  const rows = ['ITA Serie A'];
  for (let i = 0; i < 12; i++) rows.push(`${23 + (i >= 10 ? 1 : 0)}/10 20.45 ${36000 + i} ${1000 + i} ${teams[(2 * i) % 20]} ${teams[(2 * i + 1) % 20]} ${odds.slice(0, 3).join(' ')} 1 ${odds.slice(3).join(' ')}`);
  const items = rows.map((line, i) => pdfItem(line, 900 - i * 20));
  globalThis.pdfjsLib = { GlobalWorkerOptions: {}, getDocument: () => ({ promise: Promise.resolve({ numPages: 1, getPage: async () => ({ getTextContent: async () => ({ items }) }) }) }) };
  const matches = await parseSisalPdf(new ArrayBuffer(0));
  assert.equal(matches.length, 12);
});
test('Release v23: versione ?v= unica in tutti i file e PDF.js incluso in vendor', () => {
  const versions = new Set();
  const files = ['../index.html', '../app.js', '../manifest.webmanifest', ...readdirSync(new URL('../js/', import.meta.url)).map(f => `../js/${f}`)];
  for (const file of files) for (const m of readFileSync(new URL(file, import.meta.url), 'utf8').matchAll(/\?v=([\w-]+)/g)) versions.add(m[1]);
  assert.equal(versions.size, 1, `Versioni diverse trovate: ${[...versions].join(', ')}`);
  const sw = readFileSync(new URL('../sw.js', import.meta.url), 'utf8');
  assert.match(sw, /sb-v27-20261031/);
  assert.ok(existsSync(new URL('../vendor/pdfjs/pdf.min.js', import.meta.url)));
  assert.ok(existsSync(new URL('../vendor/pdfjs/pdf.worker.min.js', import.meta.url)));
  assert.match(pageJs, /new URL\('\.\/vendor\/pdfjs', document\.baseURI\)/);
});

// ---------- Test aggiunti nella revisione v14 ----------
test('Service worker: rete prima con timeout, rivalidazione no-cache e aggiornamento in background', () => {
  const sw = readFileSync(new URL('../sw.js', import.meta.url), 'utf8');
  assert.match(sw, /NETWORK_TIMEOUT_MS = 3500/);
  assert.match(sw, /cache: 'no-cache'/);
  assert.match(sw, /Promise\.race\(\[settled, timeout\]\)/);
  assert.match(sw, /event\.waitUntil\(settled\)/);
  assert.match(sw, /js\/cover-bet\.js/);
  assert.match(pageJs, /controllerchange/);
});
test('Esportazione e stampa: nessuna rigenerazione se selezioni, filtri e puntata sono già allineati', () => {
  assert.match(pageJs, /state\.columnsSig === columnsSignature\(\)/);
  assert.match(pageJs, /state\.renderSig !== stakeSignature\(\)\) renderTable\(\)/);
  assert.match(pageJs, /state\.renderSig = stakeSignature\(\);\n\s+const cols = state\.finalColumns;/);
});
test('Tabella a video paginata (100 righe) con "Mostra altre/tutte"; esportazioni e stampe restano complete', () => {
  assert.match(pageJs, /TABLE_PAGE_SIZE = 100/);
  assert.match(pageJs, /cols\.slice\(0, visibleCount\)/);
  assert.match(pageJs, /id=\\?"showMoreRows/);
  assert.match(pageJs, /CSV, testo e stampe contengono tutte le colonne/);
});
test('Stampa colonne: le quote fisse hanno riquadro nero e grassetto anche sulle righe grigie', () => {
  assert.match(pageJs, /class=\\?"print-fixed/);
  const css = readFileSync(new URL('../style.css', import.meta.url), 'utf8');
  assert.match(css, /td\.print-fixed\{box-shadow:inset 0 0 0 \.45mm #000!important/);
});

// ---------- Test aggiunti nella revisione v16 ----------
test('Stato locale tollerante: un campo anomalo non cancella la sessione', () => {
  const base = structuredClone(backupExample.data); delete base.teamLines;
  base.manualInput = 'Milan - Roma; 2.10; 3.20; 3.60';
  base.matches.push(structuredClone(base.matches[0]), structuredClone(base.matches[0]));
  base.matches[1].esiti = [];                                   // partita senza quote: da scartare
  base.stake = '-1'; base.systemBudget = '0';                   // numeri fuori range: tornano al predefinito
  base.outcomeFilterLimits = { 'esito|1': { min: '', max: '99' }, 'esito|x': { min: '2', max: '' } };
  const r = validateStoredState(base);
  assert.equal(r.matches.length, 2);
  assert.equal(r.discardedMatches, 1);
  assert.equal(r.stake, '0.10');
  assert.equal(r.systemBudget, '10.00');
  assert.equal(r.manualInput, 'Milan - Roma; 2.10; 3.20; 3.60');
  assert.equal(r.outcomeFilterLimits['esito|1'].max, '');
  assert.equal(r.outcomeFilterLimits['esito|x'].min, '2');
  assert.deepEqual(r.sanitizedFields.sort(), ['budget totale', 'filtro', 'puntata per colonna']);
  assert.throws(() => validateStoredState([]), /oggetto valido/);
  assert.throws(() => validateStoredState('x'), /oggetto valido/);
});
test('Stato locale: più di 30 partite o elementi non oggetto non rompono il ripristino', () => {
  const base = structuredClone(backupExample.data); delete base.teamLines;
  base.matches = [null, 'x', 5, ...Array.from({ length: 30 }, () => structuredClone(backupExample.data.matches[0]))];
  const r = validateStoredState(base);
  assert.ok(r.matches.length <= 30);
  assert.ok(r.discardedMatches >= 3);
});
test('Stato locale: valori numerici di tipo errato e filtri incoerenti vengono neutralizzati', () => {
  const base = structuredClone(backupExample.data); delete base.teamLines;
  base.stake = true; base.systemBudget = { amount: 200 };
  base.matches = 'elenco corrotto';
  base.outcomeFilterLimits = {
    'filtro|reverse': { min: '4', max: '2' },
    'filtro|bad-object': [],
    'filtro|valid': { min: '1', max: '3' }
  };
  const r = validateStoredState(base);
  assert.equal(r.stake, '0.10');
  assert.equal(r.systemBudget, '10.00');
  assert.equal(r.matches.length, 0);
  assert.equal(r.outcomeFilterLimits['filtro|reverse'].min, '');
  assert.equal(r.outcomeFilterLimits['filtro|reverse'].max, '');
  assert.equal(r.outcomeFilterLimits['filtro|valid'].min, '1');
  assert.ok(r.sanitizedFields.includes('puntata per colonna'));
  assert.ok(r.sanitizedFields.includes('budget totale'));
  assert.ok(r.sanitizedFields.includes('elenco partite'));
  assert.ok(r.sanitizedFields.includes('filtro'));
});
test('Ripristino: la sessione locale corretta non viene salvata sopra l’originale all’apertura', () => {
  const source = readFileSync(new URL('../app.js', import.meta.url), 'utf8');
  const start = source.indexOf('function restoreState()');
  const end = source.indexOf('function getBackupData()', start);
  assert.ok(start >= 0 && end > start);
  const restore = source.slice(start, end);
  assert.doesNotMatch(restore, /saveState\(\)/);
  assert.match(restore, /la prossima modifica lo aggiornerà/);
});

// ---------- Test aggiunti nella revisione v24 (copertura) ----------
const coverOutcome = (market, outcome, quota) => ({ market, outcome, label: outcome, quota });
const coverMatch = (id, data, ora, esiti, selezionati) => ({ id, data, ora, casa: id, trasferta: 'X', esiti, selezionati });
const coverKey = item => `${item.market}:${item.outcome}`;
function coverScenario(lastSelection) {
  const quotes = (a, b, c) => [coverOutcome('Esito Finale', '1', a), coverOutcome('Esito Finale', 'X', b), coverOutcome('Esito Finale', '2', c),
    coverOutcome('Doppia Chance', '1X', +(0.95 / (1 / a + 1 / b)).toFixed(2)), coverOutcome('Doppia Chance', 'X2', +(0.95 / (1 / b + 1 / c)).toFixed(2)), coverOutcome('Doppia Chance', '12', +(0.95 / (1 / a + 1 / c)).toFixed(2))];
  const A = coverMatch('A', '23/10', '18.00', quotes(1.8, 3.4, 4.5), ['Esito Finale:1']);
  const B = coverMatch('B', '23/10', '20.45', quotes(2.1, 3.3, 3.5), ['Esito Finale:1', 'Esito Finale:X']);
  const C = coverMatch('C', '24/10', '20.45', quotes(2.4, 3.2, 3.0), lastSelection);
  A.esitoEffettivo = 'Esito Finale:1'; B.esitoEffettivo = 'Esito Finale:1';
  const events = [A, B, C].map(m => ({ id: m.id, nome: m.id, tipo: m.selezionati.length > 1 ? 'doppia' : 'fissa',
    esiti: m.selezionati.map(k => ({ ...m.esiti.find(x => coverKey(x) === k), partita: m.id, eventId: m.id })) }));
  const { colonne } = generateSystem(events);
  return { A, B, C, colonne, stake: 5, spend: 5 * colonne.length };
}
test('Copertura base 1X2: suggerisce soltanto il complemento dell’intera selezione', () => {
  const match = { esiti: [
    coverOutcome('Esito Finale', '1', 1.45), coverOutcome('Esito Finale', 'X', 4.50), coverOutcome('Esito Finale', '2', 6.50),
    coverOutcome('Doppia Chance', '1X', 1.20), coverOutcome('Doppia Chance', 'X2', 2.80), coverOutcome('Doppia Chance', '12', 1.35)
  ] };
  const pick = outcome => match.esiti.find(item => item.market === 'Esito Finale' && item.outcome === outcome);
  const only = selections => findExactCoverCandidatesForSelections(match, selections).map(item => item.outcome.outcome);
  assert.deepEqual(only([pick('2')]), ['1X'], 'base 2 -> copertura 1X');
  assert.deepEqual(only([pick('X')]), ['12'], 'base X -> copertura 12');
  assert.deepEqual(only([pick('1')]), ['X2'], 'base 1 -> copertura X2');
  assert.deepEqual(only([pick('1'), pick('X')]), ['2'], 'base 1 + X -> soltanto 2, non 1X/X2/12');
  const base1x = match.esiti.find(item => item.market === 'Doppia Chance' && item.outcome === '1X');
  const baseX2 = match.esiti.find(item => item.market === 'Doppia Chance' && item.outcome === 'X2');
  const base12 = match.esiti.find(item => item.market === 'Doppia Chance' && item.outcome === '12');
  assert.deepEqual(only([base1x]), ['2'], 'base Doppia Chance 1X -> soltanto 2');
  assert.deepEqual(only([baseX2]), ['1'], 'base Doppia Chance X2 -> soltanto 1');
  assert.deepEqual(only([base12]), ['X'], 'base Doppia Chance 12 -> soltanto X');
  assert.equal(findExactCoverCandidatesForSelections(match, [pick('1'), coverOutcome('Under/Over 2.5', 'O 2.5', 1.9)]), null,
    'mercati diversi mantengono la modalità separata per ramo');
});

test('Copertura calcolata: una Doppia Chance 1X come base viene coperta soltanto dal 2', () => {
  const last = coverMatch('last', '24/10', '20.45', [
    coverOutcome('Esito Finale', '1', 1.45), coverOutcome('Esito Finale', 'X', 4.50), coverOutcome('Esito Finale', '2', 6.50),
    coverOutcome('Doppia Chance', '1X', 1.10), coverOutcome('Doppia Chance', 'X2', 2.80), coverOutcome('Doppia Chance', '12', 1.35)
  ], ['Doppia Chance:1X']);
  const columns = [{ quotaTotale: 12, esiti: [{ eventId: 'last', market: 'Doppia Chance', outcome: '1X' }] }];
  const result = calculateBestSingleCover({ columns, previousMatches: [], lastMatch: last, perColumnStake: 1, totalSpend: 1, bonusForColumn: () => 0 });
  assert.equal(result.best.outcome.outcome, '2');
  assert.deepEqual(result.best.covers, ['2']);
  assert.equal(result.alternatives.length, 0);
});

test('Copertura: con quote scritte a mano (Over/Under, Goal/NoGoal) si trovano le controparti', () => {
  const [match] = parseManualInput('Milan - Roma; 2.10; 3.20; 3.60; O2.5=1.90; U2.5=1.85; Goal=1.75; NoGoal=2.00');
  const find = (market, outcome) => match.esiti.find(e => e.market === market && e.outcome === outcome);
  assert.equal(findExactCoverCandidates(match, find('Over 2.5', 'Over 2.5'))[0].outcome.outcome, 'Under 2.5');
  assert.equal(findExactCoverCandidates(match, find('Under 2.5', 'Under 2.5'))[0].outcome.outcome, 'Over 2.5');
  assert.equal(findExactCoverCandidates(match, find('Goal', 'Goal'))[0].outcome.outcome, 'NoGoal');
  assert.equal(findExactCoverCandidates(match, find('NoGoal', 'NoGoal'))[0].outcome.outcome, 'Goal');
  assert.equal(describeCoverOutcome({ market: 'Handicap', outcome: 'H1', label: 'H1' }), null);
});
test('Copertura singola: con un solo esito nell’ultima partita il netto è uguale in ogni scenario', () => {
  const { A, B, C, colonne, stake, spend } = coverScenario(['Esito Finale:1']);
  const result = calculateBestSingleCover({ columns: colonne, previousMatches: [A, B], lastMatch: C, perColumnStake: stake, totalSpend: spend, bonusForColumn: () => 0 });
  assert.equal(result.best.outcome.outcome, 'X2');
  const nets = Object.values(result.best.nets);
  assert.ok(Math.max(...nets) - Math.min(...nets) < 0.02, 'netti equalizzati');
  assert.ok(result.best.worst > result.worstWithout);
});
test('Copertura singola: con due esiti nell’ultima partita copre l’esito rimanente ed è ottima (verifica a forza bruta)', () => {
  const { A, B, C, colonne, stake, spend } = coverScenario(['Esito Finale:1', 'Esito Finale:X']);
  const result = calculateBestSingleCover({ columns: colonne, previousMatches: [A, B], lastMatch: C, perColumnStake: stake, totalSpend: spend, bonusForColumn: () => 0 });
  assert.equal(result.best.outcome.outcome, '2');
  // Con base 1 + X la sola copertura ammessa è il risultato 2: non vanno
  // rimesse in gioco doppie chance (X2/1X) che includono esiti già protetti.
  assert.equal(result.best.outcome.outcome, '2');
  assert.deepEqual(result.best.covers, ['2']);
  assert.equal(result.alternatives.length, 0);
  const base = { '1': result.systemReturn['1'], 'X': result.systemReturn.x, '2': result.systemReturn['2'] };
  const expected = C.esiti.find(item => item.market === 'Esito Finale' && item.outcome === '2');
  let brute = -Infinity;
  for (let c = 0; c <= 200; c += 0.01) {
    const worst = Math.min(...['1', 'X', '2'].map(r => base[r] - spend - c + (r === '2' ? c * expected.quota : 0)));
    brute = Math.max(brute, worst);
  }
  assert.ok(Math.abs(result.best.worst - brute) < 0.011, `proposta ${result.best.worst} diversa dall'ottimo complementare ${brute}`);
});
test('Copertura singola: sceglie il centesimo che massimizza davvero il caso peggiore', () => {
  const esiti = [
    coverOutcome('Esito Finale', '1', 2.62),
    coverOutcome('Esito Finale', 'X', 4.59),
    coverOutcome('Esito Finale', '2', 2.47),
    coverOutcome('Doppia Chance', '1X', 2.91),
    coverOutcome('Doppia Chance', 'X2', 5.75),
    coverOutcome('Doppia Chance', '12', 1.31)
  ];
  const lastMatch = coverMatch('C', '24/10', '20.45', esiti, ['Esito Finale:1', 'Esito Finale:X']);
  const perColumnStake = 4.49;
  const totalSpend = 17.96;
  const columns = [
    { quotaTotale: 133.5426576 / perColumnStake, esiti: [{ eventId: 'C', market: 'Esito Finale', outcome: '1' }] },
    { quotaTotale: 233.9545032 / perColumnStake, esiti: [{ eventId: 'C', market: 'Esito Finale', outcome: 'X' }] }
  ];
  const result = calculateBestSingleCover({ columns, previousMatches: [], lastMatch, perColumnStake, totalSpend, bonusForColumn: () => 0 });
  assert.equal(result.best.outcome.outcome, '2', 'la base 1 + X ammette soltanto la copertura sul 2');
  assert.equal(result.best.stake, 54.07, 'sceglie il centesimo superiore quando migliora il caso peggiore');
  assert.ok(Math.abs(result.best.stake * 100 - Math.round(result.best.stake * 100)) < 1e-9, 'puntata al centesimo');
  const roundedDown = result.best.stake - 0.01;
  const coverOdds = result.best.outcome.quota;
  const downWorst = Math.min(...result.results.map(r => result.without[r] - roundedDown + (result.best.covers.includes(r) ? roundedDown * coverOdds : 0)));
  assert.ok(result.best.worst > downWorst, 'il centesimo scelto migliora il caso peggiore rispetto al centesimo inferiore');
});

test('Copertura singola: null con mercati diversi nell’ultima partita o risultati non registrati; nessun consiglio se non migliora', () => {
  const scenario = coverScenario(['Esito Finale:1']);
  const mixed = structuredClone(scenario.C); mixed.esiti.push(coverOutcome('Under/Over 2.5', 'O 2.5', 1.9)); mixed.selezionati = ['Esito Finale:1', 'Under/Over 2.5:O 2.5'];
  const args = { columns: scenario.colonne, previousMatches: [scenario.A, scenario.B], perColumnStake: scenario.stake, totalSpend: scenario.spend, bonusForColumn: () => 0 };
  assert.equal(calculateBestSingleCover({ ...args, lastMatch: mixed }), null);
  const unknown = structuredClone(scenario.A); delete unknown.esitoEffettivo;
  assert.equal(calculateBestSingleCover({ ...args, previousMatches: [unknown, scenario.B], lastMatch: scenario.C }), null);
  const rich = calculateBestSingleCover({ ...args, totalSpend: 0.01, lastMatch: scenario.C });
  assert.ok(rich === null || rich.best === null || rich.best.worst >= rich.worstWithout, 'mai un consiglio che peggiora il caso peggiore');
});
test('UI V24: pannello mostra la copertura consigliata con netti per scenario e schede per ramo ripiegate', () => {
  assert.match(pageJs, /calculateBestSingleCover\(\{/);
  assert.match(pageJs, /COPERTURA CONSIGLIATA/);
  assert.match(pageJs, /Coperture per singolo ramo \(mercati diversi\)/);
  assert.match(pageJs, /findExactCoverCandidatesForSelections/);
  assert.match(pageJs, /const branchMode = collectiveCandidates === null/);
  assert.match(pageJs, /Risultato netto dopo la spesa del sistema/);
});

test('V27 UI: numero versione in Info, selettore PDF marcato e pulsanti omogenei', () => {
  assert.match(pageHtml, /VERSIONE APP<\/span><strong>27<\/strong>/);
  assert.match(pageHtml, /La copertura dell’ultima partita è il complemento esatto/);
  assert.match(pageHtml, /pdf-file-picker/);
  assert.match(pageHtml, /id="generate" class="button primary action-generate"/);
  assert.match(pageHtml, /id="clearQuotes" class="button secondary action-clear"/);
  assert.match(pageHtml, /id="reset" class="button danger action-reset"/);
  const css = readFileSync(new URL('../style.css', import.meta.url), 'utf8');
  assert.match(css, /\.odds-cell\.odds-cover-suggested[\s\S]*?background:#e3d8ff!important/);
  assert.match(css, /#pdfFile::file-selector-button[\s\S]*?background:#205fe0/);
  assert.match(css, /\.generate-controls>\.button[\s\S]*?height:50px;min-height:50px/);
});

for (const { name, fn } of queue) {
  try { await fn(); console.log(`✓ ${name}`); }
  catch (error) { console.error(`✗ ${name}`); throw error; }
}
console.log('\nTutti i test di regressione sono passati.');
