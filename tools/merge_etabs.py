"""
merge_etabs.py — Fusion des ETABs dupliqués dans nodes_all.json et edges.json.

CONTRAINTES :
  - Fusionne uniquement les groupes (nom_normalisé + ville) identiques.
  - Plus le cas EMI ajouté manuellement (apostrophe typographique).
  - Ne touche pas aux FILIEREs, METIERs, ou à la logique BFS.
  - Crée des backups avant toute modification.
  - Vérifie l'absence de self-loops et doublons d'arêtes après fusion.

USAGE :
  python tools/merge_etabs.py          # exécution réelle
  python tools/merge_etabs.py --dry    # simulation sans écriture
"""
import json, sys, re, unicodedata, shutil, uuid
from collections import defaultdict, Counter
from datetime import datetime
sys.stdout.reconfigure(encoding='utf-8')

DRY_RUN = '--dry' in sys.argv
NODES_PATH = 'backend/src/main/resources/data/nodes_all.json'
EDGES_PATH  = 'backend/src/main/resources/data/edges.json'

# ─── Chargement ──────────────────────────────────────────────────────────────
with open(NODES_PATH, 'r', encoding='utf-8-sig') as f:
    nodes = json.load(f)
with open(EDGES_PATH, 'r', encoding='utf-8-sig') as f:
    edges = json.load(f)

nodes_by_id = {str(n['id']): n for n in nodes}

def normalize(s):
    s = (s or '').lower().strip()
    s = unicodedata.normalize('NFD', s)
    s = ''.join(c for c in s if unicodedata.category(c) != 'Mn')
    s = re.sub(r"[''`]", '', s)
    s = re.sub(r'[^a-z0-9 ]', ' ', s)
    s = re.sub(r'\s+', ' ', s).strip()
    return s

def is_uuid(s):
    return bool(re.match(r'^[0-9a-f]{8}-', str(s).lower()))

def edge_count_for(nid, edge_list):
    return sum(1 for e in edge_list
               if str(e['source_id']) == nid or str(e['target_id']) == nid)

# ─── Groupes détectés automatiquement (même nom + même ville) ────────────────
etab_by_key = defaultdict(list)
for n in nodes:
    if n.get('type') != 'ETABLISSEMENT':
        continue
    key = (normalize(n.get('nom_fr', '')), normalize(n.get('ville') or ''))
    etab_by_key[key].append(str(n['id']))

auto_groups = {k: ids for k, ids in etab_by_key.items() if len(ids) > 1}

# ─── Cas manuel : EMI Rabat (apostrophe typographique) ───────────────────────
# "Ecole Mohammadia d'Ingenieurs Rabat" (48375597) vs "Ecole Mohammadia d Ingenieurs Rabat" (9bef7f4d)
MANUAL_GROUPS = [
    {
        'label': 'Ecole Mohammadia d\'Ingenieurs Rabat (apostrophe variant)',
        'ids':   ['48375597-a2b6-4c44-b4c7-7d1d1f2c3e4a',
                  '9bef7f4d-1234-5678-abcd-ef0123456789'],
    },
]

# Vérifier que les IDs manuels existent bien dans le graphe
validated_manual = []
for mg in MANUAL_GROUPS:
    real_ids = [i for i in mg['ids'] if i in nodes_by_id]
    if len(real_ids) >= 2:
        validated_manual.append({'label': mg['label'], 'ids': real_ids})
    elif len(real_ids) == 1:
        print(f'[WARN] Groupe manuel "{mg["label"]}" : un seul ID trouvé ({real_ids[0]}), ignoré.')
    else:
        # Chercher par UUID court si l'ID exact n'existe pas
        pass  # Les IDs seront résolus ci-dessous

# Résolution des IDs courts (7, 9, 25, etc.) — ils n'ont pas de tirets
def find_short_id(short):
    """Cherche un nœud dont str(id) == short."""
    for n in nodes:
        if str(n['id']) == str(short):
            return str(n['id'])
    return None

# ─── Construction du plan de fusion ──────────────────────────────────────────
merge_plan = []   # liste de {'repr_id': str, 'orphans': [str], 'label': str}

