"""
APPLICATION — Corrections données Euromed/UEMF
7 ETABs Euromed : ville→Fes, secteur corrigé, cout_estime→80000
1 FILIERE "Docteur en Pharmacie" : ville→Fes, cout_estime→80000
Crée un backup avant modification.
"""

import json, re, unicodedata, shutil, sys
from datetime import datetime
from pathlib import Path

sys.stdout.reconfigure(encoding='utf-8')

DATA       = 'backend/src/main/resources/data'
NODES_PATH = Path(f'{DATA}/nodes_all.json')

with open(NODES_PATH, 'r', encoding='utf-8') as f:
    nodes = json.load(f)

# ── NORMALISATION ─────────────────────────────────────────────────────────────
def normalize(s):
    s = (s or '').upper().strip()
    s = unicodedata.normalize('NFD', s)
    s = ''.join(c for c in s if unicodedata.category(c) != 'Mn')
    s = re.sub(r"[''`\-]", ' ', s)
    s = re.sub(r'[^\w\s]', ' ', s)
    return re.sub(r'\s+', ' ', s).strip()

# ── DÉTECTION EUROMED (token de marque uniquement — pas l'adjectif générique) ─
def is_euromed_etab(n):
    nom_n  = normalize(n.get('nom_fr','') or '')
    code_n = normalize(n.get('code','')   or '')
    return ('EUROMED' in nom_n or 'EUROMED' in code_n
            or re.search(r'\bUEMF\b', nom_n) is not None
            or re.search(r'\bUEMF\b', code_n) is not None)

# ── INFÉRENCE SECTEUR ─────────────────────────────────────────────────────────
def infer_secteur(nom_fr):
    u = (nom_fr or '').upper()
    if any(k in u for k in ('PHARMACIE',)):                              return 'Sante'
    if any(k in u for k in ('MEDECINE', 'BIOMEDTECH', 'BIOMED')):       return 'Sante'
    if any(k in u for k in ('BUSINESS', 'COMMERCE', 'GESTION', 'MANAGEMENT')): return 'Commerce'
    if any(k in u for k in ('ARCHITECTURE', 'URBANISME', 'DESIGN')):    return 'Architecture'
    if any(k in u for k in ('HUMAINES', 'SOCIALES', 'POLITIQUES', 'DROIT', 'JURIDIQUES')): return 'Sciences humaines'
    if any(k in u for k in ('INGENIEUR', 'POLYTECHNIC', 'ENGINEERING', 'INSA', 'TECHNIQUE')): return 'Ingenierie'
    return 'Sciences'

FILIERE_EUROMED_ID   = '422d9fb4-91a0-daff-d7b9-28f31a0bc252'
EUROMED_VILLE        = 'Fes'
EUROMED_COUT         = 80000

# ── COLLECTE DES CHANGEMENTS ──────────────────────────────────────────────────
etab_changes    = []
filiere_changes = []

for n in nodes:
    nid  = str(n.get('id', ''))
    ntype = n.get('type', '')

    if ntype == 'ETABLISSEMENT' and is_euromed_etab(n):
        sect_n = infer_secteur(n.get('nom_fr', ''))
        etab_changes.append({
            'id':     nid,
            'nom':    n.get('nom_fr', ''),
            'ville_a': n.get('ville', '') or '',
            'sect_a':  n.get('secteur', '') or '',
            'cout_a':  n.get('cout_estime') or 0,
            'sect_n':  sect_n,
        })

    if nid == FILIERE_EUROMED_ID:
        filiere_changes.append({
            'id':    nid,
            'nom':   n.get('nom_fr', ''),
            'ville_a': n.get('ville', '') or '',
            'cout_a':  n.get('cout_estime') or 0,
        })

