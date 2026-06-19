import json, sys
from collections import defaultdict, deque

# Force UTF-8 output
sys.stdout.reconfigure(encoding='utf-8')

with open('backend/src/main/resources/data/nodes_all.json', 'r', encoding='utf-8-sig') as f:
    nodes = json.load(f)
with open('backend/src/main/resources/data/edges.json', 'r', encoding='utf-8-sig') as f:
    edges = json.load(f)

nodes_by_id = {str(n['id']): n for n in nodes}
bac_nodes = {str(n['id']): n for n in nodes
             if n.get('type') == 'FILIERE' and str(n.get('code', '')).startswith('BAC_')}

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
    for etab_id, fils in op_reverse.items():
        for f in fils:
            graph[etab_id].append((f, 'OFFERTE_PAR_REV'))
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
                new_aOP = etype == 'OFFERTE_PAR_REV'
                cur = nodes_by_id.get(node_id)
                if cur and cur.get('type') == 'FILIERE' and node_id not in bac_nodes:
                    if (cur.get('duree_mois') or 0) >= 24:
                        new_aFilLong = True
                visited.add(nb_id)
                queue.append((nb_id, new_aFilLong, new_aOP))
    return accessible

acc = compute_accessible(edges)
all_metiers = [n for n in nodes if n.get('type') == 'METIER']
inacc = [n for n in all_metiers if str(n['id']) not in acc]

# FILIEREs accessibles (simple BFS sans guards stricts pour identification)
acc_filieres_simple = set()
graph_simple = defaultdict(list)
op_rev_simple = defaultdict(list)
for e in edges:
    if e['type_lien'] == 'OFFERTE_PAR':
        op_rev_simple[str(e['target_id'])].append(str(e['source_id']))
for e in edges:
    s, t, lt = str(e['source_id']), str(e['target_id']), e['type_lien']
    if lt == 'DONNE_ACCES':
        graph_simple[s].append(t)
for etab_id, fils in op_rev_simple.items():
    for f in fils:
        graph_simple[etab_id].append(f)
for bac_id in bac_nodes:
    visited = set([bac_id])
    queue = deque([bac_id])
    while queue:
        nid = queue.popleft()
        n = nodes_by_id.get(nid)
        if n and n.get('type') == 'FILIERE' and nid not in bac_nodes:
            acc_filieres_simple.add(nid)
        for nb in graph_simple.get(nid, []):
            if nb not in visited:
                visited.add(nb)
                queue.append(nb)

# RECRUTEMENT maps
metier_to_filieres = defaultdict(list)
filiere_to_metiers = defaultdict(list)
for e in edges:
    if e['type_lien'] == 'RECRUTEMENT':
        metier_to_filieres[str(e['target_id'])].append(str(e['source_id']))
        filiere_to_metiers[str(e['source_id'])].append(str(e['target_id']))

# OFFERTE_PAR
filiere_to_etab = {}
for e in edges:
    if e['type_lien'] == 'OFFERTE_PAR':
        filiere_to_etab[str(e['source_id'])] = str(e['target_id'])

# BAC -> ETABs accessibles
bac_ids = list(bac_nodes.keys())
donne_acces_map = defaultdict(list)
for e in edges:
    if e['type_lien'] == 'DONNE_ACCES':
        donne_acces_map[str(e['source_id'])].append(str(e['target_id']))
acc_etabs = set()
for bac_id in bac_ids:
    for tgt in donne_acces_map.get(bac_id, []):
        n = nodes_by_id.get(tgt)
        if n and n.get('type') == 'ETABLISSEMENT':
            acc_etabs.add(tgt)

print(f"Etat : {len(acc)}/{len(all_metiers)} accessibles | inaccessibles = {len(inacc)}")
print(f"Gap 90% : {602 - len(acc)} METIERs manquants")
print()

