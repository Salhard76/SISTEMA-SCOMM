/* Parser manuale e parser PDF Sisal client-side.
   Il parser PDF usa la struttura reale del bollettino Sisal: 21 quote decimali
   nell'ordine fisso della tabella e un'anagrafica delle squadre Serie A.
   Se una riga non è riconoscibile con certezza, viene scartata: mai quote inventate. */
export const SISAL_DEFAULT_URL = 'https://landing.sisal.it/volantini/Scommesse_Sport/Quote/calcio%20base%20per%20manifestazione.pdf';

const NUM = String.raw`(?:\d{1,3}(?:[.,]\d{1,3})?)`;

// AGGIORNARE QUESTO ELENCO A INIZIO CAMPIONATO.
// I nomi vengono usati per separare correttamente Squadra 1 e Squadra 2
// anche quando il PDF non inserisce un trattino/separatore tra i due nomi.
export const SERIE_A_TEAMS = [
  'Atalanta', 'Bologna', 'Cagliari', 'Como', 'Fiorentina', 'Frosinone',
  'Genoa', 'Hellas Verona', 'Inter', 'Juventus', 'Lazio', 'Lecce',
  'Milan', 'Monza', 'Napoli', 'Parma', 'Roma', 'Sassuolo', 'Torino',
  'Udinese', 'Venezia'
];

function numberValue(value) {
  const n = Number(String(value).trim().replace(',', '.'));
  return Number.isFinite(n) && n > 1 ? n : null;
}

function findOdds(text) {
  return [...text.matchAll(new RegExp(NUM, 'g'))]
    .map(m => ({ raw: m[0], index: m.index, value: numberValue(m[0]) }))
    .filter(m => m.value !== null);
}

function parseMarketToken(token) {
  const m = token.match(/(O2\.?5|U2\.?5|OVER\s*2\.?5|UNDER\s*2\.?5|GOAL|NOGOAL|NO\s*GOAL)\s*[:=]\s*(\d+(?:[.,]\d+)?)/i);
  if (!m) return null;
  const key = m[1].toUpperCase().replace(/\s+/g, '');
  const label = key.startsWith('O') ? 'Over 2.5' : key.startsWith('U') ? 'Under 2.5' : key === 'GOAL' ? 'Goal' : 'NoGoal';
  const quota = numberValue(m[2]);
  return quota ? { label, outcome: label, quota, market: label } : null;
}

function parseLine(line, competition = '') {
  const clean = line.trim().replace(/^\s*[-•]\s*/, '');
  if (!clean || clean.length < 5) return null;
  const parts = clean.split(/\s*[;|]\s*/).map(s => s.trim()).filter(Boolean);
  let date = '', time = '', home = '', away = '', odds = [], markets = [];

  if (parts.length >= 4) {
    let first = parts[0];
    const dt = first.match(/(\d{1,2}[\/.-]\d{1,2}(?:[\/.-]\d{2,4})?)\s*(?:,?\s*(\d{1,2}:\d{2}))?/);
    if (dt) { date = dt[1]; time = dt[2] || ''; first = first.replace(dt[0], '').trim(); }
    if (first.includes(' - ') || first.includes(' vs ') || first.includes(' v ')) {
      const teams = first.split(/\s+(?:-\s*|vs\.?\s+|v\s+)/i);
      home = teams[0]?.trim() || ''; away = teams.slice(1).join(' ').trim();
    } else { home = first; away = parts[1] || ''; }
    const rawOdds = parts.slice(home === first ? 2 : 1);
    for (const part of rawOdds) {
      const market = parseMarketToken(part);
      if (market) markets.push(market);
      else {
        const v = numberValue(part);
        if (v && odds.length < 3) odds.push(v);
      }
    }
  } else {
    const found = findOdds(clean);
    if (found.length < 3) return null;
    const firstOdds = found.slice(0, 3);
    const prefix = clean.slice(0, firstOdds[0].index).replace(/\b\d{1,2}:\d{2}\b/g, '').trim();
    const teams = prefix.split(/\s+(?:-\s*|–\s*|—\s*|vs\.?\s+)\s*/i).filter(Boolean);
    if (teams.length < 2) return null;
    home = teams[0].replace(/^\d{1,2}[\/.-]\d{1,2}\s*/, '').trim();
    away = teams.slice(1).join(' - ').trim();
    odds = firstOdds.map(x => x.value);
    const d = clean.match(/\b(\d{1,2}[\/.-]\d{1,2}(?:[\/.-]\d{2,4})?)\b/); if (d) date = d[1];
    const t = clean.match(/\b(\d{1,2}:\d{2})\b/); if (t) time = t[1];
  }

  if (!home || !away) return null;
  const esiti = [];
  if (odds.length >= 3) {
    ['1','X','2'].forEach((outcome, i) => esiti.push({ label: outcome, outcome, quota: odds[i], market: '1X2' }));
  }
  for (const m of markets) esiti.push(m);
  if (!esiti.length) return null;
  return { id: `match-${Math.random().toString(36).slice(2, 10)}`, data: date, ora: time, casa: home, trasferta: away, competizione: competition, esiti };
}

export function parseManualInput(input) {
  const lines = String(input || '').split(/\r?\n/);
  const matches = [];
  for (const line of lines) {
    const match = parseLine(line);
    if (match) matches.push(match);
  }
  return matches;
}

