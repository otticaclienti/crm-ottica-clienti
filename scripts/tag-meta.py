#!/usr/bin/env python3
"""Aggancia meta_lead_id ai lead senza ID Meta, abbinando per telefono i lead
dei form Meta (stessa logica della funzione edge, eseguita localmente).
Chiamato dal monitoraggio mattutino."""
import json
import re
import subprocess
import time
import urllib.request
import urllib.parse

BASE = "https://azexrewuoantizffdveo.supabase.co"
WHO = subprocess.check_output(["whoami"]).decode().strip()


def keychain(name: str) -> str:
    return subprocess.check_output(
        ["security", "find-generic-password", "-s", name, "-a", WHO, "-w"]
    ).decode().strip()


def norm_phone(s):
    d = re.sub(r"\D", "", s or "")
    if not d:
        return None
    for pref in ("0039", "39"):
        if d.startswith(pref) and len(d) > 10:
            d = d[len(pref):]
            break
    return d[-10:] if len(d) > 10 else d


def rest(path, key, init=None):
    req = urllib.request.Request(BASE + "/rest/v1/" + path, headers={"apikey": key, "Authorization": "Bearer " + key})
    if init and init.get("method"):
        req = urllib.request.Request(
            BASE + "/rest/v1/" + path,
            data=json.dumps(init["body"]).encode() if init.get("body") else None,
            headers={"apikey": key, "Authorization": "Bearer " + key, "Content-Type": "application/json", "Prefer": "return=minimal"},
            method=init["method"],
        )
    return json.loads(urllib.request.urlopen(req, timeout=30).read().decode())


def meta_get(url, token, tries=3):
    sep = "&" if "?" in url else "?"
    full = url + sep + "access_token=" + urllib.parse.quote(token, safe="")
    for i in range(tries):
        try:
            return json.loads(urllib.request.urlopen(full, timeout=25).read().decode())
        except Exception:
            if i == tries - 1:
                raise
            time.sleep(2)


def main() -> None:
    key = keychain("supabase-service-role")
    clients = rest("clients?select=id,name,meta_page_token,meta_page_id&meta_page_token=not.is.null", key)
    updated_total = 0
    for c in clients:
        if not c.get("meta_page_id") or not c.get("meta_page_token"):
            continue
        meta_token = c["meta_page_token"]
        leads = rest(
            f"leads?select=id,phone&client_id=eq.{c['id']}&meta_lead_id=is.null&order=created_at.asc&limit=2000",
            key,
        )
        byphone = {}
        for l in leads:
            p = norm_phone(l.get("phone"))
            if p:
                byphone.setdefault(p, []).append(l["id"])
        forms = meta_get(f"https://graph.facebook.com/v21.0/{c['meta_page_id']}/leadgen_forms?fields=id", meta_token).get("data", [])
        matched = 0
        for f in forms:
            url = f"https://graph.facebook.com/v21.0/{f['id']}/leads?fields=id,field_data&limit=100"
            for _ in range(15):
                if not url:
                    break
                d = meta_get(url, meta_token)
                for ml in d.get("data", []):
                    phone = None
                    for fd in ml.get("field_data", []):
                        if fd.get("name", "").lower() in ("phone_number", "phone", "telefono", "numero di telefono", "cellulare"):
                            phone = norm_phone(fd.get("values", [None])[0])
                            break
                    if not phone:
                        continue
                    ids = byphone.get(phone)
                    if not ids:
                        continue
                    try:
                        rest(f"leads?id=eq.{ids[0]}", key, {"method": "PATCH", "body": {"meta_lead_id": ml["id"]}})
                        matched += 1
                        byphone.pop(phone, None)
                    except Exception:
                        pass
                url = d.get("paging", {}).get("next")
        updated_total += matched
        if matched:
            print(f"🏷️ {c['name']}: {matched} lead agganciati")
    print(f"tag-meta completato: {updated_total} aggiornamenti")


if __name__ == "__main__":
    main()