# Classer les inaccessibles
META_CATEGORIES = {'metiers commerce', 'metiers informatique', 'metiers ingenierie',
                   'metiers sante', 'metiers diplomes demandes maroc'}
ERREUR_SECTEUR_INFORMATIQUE = {
    'acheteur international', 'administrateur financier', 'charge d\'etudes medias media-planner',
    'chef de chantier gros uvres', 'chef de publicite', 'commercial', 'commissaire de police',
    'concepteur redacteur', 'concierge', 'delegue medical', 'directeur artistique',
    'gardien de la paix', 'gestionnaire', 'gestionnaire des ressources humaines', 'graphiste',
    'infographiste', 'infographiste 2d 3d', 'inspecteur de police', 'machiniste', 'maquettiste',
    'officier de police', 'offsettiste', 'photograveur', 'redacteur en chef',
    'secretaire de redaction'
}
POST_LICENCE = {'psychologue', 'chercheur scientifique', 'professeur universitaire'}
DATA_ERRORS_FILIERE = {
    # FILIEREs avec liens suspects (nursing->agro, aeronautique generique)
    'licence en sciences infirmieres - ispits rabat',
    "ingenieur en aeronautique"  # -> generic "Ingenieur" METIER
}
GENERIC_METIERS = {'ingenieur'}

acc_names = {n['nom_fr'].strip().lower() for n in all_metiers if str(n['id']) in acc}

cat_a_real = []      # orphelins vrais, secteur correct
cat_a_err_sec = []   # orphelins secteur=Informatique errone
cat_a_meta = []      # meta-categories
cat_b_real = []      # FILIEREs inaccessibles, vraies connexions
cat_b_postlic = []   # FILIEREs post-licence
cat_b_error = []     # FILIEREs avec connexions suspectes
cat_d = []           # doublons

for m in inacc:
    mid = str(m['id'])
    nom = m['nom_fr'].strip()
    nom_l = nom.lower()
    sec = m.get('secteur', '') or ''

    if nom_l in acc_names:
        cat_d.append(m)
        continue
    if nom_l in META_CATEGORIES:
        cat_a_meta.append(m)
        continue
    if nom_l in ERREUR_SECTEUR_INFORMATIQUE:
        cat_a_err_sec.append(m)
        continue

    filieres = metier_to_filieres.get(mid, [])

    if not filieres:
        if nom_l in POST_LICENCE:
            cat_b_postlic.append(m)
        else:
            cat_a_real.append(m)
        continue

    # METIER a des FILIEREs sources
    inacc_fils = [f for f in filieres if f not in acc_filieres_simple]
    acc_fils = [f for f in filieres if f in acc_filieres_simple]

    if acc_fils:
        # Filiere accessible mais metier toujours inacc -> BFS guard issue
        cat_b_real.append({'node': m, 'fils_inacc': [], 'fils_acc': acc_fils, 'note': 'ACC_FIL_BFS_GUARD'})
        continue

    if not inacc_fils:
        cat_a_real.append(m)
        continue

    # Verifier si les FILIEREs sources sont suspectes
    is_error = False
    post_lic = False
    valid_fils = []
    for fil_id in inacc_fils:
        fil = nodes_by_id.get(fil_id)
        if not fil:
            continue
        fil_nom = fil.get('nom_fr', '').lower()
        if any(err in fil_nom for err in DATA_ERRORS_FILIERE):
            is_error = True
        elif nom_l in POST_LICENCE or fil.get('duree_mois', 0) > 60:
            post_lic = True
        else:
            valid_fils.append(fil_id)

    if is_error and not valid_fils:
        cat_b_error.append({'node': m, 'fils': inacc_fils})
    elif post_lic and not valid_fils:
        cat_b_postlic.append(m)
    elif valid_fils:
        # Calculer cout minimal
        best_cost = 9999
        best_fil = None
        for fil_id in valid_fils:
            fil = nodes_by_id.get(fil_id)
            etab_id = filiere_to_etab.get(fil_id)
            bac_to_fil = any(fil_id in donne_acces_map.get(b, []) for b in bac_ids)
            bac_to_etab = etab_id and etab_id in acc_etabs
            if bac_to_fil and not bac_to_etab:
                cost = 1  # 1 OFFERTE_PAR
            elif bac_to_etab and not bac_to_fil:
                cost = 4  # 4 DONNE_ACCES
            elif not bac_to_fil and not bac_to_etab:
                cost = 5  # 4 + 1
            else:
                cost = 0
            if cost < best_cost:
                best_cost = cost
                best_fil = fil_id
        if best_cost < 9999:
            cat_b_real.append({'node': m, 'fils_inacc': valid_fils, 'fils_acc': [], 'best_fil': best_fil, 'best_cost': best_cost, 'note': ''})
        else:
            cat_b_error.append({'node': m, 'fils': valid_fils})
    else:
        cat_b_error.append({'node': m, 'fils': inacc_fils})

