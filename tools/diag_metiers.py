import json, sys
from collections import defaultdict, deque
sys.stdout.reconfigure(encoding='utf-8')

with open('backend/src/main/resources/data/nodes_all.json', 'r', encoding='utf-8-sig') as f:
    nodes = json.load(f)
with open('backend/src/main/resources/data/edges.json', 'r', encoding='utf-8-sig') as f:
    edges = json.load(f)

nodes_by_id = {str(n['id']): n for n in nodes}
bac_nodes_map = {str(n['id']): n for n in nodes
                 if n.get('type') == 'FILIERE' and str(n.get('code', '')).startswith('BAC_')}
bac_nodes = set(bac_nodes_map.keys())

# ── Construire graphes ──────────────────────────────────────────────────────
op_reverse = defaultdict(list)   # etab_id -> [filiere_id]
op_forward  = defaultdict(list)  # filiere_id -> [etab_id]
da_edges    = []                 # (bac_id, target_id)
rec_edges   = defaultdict(list)  # metier_id -> [(filiere_id, edge)]

for e in edges:
    s, t, lt = str(e['source_id']), str(e['target_id']), e['type_lien']
    if lt == 'OFFERTE_PAR':
        op_reverse[t].append(s)
        op_forward[s].append(t)
    elif lt == 'DONNE_ACCES':
        da_edges.append((s, t))
    elif lt == 'RECRUTEMENT':
        rec_edges[t].append((s, e))

graph = defaultdict(list)
for s, t in da_edges:
    graph[s].append((t, 'DONNE_ACCES'))
for e in edges:
    s, t, lt = str(e['source_id']), str(e['target_id']), e['type_lien']
    if lt == 'RECRUTEMENT':
        graph[s].append((t, 'RECRUTEMENT'))
for etab_id, fils in op_reverse.items():
    for f in fils:
        graph[etab_id].append((f, 'OFFERTE_PAR_REV'))

# BFS complet pour trouver FILIEREs et METIERs accessibles + chemin exemple
acc_filieres = set()
acc_metiers  = set()
# Garder un parent pour reconstruire un chemin exemple
parent = {}  # node_id -> (parent_id, edge_type)

for bac_id in bac_nodes:
    visited = set([bac_id])
    queue = deque([(bac_id, False, False)])
    while queue:
        node_id, aFL, aOP = queue.popleft()
        nd = nodes_by_id.get(node_id)
        if not nd:
            continue
        ntype = nd.get('type', '')
        if ntype == 'FILIERE' and node_id not in bac_nodes:
            acc_filieres.add(node_id)
        if ntype == 'METIER':
            acc_metiers.add(node_id)
            continue
        for nb_id, etype in graph[node_id]:
            if nb_id in visited:
                continue
            nb = nodes_by_id.get(nb_id)
            if not nb:
                continue
            if etype in ('OFFERTE_PAR_REV', 'ADMISSION'):
                if aFL and nb.get('type') == 'FILIERE' and (nb.get('duree_mois') or 0) >= 24:
                    continue
            if etype == 'OFFERTE_PAR_REV' and aOP:
                continue
            new_aFL = aFL
            new_aOP = (etype == 'OFFERTE_PAR_REV')
            cur = nodes_by_id.get(node_id)
            if cur and cur.get('type') == 'FILIERE' and node_id not in bac_nodes:
                if (cur.get('duree_mois') or 0) >= 24:
                    new_aFL = True
            visited.add(nb_id)
            if nb_id not in parent:
                parent[nb_id] = (node_id, etype)
            queue.append((nb_id, new_aFL, new_aOP))

def get_path(mid):
    path = []
    cur = mid
    while cur in parent:
        p, etype = parent[cur]
        path.append((cur, etype))
        cur = p
    path.append((cur, 'START'))
    path.reverse()
    return path

# ── Cibles ──────────────────────────────────────────────────────────────────
TARGETS = [
    'data scientist',
    'data analyst',
    'ingenieur ia',
    'machine learning engineer',
    'auditeur',
    'expert-comptable',
    'expert comptable',
]

def find_metier_nodes(keyword):
    results = []
    kw = keyword.lower().strip()
    for n in nodes:
        if n.get('type') != 'METIER':
            continue
        nom = n.get('nom_fr', '').lower()
        if kw in nom:
            results.append(n)
    return results

# ── DIAGNOSTIC PAR METIER ────────────────────────────────────────────────────
groups = [
    ('Data Scientist',           ['data scientist']),
    ('Data Analyst',             ['data analyst']),
    ('Ingenieur IA',             ['ingenieur ia', 'intelligence artificielle', 'ingenieur en ia']),
    ('Machine Learning Engineer',['machine learning']),
    ('Auditeur',                 ['auditeur']),
    ('Expert-Comptable',         ['expert-comptable', 'expert comptable']),
]

