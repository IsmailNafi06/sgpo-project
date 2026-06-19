import json, sys
from collections import defaultdict, deque

sys.stdout.reconfigure(encoding='utf-8')

with open('backend/src/main/resources/data/nodes_all.json', 'r', encoding='utf-8-sig') as f:
    nodes = json.load(f)
with open('backend/src/main/resources/data/edges.json', 'r', encoding='utf-8-sig') as f:
    edges = json.load(f)

nodes_by_id = {str(n['id']): n for n in nodes}
bac_nodes = {str(n['id']): n for n in nodes
             if n.get('type') == 'FILIERE' and str(n.get('code','')).startswith('BAC_')}

# ── BFS pour trouver FILIEREs accessibles ────────────────────────────────────
op_reverse = defaultdict(list)
for e in edges:
    if e['type_lien'] == 'OFFERTE_PAR':
        op_reverse[str(e['target_id'])].append(str(e['source_id']))

graph = defaultdict(list)
for e in edges:
    s, t, lt = str(e['source_id']), str(e['target_id']), e['type_lien']
    if lt == 'DONNE_ACCES':
        graph[s].append((t, 'DONNE_ACCES'))
    elif lt == 'RECRUTEMENT':
        graph[s].append((t, 'RECRUTEMENT'))
for etab_id, fils in op_reverse.items():
    for f in fils:
        graph[etab_id].append((f, 'OFFERTE_PAR_REV'))

acc_metiers = set()
acc_filieres = set()

for bac_id in bac_nodes:
    visited = set([bac_id])
    queue = deque([(bac_id, False, False)])
    while queue:
        node_id, aFilLong, aOP = queue.popleft()
        node = nodes_by_id.get(node_id)
        if not node:
            continue
        ntype = node.get('type', '')
        if ntype == 'METIER':
            acc_metiers.add(node_id)
            continue
        if ntype == 'FILIERE' and node_id not in bac_nodes:
            acc_filieres.add(node_id)
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

print(f"FILIEREs accessibles : {len(acc_filieres)}")

# Arêtes RECRUTEMENT existantes
existing_recrutement = set()
for e in edges:
    if e['type_lien'] == 'RECRUTEMENT':
        existing_recrutement.add((str(e['source_id']), str(e['target_id'])))

