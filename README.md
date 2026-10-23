# Sistema Scommesse Builder

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
5. Apri l'URL GitHub Pages assegnato al repository. Per aggiungerla alla schermata Home di Android, apri il menu Chrome (⋮) e scegli **Installa app** oppure **Aggiungi a schermata Home**: l'icona usa la stessa mascotte La(a)rfleeze già impiegata in Cammafà.
6. Su Android, apri il collegamento **Apri / scarica PDF ufficiale Sisal**, scegli **Scarica**, torna all'app e seleziona il PDF salvato in Download/Scaricati. La lettura del file locale evita il blocco CORS sul download dal sito.
7. In alternativa, incolla i dati nella sezione manuale, che resta sempre disponibile.
8. Seleziona le quote cliccando direttamente la griglia: una quota verde è una fissa, due quote ambra formano una doppia anche tra mercati diversi; il valore numerico H dell’handicap è informativo e non cliccabile. Imposta i filtri e premi **Genera sistema**.
9. Esporta CSV/testo oppure stampa la tabella.

## Formato manuale
Una partita per riga. Formato consigliato:

`23/10 20:45; Milan; Roma; 2.10; 3.20; 3.60; O2.5=1.90; U2.5=1.85; Goal=1.75; NoGoal=2.00`

Oppure, senza data/ora e senza altri mercati: `Milan - Roma; 2.10; 3.20; 3.60`.
Le prime tre quote numeriche dopo le squadre sono interpretate come 1, X, 2. I campi squadra separati da `;` vanno inseriti come `Casa; Trasferta`, senza mettere le due squadre in un unico campo dopo data/ora. Mercati opzionali supportati: `O2.5=`, `U2.5=`, `Goal=`, `NoGoal=`. Le quote accettano punto o virgola decimale.

## Limiti noti
- La modalità consigliata su PC e Android è aprire il link diretto al Foglio Quote Sisal per Manifestazione, scaricare il PDF e selezionarlo dal dispositivo. Non viene più tentata l’importazione automatica via URL, evitando i problemi CORS. Il parser PDF è specializzato sul layout del bollettino Sisal: importa esclusivamente Serie A, usa un elenco modificabile dalla finestra “Gestisci elenco squadre Serie A” (una squadra per riga, supporta nomi composti e alias) e richiede tutte le 21 quote decimali nell'ordine della tabella. L’elenco base è quello della Serie A 2026/27; da agosto appare un promemoria stagionale che resta visibile finché l’elenco non viene salvato o confermato. Le righe non riconosciute vengono scartate per evitare associazioni errate. Una diagnostica espandibile mostra righe esaminate, rifiuti, conteggio delle quote e duplicati.
- La “probabilità implicita (con aggio)” è 100 ÷ quota totale e sovrastima: ogni quota include il margine del bookmaker, che su più gambe si compone. La “probabilità stimata (senza aggio)” toglie il margine in modo proporzionale sui mercati completi (1X2, Handicap, Doppia Chance, Under/Over, Goal/NoGoal, Segna Goal); dove il mercato è incompleto resta l'implicita. Il riepilogo mostra anche la probabilità che almeno una colonna vinca e il ritorno atteso solo quando le colonne sono mutuamente esclusive; la Doppia Chance o una doppia che combina mercati diversi disabilita questa stima complessiva per evitare di sommare probabilità sovrapposte. Sono stime con partite indipendenti, non garanzie.
- Il ritorno lordo è quota totale × puntata; il profitto teorico sottrae la puntata. Nella stampa colonne si riportano solo quota totale e vincita netta (esclusi eventuali bonus). La stampa conserva tutte le combinazioni sviluppate: le righe non ammesse dai filtri hanno sfondo grigio e sono conteggiate separatamente; il costo totale indicato considera solo le colonne rimaste attive. Prima di stampare o esportare l'app ricalcola subito i filtri, anche se l'ultimo tocco è avvenuto da meno di 300 ms.
- La selezione viene dedotta automaticamente: zero quote = partita esclusa, una quota = fissa, due quote = doppia del sistema, anche se le quote provengono da mercati diversi. Il limite resta di due selezioni per partita. I backup che contengono due selezioni valide di mercati diversi vengono mantenuti come doppie.
- Se il file viene aperto con `file://`, alcuni browser possono limitare i moduli JavaScript. Per provarlo in locale usa un server statico oppure GitHub Pages.

