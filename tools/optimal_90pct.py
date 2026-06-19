import json
from collections import defaultdict, deque

with open('backend/src/main/resources/data/nodes_all.json', 'r', encoding='utf-8-sig') as f:
    nodes = json.load(f)
with open('backend/src/main/resources/data/edges.json', 'r', encoding='utf-8-sig') as f:
    edges = json.load(f)

nodes_by_id = {str(n['id']): n for n in nodes}
bac_nodes = {str(n['id']): n for n in nodes
             if n.get('type') == 'FILIERE' and str(n.get('code', '')).startswith('BAC_')}

# ── BFS simplifié ─────────────────────────────────────────────────────────────
def compute_accessible(edges_list):
    op_reverse = defaultdict(list)
    for e in edges_list:
        if e['type_lien'] == 'OFFERTE_PAR':
            op_reverse[str(e['target_id'])].append(str(e['source_id']))

    graph = defaultdict(list)
    for e in edges_list:
        s, t, lt = str(e['source_id']), str(e['target_id']), e['type_lien']
        if lt == 'DONNE_ACCES':
            graph[s].append((t, 'DONNE_ACCES'))
        elif lt == 'RECRUTEMENT':
            graph[s].append((t, 'RECRUTEMENT'))

    for etab_id, filiere_ids in op_reverse.items():
        for fil_id in filiere_ids:
            graph[etab_id].append((fil_id, 'OFFERTE_PAR_REV'))

    accessible = set()
    for bac_id in bac_nodes:
        visited = set([bac_id])
        queue = deque([(bac_id, False, False)])
        while queue:
            node_id, aFilLong, aOP = queue.popleft()
            node = nodes_by_id.get(node_id)
            if not node:
                continue
            if node.get('type') == 'METIER':
                accessible.add(node_id)
                continue
            for nb_id, etype in graph[node_id]:
                if nb_id in visited:
                    continue
                nb = nodes_by_id.get(nb_id)
                if not nb:
                    continue
                if etype in ('OFFERTE_PAR_REV', 'ADMISSION'):
                    nd = nb.get('duree_mois') or 0
                    if aFilLong and nb.get('type') == 'FILIERE' and nd >= 24:
                        continue
                if etype == 'OFFERTE_PAR_REV' and aOP:
                    continue
                new_aFilLong = aFilLong
                new_aOP = False
                cur = nodes_by_id.get(node_id)
                if cur and cur.get('type') == 'FILIERE' and node_id not in bac_nodes:
                    if (cur.get('duree_mois') or 0) >= 24:
                        new_aFilLong = True
                if etype == 'OFFERTE_PAR_REV':
                    new_aOP = True
                visited.add(nb_id)
                queue.append((nb_id, new_aFilLong, new_aOP))
    return accessible

acc = compute_accessible(edges)
all_metiers = [n for n in nodes if n.get('type') == 'METIER']
inacc_metiers = [n for n in all_metiers if str(n['id']) not in acc]

print(f"Etat actuel : {len(acc)}/{len(all_metiers)} accessibles, {len(inacc_metiers)} inaccessibles")
print(f"Objectif 90% : 602 METIERs — gap = {602 - len(acc)} METIERs")

# ── Identifier les FILIEREs accessibles ──────────────────────────────────────
acc_filieres = set()
for bac_id in bac_nodes:
    visited = set([bac_id])
    queue = deque([bac_id])
    op_reverse = defaultdict(list)
    for e in edges:
        if e['type_lien'] == 'OFFERTE_PAR':
            op_reverse[str(e['target_id'])].append(str(e['source_id']))
    graph = defaultdict(list)
    for e in edges:
        s, t, lt = str(e['source_id']), str(e['target_id']), e['type_lien']
        if lt in ('DONNE_ACCES',):
            graph[s].append(t)
    for etab_id, fils in op_reverse.items():
        for f in fils:
            graph[etab_id].append(f)
    while queue:
        nid = queue.popleft()
        n = nodes_by_id.get(nid)
        if n and n.get('type') == 'FILIERE' and nid not in bac_nodes:
            acc_filieres.add(nid)
        for nb in graph.get(nid, []):
            if nb not in visited:
                visited.add(nb)
                queue.append(nb)

