import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { parseManualInput, parseSisalPdf } from '../js/parser.js';
import { generateSystem, MAX_MATCHES, MAX_CHOICES_PER_MATCH, MAX_SYSTEM_COLUMNS } from '../js/generator.js';
import { applyFilters, classifyColumns, describeOutcome, maxOutcomeCount, collectVariableOutcomes } from '../js/filters.js';
import { printWithMode, buildCsv, PRINT_COLUMNS_PER_PAGE, splitPrintRows } from '../js/exporter.js';
import { fairProbabilities, isExclusiveSystem } from '../js/probability.js';
import { summarizeColumnRange } from '../js/calculator.js';
import { MAX_LOADED_MATCHES } from '../js/config.js';
import { createBackupPayload, validateBackupPayload, BACKUP_FORMAT } from '../js/backup.js';
import { normalizeMatchSelection, normalizeMatchList, toggleMatchOutcome, selectionMarketKey } from '../js/selection.js';
import { buildQuoteSheetGroups, flattenQuoteSheetColumns, matchesQuoteColumn } from '../js/quote-sheet.js';

// I test async venivano lanciati senza await: un fallimento compariva dopo il "✓" (o mai).
// Ora si accodano e si eseguono in sequenza, attendendo ciascuno.
const queue = [];
function test(name, fn) { queue.push({ name, fn }); }