# ── RAPPORT PRÉ-APPLICATION ───────────────────────────────────────────────────
SEP = '═' * 68
sep = '─' * 68
print(SEP)
print('  APPLICATION — Corrections Euromed (nodes_all.json)')
print(SEP)
print()
print(f'  ETABs Euromed détectés : {len(etab_changes)}')
for c in etab_changes:
    print(f'    {c["nom"][:58]}')
    print(f'      ville  : "{c["ville_a"]}"  →  "{EUROMED_VILLE}"')
    print(f'      secteur: "{c["sect_a"]}"  →  "{c["sect_n"]}"')
    print(f'      cout   : {c["cout_a"]}  →  {EUROMED_COUT}')
print()
if filiere_changes:
    c = filiere_changes[0]
    print(f'  FILIERE liée :')
    print(f'    {c["nom"][:58]}  (id: {c["id"]})')
    print(f'      ville  : "{c["ville_a"]}"  →  "{EUROMED_VILLE}"')
    print(f'      cout   : {c["cout_a"]}  →  {EUROMED_COUT}')
else:
    print('  FILIERE 422d9fb4 : non trouvée dans les nœuds')
print()

total = len(etab_changes) + len(filiere_changes)
print(f'  Nœuds à modifier : {total}')
print()

# ── BACKUP ────────────────────────────────────────────────────────────────────
ts  = datetime.now().strftime('%Y%m%d_%H%M%S')
bak = NODES_PATH.with_suffix(f'.bak_euromed_{ts}')
shutil.copy2(NODES_PATH, bak)
print(f'  Backup créé : {bak.name}')
print()

# ── APPLICATION ───────────────────────────────────────────────────────────────
etab_ids    = {c['id'] for c in etab_changes}
filiere_ids = {c['id'] for c in filiere_changes}
modified    = 0

for n in nodes:
    nid = str(n.get('id', ''))

    if nid in etab_ids:
        sect_n = next(c['sect_n'] for c in etab_changes if c['id'] == nid)
        n['ville']        = EUROMED_VILLE
        n['secteur']      = sect_n
        n['cout_estime']  = EUROMED_COUT
        modified += 1

    if nid in filiere_ids:
        n['ville']       = EUROMED_VILLE
        n['cout_estime'] = EUROMED_COUT
        modified += 1

with open(NODES_PATH, 'w', encoding='utf-8') as f:
    json.dump(nodes, f, ensure_ascii=False, indent=2)

# ── VALIDATION ────────────────────────────────────────────────────────────────
with open(NODES_PATH, 'r', encoding='utf-8') as f:
    check = json.load(f)

print(f'  JSON valide      : {"OUI" if len(check) == len(nodes) else "NON — ERREUR"}')
print(f'  Nœuds totaux     : {len(check)}  (inchangé)')
print(f'  Nœuds modifiés   : {modified}')
print()

# Spot-checks
print('  SPOT-CHECKS :')
for c in etab_changes:
    n_ch = next((n for n in check if str(n.get('id','')) == c['id']), None)
    if n_ch:
        ok_v = n_ch.get('ville','') == EUROMED_VILLE
        ok_c = (n_ch.get('cout_estime') or 0) == EUROMED_COUT
        status = 'OK' if (ok_v and ok_c) else 'ECHEC'
        print(f'    [{status}] {n_ch.get("nom_fr","")[:50]}  ville={n_ch.get("ville")}  cout={n_ch.get("cout_estime")}')

if filiere_changes:
    fid = filiere_changes[0]['id']
    n_ch = next((n for n in check if str(n.get('id','')) == fid), None)
    if n_ch:
        ok_v = n_ch.get('ville','') == EUROMED_VILLE
        ok_c = (n_ch.get('cout_estime') or 0) == EUROMED_COUT
        status = 'OK' if (ok_v and ok_c) else 'ECHEC'
        print(f'    [{status}] FILIERE {n_ch.get("nom_fr","")[:45]}  ville={n_ch.get("ville")}  cout={n_ch.get("cout_estime")}')

print()
print(sep)
print('  APPLICATION TERMINÉE')
print(sep)
