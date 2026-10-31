# Sistema Scommesse Builder

## v27 — 31 ottobre 2026 — Copertura complementare corretta e aggiornamento grafico
- **Regola della copertura 1X2:** il suggerimento è il complemento esatto dell'intera base, non una doppia chance che ripete esiti già selezionati. Base 1 → X2; base X → 12; base 2 → 1X; base 1 + X oppure doppia chance 1X → soltanto 2. Le stesse regole valgono quando la base è formata da due esiti distinti dello stesso mercato.
- **Mercati diversi:** se nell'ultima partita le selezioni appartengono a famiglie diverse, restano visibili le controparti separate per ramo; non viene presentata una copertura unica non dimostrabile.
- **Evidenziazione:** la sola quota complementare viene evidenziata con sfondo lilla/blu elettrico, distinto dalle quote selezionate e dalle quote alte.
- **Interfaccia:** selettore PDF evidenziato; i pulsanti Genera sistema, Azzera quote e Reset completo hanno dimensioni uniformi e stili coerenti. In Info è riportata la versione 27 e la regola di copertura.
- **Cache e test:** release `sb-v27-20261031`; test di regressione ampliati per tutte le mappature 1X2 e doppia chance. Tutti i **99 test di regressione** passano con `npm test`.

## v26 — 31 ottobre 2026 — Aggiornamento immediato della copertura
- **Pannello aggiornato dopo Genera sistema**: corretto un difetto dell’interfaccia. Dopo la generazione, il foglio colonne veniva aggiornato ma il pannello COPERTURA INTELLIGENTE restava sul messaggio “Genera il sistema…”. Ora il pannello ricalcola subito ritorni residui, copertura consigliata e scenari; si aggiorna anche quando cambiano puntata, bonus o filtri.
- **Aggiornamento nei casi limite**: il pannello viene rinfrescato anche se i filtri azzerano le colonne o se il budget non consente la puntata minima.
- **Test**: aggiunto un controllo di regressione sul collegamento tra generazione e aggiornamento pannello; 96 test complessivi. Release `sb-v26-20261031`.

## v25 — 30 ottobre 2026 — Puntata ottimizzata al centesimo
- **Copertura più precisa**: per ogni quota candidata vengono confrontati il centesimo inferiore e quello superiore rispetto alla puntata teorica di pareggio. Viene scelta la puntata che massimizza davvero il caso peggiore dopo l'arrotondamento monetario.
- **Test**: aggiunta una regressione in cui il centesimo superiore migliora il risultato rispetto al normale arrotondamento; 95 test complessivi. Release `sb-v25-20261030`.

## v24 — 30 ottobre 2026 — Copertura consigliata sul risultato netto
- **Copertura consigliata**: per ogni possibile risultato finale dell'ultima partita il pannello calcola il netto = ritorno del sistema − spesa del sistema − puntata di copertura (+ vincita della copertura se comprende quel risultato) e sceglie, tra le quote disponibili della stessa famiglia (1X2 + Doppia Chance, oppure un mercato binario), la puntata che massimizza il **caso peggiore**. Mostra la puntata, il netto per ogni risultato con e senza copertura e le due migliori alternative.
- **Due esiti nell'ultima partita**: la versione 23 proponeva una copertura per ogni ramo (nell'esempio di prova 30,86 € + 47,62 € per ottenere +7,36 € in ogni scenario, oppure −5,50 € nel caso peggiore con un solo ramo). La copertura sull'esito rimanente costa 15,12 € e garantisce +10,24 € nel caso peggiore (stesso esempio, verificata a forza bruta su tutte le quote e puntate da 0 a 200 €). Le schede per ramo restano, ripiegate, come alternativa.
- **Netto reale nelle schede per ramo**: oltre al «ritorno bilanciato» (prima della spesa del sistema) compare il risultato netto dopo la spesa del sistema; se su un ramo non c'è nessuna colonna viva la scheda dice «Non necessaria» invece di «In attesa».
- **Controparti anche con quote scritte a mano** (Over 2.5/Under 2.5, Goal/NoGoal): prima non ne veniva trovata nessuna perché i nomi di mercato differiscono da quelli del PDF. Nell'interfaccia attuale l'inserimento manuale non c'è più; vale per sessioni salvate e backup.
- **Limiti**: la copertura è facoltativa, non garantisce un risultato positivo (il caso peggiore può restare negativo), non considera limiti o puntate minime del bookmaker; la puntata è arrotondata al centesimo; se nell'ultima partita ci sono esiti di mercati diversi viene mostrato solo il calcolo per ramo. Il bonus Sisal è una stima.
- **Test**: 5 nuovi (94 in tutto), compresa la verifica a forza bruta. Release `sb-v24-20261030`.

