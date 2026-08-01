import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { supabase } from "../supabaseClient";
import type { Client, Lead, Pipeline, Stage } from "../types";

interface AdMetrics {
  spend: number; cpc: number; ctr: number; cpm: number;
  leads_count: number; cost_per_lead: number; updated_at: string;
}
interface MonthRow {
  month: string; spend: number; leads_count: number; cost_per_lead: number;
  cpc: number; ctr: number;
}

type Preset =
  | "this_month" | "last_month" | "last3" | "last6" | "year" | "all" | "custom";

interface Range { from: Date; to: Date; prevFrom: Date; prevTo: Date; hasPrev: boolean }

function startOfMonth(d: Date) { return new Date(d.getFullYear(), d.getMonth(), 1); }
function addDays(d: Date, n: number) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }

function computeRange(preset: Preset, cf: string, ct: string): Range {
  const now = new Date();
  const som = startOfMonth(now);
  const somPrev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const somPrev2 = new Date(now.getFullYear(), now.getMonth() - 2, 1);
  switch (preset) {
    case "this_month":
      return { from: som, to: now, prevFrom: somPrev, prevTo: som, hasPrev: true };
    case "last_month":
      return { from: somPrev, to: som, prevFrom: somPrev2, prevTo: somPrev, hasPrev: true };
    case "last3":
      return { from: addDays(now, -90), to: now, prevFrom: addDays(now, -180), prevTo: addDays(now, -90), hasPrev: true };
    case "last6":
      return { from: addDays(now, -180), to: now, prevFrom: addDays(now, -360), prevTo: addDays(now, -180), hasPrev: true };
    case "year": {
      const soy = new Date(now.getFullYear(), 0, 1);
      const soyPrev = new Date(now.getFullYear() - 1, 0, 1);
      const prevTo = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());
      return { from: soy, to: now, prevFrom: soyPrev, prevTo, hasPrev: true };
    }
    case "custom": {
      const from = cf ? new Date(cf) : new Date(0);
      const to = ct ? addDays(new Date(ct), 1) : now;
      const len = to.getTime() - from.getTime();
      return { from, to, prevFrom: new Date(from.getTime() - len), prevTo: from, hasPrev: !!(cf && ct) };
    }
    default:
      return { from: new Date(0), to: now, prevFrom: new Date(0), prevTo: new Date(0), hasPrev: false };
  }
}

const PRESET_LABEL: Record<Preset, string> = {
  this_month: "Questo mese", last_month: "Mese scorso", last3: "Ultimi 3 mesi",
  last6: "Ultimi 6 mesi", year: "Quest'anno", all: "Sempre", custom: "Personalizzato",
};

