"""
Analyse préliminaire SANS modification.
Identifie les groupes d'ETABs à fusionner (même nom normalisé + même ville),
choisit le représentant, compte les arêtes redirigées, signale les risques.
"""
import json, sys, re, unicodedata
from collections import defaultdict
sys.stdout.reconfigure(encoding='utf-8')

with open('backend/src/main/resources/data/nodes_all.json', 'r', encoding='utf-8-sig') as f:
    nodes = json.load(f)
with open('backend/src/main/resources/data/edges.json', 'r', encoding='utf-8-sig') as f:
    edges = json.load(f)

nodes_by_id = {str(n['id']): n for n in nodes}

def normalize(s):
    s = (s or '').lower().strip()
    s = unicodedata.normalize('NFD', s)
    s = ''.join(c for c in s if unicodedata.category(c) != 'Mn')
    s = re.sub(r"[''`]", '', s)        # apostrophes
    s = re.sub(r'[^a-z0-9 ]', ' ', s)
    s = re.sub(r'\s+', ' ', s).strip()
    return s

def is_uuid(s):
    """Retourne True si l'ID ressemble à un UUID (format xxxx-xxxx-xxxx)."""
    return bool(re.match(r'^[0-9a-f]{8}-', str(s).lower()))

def choose_representative(ids):
    """
    Choisit le représentant dans un groupe.
    Préférence :
      1. UUID complet (36 chars) avec le plus de FILIEREs liées
      2. UUID court
      3. ID numérique court en dernier recours (moins stable)
    """
    uuids = [i for i in ids if is_uuid(i)]
    shorts = [i for i in ids if not is_uuid(i)]

    # Compter les arêtes liées pour chaque candidat UUID
    def edge_count(nid):
        return sum(1 for e in edges
                   if str(e['source_id']) == nid or str(e['target_id']) == nid)

    if uuids:
        return max(uuids, key=edge_count)
    return max(shorts, key=edge_count)

# ─── Détecter les doublons ETAB par (nom_norm, ville_norm) ───────────────────
etab_by_key = defaultdict(list)
for n in nodes:
    if n.get('type') != 'ETABLISSEMENT':
        continue
    nom_n = normalize(n.get('nom_fr', ''))
    vil_n = normalize(n.get('ville') or '')
    key   = (nom_n, vil_n)
    etab_by_key[key].append(str(n['id']))

dup_groups = {k: ids for k, ids in etab_by_key.items() if len(ids) > 1}

# ─── Construire le plan de fusion ────────────────────────────────────────────
merge_plan = []
all_to_delete  = set()
id_to_repr     = {}   # orphelin_id → représentant_id

for (nom_n, vil_n), ids in sorted(dup_groups.items(), key=lambda x: -len(x[1])):
    repr_id = choose_representative(ids)
    orphans = [i for i in ids if i != repr_id]

    # Vérification : le représentant doit avoir un nœud valide
    repr_node = nodes_by_id.get(repr_id)
    if not repr_node:
        continue

    # Compter les arêtes concernées par chaque orphelin
    edge_counts = {}
    for oid in orphans:
        cnt = sum(1 for e in edges
                  if str(e['source_id']) == oid or str(e['target_id']) == oid)
        edge_counts[oid] = cnt
        id_to_repr[oid] = repr_id
        all_to_delete.add(oid)

    total_edges = sum(edge_counts.values())

    merge_plan.append({
        'nom': repr_node.get('nom_fr', ''),
        'ville': repr_node.get('ville', ''),
        'repr_id': repr_id,
        'repr_is_uuid': is_uuid(repr_id),
        'orphans': [(oid, edge_counts[oid]) for oid in orphans],
        'total_edges_redirected': total_edges,
    })

# Trier par nombre d'arêtes redirigées décroissant
merge_plan.sort(key=lambda x: -x['total_edges_redirected'])

# ─── Arêtes totales affectées ─────────────────────────────────────────────────
total_edges_all = sum(p['total_edges_redirected'] for p in merge_plan)
total_nodes_deleted = len(all_to_delete)

# ─── Vérification des risques ────────────────────────────────────────────────
risks = []

# Risque 1 : représentant avec ID numérique court (moins stable)
short_repr = [(p['nom'], p['repr_id']) for p in merge_plan if not p['repr_is_uuid']]
if short_repr:
    risks.append(('ATTENTION', f'{len(short_repr)} groupes ont un représentant avec ID court (non-UUID). '
                               'Vérifier que ces IDs existent bien en base.'))

