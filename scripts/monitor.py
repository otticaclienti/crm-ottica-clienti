#!/usr/bin/env python3
"""Monitoraggio CRM Ottica — "arrivano i lead?"

Legge service_role e token Meta dal Portachiavi macOS.
Regola: gli avvisi 🔴 scattano solo quando c'è un vero problema:
  - campagne PUBBLICITARIE ATTIVE ma nessun lead nel CRM da 3+ giorni
  - lead presenti su Meta ma NON entrati nel CRM (flusso interrotto)
I clienti con le ads spente vengono solo elencati come promemoria.
"""
import json
import subprocess
import urllib.request
import urllib.parse
import datetime

BASE = "https://azexrewuoantizffdveo.supabase.co"
WHO = subprocess.check_output(["whoami"]).decode().strip()


def keychain(name: str) -> str:
    return subprocess.check_output(
        ["security", "find-generic-password", "-s", name, "-a", WHO, "-w"]
    ).decode().strip()


def rest(path: str, key: str):
    req = urllib.request.Request(
        BASE + "/rest/v1/" + path,
        headers={"apikey": key, "Authorization": "Bearer " + key},
    )
    return json.loads(urllib.request.urlopen(req, timeout=30).read().decode())


def meta(url: str, token: str):
    sep = "&" if "?" in url else "?"
    r = urllib.request.urlopen(
        url + sep + "access_token=" + urllib.parse.quote(token, safe=""),
        timeout=30,
    )
    return json.loads(r.read().decode())


def parse_utc(s: str) -> datetime.datetime:
    # gestisce sia "+00:00" (CRM) sia "+0000" (Meta)
    return datetime.datetime.strptime(s[:19], "%Y-%m-%dT%H:%M:%S").replace(tzinfo=datetime.timezone.utc)


def main() -> None:
    key = keychain("supabase-service-role")
    problems: list[str] = []
    ads_off: list[str] = []

    clients = rest("clients?select=id,name,meta_page_token,meta_page_id,meta_ad_account_id", key)
    pipes = rest("pipelines?select=client_id,meta_ad_account_id", key)
    ad_by_client: dict = {}
    for p in pipes:
        if p.get("meta_ad_account_id"):
            ad_by_client.setdefault(p["client_id"], set()).add(p["meta_ad_account_id"])
    cutoff = (datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(days=3)).isoformat()

    try:
        meta_token = keychain("meta-ads-token")
        have_meta = True
    except Exception:
        meta_token, have_meta = "", False

    for c in clients:
        last = rest(
            f"leads?select=created_at&client_id=eq.{c['id']}&order=created_at.desc&limit=1",
            key,
        )
        if not last:
            continue
        last_iso = last[0]["created_at"]

        # quali account pubblicitari guardare (cliente + pipeline)
        ads = set()
        if c.get("meta_ad_account_id"):
            ads.add(c["meta_ad_account_id"])
        ads |= ad_by_client.get(c["id"], set())

        # campagne LEAD attive? (le campagne engagement/notorietà non portano lead)
        ads_active = False
        if have_meta and ads:
            for act in sorted(ads):
                try:
                    camp = meta(
                        f"https://graph.facebook.com/v21.0/act_{act}/campaigns?fields=effective_status,objective&limit=100",
                        meta_token,
                    ).get("data", [])
                    if any(
                        x.get("effective_status") == "ACTIVE"
                        and "LEAD" in (x.get("objective") or "").upper()
                        for x in camp
                    ):
                        ads_active = True
                        break
                except Exception:
                    continue

        # lead su Meta più recenti del CRM? (solo se ads attive o a scopo diagnostico)
        page_tok = c.get("meta_page_token")
        page_id = c.get("meta_page_id")
        latest_meta = None
        if have_meta and page_tok and page_id:
            try:
                forms = meta(
                    f"https://graph.facebook.com/v21.0/{page_id}/leadgen_forms?fields=id&limit=200",
                    page_tok,
                ).get("data", [])
                for f in forms:
                    d = meta(
                        f"https://graph.facebook.com/v21.0/{f['id']}/leads?fields=created_time&limit=1",
                        page_tok,
                    ).get("data", [])
                    if d and (latest_meta is None or d[0]["created_time"] > latest_meta):
                        latest_meta = d[0]["created_time"]
            except Exception:
                pass

        if latest_meta and parse_utc(latest_meta) > parse_utc(last_iso):
            gap = (parse_utc(latest_meta) - parse_utc(last_iso)).total_seconds()
            if gap > 3 * 3600:
                problems.append(
                    f"🔴 {c['name']}: lead su Meta ({latest_meta[:16]}) NON entrati nel CRM "
                    f"(ultimo CRM: {last_iso[:16]}) — flusso interrotto"
                )
        elif ads_active and last_iso < cutoff:
            d = (datetime.datetime.now(datetime.timezone.utc) - parse_utc(last_iso)).days
            problems.append(f"🔴 {c['name']}: ads ATTIVE ma nessun lead da {d} giorni")
        elif not ads_active and ads:
            ads_off.append(c["name"])

    if ads_off:
        print("🟡 ads spente (promemoria): " + ", ".join(sorted(ads_off)))
    if problems:
        print("\n".join(problems))
    elif ads_off:
        print("(nessun problema: i clienti con ads spente sono elencati sopra)")
    else:
        print("TUTTO OK")


if __name__ == "__main__":
    main()
