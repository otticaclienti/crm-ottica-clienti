import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const GRAPH = "https://graph.facebook.com/v21.0";
const VISUAL_CARE_CLIENT_ID = "dfa90fb1-f50e-4166-bfb0-1913de15d1eb";
const hasOcAcronym = (name: string) => /(^|[^a-z0-9])OC([^a-z0-9]|$)/i.test(name);

function json(o: unknown, s = 200) {
  return new Response(JSON.stringify(o), { status: s, headers: { "Content-Type": "application/json" } });
}
function normPhone(p: unknown): string {
  let d = String(p ?? "").replace(/\D/g, "");
  if (d.length > 10 && d.startsWith("39")) d = d.slice(2);
  d = d.replace(/^0+/, "");
  return d;
}

Deno.serve(async (_req) => {
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: tok } = await supabase.from("app_settings").select("value").eq("key", "meta_token").maybeSingle();
  const token = tok?.value;

  const { data: clients } = await supabase
    .from("clients").select("id,name,meta_page_id,meta_page_token").not("meta_page_id", "is", null);
  if (!clients || clients.length === 0) return json({ ok: true, summary: [] });

  const pageToken: Record<string, string> = {};
  if (token) {
    const accRes = await fetch(`${GRAPH}/me/accounts?fields=id,name,access_token&limit=200&access_token=${token}`);
    const acc = await accRes.json();
    if (!acc.error) for (const p of (acc.data || [])) pageToken[p.id] = p.access_token;
  }

  const pick = (flat: Record<string, string>, terms: string[]) => {
    for (const k of Object.keys(flat)) {
      if (terms.some((t) => k.includes(t))) {
        const v = flat[k];
        if (v !== undefined && v !== null && String(v).trim() !== "") return String(v).trim();
      }
    }
    return null;
  };

  const summary: any[] = [];
  for (const c of clients) {
    const ptoken = (c as any).meta_page_token || pageToken[c.meta_page_id as string];
    if (!ptoken) { summary.push({ client: c.name, errore: "nessuna chiave per la Pagina" }); continue; }

    const { data: pipes } = await supabase.from("pipelines").select("id,name,meta_form_id,leads_since").eq("client_id", c.id);
    if (!pipes || pipes.length === 0) { summary.push({ client: c.name, errore: "nessuna pipeline" }); continue; }

    const formToPipeline: Record<string, string> = {};
    for (const p of pipes) if ((p as any).meta_form_id) formToPipeline[String((p as any).meta_form_id)] = (p as any).id;
    const { data: pforms } = await supabase.from("pipeline_forms").select("pipeline_id,form_id").eq("client_id", c.id);
    for (const f of (pforms || [])) formToPipeline[String((f as any).form_id)] = (f as any).pipeline_id;
    const defaultPipeline = pipes.length === 1 ? (pipes[0] as any).id : null;
    const sinceByPipe: Record<string, number> = {};
    for (const p of pipes) { const ls = (p as any).leads_since; if (ls) sinceByPipe[(p as any).id] = new Date(ls).getTime(); }

    const { data: stages } = await supabase.from("stages").select("id,position,is_entry,pipeline_id").eq("client_id", c.id).order("position");
    if (!stages || stages.length === 0) { summary.push({ client: c.name, errore: "nessuna fase" }); continue; }
    const entryByPipe: Record<string, string> = {};
    const stageByPosByPipe: Record<string, Record<number, string>> = {};
    for (const s of stages) {
      const pid = (s as any).pipeline_id;
      if (!stageByPosByPipe[pid]) stageByPosByPipe[pid] = {};
      stageByPosByPipe[pid][(s as any).position] = (s as any).id;
      if ((s as any).is_entry && !entryByPipe[pid]) entryByPipe[pid] = (s as any).id;
    }
    for (const p of pipes) { const pid = (p as any).id; if (!entryByPipe[pid] && stageByPosByPipe[pid]) { const first = Object.keys(stageByPosByPipe[pid]).map(Number).sort((a,b)=>a-b)[0]; entryByPipe[pid] = stageByPosByPipe[pid][first]; } }

    const { data: hints } = await supabase.from("lead_import_hints").select("phone_norm,stage_pos,value").eq("client_id", c.id);
    const hintByPhone: Record<string, { stage_pos: number; value: number }> = {};
    for (const h of (hints || [])) hintByPhone[(h as any).phone_norm] = { stage_pos: (h as any).stage_pos, value: Number((h as any).value) || 0 };

    const { data: sup } = await supabase.from("lead_suppress").select("key").eq("client_id", c.id);
    const suppress = new Set<string>((sup || []).map((x: any) => String(x.key).trim().toLowerCase()));

    // Carica TUTTI i lead esistenti a pagine (il default di 1000 righe rendeva cieco il
    // controllo anti-duplicati appena la tabella cresceva).
    const existing: any[] = [];
    { let from = 0; const size = 1000;
      while (true) {
        const { data, error } = await supabase.from("leads").select("phone,email,pipeline_id,meta_lead_id").eq("client_id", c.id).range(from, from + size - 1);
        if (error || !data || data.length === 0) break;
        for (const r of data) existing.push(r);
        if (data.length < size) break;
        from += size;
      }
    }
    const seenPhone: Record<string, Set<string>> = {};
    const seenEmail: Record<string, Set<string>> = {};
    const seenMetaId = new Set<string>();
    for (const p of pipes) { seenPhone[(p as any).id] = new Set(); seenEmail[(p as any).id] = new Set(); }
    for (const e of existing) {
      const pid = (e as any).pipeline_id; if (!pid || !seenPhone[pid]) continue;
      const np = normPhone((e as any).phone); if (np) seenPhone[pid].add(np);
      const em = String((e as any).email ?? "").trim().toLowerCase(); if (em) seenEmail[pid].add(em);
      const mid = String((e as any).meta_lead_id ?? "").trim(); if (mid) seenMetaId.add(mid);
    }

    const formsRes = await fetch(`${GRAPH}/${c.meta_page_id}/leadgen_forms?fields=id,name&limit=200&access_token=${ptoken}`);
    const forms = await formsRes.json();
    if (forms.error) { summary.push({ client: c.name, errore: "moduli: " + forms.error.message }); continue; }

    const toInsert: any[] = []; let dup = 0; let skipped = 0; let unrouted = 0; let troppoVecchi = 0; let moduliNonOc = 0;
    for (const form of (forms.data || [])) {
      // Visual Care condivide la Pagina Meta con un'altra agenzia. Solo i
      // moduli con l'acronimo autonomo "OC" appartengono a Ottica Clienti.
      // Il controllo precede routing, lettura lead e INSERT, quindi i form
      // "Francesco" / "Opto" non entrano mai nel nostro CRM.
      if (c.id === VISUAL_CARE_CLIENT_ID && !hasOcAcronym(String(form.name || ""))) {
        moduliNonOc++;
        continue;
      }
      const targetPipe = formToPipeline[String(form.id)] || defaultPipeline;
      if (!targetPipe) { unrouted++; continue; }
      const entryId = entryByPipe[targetPipe];
      const posMap = stageByPosByPipe[targetPipe] || {};
      const since = sinceByPipe[targetPipe] || 0;
      let url: string | null = `${GRAPH}/${form.id}/leads?fields=id,created_time,field_data&limit=100&access_token=${ptoken}`;
      let guard = 0;
      while (url && guard < 30) {
        const lr = await fetch(url); const lj = await lr.json();
        if (lj.error) break;
        for (const lead of (lj.data || [])) {
          if (since && new Date(lead.created_time).getTime() < since) { troppoVecchi++; continue; }
          const metaId = String(lead.id ?? "").trim();
          if (metaId && seenMetaId.has(metaId)) { dup++; continue; }
          const flat: Record<string, string> = {};
          for (const f of (lead.field_data || [])) flat[String(f.name || "").toLowerCase()] = Array.isArray(f.values) ? f.values[0] : f.value;
          const full = pick(flat, ["full name", "nome_e_cognome", "nome e cognome", "nome completo", "nome", "name"]);
          const first = pick(flat, ["first"]); const last = pick(flat, ["last", "cognome"]);
          const name = full || [first, last].filter(Boolean).join(" ") || null;
          const phone = pick(flat, ["phone", "telefono", "cellulare", "numero"]);
          const email = pick(flat, ["email", "e-mail", "mail"]);
          const np = normPhone(phone); const em = String(email ?? "").trim().toLowerCase();
          if ((np && suppress.has(np)) || (em && suppress.has(em))) { skipped++; continue; }
          if ((np && seenPhone[targetPipe].has(np)) || (em && seenEmail[targetPipe].has(em))) { dup++; continue; }
          if (np) seenPhone[targetPipe].add(np); if (em) seenEmail[targetPipe].add(em); if (metaId) seenMetaId.add(metaId);
          const hint = np ? hintByPhone[np] : undefined;
          const stage_id = hint ? (posMap[hint.stage_pos] || entryId) : entryId;
          const value = hint ? hint.value : 0;
          toInsert.push({ client_id: c.id, pipeline_id: targetPipe, stage_id, name, phone, email, source: "Facebook", value, created_at: lead.created_time, meta_lead_id: metaId || null });
        }
        url = lj.paging?.next || null; guard++;
      }
    }
    let inserted = 0;
    if (toInsert.length) {
      // onConflict su meta_lead_id: se per qualsiasi motivo lo stesso lead Meta rientra,
      // il vincolo univoco lo scarta invece di duplicarlo.
      const { error } = await supabase.from("leads").upsert(toInsert, { onConflict: "meta_lead_id", ignoreDuplicates: true });
      if (error) { summary.push({ client: c.name, errore: "inserimento: " + error.message }); continue; }
      inserted = toInsert.length;
    }
    summary.push({ client: c.name, nuovi_inseriti: inserted, gia_presenti: dup, esclusi: skipped, troppo_vecchi: troppoVecchi, moduli_non_associati: unrouted, moduli_non_oc_ignorati: moduliNonOc });
  }
  return json({ ok: true, summary });
});