## v23 — 30 ottobre 2026 — Copertura intelligente

- **Ultima partita evidenziata:** tra le partite selezionate individua quella più tarda in base a data e ora del palinsesto; la riga viene marcata con uno sfondo dedicato.
- **Quote di controparte evidenziate:** mette in risalto solo esiti complementari riconosciuti, tra cui Doppia Chance ↔ Esito Finale, Under/Over, Goal/NoGoal e Segna Goal Casa/Ospite. Esempio: 1X ↔ 2; Segna Goal Casa SÌ ↔ NO.
- **Risultati effettivi:** nel pannello “Copertura intelligente” l’utente indica manualmente quale esito selezionato si è verificato in ciascuna partita precedente; se entrambe le selezioni di una doppia risultano vincenti, può confermarle entrambe. Non viene simulato né dichiarato un collegamento ai risultati live.
- **Calcolo della copertura:** dopo la generazione del sistema, le colonne vengono filtrate in base agli esiti effettivi registrati. Per ogni controparte esatta viene calcolata la puntata che pareggia il ritorno lordo dei due scenari (`ritorno da proteggere / quota di copertura`), includendo la stima del Bonus Multipla attivo.
- **Trasparenza sui limiti:** se sono stati selezionati due mercati diversi nell’ultima partita, ogni proposta copre il relativo ramo e non viene presentata come copertura totale automatica. La copertura è facoltativa e non garantisce un risultato positivo.
- **Persistenza:** gli esiti effettivi confermati vengono conservati nei salvataggi locali e nei backup JSON; cambiare le selezioni azzera la conferma relativa a quella partita.
- **Test e cache:** test aggiunti per complementi esatti, ordinamento cronologico, risultati precedenti, ritorno residuo e puntata suggerita. Release `sb-v23-20261030`.

## Novità versione 20 — controllo copertura minima e quote a rischio doppia
- **Azzera quote azzera anche i filtri dinamici** (per esempio Min/Max su X, Over o Goal). Conserva le partite, le quote importate, il testo manuale e le impostazioni di puntata. Se non ci sono selezioni ma restano filtri impostati, il pulsante resta disponibile per cancellarli.
- **Quote in rosso**: vengono evidenziati soltanto i mercati a due esiti riconosciuti (Under/Over 1,5, 2,5 e 3,5; Goal/NoGoal; Segna Goal Casa/Ospite) quando entrambe le quote sono pari o inferiori a 2,00. Non vengono marcati i mercati a tre esiti (1X2, Handicap, Doppia Chance), i mercati incompleti/duplicati o le coppie in cui almeno una quota supera 2,00. Il controllo è visivo e non blocca la selezione.
- **Controllo automatico ritorno/spesa**: si aggiorna quando cambiano quote selezionate, filtri, modalità di puntata, importi o Bonus Multipla. Moltiplica la quota composta di ogni colonna per la puntata effettiva e aggiunge il bonus stimato secondo la regola interna; confronta il ritorno lordo minimo tra le colonne rimaste con la spesa totale effettiva. Verde significa che il ritorno teorico minimo di una colonna vincente è almeno pari alla spesa; rosso indica il contrario.
- **Nessuna promessa di vincita**: il controllo non prevede che una colonna vinca e non conta l'eventuale vincita contemporanea di più colonne; segnala soltanto la copertura matematica del ritorno minimo calcolato alle quote correnti. Il bonus Sisal è una stima da verificare sul biglietto effettivo.
- **Test**: la suite verifica le coppie a quota bassa, il moltiplicatore, il bonus, i filtri e lo stato dell'interfaccia.