// Ordine ESATTO della tabella Sisal presente nel PDF fornito.
const SERIE_A_COLUMNS = [
  { label: '1', market: 'Esito Finale' }, { label: 'X', market: 'Esito Finale' }, { label: '2', market: 'Esito Finale' },
  { label: 'H1', market: 'Handicap' }, { label: 'HX', market: 'Handicap' }, { label: 'H2', market: 'Handicap' },
  { label: '1X', market: 'Doppia Chance' }, { label: 'X2', market: 'Doppia Chance' }, { label: '12', market: 'Doppia Chance' },
  { label: 'U 1.5', market: 'Under/Over 1.5' }, { label: 'O 1.5', market: 'Under/Over 1.5' },
  { label: 'U 2.5', market: 'Under/Over 2.5' }, { label: 'O 2.5', market: 'Under/Over 2.5' },
  { label: 'U 3.5', market: 'Under/Over 3.5' }, { label: 'O 3.5', market: 'Under/Over 3.5' },
  { label: 'Goal', market: 'Goal/NoGoal' }, { label: 'NoGoal', market: 'Goal/NoGoal' },
  { label: 'SI Casa', market: 'Segna Goal Casa' }, { label: 'NO Casa', market: 'Segna Goal Casa' },
  { label: 'SI Ospite', market: 'Segna Goal Ospite' }, { label: 'NO Ospite', market: 'Segna Goal Ospite' }
];

function normalizeTeam(value) {
  return String(value || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('it-IT')
    .replace(/[^a-z0-9]/g, '');
}

const TEAM_INDEX = SERIE_A_TEAMS
  .map(name => ({ name, key: normalizeTeam(name) }))
  .sort((a, b) => b.key.length - a.key.length);

function splitSerieATeams(teamText) {
  const compact = normalizeTeam(teamText);
  if (!compact) return null;

  // Prova tutte le coppie dell'anagrafica. Il confronto compatto permette di
  // gestire spazi multipli, maiuscole/minuscole e nomi composti.
  for (const home of TEAM_INDEX) {
    if (!compact.startsWith(home.key)) continue;
    const remainder = compact.slice(home.key.length);
    for (const away of TEAM_INDEX) {
      if (remainder === away.key) return { casa: home.name, trasferta: away.name };
    }
  }
  return null;
}

function parseSerieAPdfLine(line) {
  const original = String(line || '').replace(/\s+/g, ' ').trim();
  if (!original) return null;

  // Struttura osservata nel PDF reale:
  // DATA ORA PAL AVV SQUADRA 1 SQUADRA 2 [handicap] 21 quote decimali.
  const header = original.match(/^(\d{1,2}\/\d{1,2})\s+(\d{1,2}\.\d{2})\s+\d{4,6}\s+\d{3,6}\s+(.+)$/);
  if (!header) return null;

  const data = header[1];
  const ora = header[2];
  const body = header[3];
  const odds = [...body.matchAll(/\b\d{1,3}[.,]\d{1,3}\b/g)];
  // Il valore Handicap è intero (1 / -1) e quindi non entra qui.
  if (odds.length !== SERIE_A_COLUMNS.length) return null;

  const teamText = body.slice(0, odds[0].index).trim();
  const teams = splitSerieATeams(teamText);
  if (!teams) return null;

  const esiti = odds.map((m, i) => ({
    label: SERIE_A_COLUMNS[i].label,
    outcome: SERIE_A_COLUMNS[i].label,
    quota: Number(m[0].replace(',', '.')),
    market: SERIE_A_COLUMNS[i].market
  }));

  if (esiti.some(e => !Number.isFinite(e.quota) || e.quota <= 1)) return null;

  return {
    id: `match-${Math.random().toString(36).slice(2, 10)}`,
    data,
    ora,
    casa: teams.casa,
    trasferta: teams.trasferta,
    competizione: 'Serie A',
    esiti
  };
}

function isSerieAHeader(line) {
  return /^ITA\s+Serie\s+A$/i.test(String(line || '').trim());
}

function isCompetitionHeader(line) {
  const value = String(line || '').trim();
  return /^(?:ITA\s+Serie\s+[BC]|INT\s+|ENG\s+|ESP\s+|GER\s+|FRA\s+|ITA\s+Coppa|ITA\s+.*Coppa|.*Champions League|.*Europa League|.*Conference League|.*Youth League)/i.test(value);
}

export async function parseSisalPdf(arrayBuffer) {
  const pdfjs = globalThis.pdfjsLib;
  if (!pdfjs) throw new Error('Libreria PDF.js non disponibile. Controlla la connessione e ricarica la pagina.');

  const pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise;
  const lines = [];

  for (let pageNo = 1; pageNo <= pdf.numPages; pageNo++) {
    const page = await pdf.getPage(pageNo);
    const content = await page.getTextContent();
    const rows = new Map();

    for (const item of content.items) {
      if (!item.str?.trim()) continue;
      const y = Math.round(item.transform?.[5] || 0);
      if (!rows.has(y)) rows.set(y, []);
      rows.get(y).push({ x: item.transform?.[4] || 0, text: item.str.trim() });
    }

    for (const [, row] of [...rows.entries()].sort((a, b) => b[0] - a[0])) {
      lines.push(row.sort((a, b) => a.x - b.x).map(x => x.text).join(' ').replace(/\s+/g, ' ').trim());
    }
  }

  const found = [];
  let inSerieA = false;

  for (const line of lines) {
    if (isSerieAHeader(line)) {
      inSerieA = true;
      continue;
    }
    if (isCompetitionHeader(line)) {
      inSerieA = false;
      continue;
    }
    if (!inSerieA) continue;
    if (/^(?:Data|Ora|Pal\.|Avv\.|Squadra|Esito Finale|CALCIO PER MANIFESTAZIONE|LIVE)/i.test(line)) continue;

    const match = parseSerieAPdfLine(line);
    if (match) found.push(match);
  }

  const seen = new Set();
  return found.filter(m => {
    const key = `${m.casa}|${m.trasferta}|${m.data}|${m.ora}`.toLocaleLowerCase('it-IT');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
