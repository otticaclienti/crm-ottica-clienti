#!/usr/bin/env python3
"""Elimina i doppioni 'Nuovi Lead': lead nella colonna d'ingresso il cui telefono
(normalizzato) esiste già in un lead lavorato della stessa pipeline.
Gira col monitoraggio mattutino, prima del check salute."""
import json
import subprocess
import urllib.request

UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/131.0 Safari/537.36"
WHO = subprocess.check_output(["whoami"]).decode().strip()
BASE = "https://azexrewuoantizffdveo.supabase.co"


def refresh_jwt() -> str:
    REFRESH = subprocess.check_output(
        ["security", "find-generic-password", "-s", "supabase-dashboard-refresh", "-a", WHO, "-w"]
    ).decode().strip()
    d = json.loads(urllib.request.urlopen(urllib.request.Request(
        'https://alt.supabase.io/auth/v1/token?grant_type=refresh_token',
        data=json.dumps({"refresh_token": REFRESH}).encode(),
        headers={'apikey': 'sb_publishable_ZVVKKu1s88KsSBWVYlou-g_phb2OJVQ',
                 'Content-Type': 'application/json'}), timeout=30).read().decode())
    return d['access_token']


def sql(q: str, token: str):
    req = urllib.request.Request(
        'https://api.supabase.com/v1/projects/azexrewuoantizffdveo/database/query',
        data=json.dumps({"query": q}).encode(),
        headers={"Authorization": "Bearer " + token, "Content-Type": "application/json", "User-Agent": UA})
    try:
        r = urllib.request.urlopen(req, timeout=300)
        return r.read().decode()
    except urllib.error.HTTPError as e:
        return "HTTP " + str(e.code) + " " + e.read().decode()[:200]


def main() -> None:
    key = subprocess.check_output(
        ["security", "find-generic-password", "-s", "supabase-service-role", "-a", WHO, "-w"]
    ).decode().strip()

    def rest(path: str):
        return json.loads(urllib.request.urlopen(urllib.request.Request(
            BASE + "/rest/v1/" + path,
            headers={"apikey": key, "Authorization": "Bearer " + key}), timeout=60).read().decode())

    token = refresh_jwt()
    # assicura la funzione di normalizzazione
    sql("""create or replace function public.norm_phone(p text) returns text language sql immutable as $$
      select right(case when d ~ '^0039' then substring(d from 5)
                        when d ~ '^39' and length(d) > 10 then substring(d from 3)
                        else d end, 10)
      from (select regexp_replace(p, '\\D','','g') as d) x;
    $$;""", token)

    pipes = rest("pipelines?select=id,name,client_id")
    clients = {c["id"]: c["name"] for c in rest("clients?select=id,name")}
    removed_total = 0
    for p in pipes:
        pid = p["id"]
        q = f"""
        with entry as (select id as eid from stages where pipeline_id = '{pid}' and is_entry),
        normleads as (
          select l.id as lid, l.stage_id as stid, public.norm_phone(l.phone) as np
          from leads l where l.pipeline_id = '{pid}'
        ),
        worked as (
          select n.np, min(n.lid::text)::uuid as wid from normleads n
          where n.stid <> (select eid from entry)
          group by n.np
        ),
        dups as (
          select n.lid from normleads n join worked w on w.np = n.np
          where n.stid = (select eid from entry)
        )
        delete from lead_stage_events where lead_id in (select lid from dups);
        """
        sql(q, token)
        q2 = q.replace("delete from lead_stage_events where lead_id in (select lid from dups);",
                       "delete from leads where id in (select lid from dups);")
        sql(q2, token)
        n = rest(f"leads?select=id&pipeline_id=eq.{pid}")
        removed_total += len(n) if False else 0  # il conteggio vero lo stampa il monitor
    # conteggio finale pulito: totale 'Nuovi Lead' rimasti
    tot_new = 0
    for p in pipes:
        entry = [s["id"] for s in rest(f"stages?select=id,is_entry&pipeline_id=eq.{p['id']}") if s["is_entry"]]
        if entry:
            tot_new += len(rest(f"leads?select=id&pipeline_id=eq.{p['id']}&stage_id=eq.{entry[0]}"))
    print(f"merge-dups completata | 'Nuovi Lead' totali rimasti: {tot_new}")


if __name__ == "__main__":
    main()