## Novità versione 19 — azzera selezioni senza perdere le quote importate
- **Nuovo pulsante “Azzera quote”** tra “Genera sistema” e “Reset completo”: rimuove soltanto gli esiti selezionati per costruire il sistema. Partite e quote importate restano nel foglio e sono subito riutilizzabili; vengono conservati anche testo manuale, puntata e impostazioni. Il sistema generato precedente viene invalidato e non è più esportabile finché non si genera di nuovo.
- **Invalidazione coerente dei risultati**: quando si caricano nuove partite, si rimuove una partita, si cambia una selezione o si ripristina un backup, le vecchie colonne non possono più restare esportabili per errore.
- **Persistenza e timer più sicuri**: il testo scritto nell’area manuale si salva automaticamente; il reset completo e il ripristino backup cancellano i timer pendenti per evitare che una vecchia modifica risalvi dati sopra il reset o il backup appena importato. Il reset pulisce anche diagnostica PDF e nome del file mostrato.
- **Cache aggiornata**: release `sb-v19-20261029`; il service worker e tutti i moduli usano lo stesso identificatore.
- **Rilettura del codice**: suite di regressione estesa per l’azzeramento selezioni e l’invalidazione dei sistemi obsoleti; controllata la sintassi dei moduli, il precache e i riferimenti delle risorse.
## Novità versione 18 — icona principale più leggibile
- **Composizione ingrandita**: le icone colorate usate per installazione, manifest e Apple Touch riducono le bande azzurre laterali e rendono la mascotte più grande senza tagliare verticalmente la fiamma o il vaso. La composizione è stata allargata moderatamente perché l'illustrazione originale arriva già fino ai bordi superiore e inferiore.
- **Compatibilità**: il manifesto punta a nuovi file `app-icon-*`; il logo interno dell'interfaccia resta monocromatico a contorni e la favicon SB resta ad alto contrasto.
- **Cache aggiornata**: release `sb-v18-20261029`; i nuovi file icona sono inclusi nella shell offline.
- **Limite del collaudo**: l'icona è stata controllata come PNG; la resa finale dipende anche dalla maschera della schermata Home Samsung e va confermata installando/aggiornando la PWA sul telefono.

## Novità versione 17 — recupero senza sovrascrittura automatica
- **Il salvataggio originale non viene riscritto all'apertura** quando il ripristino tollerante corregge valori o scarta singole partite. L'app avvisa che la prima modifica successiva aggiornerà il salvataggio con i dati recuperati. Questo evita la perdita immediata del contenuto originale prima che l'utente possa controllare la sessione.
- **Controllo numerico più rigoroso**: valori locali salvati come booleani o oggetti non vengono interpretati come numeri validi; tornano ai valori predefiniti senza far fallire l'intero ripristino. Gli stessi tipi malformati sono rifiutati durante l'import di backup JSON.
- **Filtri robusti**: vengono segnalati oggetti filtro malformati e vengono azzerati i limiti contraddittori (minimo maggiore del massimo).
- **Elenco partite corrotto**: se il campo non è un array, la sessione viene recuperata senza partite e l'anomalia viene segnalata.
- **Test**: aggiunti controlli sui tipi numerici, filtri contraddittori, struttura elenco partite e mancata sovrascrittura automatica all'avvio.

## Novità versione 16 — ripristino sessione tollerante
- **Un campo anomalo non cancella più la sessione.** Nella v15 bastava un solo valore non valido nei dati salvati (puntata negativa o sopra 100.000 €, budget 0, un filtro fuori range, una partita senza quote) per scartare tutto, compreso il testo inserito a mano. Ora i numeri anomali tornano al predefinito, i filtri non validi vengono svuotati e viene scartata solo la singola partita non valida; l'app mostra cosa è stato corretto. I dati non validi non raggiungono mai l'interfaccia. L'import di un backup JSON resta rigoroso (tutto o niente).
- **Test**: 2 nuovi test; quello della v15 che pretendeva l'errore su una quota non valida ora verifica lo scarto della sola partita.


## Novità versione 15 — validazione dello stato salvato
- **Stato locale validato prima dell’uso**: i dati recuperati da `localStorage` passano attraverso la stessa validazione strutturale usata per i backup JSON, prima di aggiornare l’interfaccia o lo stato applicativo.
- **Recupero prudente**: se il salvataggio è corrotto o incoerente, l’app parte con una sessione vuota invece di usare dati parziali. Il contenuto salvato non viene cancellato automaticamente, così resta disponibile finché l’utente non salva una nuova sessione o importa un backup.
- **Compatibilità con le selezioni precedenti**: le selezioni che non corrispondono più a quote presenti vengono rimosse in modo controllato, segnalando la migrazione, mentre errori strutturali e quote non valide bloccano il ripristino.
- **Elenco squadre più robusto**: se il JSON del catalogo personalizzato è corrotto, contiene elementi non testuali o nomi ufficiali duplicati, viene usato l’elenco base incluso nell’app.
- **Versione/cache**: identificatore aggiornato a `sb-v15-20261029` per evitare il riuso dei moduli della v14.
- **Verifiche**: aggiunti test per stato locale valido, dati malformati, selezioni obsolete e catalogo squadre corrotto. Il test end-to-end con PDF Sisal reale e il collaudo fisico su Android restano da eseguire sul dispositivo.