const pageHtml = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const pageJs = readFileSync(new URL('../app.js', import.meta.url), 'utf8');

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
  assert.match(pageJs, /integralRangeMarkup\('Sistema integrale', fullRange\)/);
  assert.match(pageJs, /integralRangeMarkup\('Sistema ridotto', reducedRange, true\)/);
  assert.match(pageJs, /Quota minima/);
  assert.match(pageJs, /Quota massima/);
  assert.match(pageJs, /Vincita netta minima/);
  assert.match(pageJs, /Vincita netta massima/);
  assert.match(pageJs, /Nr colonne massime giocabili/);
  assert.match(pageJs, /Colonne Giocate \(se ridotto\)/);
  assert.match(pageJs, /Quota per colonna/);
  assert.match(pageJs, /Totale Spesa/);
  assert.match(pageJs, /formatEuro\(state\.finalColumns\.length \* stake\)/);
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
test('Selezione quote: un esito è fissa, due dello stesso mercato sono doppia', () => {
  const match = { id: 'm', casa: 'Torino', trasferta: 'Monza', esiti: [
    { market: '1X2', outcome: '1', label: '1', quota: 2.1 },
    { market: '1X2', outcome: 'X', label: 'X', quota: 3.2 },
    { market: 'Under/Over 2.5', outcome: 'Over 2.5', label: 'Over 2.5', quota: 1.9 }
  ], selezionati: [] };
  assert.equal(toggleMatchOutcome(match, '1X2:1').kind, 'fissa');
  assert.deepEqual(match.selezionati, ['1X2:1']);
  assert.equal(toggleMatchOutcome(match, '1X2:X').kind, 'doppia');
  assert.deepEqual(match.selezionati, ['1X2:1', '1X2:X']);
  const switchMarket = toggleMatchOutcome(match, 'Under/Over 2.5:Over 2.5');
  assert.equal(switchMarket.kind, 'fissa');
  assert.deepEqual(match.selezionati, ['Under/Over 2.5:Over 2.5']);
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

test('Migrazione stato: avvisa quante vecchie doppie tra mercati vengono normalizzate', () => {
  const result = normalizeMatchList([{ id: 'legacy', esiti: [
    { market: '1X2', outcome: '1' }, { market: 'Under/Over 2.5', outcome: 'Over 2.5' }
  ], selezionati: ['1X2:1', 'Under/Over 2.5:Over 2.5'] }]);
  assert.equal(result.adjustedCount, 1);
  assert.deepEqual(result.matches[0].selezionati, ['1X2:1']);
  assert.equal(result.matches[0].tipo, 'fissa');
});
test('Selezione quote: non consente tre esiti e normalizza vecchie doppie tra mercati', () => {
  const match = { esiti: [
    { market: '1X2', outcome: '1' }, { market: '1X2', outcome: 'X' }, { market: '1X2', outcome: '2' },
    { market: 'Under/Over 2.5', outcome: 'Over 2.5' }
  ], selezionati: ['1X2:1', 'Under/Over 2.5:Over 2.5'] };
  normalizeMatchSelection(match);
  assert.deepEqual(match.selezionati, ['1X2:1']);
  assert.equal(match.tipo, 'fissa');
  match.selezionati = ['1X2:1', '1X2:X'];
  normalizeMatchSelection(match);
  const refused = toggleMatchOutcome(match, 'Under/Over 2.5:Over 2.5');
  assert.equal(refused.changed, true); // mercato diverso passa intenzionalmente a una fissa
  assert.deepEqual(match.selezionati, ['Under/Over 2.5:Over 2.5']);
  match.selezionati = ['1X2:1', '1X2:X']; normalizeMatchSelection(match);
  const noThird = toggleMatchOutcome(match, '1X2:2');
  assert.equal(noThird.changed, false);
  assert.match(noThird.message, /due quote/);
});

const backupExample = createBackupPayload({
  manualInput: 'Milan - Roma; 2.10; 3.20; 3.60',
  stake: '0.10',
  sisalBonus: true,
  theme: 'dark',
  matches: [{ id: 'm1', casa: 'Milan', trasferta: 'Roma', data: '23/10', ora: '20:45', palinsesto: '36431', avvenimento: '1003', handicap: '1', competizione: '', tipo: 'fissa', esiti: [{ label: '1', outcome: '1', market: '1X2', quota: 2.1 }, { label: 'X', outcome: 'X', market: '1X2', quota: 3.2 }, { label: '2', outcome: '2', market: '1X2', quota: 3.6 }], selezionati: ['1X2:1'] }],
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
  assert.deepEqual(restored.teamLines, ['Squadra Uno', 'Squadra Due']);
  assert.equal(restored.theme, 'dark');
  assert.equal(restored.sisalBonus, true);
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
  assert.equal(isExclusiveSystem([{ tipo: 'doppia', esiti: [{ market: '1X2', outcome: '1' }, { market: '1X2', outcome: 'X' }] }, { tipo: 'fissa', esiti: [dc.esiti[0]] }]), true);
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
  assert.match(pageJs, /stakeRenderTimeout = setTimeout\(\(\) => \{ if \(state\.lastGenerated\) renderTable\(\); \}, 300\)/);
  assert.match(pageJs, /\$\('printTable'\)\.addEventListener\('click', \(\) => \{/);
  assert.match(pageJs, /refreshGeneratedColumnsNow\(\) \|\| !state\.rawColumns\.length/);
  assert.match(readFileSync(new URL('../js/exporter.js', import.meta.url), 'utf8'), /void document\.documentElement\?\.offsetHeight/);
  assert.match(pageJs, /buildPrintTable\(\);\s*stampaTabella\(\);/);
});
test('Limiti: si possono caricare più partite di quelle selezionabili, ma non più di 10 selezionate', () => {
  assert.ok(MAX_LOADED_MATCHES >= MAX_MATCHES);
  assert.match(pageJs, /activeCount >= MAX_MATCHES/);
  assert.match(pageJs, /matches\.slice\(0, MAX_LOADED_MATCHES\)/);
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
test('Release: versione ?v= unica in tutti i file e PDF.js incluso in vendor', () => {
  const versions = new Set();
  const files = ['../index.html', '../app.js', ...readdirSync(new URL('../js/', import.meta.url)).map(f => `../js/${f}`)];
  for (const file of files) for (const m of readFileSync(new URL(file, import.meta.url), 'utf8').matchAll(/\?v=([\w-]+)/g)) versions.add(m[1]);
  assert.equal(versions.size, 1, `Versioni diverse trovate: ${[...versions].join(', ')}`);
  assert.ok(existsSync(new URL('../vendor/pdfjs/pdf.min.js', import.meta.url)));
  assert.ok(existsSync(new URL('../vendor/pdfjs/pdf.worker.min.js', import.meta.url)));
  assert.match(pageJs, /new URL\('\.\/vendor\/pdfjs', document\.baseURI\)/);
});

for (const { name, fn } of queue) {
  try { await fn(); console.log(`✓ ${name}`); }
  catch (error) { console.error(`✗ ${name}`); throw error; }
}
console.log('\nTutti i test di regressione sono passati.');