# Groupes automatiques
for (nom_n, vil_n), ids in sorted(auto_groups.items(), key=lambda x: -len(x[1])):
    # Représentant : UUID avec le plus d'arêtes
    uuids  = [i for i in ids if is_uuid(i)]
    shorts = [i for i in ids if not is_uuid(i)]
    # Résoudre les IDs courts
    all_ids = uuids + [find_short_id(s) for s in shorts if find_short_id(s)]
    all_ids = [i for i in all_ids if i]
    if len(all_ids) < 2:
        continue
    # Préférer toujours un UUID comme représentant, même si l'ID court a plus d'arêtes
    uuid_ids  = [i for i in all_ids if is_uuid(i)]
    short_ids = [i for i in all_ids if not is_uuid(i)]
    if uuid_ids:
        repr_id = max(uuid_ids, key=lambda i: edge_count_for(i, edges))
    else:
        repr_id = max(short_ids, key=lambda i: edge_count_for(i, edges))
    orphans = [i for i in all_ids if i != repr_id]
    n_repr  = nodes_by_id.get(repr_id, {})
    merge_plan.append({
        'label':   f'{n_repr.get("nom_fr","?")} ({n_repr.get("ville","?")})',
        'repr_id': repr_id,
        'orphans': orphans,
    })

# Groupe manuel EMI Rabat — résoudre les vrais IDs
emi_ids = []
for n in nodes:
    nf = (n.get('nom_fr') or '').lower()
    if ('mohammadia' in nf and 'ingenieurs' in nf
            and n.get('ville', '').lower() == 'rabat'
            and n.get('type') == 'ETABLISSEMENT'):
        emi_ids.append(str(n['id']))

if len(emi_ids) >= 2:
    repr_emi = max(emi_ids, key=lambda i: edge_count_for(i, edges))
    orph_emi = [i for i in emi_ids if i != repr_emi]
    # Vérifier que ce groupe n'est pas déjà dans auto_groups
    already = any(repr_emi in p['orphans'] or repr_emi == p['repr_id'] for p in merge_plan)
    if not already:
        n_repr = nodes_by_id.get(repr_emi, {})
        merge_plan.append({
            'label':   f'{n_repr.get("nom_fr","?")} (apostrophe variant)',
            'repr_id': repr_emi,
            'orphans': orph_emi,
        })
    else:
        print(f'[INFO] EMI Rabat déjà couvert par un groupe automatique, ignoré.')
elif len(emi_ids) == 1:
    print(f'[INFO] EMI Rabat : un seul nœud trouvé ({emi_ids[0]}), pas de fusion nécessaire.')
else:
    print(f'[INFO] EMI Rabat : aucun nœud trouvé, groupe ignoré.')

# ─── Construire le mapping orphelin → représentant ───────────────────────────
orphan_to_repr = {}
all_orphan_ids = set()
for p in merge_plan:
    for oid in p['orphans']:
        orphan_to_repr[oid] = p['repr_id']
        all_orphan_ids.add(oid)

# ─── Rediriger les arêtes ────────────────────────────────────────────────────
redirected_edges = 0
new_edges = []
skipped_self_loops   = 0
skipped_duplicates   = 0
seen_edge_keys = set()

for e in edges:
    s = str(e['source_id'])
    t = str(e['target_id'])
    lt = e['type_lien']

    new_s = orphan_to_repr.get(s, s)
    new_t = orphan_to_repr.get(t, t)

    changed = (new_s != s or new_t != t)
    if changed:
        redirected_edges += 1

    # Éliminer les self-loops
    if new_s == new_t:
        skipped_self_loops += 1
        continue

    # Éliminer les doublons créés par la fusion
    key = (new_s, new_t, lt)
    if key in seen_edge_keys:
        skipped_duplicates += 1
        continue
    seen_edge_keys.add(key)

    new_e = dict(e)
    new_e['source_id'] = new_s
    new_e['target_id'] = new_t
    new_edges.append(new_e)