## Novità versione 14 — velocità su smartphone e apertura con rete debole
- **Stampa ed esportazione immediate**: il sistema non viene più rigenerato (1.024 colonne + tabella) a ogni clic su Stampa/CSV/Testo se selezioni, filtri e puntata sono già allineati. Con CPU rallentata 4× (stima di uno smartphone): stampa colonne 5,9 s → 0,3 s, stampa integrale 4,8 s → 0,2 s. Se cambi un filtro e premi subito CSV, i dati restano aggiornati.
- **Tabella a video paginata**: 100 righe alla volta con «Mostra altre 100» / «Mostra tutte». Generazione con CPU 4×: 4,8 s → 0,8 s. CSV, testo e stampe contengono sempre tutte le colonne.
- **Service worker**: l'app si apre dalla cache dopo 3,5 s se la rete è lenta (prima attendeva la rete: 8 s nella prova), la richiesta continua in background e aggiorna la cache. L'HTML viene rivalidato con `cache: 'no-cache'`, così una nuova release non resta nascosta dalla cache HTTP del browser. Se un aggiornamento viene installato mentre l'app è aperta compare un avviso.
- **Stampa colonne**: le quote fisse hanno un riquadro nero oltre al grassetto, visibile anche in bianco e nero e sulle righe grigie.
- **Pulizia**: rimosso codice duplicato nel parser PDF; versione unica della release v14 in tutti i file; 4 nuovi test.


## Novità versione 13 — importazione robusta delle quote mancanti
- **Venezia–Inter non viene più scartata** quando nel PDF manca una singola quota di mercato. Il parser usa le coordinate delle colonne Sisal per conservare correttamente l'associazione tra quota e mercato; nell'esempio, la quota 11,00 resta in «No Ospite» e «Sì Ospite» rimane vuoto.
- **Importazione parziale controllata**: i mercati per cui non è pubblicata una quota non diventano selezionabili. Se le coordinate non consentono un'associazione sicura, la riga viene ancora rifiutata piuttosto che spostare le quote in mercati sbagliati.
- **Diagnostica più chiara**: segnala le partite importate con alcune quote mancanti, specificando i mercati coinvolti.
- **Cache aggiornata**: identificatore di versione v13 per evitare il riutilizzo dei moduli v12.
- **Verifiche**: aggiunto un test mirato a Venezia–Inter e alle colonne delle quote successive.

## Novità versione 12 — ottimizzazioni leggere, offline e icone outline
- **Cache offline dell'app**: aggiunto un service worker che precachea HTML, CSS, moduli, PDF.js locale, elenco squadre e icone. Dopo la prima visita online su HTTPS (o localhost), la parte locale dell'app può riaprirsi offline; il collegamento Sisal e altri contenuti esterni restano online-only. Le quote non vengono inventate o aggiornate dalla cache.
- **Icona in bianco e nero**: le icone PWA, touch e favicon sono state convertite in disegno a contorni neri su bianco. La variante maskable è ridotta per lasciare spazio al ritaglio del launcher; la favicon usa un monogramma SB semplificato per restare leggibile a 32 px.
- **Marchio SB nelle stampe**: aggiunto un logo SB in stile contorno all'intestazione della stampa integrale e alla riga compatta di ogni pagina nella stampa colonne, senza introdurre una riga in più o modificare il limite di 32 combinazioni per foglio.
- **Stagione centralizzata**: la stagione del catalogo predefinito è definita in un unico punto; il testo del pulsante e il messaggio di ripristino non contengono più una stagione hardcoded. Il catalogo incluso è comunque statico e va verificato/aggiornato manualmente quando cambia la stagione; il promemoria resta automatico.
- **CSV più sicuro**: i testi importati che iniziano come formule di foglio elettronico (per esempio `=`, `+`, `-` o `@`) vengono neutralizzati prima dell'esportazione, riducendo il rischio di CSV formula injection.
- **Stime più difensive**: l'app non corregge le probabilità di un mercato completo se le quote non sono valide o se sono presenti esiti duplicati; evita così di esportare probabilità `NaN`/infinite o stime senza base coerente.
- **Collegamento GitHub generico rimosso**: non era collegato a un repository specifico del progetto.
- **Verifiche**: aggiunti test per cache offline, stagione, CSV formula injection, probabilità anomale e marchi outline. La prova offline reale resta da eseguire dopo il primo caricamento HTTPS sul dispositivo.

