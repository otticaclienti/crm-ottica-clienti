# Come arrivano i lead da Meta al CRM (soluzione finale)

Dopo vari tentativi con il login OAuth di n8n (bloccato da limiti/permessi di
Meta), abbiamo adottato una soluzione **più semplice e robusta**: il CRM va a
prendere i lead da solo, senza n8n e senza login interattivo.

```
Meta (Pagine dei clienti)  ──►  Funzione "pull-meta-leads" nel CRM  ──►  pipeline
                                 (parte da sola ogni 15 minuti)
```

## Come funziona

1. **Token Meta** salvato nel CRM (tabella `app_settings`, chiave `meta_token`).
2. Una **funzione** (`pull-meta-leads`) usa il token per:
   - elencare le Pagine collegate,
   - leggere i moduli lead di ogni Pagina e i relativi lead,
   - inserirli nella pipeline del cliente giusto (in base all'**ID Pagina**
     impostato su ogni cliente),
   - **evitare i doppioni** (confronto su telefono normalizzato + email).
3. Una **pianificazione** interna (pg_cron) esegue la funzione **ogni 15
   minuti**. I nuovi lead compaiono nella colonna "Nuovi Lead" da soli.

## Cosa serve per ogni cliente

- Nel CRM: **Amministrazione → cliente → Collega i lead → ID Pagina Facebook**.
- Che la Pagina del cliente sia accessibile dal token (il token deve avere
  l'accesso ai lead di quella Pagina). Le Pagine non accessibili vengono
  semplicemente saltate.

## ⚠️ Il token va reso PERMANENTE

Il token generato con "Ricevi token" nella schermata dell'app dura poche ore.
Per far funzionare tutto **in modo continuo** serve un **token di System User**
(non scade mai):

1. Vai su **business.facebook.com → Impostazioni business**.
2. **Utenti → Utenti di sistema** → **Aggiungi** (es. "CRM Lettura Lead"),
   ruolo Admin.
3. **Aggiungi risorse**: assegna a questo utente di sistema le **Pagine** dei
   clienti (con accesso ai lead) e l'**app "crm 1 oc"**.
4. **Genera nuovo token** → app "crm 1 oc" → scadenza **Mai** → permessi:
   `leads_retrieval`, `pages_show_list`, `pages_read_engagement`,
   `pages_manage_ads`, `business_management`.
5. Copia il token e sostituiscilo nel CRM (tabella `app_settings`, chiave
   `meta_token`).

## Aggiungere un nuovo cliente

1. Crea il cliente e le sue fasi (Amministrazione).
2. Imposta l'**ID Pagina Facebook** del cliente.
3. Assegna quella Pagina all'utente di sistema (passo 3 qui sopra), così il
   token può leggerne i lead.
4. Fatto: al giro successivo (max 15 min) i suoi lead iniziano a entrare.

## Nota

I workflow n8n creati durante i test (`workflows/*.json`) **non servono più**
con questa soluzione: puoi eliminarli da n8n. Restano nel repository solo come
riferimento storico.