export default function Dashboard({ client, pipeline }: { client: Client; pipeline: Pipeline }) {
  const [stages, setStages] = useState<Stage[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [ads, setAds] = useState<AdMetrics | null>(null);
  const [months, setMonths] = useState<MonthRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [preset, setPreset] = useState<Preset>("this_month");
  const [cf, setCf] = useState("");
  const [ct, setCt] = useState("");

  useEffect(() => {
    setLoading(true);
    Promise.all([
      supabase.from("stages").select("*").eq("pipeline_id", pipeline.id).order("position"),
      supabase.from("leads").select("*").eq("pipeline_id", pipeline.id),
      supabase.from("client_ad_metrics").select("*").eq("pipeline_id", pipeline.id).maybeSingle(),
      supabase.from("ad_metrics_monthly").select("*").eq("pipeline_id", pipeline.id).order("month", { ascending: false }),
    ]).then(([{ data: st }, { data: ld }, { data: adm }, { data: mm }]) => {
      setStages((st as Stage[]) ?? []);
      setLeads((ld as Lead[]) ?? []);
      setAds((adm as AdMetrics) ?? null);
      setMonths((mm as MonthRow[]) ?? []);
      setLoading(false);
    });
  }, [pipeline.id]);

  const stageById = useMemo(() => {
    const m: Record<string, Stage> = {};
    for (const s of stages) m[s.id] = s;
    return m;
  }, [stages]);

  const kpiOf = (subset: Lead[]) => {
    const nameOf = (l: Lead) => (stageById[l.stage_id]?.name || "").toLowerCase();
    const cnt = (p: (n: string) => boolean) => subset.filter((l) => p(nameOf(l))).length;
    const sum = (p: (n: string) => boolean) =>
      subset.filter((l) => p(nameOf(l))).reduce((s, l) => s + (Number(l.value) || 0), 0);
    const isAcc = (n: string) => n.includes("accettato") && !n.includes("non accettato");
    return {
      totale: subset.length,
      appuntamenti: cnt((n) => n.includes("appuntament")),
      presentati: cnt((n) => n.includes("presentato") && !n.includes("preventivo")),
      accettati: cnt(isAcc),
      accettatiEur: sum(isAcc),
      trattativa: cnt((n) => n.includes("trattativa")),
      disdetti: cnt((n) => n.includes("disdett")),
    };
  };

  const range = useMemo(() => computeRange(preset, cf, ct), [preset, cf, ct]);

  const cur = useMemo(
    () => kpiOf(leads.filter((l) => { const t = new Date(l.created_at); return t >= range.from && t < range.to; })),
    [leads, range, stageById]
  );
  const prev = useMemo(
    () => kpiOf(range.hasPrev ? leads.filter((l) => { const t = new Date(l.created_at); return t >= range.prevFrom && t < range.prevTo; }) : []),
    [leads, range, stageById]
  );

  const snapshot = useMemo(() => {
    const byStage = stages.map((s) => ({
      label: s.name, color: s.color || "#94a3b8",
      count: leads.filter((l) => l.stage_id === s.id).length,
    }));
    return {
      total: leads.length,
      valoreTot: leads.reduce((s, l) => s + (Number(l.value) || 0), 0),
      byStage,
      byAssigned: groupCount(leads.map((l) => l.assigned_to || "— non assegnato")),
    };
  }, [leads, stages]);

  if (loading) return <div className="center-msg">Caricamento dati…</div>;

  const eur = (n: number) => "€ " + Math.round(n).toLocaleString("it-IT");
  const round2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;
  const maxStage = Math.max(1, ...snapshot.byStage.map((s) => s.count));

  // Confronto spesa: mese corrente vs mese precedente (dallo storico)
  const curMonthKey = new Date().toISOString().slice(0, 7);
  const curM = months.find((m) => m.month === curMonthKey) || months[0];
  const prevM = months.find((m) => m.month < (curM?.month || "")) || null;

  return (
    <div className="page">
      <h1>Dashboard · {client.name}</h1>
      <p className="sub">Pipeline: <b>{pipeline.name}</b></p>

      {/* Selettore periodo */}
      <div className="panel" style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <b style={{ fontSize: 13 }}>Periodo:</b>
        <select className="select" value={preset} onChange={(e) => setPreset(e.target.value as Preset)}>
          {(Object.keys(PRESET_LABEL) as Preset[]).map((p) => (
            <option key={p} value={p}>{PRESET_LABEL[p]}</option>
          ))}
        </select>
        {preset === "custom" && (
          <>
            <input type="date" className="select" value={cf} onChange={(e) => setCf(e.target.value)} />
            <span>→</span>
            <input type="date" className="select" value={ct} onChange={(e) => setCt(e.target.value)} />
          </>
        )}
        <span style={{ color: "var(--muted)", fontSize: 12 }}>
          Lead <b>arrivati</b> nel periodo, per esito attuale{range.hasPrev ? " · confronto col periodo precedente" : ""}
        </span>
      </div>

      <div className="cards-grid">
        <Stat k="Contatti (nel periodo)" v={cur.totale} d={delta(cur.totale, prev.totale, range.hasPrev)} />
        <Stat k="Appuntamenti" v={cur.appuntamenti} d={delta(cur.appuntamenti, prev.appuntamenti, range.hasPrev)} />
        <Stat k="Presentati" v={cur.presentati} d={delta(cur.presentati, prev.presentati, range.hasPrev)} />
        <Stat k="Disdetti" v={cur.disdetti} d={delta(cur.disdetti, prev.disdetti, range.hasPrev)} />
      </div>
      <div className="cards-grid">
        <Stat k="Preventivi accettati" v={cur.accettati} accent="#16a34a" d={delta(cur.accettati, prev.accettati, range.hasPrev)} />
        <Stat k="Importo accettati" v={eur(cur.accettatiEur)} small accent="#16a34a" d={delta(cur.accettatiEur, prev.accettatiEur, range.hasPrev, true)} />
        <Stat k="In trattativa" v={cur.trattativa} accent="#059669" d={delta(cur.trattativa, prev.trattativa, range.hasPrev)} />
        <Stat k="Tasso conversione" v={cur.totale ? Math.round((cur.accettati / cur.totale) * 100) + "%" : "—"} small />
      </div>

      {/* Storico spesa Meta */}
      <div className="panel">
        <h2>Spesa pubblicitaria Meta · andamento mensile</h2>
        {months.length === 0 ? (
          <p style={{ color: "var(--muted)", margin: 0 }}>
            Nessuno storico spesa per questa pipeline. Collega l'account pubblicitario Meta
            (in Amministrazione → Pipeline) e lo storico si popolerà da solo.
          </p>
        ) : (
          <>
            <div className="cards-grid" style={{ marginBottom: 14 }}>
              <Stat k={`Spesa ${curM?.month ?? ""}`} v={eur(curM?.spend ?? 0)} small accent="#ea580c"
                d={prevM ? delta(curM?.spend ?? 0, prevM.spend, true, true) : undefined} />
              <Stat k="Lead da Meta (mese)" v={curM?.leads_count ?? 0}
                d={prevM ? delta(curM?.leads_count ?? 0, prevM.leads_count, true) : undefined} />
              <Stat k="Costo per lead (mese)" v={eur(curM?.cost_per_lead ?? 0)} small
                d={prevM ? delta(curM?.cost_per_lead ?? 0, prevM.cost_per_lead, true, true, true) : undefined} />
              <Stat k="Mesi disponibili" v={months.length} small />
            </div>
            <div style={{ overflowX: "auto" }}>
              <table className="perf-table">
                <thead>
                  <tr><th>Mese</th><th>Spesa</th><th>Lead</th><th>Costo/lead</th><th>CPC</th><th>CTR</th></tr>
                </thead>
                <tbody>
                  {months.map((m) => (
                    <tr key={m.month}>
                      <td><b>{m.month}</b></td>
                      <td>{eur(m.spend)}</td>
                      <td>{m.leads_count}</td>
                      <td>{eur(m.cost_per_lead)}</td>
                      <td>€ {round2(m.cpc)}</td>
                      <td>{round2(m.ctr)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
        {ads && (
          <div style={{ color: "var(--muted)", fontSize: 12, marginTop: 10 }}>
            Ultimi 30 giorni: spesa <b>{eur(Number(ads.spend))}</b> · {ads.leads_count} lead ·
            aggiornato il {new Date(ads.updated_at).toLocaleString("it-IT")}
          </div>
        )}
      </div>

      {/* Stato attuale della pipeline */}
      <div className="panel">
        <h2>Stato attuale · lead per fase (tutti)</h2>
        {snapshot.byStage.map((s) => (
          <div className="bar-row" key={s.label}>
            <div className="lbl" title={s.label}>{s.label}</div>
            <div className="bar-track">
              <div className="bar-fill" style={{ width: (s.count / maxStage) * 100 + "%", background: s.color }} />
            </div>
            <div className="num">{s.count}</div>
          </div>
        ))}
        <div style={{ color: "var(--muted)", fontSize: 12, marginTop: 10 }}>
          Totale in pipeline: <b>{snapshot.total}</b> · valore potenziale: <b>{eur(snapshot.valoreTot)}</b>
        </div>
      </div>
    </div>
  );
}

function delta(cur: number, prev: number, has: boolean, money = false, lowerBetter = false): ReactNode {
  if (!has) return undefined;
  const diff = cur - prev;
  if (Math.abs(diff) < 0.005) return <span style={{ color: "var(--muted)" }}>= vs prec.</span>;
  const up = diff > 0;
  const good = lowerBetter ? !up : up;
  const color = good ? "#16a34a" : "#dc2626";
  const arrow = up ? "▲" : "▼";
  const val = money ? "€ " + Math.round(Math.abs(diff)).toLocaleString("it-IT") : Math.abs(diff);
  return <span style={{ color, fontSize: 12, fontWeight: 700 }}>{arrow} {val} vs prec.</span>;
}

function Stat({
  k, v, small, accent, d,
}: { k: string; v: ReactNode; small?: boolean; accent?: string; d?: ReactNode }) {
  return (
    <div className="stat">
      <div className="k">{k}</div>
      <div className={"v" + (small ? " small" : "")} style={accent ? { color: accent } : undefined}>{v}</div>
      {d && <div style={{ marginTop: 4 }}>{d}</div>}
    </div>
  );
}

function groupCount(arr: string[]): { label: string; count: number }[] {
  const map: Record<string, number> = {};
  for (const x of arr) map[x] = (map[x] || 0) + 1;
  return Object.entries(map).map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count);
}
