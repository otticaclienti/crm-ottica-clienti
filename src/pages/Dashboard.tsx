import { useEffect, useMemo, useState } from "react";
import { supabase } from "../supabaseClient";
import type { Client, Lead, Pipeline, Stage } from "../types";

interface AdMetrics {
  spend: number; cpc: number; ctr: number; cpm: number;
  leads_count: number; cost_per_lead: number; updated_at: string;
}

export default function Dashboard({
  client,
  pipeline,
}: {
  client: Client;
  pipeline: Pipeline;
}) {
  const [stages, setStages] = useState<Stage[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [ads, setAds] = useState<AdMetrics | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      supabase.from("stages").select("*").eq("pipeline_id", pipeline.id).order("position"),
      supabase.from("leads").select("*").eq("pipeline_id", pipeline.id),
      supabase.from("client_ad_metrics").select("*").eq("pipeline_id", pipeline.id).maybeSingle(),
    ]).then(([{ data: st }, { data: ld }, { data: adm }]) => {
      setStages((st as Stage[]) ?? []);
      setLeads((ld as Lead[]) ?? []);
      setAds((adm as AdMetrics) ?? null);
      setLoading(false);
    });
  }, [pipeline.id]);

  const m = useMemo(() => {
    const stageById: Record<string, Stage> = {};
    for (const s of stages) stageById[s.id] = s;
    const nameOf = (l: Lead) => (stageById[l.stage_id]?.name || "").toLowerCase();

    const countBy = (pred: (n: string) => boolean) =>
      leads.filter((l) => pred(nameOf(l))).length;
    const sumBy = (pred: (n: string) => boolean) =>
      leads.filter((l) => pred(nameOf(l))).reduce((s, l) => s + (Number(l.value) || 0), 0);

    const now = new Date();
    const startMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const last30 = new Date(now.getTime() - 30 * 24 * 3600 * 1000);

    const isAppuntamento = (n: string) => n.includes("appuntament");
    const isPresentato = (n: string) => n.includes("presentato") && !n.includes("preventivo");
    const isDisdetto = (n: string) => n.includes("disdett");
    // "Preventivo non accettato" contiene comunque "accettato": va escluso esplicitamente
    const isAccettato = (n: string) => n.includes("accettato") && !n.includes("non accettato");
    const isTrattativa = (n: string) => n.includes("trattativa");
    const isErrato = (n: string) => n.includes("errato");
    const isTarget = (n: string) => n.includes("target");
    const isInteressato = (n: string) => n.includes("interessato");
    const isRichiamare = (n: string) => n.includes("richiamare");
    const isNonRisposta = (n: string) =>
      n.includes("nuovi") || n.includes("non risposto") || n.includes("non risponde") || n.includes("errato");

    return {
      total: leads.length,
      newMonth: leads.filter((l) => new Date(l.created_at) >= startMonth).length,
      new30: leads.filter((l) => new Date(l.created_at) >= last30).length,
      appuntamenti: countBy(isAppuntamento),
      presentati: countBy(isPresentato),
      disdetti: countBy(isDisdetto),
      accettatiN: countBy(isAccettato),
      accettatiEur: sumBy(isAccettato),
      trattativaN: countBy(isTrattativa),
      trattativaEur: sumBy(isTrattativa),
      errato: countBy(isErrato),
      target: countBy(isTarget),
      interessato: countBy(isInteressato),
      richiamare: countBy(isRichiamare),
      risposta: leads.length - countBy(isNonRisposta),
      valoreTot: leads.reduce((s, l) => s + (Number(l.value) || 0), 0),
      byStage: stages.map((s) => ({
        label: s.name,
        color: s.color || "#94a3b8",
        count: leads.filter((l) => l.stage_id === s.id).length,
      })),
      byAssigned: groupCount(leads.map((l) => l.assigned_to || "— non assegnato")),
      bySource: groupCount(leads.map((l) => l.source || "— sconosciuta")),
    };
  }, [leads, stages]);

  if (loading) return <div className="center-msg">Caricamento dati…</div>;

  const eur = (n: number) => "€ " + n.toLocaleString("it-IT");
  const round2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;
  const maxStage = Math.max(1, ...m.byStage.map((s) => s.count));

  return (
    <div className="page">
      <h1>Dashboard · {client.name}</h1>
      <p className="sub">
        Pipeline: <b>{pipeline.name}</b> · riepilogo in tempo reale.
      </p>

      {/* KPI principali (stile GHL) */}
      <div className="cards-grid">
        <Stat k="Contatti totali" v={m.total} />
        <Stat k="Appuntamenti futuri" v={m.appuntamenti} />
        <Stat k="Presentati" v={m.presentati} />
        <Stat k="Disdetti" v={m.disdetti} />
      </div>
      <div className="cards-grid">
        <Stat k="Preventivi accettati" v={m.accettatiN} accent="#16a34a" />
        <Stat k="Importo accettati" v={eur(m.accettatiEur)} small accent="#16a34a" />
        <Stat k="Preventivi in trattativa" v={m.trattativaN} accent="#059669" />
        <Stat k="Importo trattative" v={eur(m.trattativaEur)} small accent="#059669" />
      </div>
      <div className="cards-grid">
        <Stat k="Risposta" v={m.risposta} />
        <Stat k="Da richiamare" v={m.richiamare} />
        <Stat k="Numero errato" v={m.errato} />
        <Stat k="Non interessato" v={m.interessato} />
      </div>
      <div className="cards-grid">
        <Stat k="Non in target" v={m.target} />
        <Stat k="Nuovi questo mese" v={m.newMonth} />
        <Stat k="Nuovi ultimi 30 giorni" v={m.new30} />
        <Stat k="Valore totale pipeline" v={eur(m.valoreTot)} small />
      </div>

      {/* Metriche Meta */}
      {ads ? (
        <div className="panel">
          <h2>Metriche Meta · ultimi 30 giorni</h2>
          <div className="cards-grid" style={{ marginBottom: 0 }}>
            <Stat k="Importo speso" v={eur(Number(ads.spend))} small accent="#ea580c" />
            <Stat k="Costo per conversione" v={eur(round2(ads.cost_per_lead))} small accent="#ea580c" />
            <Stat k="CPC" v={eur(round2(ads.cpc))} small />
            <Stat k="CTR" v={round2(ads.ctr) + "%"} small />
          </div>
          <div style={{ color: "var(--muted)", fontSize: 12, marginTop: 10 }}>
            Lead da Meta nel periodo: <b>{ads.leads_count}</b> · aggiornato il{" "}
            {new Date(ads.updated_at).toLocaleString("it-IT")}
          </div>
        </div>
      ) : (
        <div className="panel" style={{ background: "#f8fafc", borderStyle: "dashed" }}>
          <h2>Metriche Meta (spesa, CPC, CTR, costo/conversione)</h2>
          <p style={{ color: "var(--muted)", margin: 0 }}>
            Per questo cliente non è ancora collegato l'account pubblicitario
            Meta. Impostalo in Amministrazione per vedere spesa, CPC, CTR e
            costo/conversione.
          </p>
        </div>
      )}

      {/* Lead per fase */}
      <div className="panel">
        <h2>Lead per fase</h2>
        {m.byStage.map((s) => (
          <div className="bar-row" key={s.label}>
            <div className="lbl" title={s.label}>{s.label}</div>
            <div className="bar-track">
              <div className="bar-fill" style={{ width: (s.count / maxStage) * 100 + "%", background: s.color }} />
            </div>
            <div className="num">{s.count}</div>
          </div>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18 }}>
        <div className="panel" style={{ margin: 0 }}>
          <h2>Lead per segretaria</h2>
          <BarList data={m.byAssigned} color="#2563eb" />
        </div>
        <div className="panel" style={{ margin: 0 }}>
          <h2>Lead per fonte</h2>
          <BarList data={m.bySource} color="#7c3aed" />
        </div>
      </div>
    </div>
  );
}

function Stat({
  k, v, small, accent,
}: { k: string; v: React.ReactNode; small?: boolean; accent?: string }) {
  return (
    <div className="stat">
      <div className="k">{k}</div>
      <div className={"v" + (small ? " small" : "")} style={accent ? { color: accent } : undefined}>{v}</div>
    </div>
  );
}

function BarList({ data, color }: { data: { label: string; count: number }[]; color: string }) {
  const max = Math.max(1, ...data.map((d) => d.count));
  if (data.length === 0) return <div style={{ color: "var(--muted)" }}>Nessun dato.</div>;
  return (
    <>
      {data.map((d) => (
        <div className="bar-row" key={d.label}>
          <div className="lbl" title={d.label}>{d.label}</div>
          <div className="bar-track">
            <div className="bar-fill" style={{ width: (d.count / max) * 100 + "%", background: color }} />
          </div>
          <div className="num">{d.count}</div>
        </div>
      ))}
    </>
  );
}

function groupCount(arr: string[]): { label: string; count: number }[] {
  const map: Record<string, number> = {};
  for (const x of arr) map[x] = (map[x] || 0) + 1;
  return Object.entries(map).map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count);
}