# ── BAC nodes accessibles ─────────────────────────────────────────────────────
bac_ids = list(bac_nodes.keys())

# ── Précompute: RECRUTEMENT edges (FILIERE -> METIER) ─────────────────────────
filiere_to_metiers = defaultdict(list)  # filiere_id -> [metier_id]
metier_to_filieres = defaultdict(list)  # metier_id -> [filiere_id]
for e in edges:
    if e['type_lien'] == 'RECRUTEMENT':
        filiere_to_metiers[str(e['source_id'])].append(str(e['target_id']))
        metier_to_filieres[str(e['target_id'])].append(str(e['source_id']))

# OFFERTE_PAR: filiere -> etab
filiere_to_etab = {}
for e in edges:
    if e['type_lien'] == 'OFFERTE_PAR':
        filiere_to_etab[str(e['source_id'])] = str(e['target_id'])

# DONNE_ACCES: source -> target (BAC -> ETAB/FILIERE)
donne_acces_map = defaultdict(list)
for e in edges:
    if e['type_lien'] == 'DONNE_ACCES':
        donne_acces_map[str(e['source_id'])].append(str(e['target_id']))

# BAC -> ETAB direct
bac_to_etabs = set()
for bac_id in bac_ids:
    for tgt in donne_acces_map.get(bac_id, []):
        n = nodes_by_id.get(tgt)
        if n and n.get('type') == 'ETABLISSEMENT':
            bac_to_etabs.add(tgt)

# ETABs accessibles depuis BAC
acc_etabs = set()
for bac_id in bac_ids:
    for tgt in donne_acces_map.get(bac_id, []):
        n = nodes_by_id.get(tgt)
        if n and n.get('type') == 'ETABLISSEMENT':
            acc_etabs.add(tgt)

print(f"\nETABs accessibles directement depuis BAC : {len(acc_etabs)}")

# ── Analyser chaque METIER inaccessible ───────────────────────────────────────

results = []  # (cost_edges, metier_nom, metier_id, cat, detail, gain_set)

inacc_names = defaultdict(list)
for m in inacc_metiers:
    inacc_names[m['nom_fr'].strip().lower()].append(str(m['id']))

# Détecter les doublons de noms parmi les inaccessibles
dup_names = {k: v for k, v in inacc_names.items() if len(v) > 1}

