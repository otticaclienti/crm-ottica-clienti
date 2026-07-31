import { useEffect, useMemo, useState } from "react";
import { supabase } from "../supabaseClient";
import type { Client, Lead, Stage } from "../types";

export default function Dashboard({ client }: { client: Client }) {
  const [stages, setStages] = useState<Stage[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      supabase
        .from("stages")
        .select("*")
        .eq("client_id", client.id)
        .order("position"),
      supabase.from("leads").select("*").eq("client_id", client.id),
    ]).then(([{ data: st }, { data: ld }]) => {
      setStages((st as Stage[]) ?? []);
      setLeads((ld as Lead[]) ?? []);
      setLoading(false);
    });
  }, [client.id]);

  const stats = useMemo(() => {
    const total = leads.length;
    const now = new Date();
    const startMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const last30 = new Date(now.getTime() - 30 * 24 * 3600 * 1000);

    const newThisMonth = leads.filter(
      (l) => new Date(l.created_at) >= startMonth
    ).length;
    const newLast30 = leads.filter(
      (l) => new Date(l.created_at) >= last30
    ).length;
    const totalValue = leads.reduce((s, l) => s + (Number(l.value) || 0), 0);

    const byStage = stages.map((s) => ({
      label: s.name,
      color: s.color || "#94a3b8",
      count: leads.filter((l) => l.stage_id === s.id).length,
    }));

    const byAssigned = groupCount(
      leads.map((l) => l.assigned_to || "— non assegnato")
    );
    const bySource = groupCount(leads.map((l) => l.source || "— sconosciuta"));

    return {
      total,
      newThisMonth,
      newLast30,
      totalValue,
      byStage,
      byAssigned,
      bySource,
    };
  }, [leads, stages]);

  if (loading) return <div className="center-msg">Caricamento dati…</div>;

  const maxStage = Math.max(1, ...stats.byStage.map((s) => s.count));

  return (
    <div className="page">
      <h1>Dashboard · {client.name}</h1>
      <p className="sub">Riepilogo della pipeline in tempo reale.</p>

      <div className="cards-grid">
        <Stat k="Lead totali" v={stats.total} />
        <Stat k="Nuovi questo mese" v={stats.newThisMonth} />
        <Stat k="Nuovi ultimi 30 giorni" v={stats.newLast30} />
        <Stat
          k="Valore totale pipeline"
          v={"€ " + stats.totalValue.toLocaleString("it-IT")}
          small
        />
      </div>

      <div className="panel">
        <h2>Lead per fase</h2>
        {stats.byStage.map((s) => (
          <div className="bar-row" key={s.label}>
            <div className="lbl" title={s.label}>
              {s.label}
            </div>
            <div className="bar-track">
              <div
                className="bar-fill"
                style={{
                  width: (s.count / maxStage) * 100 + "%",
                  background: s.color,
                }}
              />
            </div>
            <div className="num">{s.count}</div>
          </div>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18 }}>
        <div className="panel" style={{ margin: 0 }}>
          <h2>Lead per segretaria</h2>
          <BarList data={stats.byAssigned} color="#2563eb" />
        </div>
        <div className="panel" style={{ margin: 0 }}>
          <h2>Lead per fonte</h2>
          <BarList data={stats.bySource} color="#7c3aed" />
        </div>
      </div>
    </div>
  );
}

function Stat({ k, v, small }: { k: string; v: React.ReactNode; small?: boolean }) {
  return (
    <div className="stat">
      <div className="k">{k}</div>
      <div className={"v" + (small ? " small" : "")}>{v}</div>
    </div>
  );
}

function BarList({
  data,
  color,
}: {
  data: { label: string; count: number }[];
  color: string;
}) {
  const max = Math.max(1, ...data.map((d) => d.count));
  if (data.length === 0)
    return <div style={{ color: "var(--muted)" }}>Nessun dato.</div>;
  return (
    <>
      {data.map((d) => (
        <div className="bar-row" key={d.label}>
          <div className="lbl" title={d.label}>
            {d.label}
          </div>
          <div className="bar-track">
            <div
              className="bar-fill"
              style={{ width: (d.count / max) * 100 + "%", background: color }}
            />
          </div>
          <div className="num">{d.count}</div>
        </div>
      ))}
    </>
  );
}

function groupCount(arr: string[]): { label: string; count: number }[] {
  const m: Record<string, number> = {};
  for (const x of arr) m[x] = (m[x] || 0) + 1;
  return Object.entries(m)
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count);
}
