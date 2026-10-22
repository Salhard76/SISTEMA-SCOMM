# Sistema Scommesse Builder

Web app statica in HTML, CSS e JavaScript vanilla. Nessun backend o installazione richiesta.

1. Carica i file nella root di un repository GitHub.
2. Apri **Settings → Pages**.
3. Seleziona **Deploy from a branch**, branch `main`, cartella `/ (root)`.
4. Salva e attendi la pubblicazione.
5. Apri l'URL GitHub Pages assegnato al repository.
6. Su Android, apri il collegamento **Apri / scarica PDF ufficiale Sisal**, scegli **Scarica**, torna all'app e seleziona il PDF salvato in Download/Scaricati. La lettura del file locale evita il blocco CORS sul download dal sito.
7. In alternativa, incolla i dati nella sezione manuale, che resta sempre visibile; l'importazione diretta da URL è solo un tentativo facoltativo perché CORS può impedirla.
8. Seleziona gli esiti, imposta i filtri e premi **Genera sistema**.
9. Esporta CSV/testo oppure stampa la tabella.

## Formato manuale
Una partita per riga. Formato consigliato:

`23/10 20:45; Milan; Roma; 2.10; 3.20; 3.60; O2.5=1.90; U2.5=1.85; Goal=1.75; NoGoal=2.00`

Oppure, senza data/ora e senza altri mercati: `Milan - Roma; 2.10; 3.20; 3.60`.
Le prime tre quote numeriche dopo le squadre sono interpretate come 1, X, 2. I campi squadra separati da `;` vanno inseriti come `Casa; Trasferta`, senza mettere le due squadre in un unico campo dopo data/ora. Mercati opzionali supportati: `O2.5=`, `U2.5=`, `Goal=`, `NoGoal=`. Le quote accettano punto o virgola decimale.

## Limiti noti
- Il tentativo di importazione diretta del PDF può essere bloccato da CORS. La modalità consigliata su Android è scaricare prima il PDF Sisal e selezionarlo dal dispositivo. Il parser PDF è specializzato sul layout del bollettino Sisal: importa esclusivamente Serie A, usa un elenco modificabile dal pannello “Aggiorna elenco squadre” (una squadra per riga, supporta nomi composti e alias) e richiede tutte le 21 quote decimali nell'ordine della tabella. L’elenco base è quello della Serie A 2026/27; da agosto appare un promemoria stagionale che resta visibile finché l’elenco non viene salvato o confermato. Le righe non riconosciute vengono scartate per evitare associazioni errate. Una diagnostica espandibile mostra righe esaminate, rifiuti, conteggio delle quote e duplicati.
- Le probabilità sono probabilità implicite derivate dalla quota, non probabilità reali o garanzie.
- Il “ritorno lordo” è quota totale × puntata; il profitto teorico sottrae la puntata.
- Per una fissa viene usato il primo esito selezionato; per una doppia ogni esito selezionato genera un'alternativa combinatoria.
- Se il file viene aperto con `file://`, alcuni browser possono limitare i moduli JavaScript. Per provarlo in locale usa un server statico oppure GitHub Pages.

## Test manuali suggeriti
1. Inserisci `Milan - Roma; 2.10; 3.20; 3.60` e verifica che la partita venga caricata con quote 1X2.
2. Aggiungi una seconda partita e seleziona una doppia per entrambe: il sistema deve produrre 4 colonne.
3. Con 10 doppie, il sistema deve produrre esattamente 1.024 colonne. Il generatore deve rifiutare 11 partite o più di 2 esiti su una partita variabile.
4. Imposta il filtro dinamico “Esito finale · X” a `Max = 0` e controlla che il contatore e la tabella si aggiornino.
5. Crea quattro doppie selezionando Over 2.5 e Under 2.5 in ognuna; imposta “Over 2.5 · Max = 3” e verifica che restino le colonne con non più di tre Over.
6. Esporta CSV e aprilo con un foglio di calcolo: devono esserci intestazioni e celle correttamente quotate.
7. Usa “Stampa tabella”: la stampa deve nascondere input e pannelli non pertinenti.
8. Prova l'URL Sisal: se CORS lo consente, il parser importa esclusivamente le righe della sezione Serie A che rispettano la struttura prevista.
9. Prova un URL irraggiungibile o un URL con CORS bloccato: deve apparire il messaggio che indirizza al download locale, mentre input manuale e selezione file restano disponibili.
10. Da Android, apri il link ufficiale, scegli **Scarica**, poi usa il selettore file della sezione PDF e scegli il bollettino nella cartella Download/Scaricati.