## Test manuali suggeriti
1. Inserisci `Milan - Roma; 2.10; 3.20; 3.60` e verifica che la partita venga caricata con quote 1X2.
2. Aggiungi una seconda partita e clicca due quote in entrambe le righe (anche appartenenti a mercati diversi): il sistema deve produrre 4 colonne.
3. Con 10 doppie, il sistema deve produrre esattamente 1.024 colonne. Il generatore deve rifiutare 11 partite o più di 2 esiti su una partita variabile.
4. Imposta un filtro dinamico su un esito presente nelle doppie e controlla che il contatore e la tabella si aggiornino. Gli esiti fissi sono esclusi dal catalogo perché presenti in tutte le colonne.
5. Crea quattro doppie selezionando Over 2.5 e Under 2.5 in ognuna; imposta “Over 2.5 · Max = 3” e verifica che restino le colonne con non più di tre Over.
6. Esporta CSV e aprilo con un foglio di calcolo: devono esserci intestazioni e celle correttamente quotate.
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

Con Node.js 20 o successivo, esegui `npm test`. I test verificano formati manuali comuni e casi limite, i limiti strutturali del generatore, i conteggi dei filtri Over/Under, l'esclusione delle fisse dal catalogo dei filtri, i requisiti di stampa A4 e l'arresto del parsing ai confini della sezione Serie A (inclusa Serie D).


## Backup e ripristino JSON
Nel pannello “Backup e ripristino delle impostazioni” si può esportare un file JSON contenente partite caricate, esiti selezionati, filtri dinamici, puntata, preferenza Bonus Multipla, tema, testo manuale, elenco squadre e stato della conferma stagionale. Per spostare i dati su un altro dispositivo, scarica il file, apri l'app sul nuovo dispositivo e seleziona “Ripristina da JSON”. Il ripristino chiede conferma e sostituisce le impostazioni locali; il file viene controllato prima di applicare i dati e viene rifiutato se ha un formato sconosciuto, contiene quote non valide o supera il limite di 30 partite caricate. Le colonne generate non vengono conservate: dopo il ripristino premi “Genera sistema” per ricalcolarle con le impostazioni importate. Conserva i backup in una posizione privata: possono contenere quote e combinazioni personali.

## Installazione e controllo prima della generazione
Il pulsante “Installa app” usa il prompt nativo se il browser lo mette a disposizione; altrimenti mostra le istruzioni per Chrome Android o Safari iOS. La disponibilità dipende dal browser e dalle condizioni di installazione del sito. Il progetto non registra un service worker e non promette funzionamento offline.
Prima di generare, un controllo visuale rileva selezioni non collegate alle quote, quote selezionate non valide, doppie incomplete, partite duplicate e, per l'importazione PDF di Serie A, squadre non presenti nell'elenco personalizzato. Se il PDF contiene righe scartate o duplicate, mostra un avviso e chiede conferma prima di continuare; controlla la diagnostica PDF se l'avviso riguarda righe scartate.

## Icona e installazione su Android

Il progetto include `manifest.webmanifest`, icone PNG da 192 e 512 px, una variante maskable, favicon e icona Apple Touch. L'immagine principale riutilizza esattamente l'icona La(a)rfleeze già presente nel pacchetto Cammafà. La pubblicazione deve mantenere tutti questi file nella radice del sito accanto a `index.html`. Non viene registrato un service worker: l'app non promette funzionamento offline e gli aggiornamenti pubblicati non restano bloccati da una cache offline dedicata.

## Pulsante Info
Il pulsante **ⓘ Info** in alto a destra apre una guida rapida con le istruzioni per importare il PDF Sisal o inserire quote manualmente, i limiti del generatore, i filtri di riduzione, l'esportazione, il backup JSON e l'installazione sulla schermata Home. La finestra si chiude con il pulsante di chiusura, facendo clic sullo sfondo o premendo Esc. Su schermi molto stretti il pulsante viene mostrato come icona per lasciare spazio al titolo.

## Gestione elenco squadre

La gestione delle squadre è stata spostata in una finestra dedicata, aperta dal pulsante “Gestisci elenco squadre Serie A” oppure dal promemoria stagionale. La parte relativa all’anagrafica non occupa più spazio permanente nel pannello d’importazione.