## Novità versione 11 — firma autore e cache coerente
- **Firma SalHard nelle Info**: aggiunta una firma stilizzata in SVG, accessibile e adattiva, coerente con i colori del tema chiaro/scuro e leggibile su smartphone.
- **Cache-busting aggiornato**: identificatore univoco `?v=` aggiornato in tutti i moduli e nelle risorse dell'interfaccia, per evitare che il browser riutilizzi file della versione precedente dopo l'aggiornamento.
- **Autore dichiarato nei metadati**: aggiunto `meta name="author"`.

## Novità versione 10 — budget totale e doppie tra mercati
- **Due modalità di puntata**: importo per colonna oppure budget totale ripartito sulle colonne effettivamente rimaste dopo i filtri. Nel budget totale la quota per colonna viene arrotondata per difetto ai centesimi; il residuo è mostrato e la spesa non supera il budget. I calcoli economici vengono aggiornati quando cambiano colonne, filtri o modalità.
- **Doppie tra mercati**: oltre a due quote dello stesso mercato, è possibile selezionare due quote di mercati diversi sulla stessa partita (es. 1 + X2 o 1 + Over 2.5). Restano al massimo due scelte per partita e 1.024 colonne per il sistema integrale. In questi sistemi la probabilità che almeno una colonna vinca non viene sommata automaticamente, perché le selezioni possono sovrapporsi.

## Funzionalità della versione 9 — riepilogo economico completo nella stampa integrale
- **Foglio quote stile Excel**: le due squadre restano bloccate a sinistra anche sul desktop; le intestazioni dei mercati restano in alto durante lo scorrimento verticale. Data/ora scorrono dopo i nomi delle squadre, mentre Pal./Avv. sono nascosti negli schermi stretti per lasciare spazio alle quote. Lo scorrimento orizzontale rimane confinato al foglio.
- **Stampa senza fogli vuoti**: orientamento controllato con un'unica regola `@page`; le pagine successive iniziano con `break-before`, senza interruzione forzata dopo l'ultima. La nota di calcolo è nella prima pagina e non può creare una pagina finale quasi vuota.
- **32 combinazioni per foglio**: esattamente 32 righe per A4 orizzontale; dalla combinazione 33 si passa al foglio successivo. Le 1.024 combinazioni generano 32 pagine, non 33.
- **Sistema integrale più curato**: intestazione verde, badge per fisse/doppie, quote senza chiocciole e riepilogo economico con quota minima/massima e vincita netta minima/massima sia per il sistema integrale sia per quello ridotto.
- **Nuovo riepilogo finale**: in fondo alla stampa integrale compaiono colonne massime giocabili, colonne giocate se ridotto, puntata per colonna e spesa totale. I conteggi non vengono ripetuti nell’intestazione né nei titoli dei riepiloghi min/max.
- **Verifiche**: test automatizzati aggiornati; la regressione controlla i nuovi campi e i duplicati. Il collaudo nativo su Android e sulla stampante resta utile perché il print manager può applicare opzioni proprie.

## Novità versione 3
- **Foglio quote**: dopo ogni tocco lo scorrimento orizzontale e il focus restano dove sono (prima tornavano a sinistra); colonne squadra più strette su smartphone, così si vedono più quote.
- **Partite caricate vs selezionate**: si possono caricare fino a 30 partite (`MAX_LOADED_MATCHES` in `js/config.js`), ma selezionarne al massimo 10. Prima un PDF con più di 10 partite di Serie A ne perdeva in silenzio alcune. Per tornare al vecchio comportamento imposta `MAX_LOADED_MATCHES = MAX_MATCHES`.
- **PDF.js incluso** in `vendor/pdfjs/` (v3.11.174, Apache-2.0): import PDF senza CDN e senza supply-chain esterna; i CDN restano come ripiego.
- **Filtri e stampa coerenti**: prima di ogni stampa/esportazione i filtri vengono ricalcolati in modo sincrono. La tabella a video e i file esportati contengono le colonne considerate; la stampa completa mostra anche le escluse, marcate in grigio.
- **CSV per Excel italiano**: numeri con virgola e senza virgolette, colonna probabilità stimata.
- **Probabilità senza aggio** e stima di “almeno una colonna vincente”.
- **Test**: il lanciatore ora attende davvero i test asincroni (prima un fallimento poteva comparire dopo il ✓) e sono stati aggiunti 8 test; versione `?v=` unica in tutti i file (prima due stringhe diverse facevano caricare i moduli due volte).