for metier in inacc_metiers:
    mid = str(metier['id'])
    nom = metier['nom_fr']
    nom_lower = nom.strip().lower()

    # Doublon de nom parmi les inaccessibles
    if nom_lower in dup_names and len(dup_names[nom_lower]) > 1:
        results.append({
            'metier_id': mid, 'nom': nom, 'cat': 'D_MULTI',
            'detail': f"Doublon inacc: {len(dup_names[nom_lower])} copies inaccessibles",
            'edges_needed': 0, 'gain': 0, 'filieres': []
        })
        continue

    # Doublon de nom avec accessible
    acc_same_name = any(
        str(m['id']) in acc and m['nom_fr'].strip().lower() == nom_lower
        for m in all_metiers
    )
    if acc_same_name:
        results.append({
            'metier_id': mid, 'nom': nom, 'cat': 'D_ACC',
            'detail': "Doublon: version accessible existe",
            'edges_needed': 0, 'gain': 0, 'filieres': []
        })
        continue

    filieres_sources = metier_to_filieres.get(mid, [])

    if not filieres_sources:
        # CAT A : pas de RECRUTEMENT
        results.append({
            'metier_id': mid, 'nom': nom, 'cat': 'A',
            'detail': "Orphelin: 0 RECRUTEMENT",
            'edges_needed': 1,  # 1 arête RECRUTEMENT depuis filière accessible
            'gain': 1, 'filieres': []
        })
        continue

    # Vérifier si les FILIEREs sources sont accessibles
    acc_srcs = [f for f in filieres_sources if f in acc_filieres]
    inacc_srcs = [f for f in filieres_sources if f not in acc_filieres]

    if acc_srcs:
        # Filières accessibles existent mais METIER non accessible → anomalie
        results.append({
            'metier_id': mid, 'nom': nom, 'cat': 'C_ANOMALIE',
            'detail': f"Filiere accessible {acc_srcs[0][:8]} mais METIER inacc (BFS diff?)",
            'edges_needed': 0, 'gain': 1, 'filieres': acc_srcs
        })
        continue

    # CAT B : toutes FILIEREs inaccessibles
    # Trouver le coût minimal pour rendre l'une d'elles accessible
    best_cost = 9999
    best_detail = ""
    best_fils = []

    for fil_id in inacc_srcs:
        fil = nodes_by_id.get(fil_id)
        if not fil:
            continue
        fil_nom = fil.get('nom_fr', '?')
        fil_duree = fil.get('duree_mois') or 0
        fil_ville = fil.get('ville', '')

        # Vérifier si la FILIERE a un OFFERTE_PAR vers un ETAB accessible
        etab_id = filiere_to_etab.get(fil_id)
        if etab_id and etab_id in acc_etabs:
            # ETAB accessible → besoin de DONNE_ACCES depuis BAC
            # Compter combien de BAC ont déjà DONNE_ACCES vers cet ETAB
            bac_to_etab = [b for b in bac_ids if etab_id in donne_acces_map.get(b, [])]
            # Compter combien de BAC ont déjà DONNE_ACCES vers cette FILIERE directement
            bac_to_fil = [b for b in bac_ids if fil_id in donne_acces_map.get(b, [])]

            if bac_to_etab:
                # ETAB accessible → FILIERE accessible via OFFERTE_PAR_REV → 0 arête manquante?
                # Mais alors pourquoi FILIERE inaccessible?
                # Cas: ETAB accessible mais FILIERE pas dans acc_filieres → guard bloquant
                cost = 0
                detail = f"via {fil_nom[:40]} (ETAB accessible, guard?)"
                if cost < best_cost:
                    best_cost = cost
                    best_detail = detail
                    best_fils = [fil_id]
            elif bac_to_fil:
                # BAC → FILIERE directement, FILIERE accessible → mais pas dans acc_filieres?
                cost = 0
                detail = f"via {fil_nom[:40]} (BAC direct, guard?)"
                if cost < best_cost:
                    best_cost = cost
                    best_detail = detail
                    best_fils = [fil_id]
            else:
                # Besoin de DONNE_ACCES BAC → FILIERE (4 BAC types typiques) ou BAC → ETAB
                # Estimer: 4 arêtes DONNE_ACCES depuis les BAC pertinents
                cost = 4
                detail = f"via {fil_nom[:40]} (ETAB acc, besoin DONNE_ACCES BAC→FIL, ~4)"
                if cost < best_cost:
                    best_cost = cost
                    best_detail = detail
                    best_fils = [fil_id]
        else:
            # ETAB non accessible ou pas d'OFFERTE_PAR
            # Chercher si DONNE_ACCES depuis BAC vers FILIERE existe
            bac_to_fil = [b for b in bac_ids if fil_id in donne_acces_map.get(b, [])]
            if bac_to_fil:
                # BAC → FILIERE existe mais FILIERE pas accessible → FILIERE manque OFFERTE_PAR?
                # ou guard bloquant
                cost = 1  # 1 arête OFFERTE_PAR vers ETAB accessible
                detail = f"via {fil_nom[:40]} (BAC direct exist, besoin OFFERTE_PAR)"
                if cost < best_cost:
                    best_cost = cost
                    best_detail = detail
                    best_fils = [fil_id]
            else:
                # Besoin: DONNE_ACCES BAC→FIL (~4) + OFFERTE_PAR FIL→ETAB accessible (~1)
                # ou juste DONNE_ACCES BAC→FIL si pattern ENSIAS
                if etab_id:
                    cost = 4  # DONNE_ACCES BAC→FILIERE x4
                    detail = f"via {fil_nom[:40]} (besoin DONNE_ACCES BAC, ETAB exist)"
                else:
                    cost = 5  # DONNE_ACCES BAC→FIL x4 + OFFERTE_PAR FIL→ETAB x1
                    detail = f"via {fil_nom[:40]} (besoin DONNE_ACCES + OFFERTE_PAR)"
                if cost < best_cost:
                    best_cost = cost
                    best_detail = detail
                    best_fils = [fil_id]

    results.append({
        'metier_id': mid, 'nom': nom, 'cat': 'B',
        'detail': best_detail,
        'edges_needed': best_cost, 'gain': 1, 'filieres': best_fils
    })

