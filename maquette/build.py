#!/usr/bin/env python3
"""Génère swatter-tv-maquette.html : la maquette en un seul fichier
(images et polices intégrées), à envoyer au client par mail ou WeTransfer."""
import base64
import pathlib
import re

ROOT = pathlib.Path(__file__).resolve().parent
MIME = {".jpg": "image/jpeg", ".png": "image/png", ".woff2": "font/woff2"}


def inline(match: re.Match) -> str:
    path = ROOT / match.group(1)
    data = base64.b64encode(path.read_bytes()).decode()
    return f"data:{MIME[path.suffix]};base64,{data}"


html = (ROOT / "index.html").read_text(encoding="utf-8")
html = re.sub(r"(assets/[\w./-]+\.(?:jpg|png|woff2))", inline, html)
out = ROOT / "swatter-tv-maquette.html"
out.write_text(html, encoding="utf-8")
print(f"{out.name} : {out.stat().st_size / 1024:.0f} Ko")