Web app statica in HTML, CSS e JavaScript vanilla. Nessun backend o installazione richiesta.

1. Carica tutti i file, **compresa la cartella `vendor/pdfjs`**, nella root di un repository GitHub.
2. Apri **Settings → Pages**.
3. Seleziona **Deploy from a branch**, branch `main`, cartella `/ (root)`.
4. Salva e attendi la pubblicazione.
5. Apri l'URL GitHub Pages assegnato al repository. Per aggiungerla alla schermata Home di Android, apri il menu Chrome (⋮) e scegli **Installa app** oppure **Aggiungi a schermata Home**.
6. Su Android, apri il collegamento **Quote Sisal per manifestazione**, scegli **Scarica**, torna all'app e seleziona il PDF salvato in Download/Scaricati. La lettura del file locale evita il blocco CORS sul download dal sito.
7. Seleziona le quote cliccando direttamente la griglia: una quota verde è una fissa, due quote ambra formano una doppia anche tra mercati diversi; il valore numerico H dell’handicap è informativo e non cliccabile. Le quote superiori a 3,00 sono blu; le coppie binarie con entrambe le quote ≤ 2,00 sono rosse. Imposta i filtri e premi **Genera sistema**.
8. Esporta CSV/testo oppure stampa la tabella.

## Limiti noti
- La modalità consigliata su PC e Android è aprire il link diretto al Foglio Quote Sisal per Manifestazione, scaricare il PDF e selezionarlo dal dispositivo. Non viene più tentata l’importazione automatica via URL, evitando i problemi CORS. Il parser PDF è specializzato sul layout del bollettino Sisal: importa esclusivamente Serie A, usa un elenco modificabile dalla finestra “Gestisci elenco squadre Serie A” (una squadra per riga, supporta nomi composti e alias) e richiede tutte le 21 quote decimali nell'ordine della tabella. L’elenco base incluso è quello della Serie A 2026/27; la stagione del catalogo è centralizzata nel parser e da agosto appare un promemoria stagionale che resta visibile finché l’elenco non viene salvato o confermato. Le righe non riconosciute vengono scartate per evitare associazioni errate. Una diagnostica espandibile mostra righe esaminate, rifiuti, conteggio delle quote e duplicati.
- La “probabilità implicita (con aggio)” è 100 ÷ quota totale e sovrastima: ogni quota include il margine del bookmaker, che su più gambe si compone. La “probabilità stimata (senza aggio)” toglie il margine in modo proporzionale sui mercati completi (1X2, Handicap, Doppia Chance, Under/Over, Goal/NoGoal, Segna Goal); dove il mercato è incompleto resta l'implicita. Il riepilogo mostra anche la probabilità che almeno una colonna vinca e il ritorno atteso solo quando le colonne sono mutuamente esclusive; la Doppia Chance o una doppia che combina mercati diversi disabilita questa stima complessiva per evitare di sommare probabilità sovrapposte. Sono stime con partite indipendenti, non garanzie.
- Il ritorno lordo è quota totale × puntata; il profitto teorico sottrae la puntata. Nella stampa colonne si riportano solo quota totale e vincita netta (esclusi eventuali bonus). La stampa conserva tutte le combinazioni sviluppate: le righe non ammesse dai filtri hanno sfondo grigio e sono conteggiate separatamente; il costo totale indicato considera solo le colonne rimaste attive. Prima di stampare o esportare l'app ricalcola subito i filtri, anche se l'ultimo tocco è avvenuto da meno di 300 ms.
- La selezione viene dedotta automaticamente: zero quote = partita esclusa, una quota = fissa, due quote = doppia del sistema, anche se le quote provengono da mercati diversi. Il limite resta di due selezioni per partita. I backup che contengono due selezioni valide di mercati diversi vengono mantenuti come doppie.
- Se il file viene aperto con `file://`, alcuni browser possono limitare i moduli JavaScript. Per provarlo in locale usa un server statico oppure GitHub Pages.

