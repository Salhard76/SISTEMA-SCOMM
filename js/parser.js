/* Parser manuale tollerante e parser PDF client-side.
   Il PDF non ha un layout garantito: l'importazione è best-effort e non inventa quote mancanti. */
export const SISAL_DEFAULT_URL = 'https://landing.sisal.it/volantini/Scommesse_Sport/Quote/calcio%20base%20per%20manifestazione.pdf';
const COMPETITIONS = [
  { name: 'Serie A', re: /\bserie\s*a\b/i },
  { name: 'Serie B', re: /\bserie\s*b\b/i },
  { name: 'Champions League', re: /\b(?:uefa\s+)?champions\s+league\b/i },
  { name: 'Europa League', re: /\b(?:uefa\s+)?europa\s+league\b/i }
];
const NUM = String.raw`(?:\d{1,3}(?:[.,]\d{1,3})?)`;
function numberValue(value) {
  const n = Number(String(value).trim().replace(',', '.'));
  return Number.isFinite(n) && n > 1 ? n : null;
}
function findOdds(text) {
  return [...text.matchAll(new RegExp(NUM, 'g'))].map(m => ({ raw: m[0], index: m.index, value: numberValue(m[0]) }))
    .filter(m => m.value !== null);
}
function parseMarketToken(token) {
  const m = token.match(/(O2\.?5|U2\.?5|OVER\s*2\.?5|UNDER\s*2\.?5|GOAL|NOGOAL|NO\s*GOAL)\s*[:=]\s*(\d+(?:[.,]\d+)?)/i);
  if (!m) return null;
  const key = m[1].toUpperCase().replace(/\s+/g, '');
  const label = key.startsWith('O') ? 'Over 2.5' : key.startsWith('U') ? 'Under 2.5' : key === 'GOAL' ? 'Goal' : 'NoGoal';
  const outcome = label === 'Goal' ? 'Goal' : label === 'NoGoal' ? 'NoGoal' : label;
  const quota = numberValue(m[2]);
  return quota ? { label, outcome, quota, market: label } : null;
}
function parseLine(line, competition = '') {
  const clean = line.trim().replace(/^\s*[-•]\s*/, '');
  if (!clean || clean.length < 5) return null;
  // Accetta separatori ; | oppure una coppia squadre separata da " - ".
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
    // Prova a leggere una riga PDF/testo: nomi squadre e almeno tre quote consecutive.
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
export async function parseSisalPdf(arrayBuffer) {
  const pdfjs = globalThis.pdfjsLib;
  if (!pdfjs) throw new Error('Libreria PDF.js non disponibile. Controlla la connessione e ricarica la pagina.');
  const pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise;
  const lines = [];
  for (let pageNo = 1; pageNo <= pdf.numPages; pageNo++) {
    const page = await pdf.getPage(pageNo);
    const content = await page.getTextContent();
    // Raggruppa elementi testuali per coordinata verticale, così il parser non dipende
    // dall'ordine interno degli elementi restituiti da PDF.js.
    const rows = new Map();
    for (const item of content.items) {
      if (!item.str?.trim()) continue;
      const y = Math.round(item.transform?.[5] || 0);
      if (!rows.has(y)) rows.set(y, []);
      rows.get(y).push({ x: item.transform?.[4] || 0, text: item.str.trim() });
    }
    for (const [, row] of [...rows.entries()].sort((a,b) => b[0]-a[0])) {
      lines.push(row.sort((a,b) => a.x-b.x).map(x => x.text).join(' ').replace(/\s+/g, ' ').trim());
    }
  }
  const found = [];
  let activeCompetition = '';
  for (const line of lines) {
    const comp = COMPETITIONS.find(c => c.re.test(line));
    if (comp && line.length < 80) { activeCompetition = comp.name; continue; }
    // Fuori dalle quattro sezioni richieste, ogni riga viene ignorata.
    if (!activeCompetition) continue;
    // Una nuova intestazione di competizione non ammessa disattiva il parser.
    if (/\b(conference league|premier league|liga portugal|bundesliga|ligue 1|la liga|serie c|coppa italia)\b/i.test(line)) {
      activeCompetition = '';
      continue;
    }
    const match = parseLine(line, activeCompetition);
    if (match && match.esiti.some(e => e.market === '1X2')) found.push(match);
  }
  // Deduplica eventuali righe ripetute su più elementi/pagine.
  const seen = new Set();
  return found.filter(m => {
    const key = `${m.competizione}|${m.data}|${m.casa.toLowerCase()}|${m.trasferta.toLowerCase()}`;
    if (seen.has(key)) return false; seen.add(key); return true;
  });
}
