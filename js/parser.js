/* Parser manuale e parser PDF Sisal client-side.
   Il parser PDF usa la struttura reale del bollettino Sisal: 21 quote decimali
   nell'ordine fisso della tabella e un'anagrafica delle squadre Serie A.
   Se una riga non è riconoscibile con certezza, viene scartata: mai quote inventate. */
export const SISAL_DEFAULT_URL = 'https://landing.sisal.it/volantini/Scommesse_Sport/Quote/calcio%20base%20per%20manifestazione.pdf';

const NUM = String.raw`(?:\d{1,3}(?:[.,]\d{1,3})?)`;

// Elenco iniziale Serie A 2026/27; l'utente può aggiornarlo dall'interfaccia.
// Una riga = una squadra. Sono ammessi alias opzionali dopo il carattere |,
// per esempio: Nome ufficiale | abbreviazione usata nel bollettino.
export const SERIE_A_TEAMS = [
  'Atalanta', 'Bologna', 'Cagliari', 'Como', 'Fiorentina', 'Frosinone',
  'Genoa', 'Inter', 'Juventus', 'Lazio', 'Lecce', 'Milan', 'Monza',
  'Napoli', 'Parma', 'Roma', 'Sassuolo', 'Torino', 'Udinese', 'Venezia'
];
const SERIE_A_TEAMS_STORAGE_KEY = 'sistema-scommesse-serie-a-team-lines-v1';

export function getSerieATeamLines() {
  try {
    const stored = globalThis.localStorage?.getItem(SERIE_A_TEAMS_STORAGE_KEY);
    if (stored) {
      const lines = JSON.parse(stored);
      if (Array.isArray(lines) && lines.filter(x => String(x).trim()).length >= 2) {
        return lines.map(x => String(x).trim()).filter(Boolean);
      }
    }
  } catch { /* Se localStorage è disabilitato, usa l'elenco iniziale. */ }
  return [...SERIE_A_TEAMS];
}

export function getSerieATeams() {
  return getSerieATeamLines().map(line => String(line).split('|')[0].trim()).filter(Boolean);
}

export function setSerieATeamLines(lines) {
  const cleaned = [...new Set((Array.isArray(lines) ? lines : [])
    .map(x => String(x || '').trim())
    .filter(Boolean)
    .filter(line => line.split('|')[0].trim().length > 0))];
  const keys = cleaned.map(line => normalizeTeam(line.split('|')[0]));
  if (cleaned.length < 2) throw new Error('Inserisci almeno due squadre, una per riga.');
  if (cleaned.length < 15) console.warn(`Elenco con sole ${cleaned.length} voci: il riconoscimento del PDF completo di Serie A potrebbe essere incompleto.`);
  if (keys.some((key, i) => !key || keys.indexOf(key) !== i)) {
    throw new Error('L’elenco contiene nomi vuoti o squadre duplicate. Controlla le righe.');
  }
  try {
    if (!globalThis.localStorage) throw new Error('localStorage non disponibile');
    globalThis.localStorage.setItem(SERIE_A_TEAMS_STORAGE_KEY, JSON.stringify(cleaned));
  } catch {
    throw new Error('Non riesco a salvare l’elenco sul dispositivo: verifica le impostazioni del browser.');
  }
  return cleaned;
}

export function resetSerieATeamLines() {
  try { globalThis.localStorage?.removeItem(SERIE_A_TEAMS_STORAGE_KEY); }
  catch { /* L'elenco predefinito rimane disponibile anche senza storage. */ }
  return [...SERIE_A_TEAMS];
}

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
  const m = token.match(/(OVER\s*2\.?5|UNDER\s*2\.?5|O\s*2\.?5|U\s*2\.?5|NOGOAL|NO\s*GOAL|GOAL)\s*[:=]\s*(\d+(?:[.,]\d+)?)/i);
  if (!m) return null;
  const key = m[1].toUpperCase().replace(/\s+/g, '');
  const label = key.startsWith('O') ? 'Over 2.5' : key.startsWith('U') ? 'Under 2.5' : key === 'GOAL' ? 'Goal' : 'NoGoal';
  const quota = numberValue(m[2]);
  return quota ? { label, outcome: label, quota, market: label } : null;
}

