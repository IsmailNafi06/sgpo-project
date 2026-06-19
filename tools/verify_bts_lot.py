import json
from collections import defaultdict, deque

# Chargement
with open('backend/src/main/resources/data/nodes_all.json', 'r', encoding='utf-8-sig') as f:
    nodes = json.load(f)
with open('backend/src/main/resources/data/edges.json', 'r', encoding='utf-8-sig') as f:
    edges = json.load(f)

nodes_by_id = {str(n['id']): n for n in nodes}

# 1. INTEGRITE : verifier que les aretes btsc0001 sont correctes et non dupliquees
print("=== 1. INTEGRITE DES NOUVELLES ARETES ===")
new_edges = [e for e in edges if str(e.get('id','')).startswith('btsc0001')]
print(f"Nouvelles aretes: {len(new_edges)}")
sources_set = set()
targets_set = set()
for e in new_edges:
    src = nodes_by_id.get(str(e['source_id']))
    tgt = nodes_by_id.get(str(e['target_id']))
    src_nom = src['nom_fr'] if src else 'INCONNU'
    tgt_nom = tgt['nom_fr'] if tgt else 'INCONNU'
    pair = (str(e['source_id']), str(e['target_id']))
    is_dup = sum(1 for ex in edges if str(ex.get('source_id','')) == str(e['source_id'])
                 and str(ex.get('target_id','')) == str(e['target_id'])
                 and str(ex.get('id','')) != str(e['id'])) > 0
    print(f"  [{e['type_lien']}] {src_nom} -> {tgt_nom} | doublon={is_dup}")

# 2. METIERS ACCESSIBLES via BFS simplifie
print("\n=== 2. CALCUL ACCESSIBILITE BFS ===")

# Construire le graphe BFS (simplifie - traversal des liens utiles)
# BAC nodes: type=FILIERE, code starts with BAC_
bac_nodes = {str(n['id']): n for n in nodes if n.get('type') == 'FILIERE' and str(n.get('code','')).startswith('BAC_')}

# OFFERTE_PAR reverse: creer edges synthetiques ETAB -> FILIERE
op_reverse = defaultdict(list)  # etab_id -> [filiere_id]
for e in edges:
    if e['type_lien'] == 'OFFERTE_PAR':
        op_reverse[str(e['target_id'])].append(str(e['source_id']))

# Graphe de traversal complet
graph = defaultdict(list)  # node_id -> [(neighbor_id, edge_type)]
for e in edges:
    s = str(e['source_id'])
    t = str(e['target_id'])
    lt = e['type_lien']
    if lt == 'DONNE_ACCES':
        graph[s].append((t, 'DONNE_ACCES'))
    elif lt == 'RECRUTEMENT':
        graph[s].append((t, 'RECRUTEMENT'))
    # OFFERTE_PAR: only reverse (ETAB->FILIERE)
    # handled via op_reverse

# Add synthetic OFFERTE_PAR_REV edges
for etab_id, filiere_ids in op_reverse.items():
    for fil_id in filiere_ids:
        graph[etab_id].append((fil_id, 'OFFERTE_PAR_REV'))

# BFS depuis tous les BAC nodes
accessible_metiers = set()
accessible_filieres = set()

for bac_id in bac_nodes:
    visited = set()
    queue = deque([(bac_id, False, False)])  # (node_id, aDejaFiliereLongue, aDejaOffertePar)
    visited.add(bac_id)

    while queue:
        node_id, aDejaFiliereLongue, aDejaOffertePar = queue.popleft()
        node = nodes_by_id.get(node_id)
        if not node:
            continue
        node_type = node.get('type', '')

        if node_type == 'METIER':
            accessible_metiers.add(node_id)
            continue
        if node_type == 'FILIERE' and node_id not in bac_nodes:
            accessible_filieres.add(node_id)

        for neighbor_id, edge_type in graph[node_id]:
            if neighbor_id in visited:
                continue

            neighbor = nodes_by_id.get(neighbor_id)
            if not neighbor:
                continue

            # Guard: aDejaFiliereLongue - block chaining two long FILIEREs via OFFERTE_PAR/ADMISSION
            if edge_type in ('OFFERTE_PAR_REV', 'ADMISSION'):
                neighbor_type = neighbor.get('type', '')
                neighbor_duree = neighbor.get('duree_mois') or 0
                if aDejaFiliereLongue and neighbor_type == 'FILIERE' and neighbor_duree >= 24:
                    continue

            # Guard: no consecutive OFFERTE_PAR
            if edge_type == 'OFFERTE_PAR_REV' and aDejaOffertePar:
                continue

            new_aDejaFiliereLongue = aDejaFiliereLongue
            new_aDejaOffertePar = False

            if node_type == 'FILIERE' and node_id not in bac_nodes:
                duree = node.get('duree_mois') or 0
                if duree >= 24:
                    new_aDejaFiliereLongue = True

            if edge_type == 'OFFERTE_PAR_REV':
                new_aDejaOffertePar = True

            visited.add(neighbor_id)
            queue.append((neighbor_id, new_aDejaFiliereLongue, new_aDejaOffertePar))

all_metiers = [n for n in nodes if n.get('type') == 'METIER']
all_filieres = [n for n in nodes if n.get('type') == 'FILIERE' and not str(n.get('code','')).startswith('BAC_')]

print(f"Total METIERs: {len(all_metiers)}")
print(f"METIERs accessibles: {len(accessible_metiers)}")
print(f"METIERs inaccessibles: {len(all_metiers) - len(accessible_metiers)}")
print(f"Couverture: {len(accessible_metiers)/len(all_metiers)*100:.1f}%")
print(f"Total FILIEREs (hors BAC): {len(all_filieres)}")
print(f"FILIEREs accessibles: {len(accessible_filieres)}")

# 3. VERIFIER les 11 METIERs cibles
print("\n=== 3. VERIFICATION DES 11 METIERS CIBLES ===")
target_metier_ids = [
    '3096f6a1-4ec8-45cd-9d8b-1e6954c35919',
    '3363b0b3-b995-478a-b6e5-f77d3a602cbb',
    '35ae9c95-2272-40cb-91e2-21c4717e8531',
    '64c6bb31-18e1-418e-99db-3dff6de3a3f0',
    '7dbc75c1-222f-4bba-860c-f3ed0d0c1fb2',
    '813147c4-56f7-4afd-8eab-7973d5ab335b',
    'afe090f4-598a-4855-b64a-33ad494139bd',
    'b0b42567-ece6-49c5-8210-698294c4f038',
    'b6b342b7-81f2-4981-86e6-4cf3753c51b3',
    'd91eb0da-99e3-4e8b-9821-4f0938d35e7c',
    'e81381da-8e24-4028-a82f-ab63339b4d50',
]
for mid in target_metier_ids:
    m = nodes_by_id.get(mid)
    nom = m['nom_fr'] if m else 'INCONNU'
    status = 'ACCESSIBLE' if mid in accessible_metiers else 'INACCESSIBLE'
    print(f"  [{status}] {nom}")
