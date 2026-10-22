import assert from 'node:assert/strict';
import { parseManualInput, parseSisalPdf } from '../js/parser.js';
import { generateSystem, MAX_MATCHES, MAX_CHOICES_PER_MATCH, MAX_SYSTEM_COLUMNS } from '../js/generator.js';
import { applyFilters, describeOutcome, maxOutcomeCount } from '../js/filters.js';
import { printWithMode } from '../js/exporter.js';

function test(name, fn) {
  try {
    fn();
    console.log(`✓ ${name}`);
  } catch (error) {
    console.error(`✗ ${name}`);
    throw error;
  }
}

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
  assert.equal(matches.diagnostics.seriesAFound, true);
  assert.equal(matches.diagnostics.candidateRows, 3);
  assert.equal(matches.diagnostics.recognizedRows, 2);
  assert.equal(matches.diagnostics.rejects.length, 1);
  assert.equal(matches.diagnostics.rejects[0].reason, 'quote_count');
  assert.equal(matches.diagnostics.rejects[0].foundOdds, 20);
  assert.equal(matches.diagnostics.duplicateRows, 1);
  assert.equal(matches.diagnostics.importedRows, 1);
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
  const handlers = new Map();
  const timers = [];
  globalThis.document = { body: { dataset } };
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
    handlers.get('afterprint')();
    assert.equal(dataset.printMode, undefined);
    printWithMode('integral');
    assert.equal(dataset.printMode, 'integral');
    timers.at(-1)();
    assert.equal(dataset.printMode, undefined);
  } finally {
    if (previousDocument === undefined) delete globalThis.document; else globalThis.document = previousDocument;
    if (previousWindow === undefined) delete globalThis.window; else globalThis.window = previousWindow;
  }
});

console.log('\nTutti i test di regressione sono passati.');
