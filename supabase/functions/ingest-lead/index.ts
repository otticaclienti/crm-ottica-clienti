import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, x-ingest-token",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(obj: unknown, status = 200): Response {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json", ...CORS },
  });
}

function firstNonEmpty(...vals: any[]): string | null {
  for (const v of vals) {
    if (v !== undefined && v !== null && String(v).trim() !== "") return String(v).trim();
  }
  return null;
}

// Visual Care lavora con due agenzie sulla stessa Pagina Meta. I nostri
// moduli contengono l'acronimo autonomo "OC" (Ottica Clienti): non basta un
// semplice includes("oc"), perché nomi come "Francesco" lo contengono.
const VISUAL_CARE_CLIENT_ID = "dfa90fb1-f50e-4166-bfb0-1913de15d1eb";
const hasOcAcronym = (name: string) => /(^|[^a-z0-9])OC([^a-z0-9]|$)/i.test(name);

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Usa POST" }, 405);

  let body: Record<string, any>;
  try {
    body = await req.json();
  } catch {
    return json({ error: "JSON non valido" }, 400);
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const token = firstNonEmpty(body.token, req.headers.get("x-ingest-token"));
  const formId = firstNonEmpty(body.form_id, body.formId);
  const pageId = firstNonEmpty(body.page_id, body.pageId);

  let client: { id: string; name: string } | null = null;
  let pipelineId: string | null = null;

  // 1) token esplicito -> cliente
  if (token) {
    const { data } = await supabase
      .from("clients").select("id, name").eq("ingest_token", token).maybeSingle();
    client = data;
    if (!client) return json({ error: "Token non valido" }, 403);
  }

  // 2) form_id -> pipeline (e quindi cliente)
  if (!client && formId) {
    const { data } = await supabase
      .from("pipelines").select("id, client_id, clients(name)").eq("meta_form_id", formId).maybeSingle();
    if (data) {
      pipelineId = (data as any).id;
      client = { id: (data as any).client_id, name: (data as any).clients?.name || "" };
    }
  }

  // 3) page_id -> cliente
  if (!client && pageId) {
    const { data } = await supabase
      .from("clients").select("id, name").eq("meta_page_id", pageId).maybeSingle();
    client = data;
  }

  if (!client) {
    return json({
      error: "Cliente non riconosciuto: nessun token valido, e nessun cliente/pipeline collegato a questa Pagina/Modulo Meta.",
      received: { page_id: pageId, form_id: formId },
    }, 422);
  }

  // ---- Filtro agenzia Visual Care ----
  // Blocca prima di determinare fase/pipeline e, soprattutto, prima di ogni
  // INSERT: i lead dei moduli dell'altra agenzia non entrano nel CRM.
  if (client.id === VISUAL_CARE_CLIENT_ID) {
    if (!formId) {
      return json({ ok: true, ignored: true, reason: "visual_care_form_id_missing" });
    }

    const { data: visualCare } = await supabase
      .from("clients")
      .select("meta_page_token")
      .eq("id", client.id)
      .maybeSingle();
    const pageToken = firstNonEmpty((visualCare as any)?.meta_page_token);
    if (!pageToken) {
      return json({ ok: true, ignored: true, reason: "visual_care_form_unverifiable" });
    }

    try {
      const formUrl = new URL(`https://graph.facebook.com/v21.0/${encodeURIComponent(formId)}`);
      formUrl.searchParams.set("fields", "id,name");
      formUrl.searchParams.set("access_token", pageToken);
      const formResponse = await fetch(formUrl);
      const form = formResponse.ok ? await formResponse.json() : null;
      const formName = firstNonEmpty(form?.name);
      if (!formName || !hasOcAcronym(formName)) {
        return json({
          ok: true,
          ignored: true,
          reason: formName ? "visual_care_form_not_oc" : "visual_care_form_unverifiable",
          form_id: formId,
        });
      }
    } catch {
      return json({ ok: true, ignored: true, reason: "visual_care_form_unverifiable" });
    }
  }

  // ---- Determina la pipeline ----
  if (!pipelineId && formId) {
    const { data } = await supabase
      .from("pipelines").select("id").eq("client_id", client.id).eq("meta_form_id", formId).maybeSingle();
    if (data) pipelineId = (data as any).id;
  }
  if (!pipelineId) {
    // default: prima pipeline del cliente
    const { data } = await supabase
      .from("pipelines").select("id").eq("client_id", client.id).order("position").limit(1).maybeSingle();
    if (data) pipelineId = (data as any).id;
  }
  if (!pipelineId) return json({ error: "Nessuna pipeline configurata per il cliente " + client.name }, 500);

  // ---- Fase d'ingresso della pipeline ----
  const { data: stage, error: sErr } = await supabase
    .from("stages")
    .select("id")
    .eq("pipeline_id", pipelineId)
    .order("is_entry", { ascending: false })
    .order("position", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (sErr) return json({ error: sErr.message }, 500);
  if (!stage) return json({ error: "Nessuna fase configurata per questa pipeline" }, 500);

  // ---- Campi in arrivo ----
  const composed = [body.first_name, body.last_name].filter(Boolean).join(" ");
  const name = firstNonEmpty(body.name, body.full_name, body.nome, composed);
  const phone = firstNonEmpty(body.phone, body.phone_number, body.telefono);
  const email = firstNonEmpty(body.email);
  const source = firstNonEmpty(body.source, body.fonte) || "Facebook";
  const notes = firstNonEmpty(body.notes, body.note);

  // ---- Anti-doppione (stesso telefono, stessa pipeline) ----
  if (phone) {
    const { data: dup } = await supabase
      .from("leads")
      .select("id")
      .eq("pipeline_id", pipelineId)
      .eq("phone", phone)
      .limit(1);
    if (dup && dup.length > 0) {
      return json({ ok: true, duplicate: true, id: dup[0].id, client: client.name });
    }
  }

  // ---- Inserimento (il trigger imposta pipeline_id dalla fase) ----
  const { data: lead, error: lErr } = await supabase
    .from("leads")
    .insert({ client_id: client.id, pipeline_id: pipelineId, stage_id: stage.id, name, phone, email, source, notes })
    .select("id")
    .single();
  if (lErr) return json({ error: lErr.message }, 500);

  return json({ ok: true, id: lead.id, client: client.name });
});
