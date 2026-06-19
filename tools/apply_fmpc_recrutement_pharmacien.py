"""
APPLICATION — Ajout arête RECRUTEMENT manquante
  FMPC Pharmacie Casablanca (43d0776b) → Pharmacien (873f9abe)
"""

import json, uuid, shutil, sys
from datetime import datetime
from pathlib import Path

sys.stdout.reconfigure(encoding='utf-8')

EDGES_PATH = Path('backend/src/main/resources/data/edges.json')
NODES_PATH = Path('backend/src/main/resources/data/nodes_all.json')

with open(EDGES_PATH, 'r', encoding='utf-8') as f:
    edges = json.load(f)
with open(NODES_PATH, 'r', encoding='utf-8') as f:
    nodes = json.load(f)

nmap = {str(n['id']): n for n in nodes}

SOURCE_ID = '43d0776b-9262-ef44-2ebe-6a87d05f0960'  # FMPC Pharmacie Casablanca
TARGET_ID = '873f9abe-bb3a-4fb2-a8dd-756bd4c2544a'  # Pharmacien
TYPE_LIEN = 'RECRUTEMENT'

SEP = '═' * 68
sep = '─' * 68

print(SEP)
print('  DRY-RUN — RECRUTEMENT FMPC → Pharmacien')
print(SEP)

# ── 1. Vérification que les nœuds existent ──────────────────────────────────
src_node = nmap.get(SOURCE_ID)
tgt_node = nmap.get(TARGET_ID)

src_ok = src_node is not None
tgt_ok = tgt_node is not None

print(f'\n  Nœud source  : {"✅" if src_ok else "❌"} {src_node.get("nom_fr","") if src_node else "INTROUVABLE"}')
print(f'  Nœud cible   : {"✅" if tgt_ok else "❌"} {tgt_node.get("nom_fr","") if tgt_node else "INTROUVABLE"}')

if not src_ok or not tgt_ok:
    print('\n  ❌ ARRÊT — nœud manquant')
    sys.exit(1)

# ── 2. Vérification d'absence de doublon ────────────────────────────────────
doublon = any(
    e.get('source_id') == SOURCE_ID
    and e.get('target_id') == TARGET_ID
    and e.get('type_lien') == TYPE_LIEN
    for e in edges
)
print(f'\n  Doublon existant : {"❌ OUI — ARRÊT" if doublon else "✅ Non"}')
if doublon:
    sys.exit(1)

# ── 3. Self-loop check ───────────────────────────────────────────────────────
self_loop = SOURCE_ID == TARGET_ID
print(f'  Self-loop        : {"❌ OUI — ARRÊT" if self_loop else "✅ Non"}')
if self_loop:
    sys.exit(1)

# ── 4. Construction de la nouvelle arête ────────────────────────────────────
# Même schéma que les RECRUTEMENT existants de FMPC :
# taux_reussite=65 (pharmacien public, concours national)
new_edge = {
    'id':                        str(uuid.uuid4()),
    'source_id':                 SOURCE_ID,
    'target_id':                 TARGET_ID,
    'type_lien':                 TYPE_LIEN,
    'taux_reussite':             65,
    'cout_supplementaire':       0,
    'duree_supplementaire_mois': 0,
    'prerequis_notes':           '',
    'moyenne_minimale':          None,
    'type_acces':                'OUVERT',
}

print(f'\n  Arête à créer :')
print(f'    id             : {new_edge["id"]}')
print(f'    source_id      : {new_edge["source_id"]}')
print(f'    target_id      : {new_edge["target_id"]}')
print(f'    type_lien      : {new_edge["type_lien"]}')
print(f'    taux_reussite  : {new_edge["taux_reussite"]}')
print(f'    type_acces     : {new_edge["type_acces"]}')

# ── 5. Backup ────────────────────────────────────────────────────────────────
ts  = datetime.now().strftime('%Y%m%d_%H%M%S')
bak = EDGES_PATH.with_suffix(f'.bak_fmpc_rec_{ts}')
shutil.copy2(EDGES_PATH, bak)
print(f'\n  Backup : {bak.name}')

# ── 6. Application ───────────────────────────────────────────────────────────
edges_updated = edges + [new_edge]
with open(EDGES_PATH, 'w', encoding='utf-8') as f:
    json.dump(edges_updated, f, ensure_ascii=False, indent=2)

# ── 7. Validation ────────────────────────────────────────────────────────────
with open(EDGES_PATH, 'r', encoding='utf-8') as f:
    check = json.load(f)

all_ids = set(nmap.keys())
json_ok = len(check) == len(edges_updated)
orphan  = SOURCE_ID not in all_ids or TARGET_ID not in all_ids
confirm_present = any(
    e.get('source_id') == SOURCE_ID
    and e.get('target_id') == TARGET_ID
    and e.get('type_lien') == TYPE_LIEN
    for e in check
)

print(sep)
print('  VALIDATION')
print(sep)
print(f'  JSON valide         : {"✅" if json_ok else "❌"}')
print(f'  Arêtes avant/après  : {len(edges)} / {len(check)} (+{len(check)-len(edges)})')
print(f'  Arête présente      : {"✅" if confirm_present else "❌"}')
print(f'  Arêtes orphelines   : {"✅ 0" if not orphan else "❌ ORPHELINE DÉTECTÉE"}')
print(f'  Self-loop           : {"✅ Non" if not self_loop else "❌"}')

# Doublon final
doublons_finals = {}
for e in check:
    k = (e.get('source_id'), e.get('target_id'), e.get('type_lien'))
    doublons_finals[k] = doublons_finals.get(k, 0) + 1
nb_doublons = sum(1 for v in doublons_finals.values() if v > 1)
print(f'  Doublons            : {"✅ 0" if nb_doublons == 0 else f"❌ {nb_doublons}"}')

print(SEP)
print('  APPLICATION TERMINÉE')
print(SEP)