## Limiti e uso da smartphone
L’app è ottimizzata per schermi mobili, compreso Samsung Galaxy A27 5G: controlli touch più ampi, griglia a due colonne quando lo spazio lo consente e tabella risultati scorrevole in orizzontale. Il limite è rigido: massimo 10 partite e 2 esiti per partita. Il sistema integrale può quindi avere al massimo 2¹⁰ = 1.024 colonne; non è configurabile oltre questo valore. Il generatore rifiuta anche richieste che superino i limiti strutturali, indipendentemente dall’interfaccia.

## Stima Bonus Multipla Sisal
L'interfaccia include una stima facoltativa del Bonus Multipla. La stima considera eventi con quota almeno 1,25 e applica un fattore composto del 4% dal quinto evento idoneo, con limite indicativo del 177%. Le FAQ Sisal descrivono, ad esempio, circa +8% per 6 eventi e +12% per 7 eventi idonei. Questa è una simulazione informativa: non certifica che il bonus venga riconosciuto alle singole colonne di un sistema. Controllare sempre il bonus effettivamente mostrato da Sisal sul biglietto prima di confermare. Fonte: https://www.sisal.it/scommesse-matchpoint/faq


## Aggiornamento dell'elenco squadre
Nella sezione “Elenco squadre Serie A” premi “Carica elenco ufficiale di riferimento”: l'app legge il file `data/serie-a-teams.json`, distribuito con il progetto e verificato sulla pagina ufficiale della Lega Serie A. La lista viene caricata nell'editor ma non salvata automaticamente: controllala e premi “Salva elenco”. Il pulsante non interroga in tempo reale il sito ufficiale: la pagina web non fornisce un'API pubblica documentata garantita per questo uso e una lettura diretta dal browser potrebbe essere bloccata da CORS. Il file di riferimento deve quindi essere aggiornato con una versione successiva del progetto. Gli alias già associati alle squadre che rimangono in Serie A vengono conservati; gli alias di squadre uscite dal campionato non vengono importati. I nomi composti, ad esempio “Virtus Entella” o “Juve Stabia”, vanno inseriti su una sola riga. Se il PDF usa un'abbreviazione, puoi specificare `Nome ufficiale | alias`. Il promemoria stagionale resta visibile da agosto finché non salvi o confermi l'elenco della stagione corrente.
## Come funzionano i filtri di riduzione
I filtri sugli esiti sono generati in base a quelli selezionati nelle partite. Per ogni tipo di esito compaiono “Min” e “Max”: contano quante volte l'esito appare in ogni colonna generata. Un campo vuoto è inattivo; se quattro doppie contengono Over 2.5 e Under 2.5, ad esempio, puoi impostare Over 2.5 `Max = 3` per eliminare le colonne con quattro Over. Il criterio agisce sull'esito esatto, non su tutte le quote del mercato in generale. I filtri per esito si applicano insieme; anche il filtro opzionale “Numero massimo di quote sopra soglia” può restringere ulteriormente le colonne. La soglia singola preimpostata a 3,00 non agisce da sola: bisogna compilare il massimo. Sono stati rimossi i filtri sulla quota totale minima e massima; resta facoltativo il filtro sulla probabilità implicita minima, calcolata come 100 diviso la quota totale. I filtri descrivono la composizione delle colonne: non predicono i risultati e possono anche eliminare tutte le colonne.
## Test di regressione automatici

Con Node.js 20 o successivo, esegui `npm test`. I test verificano formati manuali comuni e casi limite, i limiti strutturali del generatore, i conteggi dei filtri Over/Under e l'arresto del parsing ai confini della sezione Serie A (inclusa Serie D).
