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

## Il token (già configurato)

I clienti sono **partner** nel Portfolio, e Meta **non permette** di usare un
"Utente di sistema" con token permanente sulle Pagine dei partner. Quindi usiamo
il **token del tuo account** (che ha già accesso ai lead di tutte le Pagine):

- Il token è stato **allungato** a lunga durata (non scade) ed è salvato in
  `app_settings.meta_token`.
- Per ogni cliente salviamo anche la **chiave permanente della Pagina**
  (`clients.meta_page_token`), che è la più stabile.

### ⚠️ Rinnovo ogni ~90 giorni (regola di Meta)

Meta impone che l'**accesso ai dati** venga ri-autorizzato ogni ~90 giorni
(attualmente **fino al 29/10/2026**). Quando si avvicina la scadenza:

1. Nell'app Meta → **Casi d'uso → Personalizza → Strumenti → Ricevi token**
   (permessi: `leads_retrieval`, `pages_show_list`, `pages_read_engagement`,
   `pages_manage_ads`, `business_management`) → copia il nuovo token.
2. Salvalo nel CRM sovrascrivendo `app_settings.meta_token` e ri-allungalo con
   l'App ID + App Secret (endpoint `oauth/access_token?grant_type=fb_exchange_token`).
3. Aggiorna le chiavi Pagina (`clients.meta_page_token`) da `me/accounts`.

(Se serve, chiedi assistenza: sono 3 comandi SQL, 2 minuti.)

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