# ── Tri par coût croissant ────────────────────────────────────────────────────
results.sort(key=lambda x: (x['edges_needed'], x['cat']))

# ── Affichage ─────────────────────────────────────────────────────────────────
print("\n" + "="*80)
print("PLAN OPTIMAL : METIERs inaccessibles classés par coût de correction")
print("="*80)

cat_counts = defaultdict(int)
for r in results:
    cat_counts[r['cat']] += 1

print(f"\nRépartition: A={cat_counts['A']}, B={cat_counts['B']}, "
      f"C={cat_counts['C_ANOMALIE']}, D_multi={cat_counts['D_MULTI']}, "
      f"D_acc={cat_counts['D_ACC']}")

# Grouper par coût
from itertools import groupby
by_cost = defaultdict(list)
for r in results:
    by_cost[r['edges_needed']].append(r)

print("\n--- COÛT 0 : Anomalies / Doublons (à ignorer) ---")
for r in by_cost.get(0, []):
    print(f"  [{r['cat']}] {r['nom']} | {r['detail']}")

print("\n--- COÛT 1 : 1 arête RECRUTEMENT (orphelins récupérables) ---")
for r in by_cost.get(1, []):
    print(f"  [{r['cat']}] {r['nom']} | {r['detail']}")

print("\n--- COÛT 4 : 4 arêtes DONNE_ACCES ---")
for r in by_cost.get(4, []):
    print(f"  [{r['cat']}] {r['nom']} | {r['detail']}")

print("\n--- COÛT 5 : 5 arêtes (DONNE_ACCES + OFFERTE_PAR) ---")
for r in by_cost.get(5, []):
    print(f"  [{r['cat']}] {r['nom']} | {r['detail']}")

print("\n--- COÛT 9999 : cas complexes ---")
for r in by_cost.get(9999, []):
    print(f"  [{r['cat']}] {r['nom']} | {r['detail']}")

# ── Plan optimal greedy ───────────────────────────────────────────────────────
print("\n" + "="*80)
print("PLAN GREEDY OPTIMAL : atteindre 602 METIERs (gap = 16)")
print("="*80)

# Exclure anomalies/doublons (coût 0 mais gain 0)
fixable = [r for r in results if r['gain'] > 0 and r['edges_needed'] < 9999 and r['cat'] != 'D_MULTI' and r['cat'] != 'D_ACC']
anomalies = [r for r in results if r['cat'] in ('D_MULTI', 'D_ACC', 'C_ANOMALIE')]

# Pour les cat B, regrouper par FILIERE pivot (même FILIERE → même coût pour plusieurs METIERs)
filiere_metiers_group = defaultdict(list)
for r in fixable:
    if r['cat'] == 'B' and r['filieres']:
        filiere_metiers_group[r['filieres'][0]].append(r)