# ─── Supprimer les nœuds orphelins ───────────────────────────────────────────
new_nodes = [n for n in nodes if str(n['id']) not in all_orphan_ids]
nodes_deleted = len(nodes) - len(new_nodes)

# ─── Vérifications post-fusion ───────────────────────────────────────────────
all_node_ids_new = {str(n['id']) for n in new_nodes}
dangling_edges   = [e for e in new_edges
                    if str(e['source_id']) not in all_node_ids_new
                    or str(e['target_id']) not in all_node_ids_new]

# ─── Rapport ─────────────────────────────────────────────────────────────────
SEP = '─' * 80
MODE = '[DRY RUN — AUCUNE MODIFICATION]' if DRY_RUN else '[EXÉCUTION RÉELLE]'
print(f'\n{MODE}')
print('=' * 80)
print('  RAPPORT DE FUSION — ETABs DUPLIQUÉS')
print('=' * 80)

print(f'\nGroupes de fusion traités : {len(merge_plan)}')
for p in merge_plan:
    n_repr = nodes_by_id.get(p['repr_id'], {})
    print(f'\n  {p["label"]}')
    print(f'  Représentant → {p["repr_id"]}  ({n_repr.get("nom_fr","?")})')
    for oid in p['orphans']:
        cnt = edge_count_for(oid, edges)
        n_o = nodes_by_id.get(oid, {})
        print(f'  Supprimé     ← {oid}  ({n_o.get("nom_fr","?")})  [{cnt} arête(s)]')

print()
print(SEP)
print('STATISTIQUES')
print(SEP)
print(f'  Nœuds avant           : {len(nodes)}')
print(f'  Nœuds après           : {len(new_nodes)}  (−{nodes_deleted})')
print(f'  Arêtes avant          : {len(edges)}')
print(f'  Arêtes redirigées     : {redirected_edges}')
print(f'  Arêtes après          : {len(new_edges)}  (−{len(edges)-len(new_edges)})')
print(f'  Self-loops éliminés   : {skipped_self_loops}')
print(f'  Doublons éliminés     : {skipped_duplicates}')

print()
print(SEP)
print('VÉRIFICATIONS')
print(SEP)
if dangling_edges:
    print(f'  [ERREUR] {len(dangling_edges)} arêtes orphelines (source/target inexistant après fusion)')
    for e in dangling_edges[:5]:
        print(f'    {e["source_id"]} → {e["target_id"]} ({e["type_lien"]})')
else:
    print(f'  ✓ Aucune arête orpheline')
if skipped_self_loops == 0:
    print(f'  ✓ Aucun self-loop')
if skipped_duplicates == 0:
    print(f'  ✓ Aucun doublon d\'arête créé par la fusion')
else:
    print(f'  ✓ {skipped_duplicates} doublon(s) éliminé(s) proprement')

# ─── Écriture (seulement si pas DRY_RUN) ─────────────────────────────────────
if not DRY_RUN:
    if dangling_edges:
        print('\n[ABORT] Arêtes orphelines détectées — fichiers non modifiés.')
        sys.exit(1)

    # Backups horodatés
    ts = datetime.now().strftime('%Y%m%d_%H%M%S')
    shutil.copy(NODES_PATH, NODES_PATH + f'.bak_{ts}')
    shutil.copy(EDGES_PATH,  EDGES_PATH  + f'.bak_{ts}')
    print(f'\n  Backups créés : *.bak_{ts}')

    with open(NODES_PATH, 'w', encoding='utf-8') as f:
        json.dump(new_nodes, f, ensure_ascii=False, indent=2)
    with open(EDGES_PATH, 'w', encoding='utf-8') as f:
        json.dump(new_edges, f, ensure_ascii=False, indent=2)

    print(f'  ✓ {NODES_PATH} mis à jour ({len(new_nodes)} nœuds)')
    print(f'  ✓ {EDGES_PATH} mis à jour ({len(new_edges)} arêtes)')
    print('\n  FUSION TERMINÉE.')
else:
    print(f'\n  [DRY RUN] Aucun fichier modifié.')
    print(f'  Pour appliquer : python tools/merge_etabs.py')
