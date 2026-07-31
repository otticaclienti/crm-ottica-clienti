# Guida: mandare i lead dei form Meta al CRM tramite n8n

Obiettivo: quando arriva un lead da un **form Facebook/Instagram**, n8n lo manda
al CRM e il lead compare nella colonna **"Nuovi Lead"** del cliente giusto —
**in automatico**.

```
Form Meta (Pagina del cliente)  ──►  n8n  ──►  CRM (colonna "Nuovi Lead")
```

## Come fa il CRM a sapere di chi è il lead?

Ogni tuo cliente ha la **sua Pagina Facebook**. Il CRM riconosce il cliente
dall'**ID della Pagina**: lo imposti **una volta** nel CRM, e da quel momento
tutti i lead di quella Pagina finiscono nella pipeline giusta. In n8n **non devi
mettere nessun token**: i workflow sono tutti identici.

---

## PARTE A — Imposta il cliente nel CRM (una volta per cliente)

1. Apri il CRM → **Amministrazione** → seleziona il cliente (es. *Arte Ottica*).
2. Nel riquadro **"Collega i lead"**, campo **ID Pagina Facebook**, incolla
   l'ID della Pagina di quel cliente e premi **Salva collegamento Meta**.
3. Copia anche l'**Indirizzo (URL)** che vedi lì: è **uguale per tutti i
   clienti**, ti serve in n8n.

> **Dove trovo l'ID della Pagina?** Su Facebook → Impostazioni della Pagina →
> "Trasparenza della Pagina" mostra l'ID; oppure, più semplice: importa il
> workflow (Parte B), fai un test, e **dimmi "ho fatto il test"**: leggo io
> l'esecuzione da qui e ti dico l'ID della Pagina da incollare nel CRM.

---

## PARTE B — Crea il workflow in n8n (una volta per cliente)

### Metodo veloce: importa il workflow già pronto

Nel repository c'è il file
[`workflows/meta-to-crm-arte-ottica.json`](../workflows/meta-to-crm-arte-ottica.json):
è già configurato con l'URL del CRM e l'auto-routing per Pagina.

1. In n8n: in alto a destra **⋮ → Import from File…** e carica quel file.
2. Compare un workflow con 3 nodi: **Nuovo Lead da Meta → Normalizza campi →
   Invia al CRM**. Rinominalo col nome del cliente.
3. Clicca il nodo **"Nuovo Lead da Meta"** e imposta:
   - la tua **credenziale Meta** (Business Manager),
   - la **Pagina Facebook** e il **Modulo** di questo cliente.
4. **Save**, poi attiva l'interruttore **Active** in alto.

Non c'è nient'altro da toccare: il nodo "Invia al CRM" è già pronto e uguale per
tutti.

### Per ogni altro cliente

Ripeti Parte A (imposta l'ID Pagina nel CRM) e Parte B (importa il workflow e
scegli la sua Pagina/Modulo). Non cambi né URL né token: **solo la Pagina nel
trigger**.

---

## PARTE C — Collaudo

1. In n8n apri il workflow e clicca **Test workflow** (oppure invia un lead di
   prova dal form Meta con "Strumento di test dei lead" di Meta).
2. Il nodo **"Invia al CRM"** deve rispondere:
   ```json
   { "ok": true, "id": "...", "client": "Arte Ottica" }
   ```
3. Apri il CRM → **Bacheca** del cliente → il lead è in **"Nuovi Lead"**. ✅

Se preferisci, dopo l'import **lo collaudo io da qui**: dimmelo e faccio partire
il workflow, poi ti confermo che il lead è arrivato e ti dico l'ID Pagina
rilevato.

---

## Cosa fa il sistema in automatico

- Riconosce il cliente dall'**ID Pagina** (o Modulo) impostato nel CRM.
- Mette il lead nella **fase d'ingresso** del cliente (di solito "Nuovi Lead").
- **Evita i doppioni**: stesso telefono per lo stesso cliente = non ricreato.

---

## Se qualcosa non va

| Risposta del nodo "Invia al CRM" | Significato | Soluzione |
|---|---|---|
| `{"error":"Cliente non riconosciuto…"}` | l'ID Pagina non è impostato nel CRM | Copia l'`page_id` che vedi nel campo `received` e incollalo nel CRM (Parte A) |
| `{"error":"JSON non valido"}` | body non in formato JSON | Nel nodo: Body Content Type = JSON |
| Errore 401 dal server | il gateway chiede la chiave | Il workflow pronto la include già (header `apikey`); se l'hai costruito a mano, aggiungila |
| `{ "ok": true, "duplicate": true }` | quel telefono esiste già per il cliente | È normale: nessun doppione creato |

---

## (Avanzato) Costruire il nodo a mano

Se non vuoi importare il file, crea un workflow con **Facebook Lead Ads
Trigger** → **HTTP Request** così configurato:

- **Method**: `POST`
- **URL**: `https://azexrewuoantizffdveo.supabase.co/functions/v1/ingest-lead`
- **Headers**: `Content-Type: application/json`
- **Body (JSON)**:
  ```json
  {
    "page_id": "{{ $json.page_id }}",
    "name": "{{ $json.full_name }}",
    "phone": "{{ $json.phone_number }}",
    "email": "{{ $json.email }}",
    "source": "Facebook"
  }
  ```
  (I nomi dei campi dipendono dal tuo form; in n8n, dopo un test, li vedi e li
  trascini al posto giusto. In alternativa a `page_id` puoi usare `"token":
  "<token del cliente>"`.)
