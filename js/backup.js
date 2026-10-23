import { MAX_MATCHES, MAX_LOADED_MATCHES, MAX_CHOICES_PER_MATCH } from './config.js?v=salhard-signature-v11-20261023';

export const BACKUP_FORMAT = 'sistema-scommesse-builder-backup';
export const BACKUP_SCHEMA_VERSION = 1;

const asText = (value, fallback = '') => typeof value === 'string' ? value.slice(0, 100000) : fallback;
const compactTeam = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('it-IT').replace(/[^a-z0-9]/g, '');

export function createBackupPayload(data, exportedAt = new Date().toISOString()) {
  return {
    format: BACKUP_FORMAT,
    schemaVersion: BACKUP_SCHEMA_VERSION,
    app: 'Sistema Scommesse Builder',
    exportedAt,
    data
  };
}

export function validateBackupPayload(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('Il file non contiene un oggetto JSON valido.');
  if (payload.format !== BACKUP_FORMAT) throw new Error('Questo non è un backup di Sistema Scommesse Builder.');
  if (payload.schemaVersion !== BACKUP_SCHEMA_VERSION) throw new Error(`Versione backup non supportata (${String(payload.schemaVersion)}).`);
  const data = payload.data;
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('Il backup non contiene la sezione dati.');

  const inputMatches = data.matches ?? [];
  if (!Array.isArray(inputMatches)) throw new Error('Elenco partite non valido nel backup.');
  if (inputMatches.length > MAX_LOADED_MATCHES) throw new Error(`Il backup contiene ${inputMatches.length} partite: il limite è ${MAX_LOADED_MATCHES}.`);
  const matches = inputMatches.map((match, index) => {
    if (!match || typeof match !== 'object' || Array.isArray(match)) throw new Error(`Partita ${index + 1}: struttura non valida.`);
    const casa = asText(match.casa).trim();
    const trasferta = asText(match.trasferta).trim();
    if (!casa || !trasferta) throw new Error(`Partita ${index + 1}: nome della squadra mancante.`);
    if (!Array.isArray(match.esiti) || match.esiti.length === 0 || match.esiti.length > 100) throw new Error(`Partita ${index + 1}: elenco quote non valido.`);
    const esiti = match.esiti.map((outcome, outcomeIndex) => {
      if (!outcome || typeof outcome !== 'object') throw new Error(`Partita ${index + 1}, esito ${outcomeIndex + 1}: dato non valido.`);
      const market = asText(outcome.market).trim();
      const result = asText(outcome.outcome).trim();
      const label = asText(outcome.label || outcome.outcome).trim();
      const quota = Number(outcome.quota);
      if (!market || !result || !label || !Number.isFinite(quota) || quota <= 1) throw new Error(`Partita ${index + 1}, esito ${outcomeIndex + 1}: quota o descrizione non valida.`);
      return { label, outcome: result, quota, market };
    });
    const selected = match.selezionati ?? [];
    if (!Array.isArray(selected) || selected.length > MAX_CHOICES_PER_MATCH) throw new Error(`Partita ${index + 1}: sono consentite al massimo ${MAX_CHOICES_PER_MATCH} selezioni.`);
    const available = new Set(esiti.map(outcome => `${outcome.market}:${outcome.outcome}`));
    const selezionati = [...new Set(selected.map(x => asText(x).trim()).filter(Boolean))];
    if (selezionati.some(key => !available.has(key))) throw new Error(`Partita ${index + 1}: una selezione non corrisponde a una quota presente.`);
    const tipo = match.tipo === 'doppia' ? 'doppia' : 'fissa';
    if (tipo === 'fissa' && selezionati.length > 1) throw new Error(`Partita ${index + 1}: una fissa può contenere una sola selezione.`);
    return {
      id: asText(match.id, `backup-match-${index + 1}`).trim() || `backup-match-${index + 1}`,
      casa, trasferta,
      data: asText(match.data), ora: asText(match.ora),
      palinsesto: asText(match.palinsesto || match.pal), avvenimento: asText(match.avvenimento || match.avv),
      handicap: asText(match.handicap), competizione: asText(match.competizione),
      tipo, esiti, selezionati
    };
  });

  let teamLines = data.teamLines;
  if (teamLines !== undefined) {
    if (!Array.isArray(teamLines)) throw new Error('Elenco squadre non valido nel backup.');
    teamLines = [...new Set(teamLines.map(x => asText(x).trim()).filter(Boolean))];
    if (teamLines.length < 2) throw new Error('Il backup contiene meno di due squadre. Elenco non applicato.');
    const names = teamLines.map(line => compactTeam(line.split('|')[0].trim()));
    if (names.some((name, i) => !name || names.indexOf(name) !== i)) throw new Error('Il backup contiene nomi squadra vuoti o duplicati. Elenco non applicato.');
  }

  const sourceDiagnostics = data.pdfDiagnostics && typeof data.pdfDiagnostics === 'object' ? data.pdfDiagnostics : null;
  const pdfDiagnostics = sourceDiagnostics ? {
    seriesAFound: Boolean(sourceDiagnostics.seriesAFound),
    candidateRows: clampCount(sourceDiagnostics.candidateRows),
    recognizedRows: clampCount(sourceDiagnostics.recognizedRows),
    duplicateRows: clampCount(sourceDiagnostics.duplicateRows),
    importedRows: clampCount(sourceDiagnostics.importedRows),
    rejectedRows: clampCount(sourceDiagnostics.rejectedRows),
    rejects: Array.isArray(sourceDiagnostics.rejects) ? sourceDiagnostics.rejects.slice(0, 100).map(x => ({
      data: asText(x?.data, 'Riga non identificata',).slice(0, 80),
      reason: asText(x?.reason, 'unknown').slice(0, 40),
      foundOdds: x?.foundOdds == null ? null : clampCount(x.foundOdds)
    })) : []
  } : null;

  const limits = {};
  if (data.outcomeFilterLimits && typeof data.outcomeFilterLimits === 'object' && !Array.isArray(data.outcomeFilterLimits)) {
    for (const [key, value] of Object.entries(data.outcomeFilterLimits)) {
      if (!key || key.length > 250 || ['__proto__', 'constructor', 'prototype'].includes(key) || !value || typeof value !== 'object') continue;
      const clean = {};
      for (const side of ['min', 'max']) {
        const limit = value[side];
        if (limit === '' || limit == null) clean[side] = '';
        else if (Number.isInteger(Number(limit)) && Number(limit) >= 0 && Number(limit) <= MAX_MATCHES) clean[side] = String(Number(limit));
        else throw new Error(`Limite del filtro “${key}” non valido.`);
      }
      limits[key] = clean;
    }
  }
  const theme = data.theme === 'dark' ? 'dark' : 'light';
  const stake = validNumberString(data.stake, '0.10', 0, 100000, 'puntata');
  const stakeMode = data.stakeMode === 'total-budget' ? 'total-budget' : 'per-column';
  const systemBudget = validNumberString(data.systemBudget, '10.00', 0.01, 100000, 'budget totale');

  return {
    manualInput: asText(data.manualInput),
    stake, stakeMode, systemBudget, matches, outcomeFilterLimits: limits, theme,
    sisalBonus: data.sisalBonus !== false,
    teamLines,
    reviewedSeason: asText(data.reviewedSeason, '').slice(0, 20),
    source: asText(data.source, '').slice(0, 80),
    pdfDiagnostics
  };
}

function clampCount(value) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(0, Math.min(100000, Math.floor(n))) : 0;
}
function validNumberString(value, fallback, min, max, label) {
  if (value == null || value === '') return fallback;
  const n = Number(value);
  if (!Number.isFinite(n) || n < min || n > max) throw new Error(`Valore ${label} non valido nel backup.`);
  return String(value);
}