# ── Définition des 16 orphelins et critères de recherche ─────────────────────
TARGETS = [
    {
        'nom': 'Ingenieur CVC',
        'id': None,  # sera résolu
        'keywords': ['thermique', 'cvc', 'chaleur', 'ventilation', 'climatisation', 'froid', 'bâtiment', 'habitat', 'energetique'],
        'secteurs_fil': ['genie', 'energetique', 'thermique', 'energie', 'industriel', 'btp'],
        'note': 'Chauffage Ventilation Climatisation'
    },
    {
        'nom': 'Ingenieur structure bois',
        'id': None,
        'keywords': ['bois', 'structure', 'genie civil', 'btp', 'construction', 'materiau'],
        'secteurs_fil': ['genie civil', 'btp', 'construction', 'matériaux'],
        'note': 'Construction bois/génie civil'
    },
    {
        'nom': 'Architecte en energies renouvelables',
        'id': None,
        'keywords': ['energie', 'renouvelable', 'solaire', 'architecture', 'ensa', 'btp'],
        'secteurs_fil': ['energie', 'renouvelable', 'electrique', 'architecture'],
        'note': 'Architecture + énergies renouvelables'
    },
    {
        'nom': 'Ingenieur en biotechnologies agricoles',
        'id': None,
        'keywords': ['biotechnologie', 'agronomie', 'biologie', 'iav', 'agricole', 'biotech'],
        'secteurs_fil': ['agro', 'biologie', 'biotechnologie', 'iav'],
        'note': 'Biotechnologies végétales/animales'
    },
    {
        'nom': 'Aquaculteur',
        'id': None,
        'keywords': ['aquaculture', 'halieutique', 'peche', 'marin', 'biologie marine', 'iav', 'agronomie'],
        'secteurs_fil': ['agro', 'biologie', 'halieutique', 'marine'],
        'note': 'Élevage aquatique'
    },
    {
        'nom': 'Cerealier',
        'id': None,
        'keywords': ['agronomie', 'agriculture', 'iav', 'cereale', 'culture'],
        'secteurs_fil': ['agro', 'agriculture'],
        'note': 'Agriculture céréalière'
    },
    {
        'nom': 'Ingenieur biomecanique',
        'id': None,
        'keywords': ['biomecanique', 'biomédical', 'medical', 'sante', 'genie', 'biologie'],
        'secteurs_fil': ['sante', 'biomédical', 'génie biomédical'],
        'note': 'Génie biomédical'
    },
    {
        'nom': 'ingenieur en systemes de stockage d\'energie',
        'id': None,
        'keywords': ['energie', 'electrique', 'stockage', 'renouvelable', 'ensa', 'inpt', 'electronique'],
        'secteurs_fil': ['electrique', 'energie', 'electronique'],
        'note': 'Batteries / stockage énergie'
    },
    {
        'nom': 'Ingenieur packaging',
        'id': None,
        'keywords': ['packaging', 'emballage', 'industriel', 'chimie', 'plasturgie', 'genie'],
        'secteurs_fil': ['industriel', 'chimie', 'plasturgie', 'matériaux'],
        'note': 'Conception emballages industriels'
    },
    {
        'nom': 'Ingenieur support telecom',
        'id': None,
        'keywords': ['telecom', 'reseau', 'inpt', 'telecoms', 'communication', 'ensa'],
        'secteurs_fil': ['telecom', 'reseau', 'communication'],
        'note': 'Support technique télécoms'
    },
    {
        'nom': 'Architecte en conception bioclimatique',
        'id': None,
        'keywords': ['architecture', 'energie', 'bioclimatique', 'btp', 'habitat'],
        'secteurs_fil': ['architecture', 'btp', 'energie'],
        'note': 'Architecture bioclimatique / éco-construction'
    },
    {
        'nom': 'Analyste en Cybersante',
        'id': None,
        'keywords': ['sante', 'numerique', 'informatique', 'medical', 'cyber', 'si', 'systeme'],
        'secteurs_fil': ['informatique', 'sante', 'systeme'],
        'note': 'Santé numérique / cybersécurité médicale'
    },
    {
        'nom': 'Ingenieur en realite augmentee',
        'id': None,
        'keywords': ['realite', 'multimedia', 'informatique', '3d', 'numerique', 'image'],
        'secteurs_fil': ['informatique', 'multimedia', 'numerique'],
        'note': 'AR/VR / infographie 3D'
    },
    {
        'nom': 'Scenariste',
        'id': None,
        'keywords': ['audiovisuel', 'cinema', 'communication', 'journalisme', 'isic', 'media', 'ecriture'],
        'secteurs_fil': ['communication', 'journalisme', 'media', 'audiovisuel'],
        'note': 'Écriture scénaristique / audiovisuel'
    },
    {
        'nom': 'Responsable de suivi biologique',
        'id': None,
        'keywords': ['biologie', 'biochimie', 'biotechnologie', 'agronomie', 'laboratoire', 'analyse'],
        'secteurs_fil': ['biologie', 'biochimie', 'agroalimentaire'],
        'note': 'Suivi biologique / laboratoire'
    },
    {
        'nom': 'Ingenieur(e) en analyse de l\'air',
        'id': None,
        'keywords': ['chimie', 'environnement', 'pollution', 'air', 'qualite', 'analyse', 'atmosphere'],
        'secteurs_fil': ['chimie', 'environnement'],
        'note': 'Qualité de l\'air / chimie environnementale'
    },
]

# Résoudre les IDs des METIERs
for t in TARGETS:
    for m in nodes:
        if m.get('type') == 'METIER' and m['nom_fr'].lower().strip() == t['nom'].lower().strip():
            t['id'] = str(m['id'])
            break
    if not t['id']:
        # Recherche partielle
        for m in nodes:
            if m.get('type') == 'METIER' and t['nom'].lower() in m['nom_fr'].lower():
                t['id'] = str(m['id'])
                break

# ── Recherche de FILIEREs accessibles cohérentes ────────────────────────────
def score_filiere(fil, keywords):
    """Score de pertinence d'une FILIERE pour un METIER."""
    nom = fil.get('nom_fr', '').lower()
    sec = fil.get('secteur', '').lower() if fil.get('secteur') else ''
    score = 0
    for kw in keywords:
        if kw.lower() in nom:
            score += 3
        if kw.lower() in sec:
            score += 1
    # Bonus pour formations longues (ingénieurs préfèrent cycles ingénieur)
    duree = fil.get('duree_mois') or 0
    if 48 <= duree <= 72:
        score += 2
    elif 36 <= duree < 48:
        score += 1
    return score

print()
print("="*80)
print("AUDIT : FILIEREs accessibles pour les 16 orphelins prioritaires")
print("="*80)

results_high = []
results_medium = []
results_low = []