# Groupes cat B: (filiere_id, nb_metiers, edges_cost)
b_groups = []
for fil_id, metiers in filiere_metiers_group.items():
    fil = nodes_by_id.get(fil_id)
    fil_nom = fil['nom_fr'] if fil else '?'
    edges_cost = metiers[0]['edges_needed']  # même coût pour tous
    b_groups.append({
        'filiere_id': fil_id, 'filiere_nom': fil_nom,
        'metiers': metiers, 'nb_metiers': len(metiers),
        'edges_cost': edges_cost,
        'ratio': len(metiers) / max(edges_cost, 1)
    })

# Tri par ratio METIERs/arêtes décroissant
b_groups.sort(key=lambda x: (-x['ratio'], x['edges_cost']))

print(f"\nGroupes Cat B par FILIERE pivot (triés par ratio METIERs/arête) :")
print(f"{'FILIERE':<55} {'METIERs':>7} {'Arêtes':>7} {'Ratio':>6}")
print("-"*80)
total_b_metiers = 0
total_b_edges = 0
for g in b_groups:
    fil_short = g['filiere_nom'][:54]
    print(f"  {fil_short:<54} {g['nb_metiers']:>7} {g['edges_cost']:>7} {g['ratio']:>6.2f}")
    for r in g['metiers']:
        print(f"    -> {r['nom']}")
    total_b_metiers += g['nb_metiers']
    total_b_edges += g['edges_cost']

# Cat A orphelins
cat_a = [r for r in fixable if r['cat'] == 'A']
print(f"\nCat A orphelins (1 arête RECRUTEMENT chacun) : {len(cat_a)} METIERs")
for r in cat_a:
    print(f"  {r['nom']} | secteur={nodes_by_id.get(r['metier_id'],{}).get('secteur','?')}")

# Simulation greedy pour atteindre gap=16
print("\n" + "="*80)
print("SIMULATION GREEDY : combinaison minimale pour +16 METIERs")
print("="*80)

gap = 602 - len(acc)
selected = []
total_edges = 0
total_gained = 0

# D'abord les groupes B triés par ratio
for g in b_groups:
    if total_gained >= gap:
        break
    selected.append(('B_GROUP', g['filiere_nom'], g['nb_metiers'], g['edges_cost'], g['metiers']))
    total_gained += g['nb_metiers']
    total_edges += g['edges_cost']

# Ensuite cat A si encore nécessaire
if total_gained < gap:
    needed = gap - total_gained
    # Filtrer les vrais METIERs (pas méta-catégories)
    meta_keywords = ['metiers ', 'Metiers ', 'Metier ']
    valid_a = [r for r in cat_a if not any(r['nom'].lower().startswith(k.lower()) for k in meta_keywords)]
    # Prioriser par secteur utile
    for r in valid_a[:needed]:
        selected.append(('A_ORPHELIN', r['nom'], 1, 1, [r]))
        total_gained += 1
        total_edges += 1

print(f"\nPlan sélectionné ({total_gained} METIERs, {total_edges} arêtes) :")
print()
for item in selected:
    typ, nom, nb, cost, mrs = item
    if typ == 'B_GROUP':
        print(f"  [FILIERE] {nom[:60]}")
        print(f"    Arêtes nécessaires : {cost} | METIERs débloqués : {nb}")
        for r in mrs:
            print(f"    + {r['nom']}")
    else:
        print(f"  [RECRUTEMENT] {nom} — 1 arête")

print(f"\n  TOTAL : {total_edges} arêtes → +{total_gained} METIERs")
print(f"  Couverture finale estimée : {len(acc) + total_gained}/669 = {(len(acc)+total_gained)/669*100:.1f}%")

print("\n--- Anomalies / Doublons identifiés (à ignorer, 0 gain) ---")
for r in anomalies:
    print(f"  [{r['cat']}] {r['nom']} | {r['detail']}")
