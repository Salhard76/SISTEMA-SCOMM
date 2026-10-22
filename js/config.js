/* Limiti strutturali condivisi da interfaccia e generatore. */
export const MAX_MATCHES = 10;
export const MAX_CHOICES_PER_MATCH = 2;
export const MAX_SYSTEM_COLUMNS = MAX_CHOICES_PER_MATCH ** MAX_MATCHES;
/* Partite caricabili nel foglio quote (es. da un PDF con più di un turno). Le partite SELEZIONATE restano al massimo MAX_MATCHES.
   Per tornare al comportamento "massimo 10 partite caricate" imposta MAX_LOADED_MATCHES = MAX_MATCHES. */
export const MAX_LOADED_MATCHES = 30;