for t in TARGETS:
    mid = t['id']
    if not mid:
        print(f"\n[ERREUR] METIER '{t['nom']}' non trouvé dans nodes_all.json")
        continue

    # Vérifier que le METIER est bien inaccessible
    if mid in acc_metiers:
        print(f"\n[SKIP] {t['nom']} est déjà accessible!")
        continue

    # Chercher FILIEREs accessibles avec score > 0
    candidates = []
    for fil_id in acc_filieres:
        fil = nodes_by_id.get(fil_id)
        if not fil:
            continue
        s = score_filiere(fil, t['keywords'])
        if s >= 3:  # Au moins un match sur le nom
            # Vérifier pas de RECRUTEMENT existant
            already_exists = (fil_id, mid) in existing_recrutement
            candidates.append((s, fil_id, fil, already_exists))

    candidates.sort(key=lambda x: -x[0])

    print(f"\n{'='*70}")
    print(f"METIER : {t['nom']}")
    print(f"  ID   : {mid}")
    print(f"  Note : {t['note']}")

    if not candidates:
        print(f"  [AUCUNE FILIERE TROUVEE] — confiance FAIBLE")
        results_low.append({'metier': t['nom'], 'metier_id': mid, 'filiere': None, 'raison': 'Aucune filière accessible trouvée'})
        continue

    # Prendre le meilleur candidat non-dupliqué
    best = None
    for score, fil_id, fil, already_exists in candidates[:5]:
        print(f"  Candidat (score={score}): {fil['nom_fr'][:60]:60} | ville={fil.get('ville','?')}")
        print(f"           duree={fil.get('duree_mois')}m | doublon={already_exists}")
        if best is None and not already_exists:
            best = (score, fil_id, fil)

    if best is None:
        print(f"  [RECRUTEMENT DEJA EXISTANT ou PAS DE CANDIDAT VALIDE]")
        results_low.append({'metier': t['nom'], 'metier_id': mid, 'filiere': None, 'raison': 'Arête existante ou candidat invalide'})
        continue

    score, fil_id, fil = best
    fil_nom = fil['nom_fr']
    fil_duree = fil.get('duree_mois') or 0

    # Évaluer confiance
    if score >= 9 and fil_duree >= 36:
        confidence = 'ELEVEE'
    elif score >= 6:
        confidence = 'ELEVEE' if fil_duree >= 24 else 'MOYENNE'
    elif score >= 3:
        confidence = 'MOYENNE'
    else:
        confidence = 'FAIBLE'

    record = {
        'metier': t['nom'],
        'metier_id': mid,
        'filiere_nom': fil_nom,
        'filiere_id': fil_id,
        'score': score,
        'duree': fil_duree,
        'confidence': confidence,
        'note': t['note'],
        'ville': fil.get('ville', ''),
    }

    print(f"  => RETENU : {fil_nom}")
    print(f"     ID     : {fil_id}")
    print(f"     Score  : {score} | Duree : {fil_duree}m | Confiance : {confidence}")

    if confidence == 'ELEVEE':
        results_high.append(record)
    elif confidence == 'MOYENNE':
        results_medium.append(record)
    else:
        results_low.append(record)

# ── Synthèse ─────────────────────────────────────────────────────────────────
print()
print("="*80)
print("SYNTHESE : ARETES RECRUTEMENT PROPOSEES PAR NIVEAU DE CONFIANCE")
print("="*80)

print(f"\n--- CONFIANCE ELEVEE ({len(results_high)} aretes) ---")
for r in results_high:
    print(f"  {r['metier'][:45]:45} <- {r['filiere_nom'][:45]:45} | score={r['score']}")

print(f"\n--- CONFIANCE MOYENNE ({len(results_medium)} aretes) ---")
for r in results_medium:
    print(f"  {r['metier'][:45]:45} <- {r['filiere_nom'][:45]:45} | score={r['score']}")

print(f"\n--- CONFIANCE FAIBLE / NON TROUVE ({len(results_low)} METIERs) ---")
for r in results_low:
    raison = r.get('raison', '')
    fil = r.get('filiere_nom', 'N/A') or 'N/A'
    print(f"  {r['metier'][:45]:45} | {raison or fil}")

print(f"\n--- JSON LOT STRATEGIE A (confiance ELEVEE seulement) ---")
print(f"[")
for i, r in enumerate(results_high):
    comma = "," if i < len(results_high) - 1 else ""
    print(f'  {{ "source_id": "{r["filiere_id"]}", "target_id": "{r["metier_id"]}",')
    print(f'    "filiere": "{r["filiere_nom"][:60]}", "metier": "{r["metier"]}" }}{comma}')
print(f"]")
print(f"\nTotal ELEVEE : {len(results_high)} | MOYENNE : {len(results_medium)} | FAIBLE : {len(results_low)}")
