import { useEffect, useState } from "react";
import { supabase, INGEST_FN_URL } from "../supabaseClient";
import type { Client, Stage } from "../types";

/* Chiamata alla funzione protetta che gestisce gli utenti */
async function callAdmin(action: string, payload: Record<string, unknown> = {}) {
  const { data, error } = await supabase.functions.invoke("admin-user", {
    body: { action, ...payload },
  });
  if (error) {
    // prova a leggere il messaggio dettagliato dalla risposta
    let msg = error.message;
    try {
      const ctx = (error as any).context;
      if (ctx && typeof ctx.json === "function") {
        const j = await ctx.json();
        if (j?.error) msg = j.error;
      }
    } catch {
      /* ignora */
    }
    return { error: msg };
  }
  return data as any;
}

interface SecretaryRow {
  id: string;
  role: string;
  client_id: string | null;
  full_name: string | null;
  email: string;
}

export default function Admin({
  clients,
  onClientsChanged,
}: {
  clients: Client[];
  onClientsChanged: () => void;
}) {
  const [selClient, setSelClient] = useState<string | null>(
    clients[0]?.id ?? null
  );

  useEffect(() => {
    if (!selClient && clients[0]) setSelClient(clients[0].id);
  }, [clients, selClient]);

  const current = clients.find((c) => c.id === selClient) ?? null;

  return (
    <div className="page">
      <h1>Amministrazione</h1>
      <p className="sub">
        Gestisci clienti, fasi e accessi. Qui trovi anche i dati per collegare
        n8n.
      </p>

      <ClientsPanel
        clients={clients}
        onChanged={onClientsChanged}
        selClient={selClient}
        setSelClient={setSelClient}
      />

      {current && (
        <>
          <ConnectPanel client={current} onChanged={onClientsChanged} />
          <StagesPanel client={current} />
        </>
      )}

      <UsersPanel clients={clients} />
    </div>
  );
}