## Test manuali suggeriti
1. Apri il link Sisal, scarica il PDF e selezionalo dal pannello di importazione. Verifica che vengano caricate le partite riconosciute di Serie A.
2. Clicca due quote in due partite (anche appartenenti a mercati diversi): il sistema deve produrre 4 colonne.
3. Con 10 doppie, il sistema deve produrre esattamente 1.024 colonne. Il generatore deve rifiutare 11 partite o più di 2 esiti su una partita variabile.
4. Imposta un filtro dinamico su un esito presente nelle doppie e controlla che il contatore e la tabella si aggiornino. Gli esiti fissi sono esclusi dal catalogo perché presenti in tutte le colonne.
5. Crea quattro doppie selezionando Over 2.5 e Under 2.5 in ognuna; imposta “Over 2.5 · Max = 3” e verifica che restino le colonne con non più di tre Over.
6. Esporta CSV e aprilo con un foglio di calcolo: devono esserci intestazioni e celle correttamente quotate; testi che iniziano con simboli da formula devono avere un apostrofo protettivo.
7. Usa “Stampa colonne”: mostra tutte le combinazioni sviluppate; quelle considerate dai filtri restano normali, quelle escluse hanno sfondo grigio. Le fisse sono in grassetto e, a destra, compaiono soltanto quota totale e vincita netta. Il layout usa A4 orizzontale: esattamente 32 combinazioni per foglio; dalla 33ª combinazione si passa al foglio successivo. Fino a 1.024 combinazioni sono quindi suddivise automaticamente in un massimo di 32 fogli. “Stampa sistema integrale” è impaginata in A4 verticale e va controllata con il numero di partite selezionate.
8. Prova la stampa con 33 combinazioni: il primo foglio deve contenere 32 righe e il secondo una sola; con 1.024 combinazioni devono risultare 32 fogli.
9. Nella stampa integrale verifica che i quattro campi finali compaiano una sola volta e che la spesa totale corrisponda a puntata per colonna × colonne considerate.
10. Da Android, apri il link ufficiale, scegli **Scarica**, poi usa il selettore file della sezione PDF e scegli il bollettino nella cartella Download/Scaricati.

## Limiti e uso da smartphone
L’app è ottimizzata per schermi mobili, compreso Samsung Galaxy A27 5G: controlli touch più ampi, campi e pulsanti adattivi, risultati in schede verticali senza scorrimento orizzontale dell’intera pagina. Solo il foglio quote mantiene lo scorrimento orizzontale, indipendentemente dalla larghezza dello schermo. Le due colonne squadra rimangono congelate a sinistra e le intestazioni dei mercati restano in alto mentre si scorre verticalmente. Il limite è rigido: massimo 10 partite selezionate (se ne possono caricare fino a 30, ad esempio da un PDF con più turni) e 2 esiti per partita. Il sistema integrale può quindi avere al massimo 2¹⁰ = 1.024 colonne; non è configurabile oltre questo valore. Il generatore rifiuta anche richieste che superino i limiti strutturali, indipendentemente dall’interfaccia.

## Stima Bonus Multipla Sisal
L'interfaccia include una stima facoltativa del Bonus Multipla. La stima considera eventi con quota almeno 1,25 e applica un fattore composto del 4% dal quinto evento idoneo, con limite indicativo del 177%. Le FAQ Sisal descrivono, ad esempio, circa +8% per 6 eventi e +12% per 7 eventi idonei. Questa è una simulazione informativa: non certifica che il bonus venga riconosciuto alle singole colonne di un sistema. Controllare sempre il bonus effettivamente mostrato da Sisal sul biglietto prima di confermare. Fonte: https://www.sisal.it/scommesse-matchpoint/faq


## Aggiornamento dell'elenco squadre
Premi “Gestisci elenco squadre Serie A” per aprire la finestra dedicata, poi “Carica elenco ufficiale di riferimento”: l'app legge il file `data/serie-a-teams.json`, distribuito con il progetto e verificato sulla pagina ufficiale della Lega Serie A. La lista viene caricata nell'editor ma non salvata automaticamente: controllala e premi “Salva elenco”. Il pulsante non interroga in tempo reale il sito ufficiale: la pagina web non fornisce un'API pubblica documentata garantita per questo uso e una lettura diretta dal browser potrebbe essere bloccata da CORS. Il file di riferimento deve quindi essere aggiornato con una versione successiva del progetto. Gli alias già associati alle squadre che rimangono in Serie A vengono conservati; gli alias di squadre uscite dal campionato non vengono importati. I nomi composti, ad esempio “Virtus Entella” o “Juve Stabia”, vanno inseriti su una sola riga. Se il PDF usa un'abbreviazione, puoi specificare `Nome ufficiale | alias`. Il promemoria stagionale resta visibile da agosto finché non salvi o confermi l'elenco della stagione corrente.
## Come funzionano i filtri di riduzione
I filtri sugli esiti sono generati dinamicamente in base alle selezioni delle partite doppie. Per ogni esito variabile compaiono “Min” e “Max”: contano quante volte l'esito appare in ogni colonna generata. Un campo vuoto è inattivo; se quattro doppie contengono Over 2.5 e Under 2.5, ad esempio, puoi impostare Over 2.5 `Max = 3` per eliminare le colonne con quattro Over. Il criterio agisce sull'esito esatto. Gli esiti delle partite fisse non vengono proposti come filtri perché sono presenti in tutte le colonne: impostare un limite incompatibile su un esito fisso non ridurrebbe utilmente il sistema e potrebbe azzerarlo. Sono stati rimossi “Soglia quote singole alte”, “Numero massimo di quote sopra soglia” e “Probabilità implicita minima (%)”. I filtri descrivono la composizione delle colonne, non predicono i risultati, e limiti troppo restrittivi possono comunque lasciare zero colonne.
## Test di regressione automatici