# == Rapport ==
print("=" * 70)
print("CLASSIFICATION DES 83 METIERs INACCESSIBLES")
print("=" * 70)
print(f"  Cat A real (orphelins vrais)      : {len(cat_a_real):3} METIERs | 1 arete chacun")
print(f"  Cat A err secteur Informatique    : {len(cat_a_err_sec):3} METIERs | DONNEES ERRONEES")
print(f"  Cat A meta-categories             : {len(cat_a_meta):3} METIERs | A SUPPRIMER")
print(f"  Cat B real (FILIEREs inaccessibles): {len(cat_b_real):3} METIERs | 4-5 aretes/FILIERE")
print(f"  Cat B post-licence                : {len(cat_b_postlic):3} METIERs | NON FIXABLE (BAC)")
print(f"  Cat B donnees erronees            : {len(cat_b_error):3} METIERs | ERREURS DATA")
print(f"  Cat D doublons                    : {len(cat_d):3} METIERs | IGNORER")
total_check = len(cat_a_real)+len(cat_a_err_sec)+len(cat_a_meta)+len(cat_b_real)+len(cat_b_postlic)+len(cat_b_error)+len(cat_d)
print(f"  TOTAL                             : {total_check:3}")

# Cat B real details
b_by_fil = defaultdict(list)
for item in cat_b_real:
    if item.get('best_fil'):
        b_by_fil[item['best_fil']].append(item)
    elif item.get('fils_acc'):
        b_by_fil['ACC_GUARD'].append(item)

print()
print("-- Cat B REAL : FILIEREs a connecter (triees par nb_metiers/cout) --")
groups = []
for fil_id, items in b_by_fil.items():
    if fil_id == 'ACC_GUARD':
        continue
    fil = nodes_by_id.get(fil_id)
    fil_nom = fil['nom_fr'] if fil else '?'
    cost = items[0].get('best_cost', 5)
    nb = len(items)
    groups.append((fil_id, fil_nom, nb, cost, items))
groups.sort(key=lambda x: (-x[2]/max(x[3],1), x[3]))

total_b_edges = 0
total_b_metiers = 0
for fil_id, fil_nom, nb, cost, items in groups:
    ratio = nb/cost
    print(f"  {nb}M/{cost}E (r={ratio:.2f}) | {fil_nom[:55]}")
    for item in items:
        print(f"    + {item['node']['nom_fr']}")
    total_b_edges += cost
    total_b_metiers += nb

print(f"  --- Total Cat B real : {total_b_metiers} METIERs, {total_b_edges} aretes ---")

print()
print("-- Cat A REAL : orphelins a connecter (1 RECRUTEMENT chacun) --")
for m in cat_a_real:
    sec = m.get('secteur', '') or 'N/A'
    print(f"  {m['nom_fr'][:55]:55} | secteur={sec[:35]}")