function parseLine(line, competition = '') {
  const clean = String(line || '').trim().replace(/^\s*[-•]\s*/, '');
  if (!clean || clean.length < 5) return null;

  let date = '', time = '', home = '', away = '', odds = [], markets = [];
  const parts = clean.split(/\s*[;|]\s*/).map(s => s.trim()).filter(Boolean);

  const stripDateTime = value => {
    let text = String(value || '').trim();
    const d = text.match(/^(\d{1,2}[\/.-]\d{1,2}(?:[\/.-]\d{2,4})?)\b\s*/);
    if (d) { date = d[1]; text = text.slice(d[0].length).trim(); }
    const t = text.match(/^(\d{1,2}[:.]\d{2})\b\s*/);
    if (t) { time = t[1].replace('.', ':'); text = text.slice(t[0].length).trim(); }
    return text;
  };
  const splitPair = value => {
    const text = String(value || '').trim();
    // Accetta anche trattini senza spazi: "Milan-Roma".
    // Nel formato manuale i nomi composti sono consigliati separati da punto e virgola.
    const pair = text.match(/^(.+?)\s*(?:-|–|—|vs\.?|\bv\b)\s*(.+)$/i);
    return pair ? [pair[1].trim(), pair[2].trim()] : null;
  };
  const consumeOdds = values => {
    for (const value of values) {
      const market = parseMarketToken(value);
      if (market) { markets.push(market); continue; }
      const v = numberValue(value);
      if (v && odds.length < 3) odds.push(v);
    }
  };

  const separateDate = parts[0]?.match(/^(\d{1,2}[\/.-]\d{1,2}(?:[\/.-]\d{2,4})?)$/);
  const separateTime = parts[1]?.match(/^(\d{1,2}[:.]\d{2})$/);
  if (parts.length >= 6 && separateDate && separateTime) {
    // Variante: data; ora; casa; trasferta; quota 1; quota X; quota 2...
    date = separateDate[1]; time = separateTime[1].replace('.', ':');
    home = parts[2]; away = parts[3];
    consumeOdds(parts.slice(4));
  } else if (parts.length >= 3) {
    // Formato con separatori: data/ora; casa; trasferta; quote...
    // oppure casa; trasferta; quote... / casa - trasferta; quote...
    const first = stripDateTime(parts[0]);
    const pair = splitPair(first);
    let valuesStart = 1;
    if (pair) {
      [home, away] = pair;
    } else if (!first && parts.length >= 3) {
      home = parts[1]; away = parts[2]; valuesStart = 3;
    } else {
      home = first; away = parts[1]; valuesStart = 2;
    }
    consumeOdds(parts.slice(valuesStart));
  } else {
    // Riga libera: squadre + quote 1X2 e/o mercati speciali.
    // Si mascherano prima i token di mercato, altrimenti il "2.5" di O2.5 può
    // essere scambiato per una quota 1X2. Si accettano anche righe con i soli mercati.
    const dt = clean.match(/^\s*(\d{1,2}[\/.-]\d{1,2}(?:[\/.-]\d{2,4})?)(?:\s+(\d{1,2}[:.]\d{2}))?/);
    if (dt) { date = dt[1]; if (dt[2]) time = dt[2].replace('.', ':'); }
    const withoutDateTime = clean
      .replace(/^\s*\d{1,2}[\/.-]\d{1,2}(?:[\/.-]\d{2,4})?(?:\s+\d{1,2}[:.]\d{2})?/, ' ')
      .replace(/\s+/g, ' ').trim();
    const marketPattern = /(?:OVER\s*2\.?5|UNDER\s*2\.?5|O\s*2\.?5|U\s*2\.?5|NOGOAL|NO\s*GOAL|GOAL)\s*[:=]\s*\d+(?:[.,]\d+)?/ig;
    const marketTokens = [...withoutDateTime.matchAll(marketPattern)];
    for (const token of marketTokens) {
      const market = parseMarketToken(token[0]);
      if (market) markets.push(market);
    }
    const maskedMarkets = withoutDateTime.replace(marketPattern, token => ' '.repeat(token.length));
    const found = findOdds(maskedMarkets);
    if (found.length >= 3) {
      const firstThree = found.slice(0, 3);
      const prefix = maskedMarkets.slice(0, firstThree[0].index).trim();
      const pair = splitPair(prefix);
      if (!pair) return null;
      [home, away] = pair;
      odds = firstThree.map(x => x.value);
    } else if (markets.length) {
      const firstMarketIndex = marketTokens[0]?.index ?? -1;
      if (firstMarketIndex < 0) return null;
      const prefix = withoutDateTime.slice(0, firstMarketIndex).trim();
      const pair = splitPair(prefix);
      if (!pair) return null;
      [home, away] = pair;
    } else {
      // Una o due quote non bastano per costruire un mercato 1X2.
      return null;
    }
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

function getTeamIndex() {
  return getSerieATeamLines().flatMap(line => {
    const parts = String(line).split('|').map(x => x.trim()).filter(Boolean);
    const name = parts[0];
    return parts.map(alias => ({ name, key: normalizeTeam(alias) }));
  }).filter(item => item.key).sort((a, b) => b.key.length - a.key.length);
}

function splitSerieATeams(teamText) {
  const compact = normalizeTeam(teamText);
  if (!compact) return null;
  const teamIndex = getTeamIndex();

  // Prova tutte le coppie: nomi composti e alias sono definiti nell'elenco,
  // non gestiti da eccezioni scritte nel parser.
  for (const home of teamIndex) {
    if (!compact.startsWith(home.key)) continue;
    const remainder = compact.slice(home.key.length);
    for (const away of teamIndex) {
      if (remainder === away.key) return { casa: home.name, trasferta: away.name };
    }
  }
  return null;
}

function parseSerieAPdfLine(line, diagnostics) {
  const original = String(line || '').replace(/\s+/g, ' ').trim();
  if (!original) return null;

  // Conta solo righe che somigliano davvero a una riga dati (data, ora, palinsesto, avvenimento).
  if (!/^\d{1,2}\/\d{1,2}\s+\d{1,2}\.\d{2}\s+\d{4,6}\s+\d{3,6}\s+/.test(original)) return null;
  diagnostics.candidateRows += 1;

  const reject = (reason, extra = {}) => {
    diagnostics.rejects.push({ data: original.slice(0, 16), reason, ...extra });
    return null;
  };
  // Struttura del bollettino: DATA ORA PAL AVV SQUADRA 1 SQUADRA 2 [handicap] 21 quote decimali.
  const header = original.match(/^(\d{1,2}\/\d{1,2})\s+(\d{1,2}\.\d{2})\s+(\d{4,6})\s+(\d{3,6})\s+(.+)$/);
  if (!header) return reject('structure');

  const data = header[1];
  const ora = header[2];
  const palinsesto = header[3];
  const avvenimento = header[4];
  const body = header[5];
  const odds = [...body.matchAll(/\b\d{1,3}[.,]\d{1,3}\b/g)];
  // Handicap è un intero (1 / -1), quindi non entra nella lista delle quote decimali.
  if (odds.length !== SERIE_A_COLUMNS.length) return reject('quote_count', { foundOdds: odds.length });

  const handicapRaw = body.slice(odds[2].index + odds[2][0].length, odds[3].index).trim();
  const handicap = /^[+-]?\d+$/.test(handicapRaw) ? handicapRaw : '';
  const teamText = body.slice(0, odds[0].index).trim();
  const teams = splitSerieATeams(teamText);
  if (!teams) return reject('teams', { foundOdds: odds.length });

  const esiti = odds.map((m, i) => ({
    label: SERIE_A_COLUMNS[i].label,
    outcome: SERIE_A_COLUMNS[i].label,
    quota: Number(m[0].replace(',', '.')),
    market: SERIE_A_COLUMNS[i].market
  }));
  if (esiti.some(e => !Number.isFinite(e.quota) || e.quota <= 1)) return reject('invalid_odds', { foundOdds: odds.length });

  diagnostics.recognizedRows += 1;
  return {
    id: `match-${Math.random().toString(36).slice(2, 10)}`,
    data,
    ora,
    palinsesto,
    avvenimento,
    handicap,
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
  return /^(?:ITA\s+Serie\s+[BCD]|INT\s+|ENG\s+|ESP\s+|GER\s+|FRA\s+|ITA\s+Coppa|ITA\s+.*Coppa|.*Champions League|.*Europa League|.*Conference League|.*Youth League)/i.test(value);
}

export async function parseSisalPdf(arrayBuffer) {
  const pdfjs = globalThis.pdfjsLib;
  if (!pdfjs) throw new Error('Libreria PDF.js non disponibile. Controlla la connessione e ricarica la pagina.');

  let pdf;
  try {
    pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise;
  } catch (error) {
    const passwordResponses = pdfjs.PasswordResponses;
    if (error?.name === 'PasswordException' ||
        (passwordResponses?.NEED_PASSWORD != null && error?.code === passwordResponses.NEED_PASSWORD) ||
        (passwordResponses?.INCORRECT_PASSWORD != null && error?.code === passwordResponses.INCORRECT_PASSWORD)) {
      throw new Error('Il PDF è protetto da password: rimuovi la protezione e riprova con una copia leggibile.');
    }
    throw error;
  }
  const lines = [];

  for (let pageNo = 1; pageNo <= pdf.numPages; pageNo++) {
    const page = await pdf.getPage(pageNo);
    const content = await page.getTextContent();
    // Nel PDF Sisal alcuni valori (es. la quota 10,50 di Inter-Fiorentina)
    // possono avere una coordinata verticale leggermente diversa pur essendo
    // sulla stessa riga. Arrotondare Y al singolo punto li separava in due righe
    // e faceva risultare 20 quote invece delle 21 previste. Raggruppiamo per
    // vicinanza verticale (2 pt), poi ordiniamo sempre per X.
    const textItems = content.items
      .filter(item => item.str?.trim())
      .map(item => ({
        x: item.transform?.[4] || 0,
        y: item.transform?.[5] || 0,
        text: item.str.trim()
      }))
      .sort((a, b) => b.y - a.y || a.x - b.x);

    const rows = [];
    const rowTolerance = 2;
    for (const item of textItems) {
      let row = rows[rows.length - 1];
      if (!row || Math.abs(row.y - item.y) > rowTolerance) {
        row = { y: item.y, count: 0, items: [] };
        rows.push(row);
      }
      row.items.push(item);
      row.count += 1;
      row.y += (item.y - row.y) / row.count;
    }

    for (const row of rows) {
      lines.push(row.items.sort((a, b) => a.x - b.x).map(x => x.text).join(' ').replace(/\s+/g, ' ').trim());
    }
  }

  const found = [];
  const diagnostics = {
    seriesAFound: false,
    candidateRows: 0,
    recognizedRows: 0,
    duplicateRows: 0,
    rejects: []
  };
  let inSerieA = false;

  for (const line of lines) {
    if (isSerieAHeader(line)) {
      inSerieA = true;
      diagnostics.seriesAFound = true;
      continue;
    }
    if (isCompetitionHeader(line)) {
      inSerieA = false;
      continue;
    }
    if (!inSerieA) continue;
    if (/^(?:Data|Ora|Pal\.|Avv\.|Squadra|Esito Finale|CALCIO PER MANIFESTAZIONE|LIVE)/i.test(line)) continue;

    const match = parseSerieAPdfLine(line, diagnostics);
    if (match) found.push(match);
  }

  const seen = new Set();
  const unique = [];
  for (const match of found) {
    const key = `${match.casa}|${match.trasferta}|${match.data}|${match.ora}`.toLocaleLowerCase('it-IT');
    if (seen.has(key)) {
      diagnostics.duplicateRows += 1;
      continue;
    }
    seen.add(key);
    unique.push(match);
  }
  diagnostics.importedRows = unique.length;
  diagnostics.rejectedRows = diagnostics.rejects.length;
  // Mantiene l'API esistente (array di partite) e allega diagnostica leggibile dall'interfaccia.
  Object.defineProperty(unique, 'diagnostics', { value: diagnostics, enumerable: false, configurable: true });
  return unique;
}
