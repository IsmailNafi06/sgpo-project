"""
CORRECTIONS AUTO — qualité recommandations utilisateur
1. Propagation ville ETAB → FILIERE (FILIEREs sans ville ou ville ≠ ETAB, 1 seul ETAB lié)
2. Correction cout_estime = 630000 → 0 (EM6MV nœuds ETAB + FILIERE)
Dry-run par défaut. Passer DRY_RUN=False pour appliquer.
"""

import json, re, unicodedata, sys, shutil
from datetime import datetime
from collections import defaultdict
from pathlib import Path

DRY_RUN = False   # ← False = APPLY

sys.stdout.reconfigure(encoding='utf-8')

DATA = 'backend/src/main/resources/data'
NODES_PATH = Path(f'{DATA}/nodes_all.json')

with open(NODES_PATH, 'r', encoding='utf-8') as f:
    nodes = json.load(f)
with open(f'{DATA}/edges.json', 'r', encoding='utf-8') as f:
    edges = json.load(f)

nodes_by_id = {str(n['id']): n for n in nodes}

def norm(s):
    s = (s or '').lower().strip()
    s = unicodedata.normalize('NFD', s)
    s = ''.join(c for c in s if unicodedata.category(c) != 'Mn')
    return re.sub(r'\s+', ' ', s).strip()

# Construire mapping FILIERE → liste ETABs
filiere_etabs = defaultdict(list)
for e in edges:
    if e.get('type_lien') == 'OFFERTE_PAR':
        fid = str(e.get('source_id', ''))
        eid = str(e.get('target_id', ''))
        filiere_etabs[fid].append(eid)

filieres = {str(n['id']): n for n in nodes if n.get('type') == 'FILIERE'}
etabs    = {str(n['id']): n for n in nodes if n.get('type') == 'ETABLISSEMENT'}

changes_ville_propagation  = []  # (fid, old_ville, new_ville, raison)
changes_ville_correction   = []  # (fid, old_ville, new_ville, raison)
changes_cout               = []  # (nid, type, nom, old_cout, new_cout)

# ── 1. PROPAGATION VILLE ETAB → FILIERE ──────────────────────────────────────
for fid, fil in filieres.items():
    etab_ids = filiere_etabs.get(fid, [])
    # Règle : exactement 1 ETAB lié → pas d'ambiguïté
    if len(etab_ids) != 1:
        continue
    eid  = etab_ids[0]
    etab = etabs.get(eid, {})
    etab_ville = (etab.get('ville') or '').strip()
    if not etab_ville:
        continue

    fil_ville = (fil.get('ville') or '').strip()

    # Cas 1 : Filière sans ville mais ETAB localisé
    if not fil_ville:
        changes_ville_propagation.append((fid, '', etab_ville, f'Héritage depuis {etab.get("nom_fr","")[:40]}'))

    # Cas 2 : Filière avec ville différente de son ETAB
    elif norm(fil_ville) != norm(etab_ville):
        changes_ville_correction.append((fid, fil_ville, etab_ville, f'ETAB={etab.get("nom_fr","")[:40]} est à {etab_ville}'))

# ── 2. CORRECTION COUT_ESTIME 630000 → 0 ─────────────────────────────────────
EM6MV_IDS = {
    'd0076634-c744-4660-a385-d286b8fe8c7f',   # FILIERE Doctorat Med Vét EM6MV
    '3b48da93-6f54-0feb-f89b-37ab75ed5a52',   # ETAB Ecole Mohammed VI Méd Vét
}
for n in nodes:
    nid = str(n.get('id', ''))
    if nid in EM6MV_IDS and (n.get('cout_estime') or 0) != 0:
        changes_cout.append((nid, n.get('type',''), n.get('nom_fr','')[:55],
                              n.get('cout_estime'), 0))