print()
print("-- EXCLUSIONS : ne pas connecter --")
print(f"  [{len(cat_a_meta)}] Meta-categories (supprimer) :")
for m in cat_a_meta:
    print(f"    '{m['nom_fr']}'")
print(f"  [{len(cat_a_err_sec)}] Secteur Informatique errone (donnees scraping) :")
for m in cat_a_err_sec:
    print(f"    '{m['nom_fr']}'")
print(f"  [{len(cat_b_postlic)}] Post-licence (non accessibles depuis BAC) :")
for m in cat_b_postlic:
    print(f"    '{m['nom_fr']}'")
print(f"  [{len(cat_b_error)}] Erreurs de donnees FILIEREs suspectes :")
for item in cat_b_error:
    m = item['node'] if isinstance(item, dict) else item
    nom = m['nom_fr'] if isinstance(m, dict) else m.get('nom_fr','?')
    print(f"    '{nom}'")
print(f"  [{len(cat_d)}] Doublons accessibles :")
for m in cat_d:
    print(f"    '{m['nom_fr']}'")

# == STRATEGIES ==
print()
print("=" * 70)
print("COMPARAISON DES STRATEGIES POUR +16 METIERs (gap 90%)")
print("=" * 70)
gap = 602 - len(acc)
print(f"Gap actuel : {gap} METIERs")
print()
print("Strategie A | Cat A seulement (RECRUTEMENT purs)")
print(f"  {gap} aretes RECRUTEMENT (1/METIER) -> +{gap} METIERs")
print(f"  Conditions : trouver une FILIERE accessible pour chaque orphelin")
print(f"  Validite : {len(cat_a_real)} orphelins reels disponibles (>= {gap} needed)")
print()
print("Strategie B | Cat B + Cat A (FILIEREs + RECRUTEMENT)")
needed_from_a = max(0, gap - total_b_metiers)
total_strat_b = total_b_edges + needed_from_a
print(f"  Cat B : {total_b_metiers} METIERs, {total_b_edges} aretes")
print(f"  Cat A : {needed_from_a} METIERs suppl. si Cat B insuffisant")
print(f"  Total : ~{total_strat_b} aretes -> +{min(total_b_metiers+needed_from_a, gap)} METIERs")
print()
print("Strategie C | Mix optimise (meilleur ratio par arete)")
print("  Prendre les Cat B avec ratio M/E le plus eleve + Cat A pour combler")
# Greedy optimise
selected_greedy = []
gained = 0
total_aretes = 0
# Cat B triees par ratio
for fil_id, fil_nom, nb, cost, items in groups:
    if gained >= gap:
        break
    remaining = gap - gained
    take = min(nb, remaining)
    selected_greedy.append((fil_nom[:50], take, cost, items[:take]))
    gained += take
    total_aretes += cost
# Cat A pour combler
if gained < gap:
    remaining = gap - gained
    for m in cat_a_real[:remaining]:
        selected_greedy.append((m['nom_fr'][:50], 1, 1, [{'node': m}]))
        gained += 1
        total_aretes += 1
print(f"  Total : {total_aretes} aretes -> +{gained} METIERs")
print()
print(f"  VERDICT : Strategie A = {gap} aretes OPTIMAL")
print(f"            Strategie C = {total_aretes} aretes si FILIEREs non identifiables")

# Meilleurs 16 Cat A pour Strategie A
print()
print("=" * 70)
print("STRATEGIE A : TOP 16 ORPHELINS PRIORITAIRES")
print("  (1 arete RECRUTEMENT chacun depuis FILIERE accessible a identifier)")
print("=" * 70)
priority_a = [
    m for m in cat_a_real
    if m.get('secteur','') and 'Informatique' not in (m.get('secteur','') or '')
    and m['nom_fr'].lower() not in META_CATEGORIES
]
for i, m in enumerate(priority_a[:gap], 1):
    sec = m.get('secteur','') or 'N/A'
    print(f"  {i:2}. {m['nom_fr']:<45} secteur={sec[:30]}")
