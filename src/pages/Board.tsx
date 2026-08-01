import { useCallback, useEffect, useMemo, useState } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  useDraggable,
  useDroppable,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { supabase } from "../supabaseClient";
import type { Client, Lead, Stage } from "../types";
import LeadModal from "./LeadModal";

export default function Board({
  client,
  canEdit,
  meName,
}: {
  client: Client;
  canEdit: boolean;
  meName?: string;
}) {
  const [stages, setStages] = useState<Stage[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeLead, setActiveLead] = useState<Lead | null>(null);
  const [editing, setEditing] = useState<Lead | null>(null);
  const [creatingInStage, setCreatingInStage] = useState<Stage | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  const load = useCallback(async () => {
    const [{ data: st }, { data: ld }] = await Promise.all([
      supabase
        .from("stages")
        .select("*")
        .eq("client_id", client.id)
        .order("position"),
      supabase
        .from("leads")
        .select("*")
        .eq("client_id", client.id)
        .order("position")
        .order("created_at", { ascending: false }),
    ]);
    setStages((st as Stage[]) ?? []);
    setLeads((ld as Lead[]) ?? []);
    setLoading(false);
  }, [client.id]);

  useEffect(() => {
    setLoading(true);
    load();
    // Aggiornamento in tempo reale: se un'altra segretaria sposta un lead,
    // la bacheca si aggiorna da sola.
    const ch = supabase
      .channel(`leads-${client.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "leads",
          filter: `client_id=eq.${client.id}`,
        },
        () => load()
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [client.id, load]);

  const leadsByStage = useMemo(() => {
    const map: Record<string, Lead[]> = {};
    for (const s of stages) map[s.id] = [];
    for (const l of leads) {
      if (!map[l.stage_id]) map[l.stage_id] = [];
      map[l.stage_id].push(l);
    }
    return map;
  }, [stages, leads]);

  async function onDragEnd(e: DragEndEvent) {
    setActiveLead(null);
    const leadId = String(e.active.id);
    const targetStageId = e.over ? String(e.over.id) : null;
    if (!targetStageId) return;
    const lead = leads.find((l) => l.id === leadId);
    if (!lead || lead.stage_id === targetStageId) return;

    // Posiziona in cima alla colonna di destinazione
    const minPos = Math.min(
      0,
      ...(leadsByStage[targetStageId] ?? []).map((l) => l.position)
    );
    const newPos = minPos - 1;

    // Aggiornamento ottimistico (immediato a schermo)
    setLeads((prev) =>
      prev.map((l) =>
        l.id === leadId
          ? { ...l, stage_id: targetStageId, position: newPos }
          : l
      )
    );
    const { error } = await supabase
      .from("leads")
      .update({ stage_id: targetStageId, position: newPos })
      .eq("id", leadId);
    if (error) {
      alert("Non è stato possibile spostare il lead: " + error.message);
      load();
    }
  }

  function onDragStart(e: DragStartEvent) {
    const lead = leads.find((l) => l.id === String(e.active.id));
    setActiveLead(lead ?? null);
  }

  if (loading) return <div className="center-msg">Caricamento bacheca…</div>;
  if (stages.length === 0)
    return (
      <div className="center-msg">
        Questo cliente non ha ancora delle fasi. Aggiungile da
        “Amministrazione”.
      </div>
    );

  return (
    <>
      <DndContext
        sensors={sensors}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
      >
        <div className="board-wrap">
          <div className="board">
            {stages.map((s) => (
              <Column
                key={s.id}
                stage={s}
                leads={leadsByStage[s.id] ?? []}
                onOpen={(l) => setEditing(l)}
                onAdd={canEdit ? () => setCreatingInStage(s) : undefined}
              />
            ))}
          </div>
        </div>
        <DragOverlay>
          {activeLead ? <LeadCardView lead={activeLead} /> : null}
        </DragOverlay>
      </DndContext>

      {editing && (
        <LeadModal
          lead={editing}
          stages={stages}
          meName={meName}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            load();
          }}
        />
      )}
      {creatingInStage && (
        <LeadModal
          newInStage={creatingInStage}
          clientId={client.id}
          stages={stages}
          meName={meName}
          onClose={() => setCreatingInStage(null)}
          onSaved={() => {
            setCreatingInStage(null);
            load();
          }}
        />
      )}
    </>
  );
}

/* ---------------- Colonna ---------------- */
function Column({
  stage,
  leads,
  onOpen,
  onAdd,
}: {
  stage: Stage;
  leads: Lead[];
  onOpen: (l: Lead) => void;
  onAdd?: () => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: stage.id });
  return (
    <div className={"column" + (isOver ? " drop-hint" : "")}>
      <div className="col-head">
        <span
          className="col-dot"
          style={{ background: stage.color || "#94a3b8" }}
        />
        {stage.name}
        <span className="col-count">{leads.length}</span>
      </div>
      <div className="col-body" ref={setNodeRef}>
        {leads.map((l) => (
          <DraggableCard key={l.id} lead={l} onOpen={() => onOpen(l)} />
        ))}
      </div>
      {onAdd && (
        <button className="col-add" onClick={onAdd}>
          + Aggiungi lead
        </button>
      )}
    </div>
  );
}

/* ---------------- Card trascinabile ---------------- */
function DraggableCard({ lead, onOpen }: { lead: Lead; onOpen: () => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: lead.id,
  });
  return (
    <div
      ref={setNodeRef}
      className={"card" + (isDragging ? " dragging" : "")}
      {...listeners}
      {...attributes}
      onClick={onOpen}
    >
      <LeadCardInner lead={lead} />
    </div>
  );
}

/* Card usata anche nell'overlay di trascinamento */
function LeadCardView({ lead }: { lead: Lead }) {
  return (
    <div className="card" style={{ width: 264 }}>
      <LeadCardInner lead={lead} />
    </div>
  );
}

function LeadCardInner({ lead }: { lead: Lead }) {
  return (
    <>
      <div className="name">{lead.name || "(senza nome)"}</div>
      {lead.phone && (
        <div className="row">
          <span>📞</span>
          <a href={`tel:${lead.phone}`} onClick={(e) => e.stopPropagation()}>
            {lead.phone}
          </a>
        </div>
      )}
      {lead.email && (
        <div className="row">
          <span>✉️</span>
          <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>
            {lead.email}
          </span>
        </div>
      )}
      <div className="tags">
        {lead.source && <span className="tag src">{lead.source}</span>}
        {lead.assigned_to && <span className="tag">{lead.assigned_to}</span>}
        {lead.notes && <span className="tag note">📝 nota</span>}
      </div>
    </>
  );
}