for label, keywords in groups:
    print()
    print('=' * 80)
    print(f'DIAGNOSTIC : {label}')
    print('=' * 80)

    # 1. Trouver les nœuds METIER correspondants
    found = []
    for kw in keywords:
        for n in nodes:
            if n.get('type') != 'METIER':
                continue
            if kw in n.get('nom_fr', '').lower():
                if n not in found:
                    found.append(n)

    if not found:
        print('  [1] NOEUD METIER : ABSENT dans nodes_all.json')
        print('  CAUSE : le METIER n existe pas dans la base de donnees')
        continue

    print(f'  [1] NOEUDS METIER trouves : {len(found)}')
    for n in found:
        mid = str(n['id'])
        nom = n['nom_fr']
        acc = mid in acc_metiers
        print(f'      id={mid}')
        print(f'      nom={nom}')
        print(f'      secteur={n.get("secteur")}')
        print(f'      accessible_BFS={acc}')

        # 2. FILIEREs source (RECRUTEMENT)
        sources = rec_edges.get(mid, [])
        print(f'  [3] FILIEREs avec RECRUTEMENT -> ce METIER : {len(sources)}')

        acc_src = []
        inacc_src = []
        for fid, edge in sources:
            fn = nodes_by_id.get(fid)
            if not fn:
                continue
            is_acc = fid in acc_filieres
            if is_acc:
                acc_src.append((fid, fn))
            else:
                inacc_src.append((fid, fn))

        print(f'      FILIEREs accessibles depuis BAC : {len(acc_src)}')
        for fid, fn in acc_src[:8]:
            duree = fn.get('duree_mois') or 0
            ville = fn.get('ville') or '(sans ville)'
            print(f'        [ACC][{duree}m] {fn.get("nom_fr","")[:65]} | {ville}')

        print(f'      FILIEREs INACCESSIBLES depuis BAC : {len(inacc_src)}')
        for fid, fn in inacc_src[:5]:
            duree = fn.get('duree_mois') or 0
            has_op = bool(op_forward.get(fid))
            has_da = any(t == fid for s, t in da_edges if s in bac_nodes)
            print(f'        [INACC][{duree}m] {fn.get("nom_fr","")[:65]}')
            print(f'               has_OP={has_op} | has_DA_direct={has_da}')

        # 3. Chemin exemple si accessible
        if acc and acc_src:
            path = get_path(mid)
            print(f'  [2] CHEMIN EXEMPLE (BFS) :')
            for step_id, etype in path:
                sn = nodes_by_id.get(step_id)
                snom = sn.get('nom_fr', step_id)[:60] if sn else step_id
                stype = sn.get('type', '?') if sn else '?'
                print(f'        [{stype}] {snom}  --({etype})--> ')
        elif not acc:
            print(f'  [2] NON ACCESSIBLE par BFS')
            if not sources:
                print(f'      CAUSE : aucune arete RECRUTEMENT vers ce METIER')
            elif not acc_src:
                print(f'      CAUSE : toutes les FILIEREs sources sont elles-memes inaccessibles')

        print()

# ── FOCUS FRONTEND : filtres potentiels ─────────────────────────────────────
print()
print('=' * 80)
print('ANALYSE FRONTEND : filtres susceptibles d elimination')
print('=' * 80)
print("""
Filtres actifs dans pathUtils.js (d apres le plan d audit existant) :

1. isCoherentPath() — regles codees en dur pour ~14 types de metiers.
   Pour Data Scientist, Data Analyst, Ingenieur IA, ML Engineer :
   - Aucune regle specifique => le chemin passe avec confidence=LOW
   - Mais : si le chemin a > 5 etapes post-BAC, il peut etre ELIMINE
     (seuil generaliste non adapte a ces metiers)
   - Durée > 96 mois peut eliminer certains parcours longs

2. pathMatchesRequestedCity() — logique AND stricte :
   - Si l etudiant selectionnne "Casablanca" et qu une FILIERE est a Rabat,
     le chemin est elimine meme si coherent.
   - Pour IT/Data : les meilleures formations (ENSIAS, INPT, EMI) sont a Rabat.
     Un etudiant cherchant depuis Casablanca ne les verra PAS.

3. finalJobMatchesSelection() — token matching :
   - Si l etudiant tape "Data Scientist" et le noeud s appelle
     "Data Scientist" exactement => OK
   - Si le noeud s appelle "Ingenieur Data Science" => peut ECHOUER
     selon l implementation exacte du matching

4. Score non adapte aux metiers Data/IA :
   - getScore() ajuste pour Expert Comptable et public/prive uniquement
   - Parcours Data Science via CPGE (correct mais long) peut scorer moins
     qu un parcours direct via ecole privee (court mais moins rigoureux)
""")

# Verifier le nom exact des noeuds pour le matching
print('=== Noms exacts des noeuds METIER (pour verifier le token matching) ===')
for label, keywords in groups:
    found = []
    for kw in keywords:
        for n in nodes:
            if n.get('type') == 'METIER' and kw in n.get('nom_fr', '').lower():
                if n not in found:
                    found.append(n)
    print(f'\n  {label}:')
    for n in found:
        print(f'    "{n.get("nom_fr")}" (id={str(n["id"])[:20]})')
