# CRM Ottica — Pipeline & Dashboard (sostituzione GoHighLevel)

Software per gestire le **pipeline (bacheche kanban)** dei lead e una
**dashboard** con i numeri. È **multi-cliente**: ogni cliente ha la sua
pipeline separata e la segretaria di un cliente vede **solo** i suoi lead.

Niente WhatsApp/SMS/email/calendario: solo **pipeline + dashboard**, come da
richiesta.

---

## 🔑 I tuoi accessi (da conservare)

| Cosa | Valore |
|------|--------|
| Indirizzo dell'app | *(lo avrai dopo la pubblicazione su Vercel — vedi guida)* |
| Login amministratore | **otticaclienti@gmail.com** |
| Password temporanea | **OtticaCRM2026!** → cambiala al primo accesso |

> ⚠️ La password è temporanea: entra, vai su una segretaria o chiedi il cambio,
> e comunque cambiala. (Il cambio password admin si fa dal pannello Supabase o
> chiedendo a chi ti gestisce il sistema.)

---

## 🧩 Come è fatto (a parole semplici)

1. **Database (Supabase)** — è il "magazzino" dei dati, in Europa 🇪🇺. Contiene
   clienti, fasi e lead. Ha un "muro" di sicurezza (RLS) che tiene separati i
   clienti: **collaudato**, una segretaria non vede i lead degli altri.
2. **App web (questa cartella)** — la bacheca kanban + dashboard +
   amministrazione. Si pubblica gratis su **Vercel**.
3. **n8n** — riceve i lead dei form Meta e li manda all'app. Vedi
   [`docs/GUIDA-N8N-META.md`](docs/GUIDA-N8N-META.md).

---

## 🚀 Da dove inizio?

1. **Pubblica l'app**: segui [`docs/GUIDA-DEPLOY-VERCEL.md`](docs/GUIDA-DEPLOY-VERCEL.md).
2. **Entra** con l'accesso amministratore qui sopra.
3. Nella **Bacheca** vedrai già il cliente *Arte Ottica* con i **155 lead**
   nelle colonne giuste (importati dal tuo CSV).
4. **Collega i lead nuovi** da Meta: segui [`docs/GUIDA-N8N-META.md`](docs/GUIDA-N8N-META.md).

---

## 🖥️ Cosa puoi fare nell'app

- **Bacheca (kanban)**: trascini i lead da una colonna all'altra per cambiare
  fase. Clicchi un lead per vedere/scrivere le note, cambiare fase, assegnarlo a
  una segretaria, o eliminarlo. Pulsante **+ Aggiungi lead** per inserirli a mano.
  Si aggiorna **in tempo reale** tra più segretarie.
- **Dashboard**: lead totali, nuovi del mese, nuovi ultimi 30 giorni, valore
  totale, lead per fase, per segretaria e per fonte.
- **Amministrazione** (solo tu, il titolare):
  - **Clienti**: aggiungi/rinomina/elimina clienti.
  - **Collega n8n**: per ogni cliente trovi l'indirizzo e il **token** da mettere
    in n8n (con tasto "Copia").
  - **Fasi**: aggiungi/rinomina/riordina/colora le colonne, e scegli la **fase
    d'ingresso** (dove entrano i lead nuovi).
  - **Accessi**: crei/elimini gli accessi delle segretarie e assegni ognuna a un
    cliente. (Niente Supabase da toccare: tutto da qui.)

---

## ➕ Aggiungere un nuovo cliente (5 minuti)

1. **Amministrazione → Clienti → + Aggiungi cliente** (scrivi il nome).
2. **Selezionalo** e, in **Fasi**, crea le sue colonne (o le stesse di Arte
   Ottica).
3. In **Accessi**, crea l'accesso della sua segretaria assegnandola a questo
   cliente.
4. In **Collega n8n**, copia indirizzo + token e crea il collegamento in n8n
   (vedi guida).

---

## 🛠️ Dettagli tecnici (per chi ti aiuta)

- Stack: **React + Vite** (frontend) · **Supabase** (Postgres + Auth + RLS +
  Edge Functions).
- Progetto Supabase: `crm-ottica-clienti` (regione `eu-west-1`).
- Le chiavi pubbliche sono già nel codice (`src/supabaseClient.ts`), sono sicure
  da pubblicare perché i dati sono protetti dalle regole RLS.
- Sviluppo locale: `npm install` poi `npm run dev`.