# Risque 2 : orphelins avec beaucoup d'arêtes (risque de perte si UUID manquant)
heavy = [(p['nom'], oid, cnt) for p in merge_plan
         for oid, cnt in p['orphans'] if cnt >= 20]
if heavy:
    risks.append(('ATTENTION', f'{len(heavy)} orphelins ont ≥20 arêtes — '
                               'vérifier manuellement que la redirection est correcte.'))

# Risque 3 : si deux UUIDs ont chacun un grand nombre d'arêtes
# (les deux sont actifs dans la data — la fusion doit garder toutes les arêtes)
split = [(p['nom'], p['repr_id'], oid, cnt) for p in merge_plan
         for oid, cnt in p['orphans']
         if cnt >= 10 and p['total_edges_redirected'] - cnt >= 10]
if split:
    risks.append(('INFO', f'{len(split)} fusions où LES DEUX IDs ont ≥10 arêtes — '
                           'aucune perte de données (les arêtes sont redirigées, pas supprimées), '
                           'mais la redirection doit être exhaustive.'))

# ─── Affichage du rapport ─────────────────────────────────────────────────────
SEP = '─' * 80

print('=' * 80)
print('  PLAN DE FUSION — ETABs DUPLIQUÉS (PRÉVISUALISATION SANS MODIFICATION)')
print(f'  {len(merge_plan)} groupes · {total_nodes_deleted} nœuds à supprimer · {total_edges_all} arêtes à rediriger')
print('=' * 80)

for i, p in enumerate(merge_plan, 1):
    print(f'\n[{i:02d}] {p["nom"][:65]}')
    print(f'     Ville       : {p["ville"] or "(vide)"}')
    print(f'     Représentant: {p["repr_id"]}  {"(UUID)" if p["repr_is_uuid"] else "(ID court — vérifier)"}')
    for oid, cnt in p['orphans']:
        uuid_l = "(UUID)" if is_uuid(oid) else "(ID court)"
        print(f'     Supprimer   : {oid}  {uuid_l}  [{cnt} arête(s) à rediriger]')
    print(f'     Total arêtes redirigées : {p["total_edges_redirected"]}')

print()
print(SEP)
print('RÉSUMÉ')
print(SEP)
print(f'  Groupes de fusion       : {len(merge_plan)}')
print(f'  Nœuds ETAB supprimés    : {total_nodes_deleted}')
print(f'  Arêtes redirigées total : {total_edges_all}')
print(f'  Nœuds ETAB restants     : {sum(1 for n in nodes if n.get("type")=="ETABLISSEMENT") - total_nodes_deleted}')

print()
print(SEP)
print('RISQUES ET POINTS D\'ATTENTION')
print(SEP)
if risks:
    for level, msg in risks:
        print(f'  [{level}] {msg}')
else:
    print('  Aucun risque détecté.')

print()
print(SEP)
print('CE QUE LE SCRIPT merge_etabs.py FERA')
print(SEP)
print("""
  1. Pour chaque groupe :
       a. Choisir le représentant (UUID avec le plus d'arêtes)
       b. Pour chaque orphelin :
            - Rediriger toutes les arêtes source_id == orphelin → source_id = représentant
            - Rediriger toutes les arêtes target_id == orphelin → target_id = représentant
       c. Supprimer le nœud orphelin de nodes_all.json

  2. Écrire nodes_all.json et edges.json mis à jour.

  3. Vérifications post-fusion :
       - Pas d'arête dupliquée créée par la fusion (source+target+type identiques)
       - Pas de self-loop (source_id == target_id)
       - Tous les IDs référencés dans edges existent dans nodes

  4. Rapport final : nœuds avant/après, arêtes avant/après, doublons créés (s'il y en a).

  AUCUNE MODIFICATION des FILIEREs, METIERs, ou de la logique BFS.
""")

# ─── Détail des IDs courts (à valider manuellement) ─────────────────────────
short_id_groups = [(p['repr_id'], p['nom'], p['ville']) for p in merge_plan if not p['repr_is_uuid']]
orphan_short    = [(oid, p['nom']) for p in merge_plan for oid, _ in p['orphans'] if not is_uuid(oid)]

if short_id_groups or orphan_short:
    print(SEP)
    print('IDs COURTS (non-UUID) — VALIDATION MANUELLE REQUISE')
    print(SEP)
    if short_id_groups:
        print('  Représentants avec ID court :')
        for rid, nom, vil in short_id_groups:
            print(f'    repr={rid} | {nom} ({vil})')
    if orphan_short:
        print('  Orphelins avec ID court :')
        for oid, nom in orphan_short[:20]:
            print(f'    del={oid} | {nom}')