Con Node.js 20 o successivo, esegui `npm test`. I test verificano anche i formati legacy del parser e i casi limite, i limiti strutturali del generatore, i conteggi dei filtri Over/Under, l'esclusione delle fisse dal catalogo dei filtri, i requisiti di stampa A4 e l'arresto del parsing ai confini della sezione Serie A (inclusa Serie D).


## Backup e ripristino JSON
Nel pannello “Backup e ripristino delle impostazioni” si può esportare un file JSON contenente partite caricate, esiti selezionati, filtri dinamici, puntata, preferenza Bonus Multipla, tema, elenco squadre e stato della conferma stagionale. Per spostare i dati su un altro dispositivo, scarica il file, apri l'app sul nuovo dispositivo e seleziona “Ripristina da JSON”. Il ripristino chiede conferma e sostituisce le impostazioni locali; il file viene controllato prima di applicare i dati e viene rifiutato se ha un formato sconosciuto, contiene quote non valide o supera il limite di 30 partite caricate. Le colonne generate non vengono conservate: dopo il ripristino premi “Genera sistema” per ricalcolarle con le impostazioni importate. Conserva i backup in una posizione privata: possono contenere quote e combinazioni personali.

## Installazione e controllo prima della generazione
Il pulsante “Installa app” usa il prompt nativo se il browser lo mette a disposizione; altrimenti mostra le istruzioni per Chrome Android o Safari iOS. La disponibilità dipende dal browser e dalle condizioni di installazione del sito. Il service worker salva la shell locale dopo la prima visita online su HTTPS o localhost. Al primo accesso serve una connessione; link esterni, come il PDF Sisal, richiedono comunque Internet. Se una nuova versione viene pubblicata, la cache viene aggiornata con l’identificatore di rilascio.
Prima di generare, un controllo visuale rileva selezioni non collegate alle quote, quote selezionate non valide, doppie incomplete, partite duplicate e, per l'importazione PDF di Serie A, squadre non presenti nell'elenco personalizzato. Se il PDF contiene righe scartate o duplicate, mostra un avviso e chiede conferma prima di continuare; controlla la diagnostica PDF se l'avviso riguarda righe scartate.

## Icona e installazione su Android

Il progetto include icone colorate dedicate (`app-icon-192.png`, `app-icon-512.png`, `app-icon-maskable-512.png` e `app-apple-touch-icon.png`) con bande laterali ridotte e mascotte più grande. Il logo nell’intestazione dell’app resta monocromatico a contorni; la favicon da 32 px usa il monogramma SB per restare leggibile. La pubblicazione deve mantenere tutti questi file e `sw.js` nella radice del sito accanto a `index.html`. Il service worker usa una cache versionata della shell locale; la prima visita richiede HTTPS o localhost e una connessione, mentre le risorse esterne restano disponibili solo online.

## Pulsante Info
Il pulsante **ⓘ Info** in alto a destra apre una guida rapida con le istruzioni per importare il PDF Sisal, i limiti del generatore, i filtri di riduzione, l'esportazione, il backup JSON e l'installazione sulla schermata Home. La finestra si chiude con il pulsante di chiusura, facendo clic sullo sfondo o premendo Esc. Su schermi molto stretti il pulsante viene mostrato come icona per lasciare spazio al titolo.

## Gestione elenco squadre

La gestione delle squadre è stata spostata in una finestra dedicata, aperta dal pulsante “Gestisci elenco squadre Serie A” oppure dal promemoria stagionale. La parte relativa all’anagrafica non occupa più spazio permanente nel pannello d’importazione.
