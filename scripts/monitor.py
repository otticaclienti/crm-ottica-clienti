#!/usr/bin/env python3
"""Monitoraggio CRM Ottica: clienti senza lead da 3+ giorni e campagne Meta spente.

Legge la chiave service_role e il token Meta dal Portachiavi macOS.
Stampa SOLO i problemi; "TUTTO OK" se non ce ne sono.
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


def main() -> None:
    key = keychain("supabase-service-role")
    problems: list[str] = []

    # --- lead per cliente ---
    clients = rest("clients?select=id,name,meta_ad_account_id", key)
    pipes = rest("pipelines?select=client_id,meta_ad_account_id", key)
    ad_by_client: dict[str, set] = {}
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
            problems.append(f"🔴 {c['name']}: nessun lead mai registrato")
            continue
        last_iso = last[0]["created_at"]
        if last_iso < cutoff:
            d = (datetime.datetime.now(datetime.timezone.utc)
                 - datetime.datetime.fromisoformat(last_iso.replace("Z", "+00:00"))).days
            problems.append(f"🔴 {c['name']}: nessun lead da {d} giorni (ultimo: {last_iso[:10]})")

        # --- campagne Meta ---
        if not have_meta:
            continue
        ads = set()
        if c.get("meta_ad_account_id"):
            ads.add(c["meta_ad_account_id"])
        ads |= ad_by_client.get(c["id"], set())
        for act in sorted(ads):
            try:
                camp = meta(
                    f"https://graph.facebook.com/v21.0/act_{act}/campaigns?fields=name,effective_status&limit=50",
                    meta_token,
                ).get("data", [])
            except Exception:
                problems.append(f"⚠️ {c['name']}: impossibile leggere le campagne (account {act[:8]}…)")
                continue
            active = [x for x in camp if x.get("effective_status") == "ACTIVE"]
            if not active:
                problems.append(f"🟠 {c['name']}: ad account {act[:8]}… senza campagne attive")

    if problems:
        print("\n".join(problems))
    else:
        print("TUTTO OK")


if __name__ == "__main__":
    main()
