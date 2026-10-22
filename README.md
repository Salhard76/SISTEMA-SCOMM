# Sistema Scommesse Builder

Web app statica in HTML, CSS e JavaScript vanilla. Nessun backend o installazione richiesta.

1. Carica i file nella root di un repository GitHub.
2. Apri **Settings → Pages**.
3. Seleziona **Deploy from a branch**, branch `main`, cartella `/ (root)`.
4. Salva e attendi la pubblicazione.
5. Apri l'URL GitHub Pages assegnato al repository.
6. Inserisci quote manuali o prova l'importazione PDF; CORS può impedirla.
7. Seleziona gli esiti, imposta i filtri e premi **Genera sistema**.
8. Esporta CSV/testo oppure stampa la tabella.

## Formato manuale
Una partita per riga. Formato consigliato:

`23/10 20:45; Milan - Roma; 2.10; 3.20; 3.60; O2.5=1.90; U2.5=1.85; Goal=1.75; NoGoal=2.00`

Le prime tre quote numeriche dopo le squadre sono interpretate come 1, X, 2. Mercati opzionali supportati: `O2.5=`, `U2.5=`, `Goal=`, `NoGoal=`. Le quote accettano punto o virgola decimale.

## Limiti noti
- L'importazione PDF dipende da CORS e dalla struttura del PDF Sisal, che può cambiare. Il parser PDF è specializzato sul layout Sisal del bollettino fornito: importa esclusivamente Serie A, usa un elenco configurabile delle squadre e richiede tutte le 21 quote decimali nell'ordine della tabella. Le righe non riconosciute vengono scartate per evitare associazioni errate.
- Le probabilità sono probabilità implicite derivate dalla quota, non probabilità reali o garanzie.
- Il “ritorno lordo” è quota totale × puntata; il profitto teorico sottrae la puntata.
- Per una fissa viene usato il primo esito selezionato; per una doppia ogni esito selezionato genera un'alternativa combinatoria.
- Se il file viene aperto con `file://`, alcuni browser possono limitare i moduli JavaScript. Per provarlo in locale usa un server statico oppure GitHub Pages.

## Test manuali suggeriti
1. Inserisci `Milan - Roma; 2.10; 3.20; 3.60` e verifica che la partita venga caricata con quote 1X2.
2. Aggiungi una seconda partita e seleziona una doppia per entrambe: il sistema deve produrre 4 colonne.
3. Imposta “Pareggi massimi” a 0 e controlla che il contatore e la tabella si aggiornino.
4. Imposta quota minima maggiore di tutte le colonne: il risultato deve essere vuoto senza errori.
5. Esporta CSV e aprilo con un foglio di calcolo: devono esserci intestazioni e celle correttamente quotate.
6. Usa “Stampa tabella”: la stampa deve nascondere input e pannelli non pertinenti.
7. Prova l'URL Sisal: se CORS lo consente, il parser importa esclusivamente le righe della sezione Serie A che rispettano la struttura prevista.
8. Prova un URL irraggiungibile o un URL con CORS bloccato: deve apparire il messaggio d'errore e l'input manuale deve restare utilizzabile.

## Limiti e uso da smartphone
L’app è ottimizzata per schermi mobili, compreso Samsung Galaxy A27 5G: controlli touch più ampi, griglia a due colonne quando lo spazio lo consente e tabella risultati scorrevole in orizzontale. Il limite di 10 partite viene applicato anche al ripristino della sessione; ogni doppia ammette al massimo 2 esiti.

## Stima Bonus Multipla Sisal
L'interfaccia include una stima facoltativa del Bonus Multipla. La stima considera eventi con quota almeno 1,25 e applica un fattore composto del 4% dal quinto evento idoneo, con limite indicativo del 177%. Le FAQ Sisal descrivono, ad esempio, circa +8% per 6 eventi e +12% per 7 eventi idonei. Questa è una simulazione informativa: non certifica che il bonus venga riconosciuto alle singole colonne di un sistema. Controllare sempre il bonus effettivamente mostrato da Sisal sul biglietto prima di confermare. Fonte: https://www.sisal.it/scommesse-matchpoint/faq