# ── RAPPORT DRY-RUN ───────────────────────────────────────────────────────────
SEP = '═' * 68
sep = '─' * 68
print(SEP)
mode = 'DRY-RUN (aucun fichier modifié)' if DRY_RUN else 'APPLICATION RÉELLE'
print(f'  CORRECTIONS AUTO — {mode}')
print(SEP)
print()
print(f'  [1] Propagation ville (sans ville → hérite ETAB) : {len(changes_ville_propagation)} filières')
for fid, old, new, raison in changes_ville_propagation[:15]:
    nom = filieres[fid].get('nom_fr','')[:52]
    print(f'       {nom}')
    print(f'         ∅ → {new}  |  {raison}')
if len(changes_ville_propagation) > 15:
    print(f'       ... + {len(changes_ville_propagation)-15} autres')
print()
print(f'  [2] Correction ville (ville filière ≠ ville ETAB) : {len(changes_ville_correction)} filières')
for fid, old, new, raison in changes_ville_correction[:10]:
    nom = filieres[fid].get('nom_fr','')[:52]
    print(f'       {nom}')
    print(f'         {old} → {new}  |  {raison}')
if len(changes_ville_correction) > 10:
    print(f'       ... + {len(changes_ville_correction)-10} autres')
print()
print(f'  [3] Correction coût EM6MV : {len(changes_cout)} nœuds')
for nid, ntype, nom, old, new in changes_cout:
    print(f'       [{ntype}] {nom}')
    print(f'         {old} → {new} MAD')
print()

total_changes = len(changes_ville_propagation) + len(changes_ville_correction) + len(changes_cout)
print(f'  Total nœuds modifiés : {total_changes}')
print()

if DRY_RUN:
    print('  Mode DRY-RUN — aucune modification effectuée.')
    print(sep)
    sys.exit(0)

# ── APPLICATION ────────────────────────────────────────────────────────────────
ts  = datetime.now().strftime('%Y%m%d_%H%M%S')
bak = NODES_PATH.with_suffix(f'.bak_corrections_auto_{ts}')
shutil.copy2(NODES_PATH, bak)
print(f'  Backup créé : {bak.name}')
print()

nodes_modified = 0
for n in nodes:
    nid = str(n.get('id', ''))

    # Propagation ville
    for fid, old, new, _ in changes_ville_propagation:
        if nid == fid:
            n['ville'] = new
            nodes_modified += 1
            break

    # Correction ville
    for fid, old, new, _ in changes_ville_correction:
        if nid == fid:
            n['ville'] = new
            nodes_modified += 1
            break

    # Correction coût
    for cnid, _, _, old, new in changes_cout:
        if nid == cnid:
            n['cout_estime'] = new
            nodes_modified += 1
            break

with open(NODES_PATH, 'w', encoding='utf-8') as f:
    json.dump(nodes, f, ensure_ascii=False, indent=2)

# Validation
with open(NODES_PATH, 'r', encoding='utf-8') as f:
    check = json.load(f)

print(f'  JSON valide          : {"OUI" if len(check) == len(nodes) else "NON — ERREUR"}')
print(f'  Nœuds totaux         : {len(check)}  (inchangé)')
print(f'  Nœuds modifiés       : {nodes_modified}')
print(f'  Villes propagées     : {len(changes_ville_propagation)}')
print(f'  Villes corrigées     : {len(changes_ville_correction)}')
print(f'  Coûts corrigés       : {len(changes_cout)}')
print()

# Vérification spot-check
em6mv_after = [n for n in check if str(n.get('id','')) in EM6MV_IDS]
for n in em6mv_after:
    print(f'  CHECK EM6MV [{n.get("type")}] cout={n.get("cout_estime")}  → {"OK" if n.get("cout_estime") == 0 else "ECHEC"}')

sample_propagated = changes_ville_propagation[0] if changes_ville_propagation else None
if sample_propagated:
    fid, _, expected_ville, _ = sample_propagated
    n_check = next((n for n in check if str(n.get('id','')) == fid), None)
    if n_check:
        actual = n_check.get('ville','')
        print(f'  CHECK VILLE sample : {n_check.get("nom_fr","")[:40]} → ville={actual}  → {"OK" if actual == expected_ville else "ECHEC"}')

print()
print(sep)
print('  APPLICATION TERMINÉE')
print(sep)
