# Guida: pubblicare l'app su Vercel (gratis)

Obiettivo: mettere l'app online con un indirizzo web (es.
`https://crm-ottica.vercel.app`) che tu e le segretarie userete dal browser.

Tempo: ~10 minuti. Non serve saper programmare.

---

## Passo 1 — Crea un account Vercel

1. Vai su **https://vercel.com** e clicca **Sign Up**.
2. Scegli **Continue with GitHub** (così Vercel prende il codice direttamente
   dal repository). Se non hai GitHub, creane uno gratis su github.com.

---

## Passo 2 — Collega il repository

1. Su Vercel clicca **Add New… → Project**.
2. Nella lista compare il repository **`crm-ottica-clienti`**. Clicca **Import**.
   - Se non lo vedi, clicca "Adjust GitHub App Permissions" e dai a Vercel
     l'accesso al repository.

---

## Passo 3 — Impostazioni (già a posto)

Vercel riconosce da solo che è un progetto **Vite**. Dovresti vedere:

- **Framework Preset**: `Vite`
- **Build Command**: `npm run build`
- **Output Directory**: `dist`

> Le chiavi del database sono già incluse nel codice, quindi **non devi
> configurare nessuna variabile d'ambiente**. Puoi lasciare tutto com'è.

Clicca **Deploy**.

---

## Passo 4 — Fatto!

Dopo 1-2 minuti Vercel mostra "🎉 Congratulations" e un indirizzo tipo
`https://crm-ottica-clienti.vercel.app`.

1. Aprilo.
2. Accedi con:
   - Email: **otticaclienti@gmail.com**
   - Password: **OtticaCRM2026!**
3. Vedrai la bacheca di **Arte Ottica** con i 155 lead. ✅

**Salva quell'indirizzo** e comunicalo alle segretarie (ognuna con il proprio
accesso, che crei tu da *Amministrazione → Accessi*).

---

## Aggiornamenti futuri

Ogni volta che il codice nel repository cambia, Vercel ripubblica l'app **da
solo**. Tu non devi fare niente.

---

## Domande frequenti

**Quanto costa?** Il piano gratuito di Vercel e di Supabase è più che
sufficiente per un'agenzia. Zero euro.

**Posso usare un mio dominio** (es. `crm.miaagenzia.it`)? Sì: su Vercel →
Project → **Settings → Domains** → aggiungi il dominio e segui le istruzioni.

**L'indirizzo è pubblico: è un problema?** No. Senza email e password non si
entra, e ogni segretaria vede solo il suo cliente (protezione a livello di
database, già collaudata).
