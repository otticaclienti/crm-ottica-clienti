import { useEffect, useState } from "react";
import { supabase } from "./supabaseClient";
import { useAuth } from "./useAuth";
import type { Client, Pipeline } from "./types";
import Login from "./pages/Login";
import Board from "./pages/Board";
import Dashboard, { ALL_PIPELINES_ID } from "./pages/Dashboard";
import Admin from "./pages/Admin";
import Performance from "./pages/Performance";

type Tab = "board" | "dashboard" | "performance" | "admin";

export default function App() {
  const auth = useAuth();
  const [tab, setTab] = useState<Tab>("board");
  const [clients, setClients] = useState<Client[]>([]);
  const [clientId, setClientId] = useState<string | null>(null);
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [pipelineId, setPipelineId] = useState<string | null>(null);

  const isAdmin = auth.profile?.role === "admin";
  const meName = auth.profile?.full_name || auth.email || "";

  // Carica i clienti visibili (l'admin li vede tutti, la segretaria solo il suo)
  useEffect(() => {
    if (!auth.profile) return;
    supabase
      .from("clients")
      .select(
        "id, name, ingest_token, ghl_pipeline_id, meta_page_id, meta_form_id, meta_ad_account_id, created_at"
      )
      .order("name")
      .then(({ data }) => {
        const list = (data as Client[]) ?? [];
        setClients(list);
        // Sceglie il cliente iniziale
        if (auth.profile?.role === "secretary") {
          setClientId(auth.profile.client_id);
        } else if (list.length > 0) {
          setClientId((prev) => prev ?? list[0].id);
        }
      });
  }, [auth.profile]);

  // Carica le pipeline del cliente selezionato.
  // IMPORTANTE: questo hook deve stare PRIMA di ogni return condizionale,
  // altrimenti React cambia il numero di hook tra un render e l'altro (schermo bianco).
  useEffect(() => {
    if (!clientId) {
      setPipelines([]);
      setPipelineId(null);
      return;
    }
    supabase
      .from("pipelines")
      .select("id, client_id, name, position, meta_form_id, meta_ad_account_id, created_at")
      .eq("client_id", clientId)
      .order("position")
      .then(({ data }) => {
        const list = (data as Pipeline[]) ?? [];
        setPipelines(list);
        setPipelineId((prev) => (list.find((p) => p.id === prev) ? prev : list[0]?.id ?? null));
      });
  }, [clientId]);

  if (auth.loading) {
    return <div className="center-msg">Caricamento…</div>;
  }
  if (!auth.userId) {
    return <Login />;
  }
  if (!auth.profile) {
    return (
      <div className="center-msg">
        Il tuo account non ha ancora un profilo. Chiedi all'amministratore di
        assegnarti un cliente.
        <br />
        <button
          className="btn"
          style={{ marginTop: 12 }}
          onClick={() => supabase.auth.signOut()}
        >
          Esci
        </button>
      </div>
    );
  }

  const currentClient = clients.find((c) => c.id === clientId) ?? null;
  const isAllView = pipelineId === ALL_PIPELINES_ID;
  // Pipeline sintetica "Totale": esiste solo per la Dashboard.
  const allPipeline: Pipeline | null =
    isAllView && clientId
      ? {
          id: ALL_PIPELINES_ID,
          client_id: clientId,
          name: "Totale (tutti i servizi)",
          position: -1,
          meta_form_id: null,
          meta_ad_account_id: null,
          created_at: "",
        }
      : null;
  const currentPipeline = allPipeline ?? pipelines.find((p) => p.id === pipelineId) ?? null;
  // La Bacheca non conosce la vista Totale: usa sempre una pipeline reale.
  const boardPipeline = isAllView ? pipelines[0] ?? null : currentPipeline;

  return (
    <div className="app">
      <div className="topbar">
        <div className="brand">
          CRM Ottica <small>· pipeline</small>
        </div>

        <nav className="nav">
          <button
            className={tab === "board" ? "active" : ""}
            onClick={() => {
              setTab("board");
              // La Bacheca non ha la vista Totale: torna a una pipeline reale.
              if (pipelineId === ALL_PIPELINES_ID) setPipelineId(pipelines[0]?.id ?? null);
            }}
          >
            Bacheca
          </button>
          <button
            className={tab === "dashboard" ? "active" : ""}
            onClick={() => setTab("dashboard")}
          >
            Dashboard
          </button>
          {isAdmin && (
            <button
              className={tab === "performance" ? "active" : ""}
              onClick={() => setTab("performance")}
            >
              Performance
            </button>
          )}
          {isAdmin && (
            <button
              className={tab === "admin" ? "active" : ""}
              onClick={() => setTab("admin")}
            >
              Amministrazione
            </button>
          )}
        </nav>

        {/* Selettore cliente: l'admin sceglie, la segretaria lo vede bloccato */}
        {clients.length > 0 && tab !== "admin" && tab !== "performance" && (
          <select
            className="select"
            value={clientId ?? ""}
            disabled={!isAdmin}
            onChange={(e) => setClientId(e.target.value)}
          >
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        )}

        {/* Selettore pipeline: appare solo se il cliente ha piu' di una pipeline */}
        {pipelines.length > 1 && tab !== "admin" && tab !== "performance" && (
          <select
            className="select"
            value={pipelineId ?? ""}
            onChange={(e) => setPipelineId(e.target.value)}
            title="Scegli la pipeline"
          >
            {pipelines.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
            {/* La vista Totale somma tutti i servizi: solo nella Dashboard */}
            {tab === "dashboard" && (
              <option value={ALL_PIPELINES_ID}>Totale (tutti i servizi)</option>
            )}
          </select>
        )}

        <div className="spacer" />
        <div className="who">
          <b>{auth.profile.full_name || auth.email}</b>
          <br />
          {isAdmin ? "Amministratore" : "Segretaria"}
        </div>
        <button className="btn small" onClick={() => supabase.auth.signOut()}>
          Esci
        </button>
      </div>

      {tab === "board" &&
        (currentClient && boardPipeline ? (
          <Board
            client={currentClient}
            pipeline={boardPipeline}
            canEdit={true}
            meName={meName}
            autoAssign={!isAdmin}
          />
        ) : (
          <div className="center-msg">Nessuna pipeline disponibile.</div>
        ))}

      {tab === "performance" && isAdmin && <Performance clients={clients} />}

      {tab === "dashboard" &&
        (currentClient && currentPipeline ? (
          <Dashboard client={currentClient} pipeline={currentPipeline} pipelines={pipelines} />
        ) : (
          <div className="center-msg">Nessuna pipeline disponibile.</div>
        ))}

      {tab === "admin" && isAdmin && (
        <Admin
          clients={clients}
          onClientsChanged={() => {
            supabase
              .from("clients")
              .select(
        "id, name, ingest_token, ghl_pipeline_id, meta_page_id, meta_form_id, meta_ad_account_id, created_at"
      )
              .order("name")
              .then(({ data }) => setClients((data as Client[]) ?? []));
          }}
        />
      )}
    </div>
  );
}