/* ---------------- Clienti ---------------- */
function ClientsPanel({
  clients,
  onChanged,
  selClient,
  setSelClient,
}: {
  clients: Client[];
  onChanged: () => void;
  selClient: string | null;
  setSelClient: (id: string) => void;
}) {
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState(false);

  async function addClient() {
    if (!newName.trim()) return;
    setBusy(true);
    const { error } = await supabase
      .from("clients")
      .insert({ name: newName.trim() });
    setBusy(false);
    if (error) return alert(error.message);
    setNewName("");
    onChanged();
  }

  async function rename(c: Client) {
    const n = prompt("Nuovo nome cliente:", c.name);
    if (!n || !n.trim()) return;
    const { error } = await supabase
      .from("clients")
      .update({ name: n.trim() })
      .eq("id", c.id);
    if (error) return alert(error.message);
    onChanged();
  }

  async function del(c: Client) {
    if (
      !confirm(
        `Eliminare il cliente "${c.name}"? Verranno cancellati anche le sue fasi e TUTTI i suoi lead. Operazione non annullabile.`
      )
    )
      return;
    const { error } = await supabase.from("clients").delete().eq("id", c.id);
    if (error) return alert(error.message);
    onChanged();
  }

  return (
    <div className="panel">
      <h2>Clienti</h2>
      <table className="table">
        <thead>
          <tr>
            <th>Nome</th>
            <th style={{ width: 260 }}></th>
          </tr>
        </thead>
        <tbody>
          {clients.map((c) => (
            <tr key={c.id}>
              <td>
                <b>{c.name}</b>
              </td>
              <td style={{ textAlign: "right" }}>
                <button
                  className="btn small"
                  onClick={() => setSelClient(c.id)}
                  style={{
                    marginRight: 6,
                    ...(selClient === c.id
                      ? { borderColor: "var(--brand)", color: "var(--brand)" }
                      : {}),
                  }}
                >
                  {selClient === c.id ? "● Selezionato" : "Gestisci"}
                </button>
                <button
                  className="btn small"
                  onClick={() => rename(c)}
                  style={{ marginRight: 6 }}
                >
                  Rinomina
                </button>
                <button className="btn small danger" onClick={() => del(c)}>
                  Elimina
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
        <input
          className="field"
          style={{ flex: 1, padding: 9 }}
          placeholder="Nome nuovo cliente (es. Ottica Rossi)"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
        />
        <button className="btn primary" onClick={addClient} disabled={busy}>
          + Aggiungi cliente
        </button>
      </div>
    </div>
  );
}

/* ---------------- Collegamento n8n ---------------- */
function ConnectPanel({
  client,
  onChanged,
}: {
  client: Client;
  onChanged: () => void;
}) {
  const [pageId, setPageId] = useState(client.meta_page_id ?? "");
  const [formId, setFormId] = useState(client.meta_form_id ?? "");
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  // Riallinea i campi quando cambio cliente selezionato
  useEffect(() => {
    setPageId(client.meta_page_id ?? "");
    setFormId(client.meta_form_id ?? "");
    setSaved(false);
  }, [client.id]);

  async function save() {
    setBusy(true);
    const { error } = await supabase
      .from("clients")
      .update({
        meta_page_id: pageId.trim() || null,
        meta_form_id: formId.trim() || null,
      })
      .eq("id", client.id);
    setBusy(false);
    if (error) return alert(error.message);
    setSaved(true);
    setTimeout(() => setSaved(false), 1800);
    onChanged();
  }

  return (
    <div className="panel">
      <h2>Collega i lead di {client.name} (n8n / Meta)</h2>
      <p style={{ color: "var(--muted)", marginTop: -6 }}>
        I lead di Meta arrivano tramite n8n. Il CRM riconosce da solo il cliente
        dalla <b>Pagina Facebook</b>: inserisci qui sotto l'ID della Pagina di
        questo cliente e non dovrai mettere nessun token in n8n.
      </p>

      <div className="field">
        <label>Indirizzo (URL) a cui n8n invia i lead — uguale per tutti</label>
        <CopyRow text={INGEST_FN_URL} />
      </div>

      <div style={{ display: "flex", gap: 12 }}>
        <div className="field" style={{ flex: 1 }}>
          <label>ID Pagina Facebook di {client.name}</label>
          <input
            value={pageId}
            onChange={(e) => setPageId(e.target.value)}
            placeholder="es. 1234567890"
          />
        </div>
        <div className="field" style={{ flex: 1 }}>
          <label>ID Modulo Facebook (facoltativo)</label>
          <input
            value={formId}
            onChange={(e) => setFormId(e.target.value)}
            placeholder="solo se vuoi distinguere per modulo"
          />
        </div>
      </div>
      <button className="btn primary" onClick={save} disabled={busy}>
        {saved ? "Salvato ✓" : busy ? "Salvo…" : "Salva collegamento Meta"}
      </button>

      <details style={{ marginTop: 14 }}>
        <summary style={{ cursor: "pointer", color: "var(--muted)" }}>
          Metodo alternativo: usa un token invece della Pagina
        </summary>
        <div className="field" style={{ marginTop: 10 }}>
          <label>Token di {client.name}</label>
          <CopyRow text={client.ingest_token} />
        </div>
      </details>
    </div>
  );
}

function CopyRow({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
      <span className="mono" style={{ flex: 1 }}>
        {text}
      </span>
      <button
        className="btn small"
        onClick={() => {
          navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
      >
        {copied ? "Copiato ✓" : "Copia"}
      </button>
    </div>
  );
}

/* ---------------- Fasi ---------------- */
function StagesPanel({ client }: { client: Client }) {
  const [stages, setStages] = useState<Stage[]>([]);
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState("#2563eb");

  async function load() {
    const { data } = await supabase
      .from("stages")
      .select("*")
      .eq("client_id", client.id)
      .order("position");
    setStages((data as Stage[]) ?? []);
  }
  useEffect(() => {
    load();
  }, [client.id]);

  async function add() {
    if (!newName.trim()) return;
    const pos = stages.length
      ? Math.max(...stages.map((s) => s.position)) + 1
      : 1;
    const { error } = await supabase.from("stages").insert({
      client_id: client.id,
      name: newName.trim(),
      color: newColor,
      position: pos,
      is_entry: stages.length === 0,
    });
    if (error) return alert(error.message);
    setNewName("");
    load();
  }

  async function rename(s: Stage) {
    const n = prompt("Nuovo nome fase:", s.name);
    if (!n || !n.trim()) return;
    await supabase.from("stages").update({ name: n.trim() }).eq("id", s.id);
    load();
  }

  async function setColor(s: Stage, color: string) {
    await supabase.from("stages").update({ color }).eq("id", s.id);
    load();
  }

  async function move(s: Stage, dir: -1 | 1) {
    const idx = stages.findIndex((x) => x.id === s.id);
    const other = stages[idx + dir];
    if (!other) return;
    await Promise.all([
      supabase
        .from("stages")
        .update({ position: other.position })
        .eq("id", s.id),
      supabase
        .from("stages")
        .update({ position: s.position })
        .eq("id", other.id),
    ]);
    load();
  }

  async function setEntry(s: Stage) {
    await supabase
      .from("stages")
      .update({ is_entry: false })
      .eq("client_id", client.id);
    await supabase.from("stages").update({ is_entry: true }).eq("id", s.id);
    load();
  }

  async function del(s: Stage) {
    if (
      !confirm(
        `Eliminare la fase "${s.name}"? Puoi farlo solo se non contiene lead.`
      )
    )
      return;
    const { error } = await supabase.from("stages").delete().eq("id", s.id);
    if (error)
      return alert(
        "Impossibile eliminare: probabilmente la fase contiene ancora dei lead. Spostali prima altrove."
      );
    load();
  }

  return (
    <div className="panel">
      <h2>Fasi (colonne) di {client.name}</h2>
      <table className="table">
        <thead>
          <tr>
            <th style={{ width: 40 }}>#</th>
            <th>Fase</th>
            <th style={{ width: 70 }}>Colore</th>
            <th style={{ width: 110 }}>Ingresso</th>
            <th style={{ width: 220 }}></th>
          </tr>
        </thead>
        <tbody>
          {stages.map((s, i) => (
            <tr key={s.id}>
              <td>{i + 1}</td>
              <td>
                <span
                  className="col-dot"
                  style={{
                    background: s.color || "#94a3b8",
                    display: "inline-block",
                    marginRight: 8,
                  }}
                />
                {s.name}
              </td>
              <td>
                <input
                  type="color"
                  value={s.color || "#94a3b8"}
                  onChange={(e) => setColor(s, e.target.value)}
                  style={{ width: 36, height: 26, border: "none" }}
                />
              </td>
              <td>
                {s.is_entry ? (
                  <span className="tag src">● ingresso</span>
                ) : (
                  <button
                    className="btn small"
                    onClick={() => setEntry(s)}
                    title="I nuovi lead da n8n entrano qui"
                  >
                    imposta
                  </button>
                )}
              </td>
              <td style={{ textAlign: "right" }}>
                <button
                  className="btn small"
                  onClick={() => move(s, -1)}
                  disabled={i === 0}
                >
                  ↑
                </button>{" "}
                <button
                  className="btn small"
                  onClick={() => move(s, 1)}
                  disabled={i === stages.length - 1}
                >
                  ↓
                </button>{" "}
                <button className="btn small" onClick={() => rename(s)}>
                  Rinomina
                </button>{" "}
                <button className="btn small danger" onClick={() => del(s)}>
                  Elimina
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
        <input
          type="color"
          value={newColor}
          onChange={(e) => setNewColor(e.target.value)}
          style={{ width: 40, height: 38, border: "none" }}
        />
        <input
          className="field"
          style={{ flex: 1, padding: 9 }}
          placeholder="Nome nuova fase"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
        />
        <button className="btn primary" onClick={add}>
          + Aggiungi fase
        </button>
      </div>
    </div>
  );
}

/* ---------------- Utenti / Segretarie ---------------- */
function UsersPanel({ clients }: { clients: Client[] }) {
  const [users, setUsers] = useState<SecretaryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [clientId, setClientId] = useState(clients[0]?.id ?? "");

  async function load() {
    setLoading(true);
    const res = await callAdmin("list_users");
    setLoading(false);
    if (res.error) return setErr(res.error);
    setUsers(res.users as SecretaryRow[]);
  }
  useEffect(() => {
    load();
  }, []);
  useEffect(() => {
    if (!clientId && clients[0]) setClientId(clients[0].id);
  }, [clients, clientId]);

  async function create() {
    setErr(null);
    setMsg(null);
    if (!email.trim() || !password.trim() || !clientId)
      return setErr("Compila email, password e cliente.");
    const res = await callAdmin("create_secretary", {
      email: email.trim(),
      password,
      client_id: clientId,
      full_name: fullName.trim() || null,
    });
    if (res.error) return setErr(res.error);
    setMsg("Accesso creato. Comunica email e password alla segretaria.");
    setEmail("");
    setPassword("");
    setFullName("");
    load();
  }

  async function resetPwd(u: SecretaryRow) {
    const p = prompt(`Nuova password per ${u.email}:`);
    if (!p) return;
    const res = await callAdmin("set_password", { user_id: u.id, password: p });
    if (res.error) return alert(res.error);
    alert("Password aggiornata.");
  }

  async function del(u: SecretaryRow) {
    if (!confirm(`Eliminare l'accesso di ${u.email}?`)) return;
    const res = await callAdmin("delete_user", { user_id: u.id });
    if (res.error) return alert(res.error);
    load();
  }

  const clientName = (id: string | null) =>
    clients.find((c) => c.id === id)?.name ?? (id ? "—" : "(tutti)");

  return (
    <div className="panel">
      <h2>Accessi (segretarie)</h2>
      {err && <div className="notice err">{err}</div>}
      {msg && <div className="notice ok">{msg}</div>}

      {loading ? (
        <div style={{ color: "var(--muted)" }}>Caricamento…</div>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>Nome</th>
              <th>Email</th>
              <th>Ruolo</th>
              <th>Cliente</th>
              <th style={{ width: 180 }}></th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td>{u.full_name || "—"}</td>
                <td>{u.email}</td>
                <td>{u.role === "admin" ? "Amministratore" : "Segretaria"}</td>
                <td>{u.role === "admin" ? "(tutti)" : clientName(u.client_id)}</td>
                <td style={{ textAlign: "right" }}>
                  {u.role !== "admin" && (
                    <>
                      <button
                        className="btn small"
                        onClick={() => resetPwd(u)}
                        style={{ marginRight: 6 }}
                      >
                        Password
                      </button>
                      <button
                        className="btn small danger"
                        onClick={() => del(u)}
                      >
                        Elimina
                      </button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <h3 style={{ fontSize: 14, marginTop: 18 }}>Crea nuovo accesso segretaria</h3>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <div className="field">
          <label>Nome</label>
          <input value={fullName} onChange={(e) => setFullName(e.target.value)} />
        </div>
        <div className="field">
          <label>Cliente assegnato</label>
          <select value={clientId} onChange={(e) => setClientId(e.target.value)}>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>Email (per il login)</label>
          <input value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div className="field">
          <label>Password iniziale</label>
          <input value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
      </div>
      <button className="btn primary" onClick={create}>
        + Crea accesso
      </button>
    </div>
  );
}
