"""Overlay SQLite di punti custom, editabile dall'agente.

I dati fissi (comuni/rifugi/rotte/soste OSM) restano incorporati in index.html e sono
la BASE autorevole. Qui vive il layer che integra/corregge quella base: aggiunte trovate
sul web o dall'utente (es. un'area camper non mappata), correzioni, punti personali.
Un file `punti.db` accanto al backend; una connessione per chiamata (thread-safe con AgentOS).
"""
from __future__ import annotations

import json
import sqlite3
from math import radians, sin, cos, asin, sqrt
from pathlib import Path

from agno.tools import tool

DB = str(Path(__file__).with_name("punti.db"))


def _conn() -> sqlite3.Connection:
    c = sqlite3.connect(DB)
    c.execute(
        """CREATE TABLE IF NOT EXISTS punti(
             id INTEGER PRIMARY KEY AUTOINCREMENT,
             nome TEXT NOT NULL,
             tipo TEXT,
             lat REAL NOT NULL,
             lon REAL NOT NULL,
             quota_m INTEGER,
             note TEXT,
             fonte TEXT,
             creato TEXT DEFAULT (datetime('now')))"""
    )
    return c


def _haversine_km(alat: float, alon: float, blat: float, blon: float) -> float:
    dlat, dlon = radians(blat - alat), radians(blon - alon)
    s = sin(dlat / 2) ** 2 + cos(radians(alat)) * cos(radians(blat)) * sin(dlon / 2) ** 2
    return 2 * 6371 * asin(sqrt(s))


@tool(name="aggiungi_punto",
      description="Salva un punto NON presente nei dati fissi (area camper, sorgente, rifugio o "
                  "accesso non mappato, correzione) scoperto dal web o indicato dall'utente. "
                  "Campi: nome, lat, lon, tipo (rifugio/bivacco/sosta_camper/parcheggio/acqua/punto), "
                  "e se noti quota_m, note, fonte(URL). Prima verifica con punti_vicini di non duplicare.")
def aggiungi_punto(nome: str, lat: float, lon: float, tipo: str = "punto",
                   quota_m: int | None = None, note: str | None = None, fonte: str | None = None) -> str:
    c = _conn()
    cur = c.execute("INSERT INTO punti(nome,tipo,lat,lon,quota_m,note,fonte) VALUES(?,?,?,?,?,?,?)",
                    (nome, tipo, lat, lon, quota_m, note, fonte))
    c.commit()
    new_id = cur.lastrowid
    c.close()
    return json.dumps({"ok": True, "id": new_id, "nome": nome}, ensure_ascii=False)


@tool(name="punti_vicini",
      description="Elenca i punti CUSTOM salvati (overlay che integra/corregge i dati fissi OSM) "
                  "entro un raggio da coordinate. Usalo INSIEME a rifugi_vicini/soste_camper_vicine "
                  "così non perdi ciò che è stato salvato in precedenza.")
def punti_vicini(lat: float, lon: float, raggio_km: float = 20) -> str:
    c = _conn()
    rows = c.execute("SELECT id,nome,tipo,lat,lon,quota_m,note,fonte FROM punti").fetchall()
    c.close()
    out = [{"id": r[0], "nome": r[1], "tipo": r[2], "lat": r[3], "lon": r[4],
            "quota_m": r[5], "note": r[6], "fonte": r[7]}
           for r in rows if _haversine_km(lat, lon, r[3], r[4]) <= raggio_km]
    return json.dumps({"punti": out}, ensure_ascii=False)


@tool(name="elimina_punto", description="Elimina un punto custom per id (trovalo con punti_vicini).")
def elimina_punto(id: int) -> str:
    c = _conn()
    c.execute("DELETE FROM punti WHERE id=?", (id,))
    c.commit()
    c.close()
    return json.dumps({"ok": True, "id": id})


PUNTI_TOOLS = [aggiungi_punto, punti_vicini, elimina_punto]
