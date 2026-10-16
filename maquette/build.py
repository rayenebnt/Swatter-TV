#!/usr/bin/env python3
"""Génère swatter-tv-maquette.html : la maquette en un seul fichier
(images et polices intégrées), à envoyer au client par mail ou WeTransfer."""
import base64
import json
import pathlib
import re

ROOT = pathlib.Path(__file__).resolve().parent
MIME = {".jpg": "image/jpeg", ".png": "image/png", ".webp": "image/webp", ".woff2": "font/woff2"}
JS_VISUELS = "const V = n => `assets/visuels/${n}.webp`;"


def data_uri(path: pathlib.Path) -> str:
    return f"data:{MIME[path.suffix]};base64,{base64.b64encode(path.read_bytes()).decode()}"


html = (ROOT / "index.html").read_text(encoding="utf-8")
# le préchargement n'a plus de sens quand l'image est intégrée
html = re.sub(r'<link rel="preload" as="image"[^>]*>\n', "", html)
# visuels appelés par le script (cartes, grille TV, recherche…)
script = html[html.index("<script>"):]
noms = sorted({p.stem for p in (ROOT / "assets/visuels").glob("*.webp") if re.search(rf"['\"]{p.stem}['\"]", script)})
table = {n: data_uri(ROOT / f"assets/visuels/{n}.webp") for n in noms}
assert JS_VISUELS in html, "définition de V() introuvable"
html = html.replace(JS_VISUELS, f"const VIS = {json.dumps(table)};\nconst V = n => VIS[n];")
# ressources référencées directement dans le HTML et le CSS
html = re.sub(r"assets/[\w./-]+\.(?:jpg|png|webp|woff2)", lambda m: data_uri(ROOT / m.group(0)), html)
out = ROOT / "swatter-tv-maquette.html"
out.write_text(html, encoding="utf-8")
print(f"{out.name} : {out.stat().st_size / 1024:.0f} Ko, {len(noms)} visuels pour le script")
