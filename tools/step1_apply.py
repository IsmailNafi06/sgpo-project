"""
Étape 1 — APPLICATION : Rattacher les FILIEREs orphelines aux ETABs réels existants.
Ajoute 68 arêtes OFFERTE_PAR dans edges.json. Crée un backup horodaté avant.
"""

import json, re, unicodedata, uuid, sys, shutil
from datetime import datetime
from collections import defaultdict, Counter

sys.stdout.reconfigure(encoding='utf-8')

DATA    = 'backend/src/main/resources/data'
EDGES_F = f'{DATA}/edges.json'
NODES_F = f'{DATA}/nodes_all.json'

# ── helpers ──────────────────────────────────────────────────────────────────
def norm(s):
    s = (s or '').lower().strip()
    s = unicodedata.normalize('NFD', s)
    s = ''.join(c for c in s if unicodedata.category(c) != 'Mn')
    s = re.sub(r"[''`]", '', s)
    s = re.sub(r'[^a-z0-9 ]', ' ', s)
    return re.sub(r'\s+', ' ', s).strip()

# ── 0. Backup ────────────────────────────────────────────────────────────────
ts = datetime.now().strftime('%Y%m%d_%H%M%S')
bak = f'{EDGES_F}.bak_step1_{ts}'
shutil.copy2(EDGES_F, bak)
print(f'[BACKUP] {bak}')

# ── 1. Charger les données ───────────────────────────────────────────────────
with open(NODES_F, 'r', encoding='utf-8') as f:
    nodes = json.load(f)
with open(EDGES_F, 'r', encoding='utf-8') as f:
    edges = json.load(f)

nodes_by_id = {str(n['id']): n for n in nodes}

filiere_etabs   = defaultdict(set)
filiere_metiers = defaultdict(set)
metier_filieres = defaultdict(set)
filiere_bacs    = defaultdict(set)
etab_filiers    = defaultdict(set)
existing_op     = set()

for e in edges:
    s  = str(e.get('source_id', ''))
    t  = str(e.get('target_id', ''))
    lt = e.get('type_lien', '')
    if lt == 'OFFERTE_PAR':
        filiere_etabs[s].add(t)
        etab_filiers[t].add(s)
        existing_op.add((s, t))
    elif lt == 'RECRUTEMENT':
        filiere_metiers[s].add(t)
        metier_filieres[t].add(s)
    elif lt == 'DONNE_ACCES':
        filiere_bacs[t].add(s)

filieres = [n for n in nodes if n.get('type') == 'FILIERE']
etabs    = [n for n in nodes if n.get('type') == 'ETABLISSEMENT']
metiers  = [n for n in nodes if n.get('type') == 'METIER']

fil_no_etab_avant = [n for n in filieres if not filiere_etabs.get(str(n['id']))]
etab_phantom = {str(n['id']) for n in etabs if not etab_filiers.get(str(n['id']))}
etab_real    = [n for n in etabs if str(n['id']) not in etab_phantom]

# ── 2. Matching (même logique que dry-run) ───────────────────────────────────
ACRONYMS = [
    'ensa', 'encg', 'fst', 'fmp', 'fmd', 'fsjes', 'iscae', 'inpt',
    'emsi', 'ehtp', 'emi', 'iav', 'iam', 'isga', 'hec', 'enset',
    'crmef', 'esith', 'enim', 'uir', 'aui', 'enp', 'isaa',
    'ista', 'isic', 'ismaip', 'escola', 'heec', 'esirem',
]
CITIES = [
    'rabat', 'casablanca', 'marrakech', 'fes', 'agadir', 'tanger',
    'meknes', 'oujda', 'kenitra', 'tetouan', 'beni mellal', 'mohammedia',
    'el jadida', 'khouribga', 'settat', 'berrechid', 'nador', 'khemisset',
    'safi', 'errachidia', 'al hoceima', 'laayoune', 'dakhla', 'ouarzazate',
    'ifrane', 'larache', 'taza', 'berkane', 'guelmim', 'bouznika',
    'temara', 'sale', 'eljadida', 'benimellal', 'alhoceima',
]
CITY_ALIAS = {
    'casa': 'casablanca', 'fez': 'fes', 'marrakesh': 'marrakech',
    'sala': 'sale', 'eljadida': 'el jadida',
    'alhoceima': 'al hoceima', 'benimellal': 'beni mellal',
}

def normalize_city(s):
    c = norm(s or '')
    return CITY_ALIAS.get(c, c)

# Index (acr, ville) -> ETABs réels
etab_index     = defaultdict(list)
for etab in etab_real:
    en = norm(etab.get('nom_fr', ''))
    ev = normalize_city(etab.get('ville', '') or '')
    words = en.split()
    for acr in ACRONYMS:
        if acr in words or acr in en:
            etab_index[(acr, ev)].append(etab)

def extract_acr_city(nom, ville_noeud):
    results = []
    n = norm(nom)
    words = n.split()
    for acr in ACRONYMS:
        if acr not in words and acr not in n:
            continue
        found_city = None
        for city in sorted(CITIES, key=len, reverse=True):
            if city in n:
                found_city = city
                break
        if found_city:
            results.append((acr, found_city, 'HIGH'))
        elif ville_noeud:
            cv = normalize_city(ville_noeud)
            if cv:
                results.append((acr, cv, 'MED'))
    return results

# Parcourir les FILIEREs orphelines
new_links = []
seen_fid  = set()

for fil in fil_no_etab_avant:
    fid  = str(fil['id'])
    nom  = fil.get('nom_fr', '')
    vcity = fil.get('ville', '') or ''
    candidates = extract_acr_city(nom, vcity)

    best = None
    for acr, city, conf in candidates:
        elist = etab_index.get((acr, city), [])
        if len(elist) == 1:
            best = (elist[0], conf)
            break
        elif len(elist) > 1:
            top = sorted(elist, key=lambda e: len(etab_filiers.get(str(e['id']), set())), reverse=True)
            best = (top[0], 'MED')

    if best is None or fid in seen_fid:
        continue
    etab, conf = best
    eid = str(etab['id'])
    if eid in etab_phantom:
        continue
    if (fid, eid) in existing_op:
        continue
    seen_fid.add(fid)
    new_links.append((fil, etab, conf))

# ── 3. Générer les nouvelles arêtes ─────────────────────────────────────────
new_edges_data = []
for fil, etab, conf in new_links:
    new_edges_data.append({
        "id":                       str(uuid.uuid4()),
        "source_id":                str(fil['id']),
        "target_id":                str(etab['id']),
        "type_lien":                "OFFERTE_PAR",
        "taux_reussite":            100,
        "cout_supplementaire":      0,
        "duree_supplementaire_mois": 0,
        "prerequis_notes":          "Lien etabli Phase B Step1.",
        "moyenne_minimale":         None,
        "type_acces":               "OUVERT",
    })

# ── 4. Métriques AVANT ───────────────────────────────────────────────────────
nb_edges_avant = len(edges)
nb_op_avant    = sum(1 for e in edges if e.get('type_lien') == 'OFFERTE_PAR')
nb_fil_no_etab_avant = len(fil_no_etab_avant)

def count_accessible_metiers(fil_et_map):
    ok = 0
    for n in metiers:
        mid = str(n['id'])
        if any(fil_et_map.get(fid) and filiere_bacs.get(fid)
               for fid in metier_filieres.get(mid, set())):
            ok += 1
    return ok

met_avant = count_accessible_metiers(filiere_etabs)

# ── 5. Écrire edges.json ─────────────────────────────────────────────────────
edges_apres = edges + new_edges_data
with open(EDGES_F, 'w', encoding='utf-8') as f:
    json.dump(edges_apres, f, ensure_ascii=False, indent=2)

# ── 6. Métriques APRÈS ───────────────────────────────────────────────────────
# Reconstruire les index avec les nouvelles arêtes
filiere_etabs_apres = defaultdict(set)
etab_filiers_apres  = defaultdict(set)
for e in edges_apres:
    s  = str(e.get('source_id', ''))
    t  = str(e.get('target_id', ''))
    lt = e.get('type_lien', '')
    if lt == 'OFFERTE_PAR':
        filiere_etabs_apres[s].add(t)
        etab_filiers_apres[t].add(s)

met_apres         = count_accessible_metiers(filiere_etabs_apres)
nb_fil_no_etab_ap = sum(1 for n in filieres if not filiere_etabs_apres.get(str(n['id'])))
nb_op_apres       = nb_op_avant + len(new_edges_data)

# ── 7. Vérifications intégrité ───────────────────────────────────────────────
all_ids = {str(n['id']) for n in nodes}
orphans  = sum(1 for e in new_edges_data
               if str(e['source_id']) not in all_ids or str(e['target_id']) not in all_ids)
selfloops = sum(1 for e in new_edges_data if str(e['source_id']) == str(e['target_id']))

# Doublons dans l'ensemble final
pairs_all = defaultdict(int)
for e in edges_apres:
    if e.get('type_lien') == 'OFFERTE_PAR':
        pairs_all[(str(e['source_id']), str(e['target_id']))] += 1
doublons = sum(1 for v in pairs_all.values() if v > 1)

# JSON valide (si on arrive ici, la sérialisation a réussi)
json_valid = True

# ── 8. Rapport ───────────────────────────────────────────────────────────────
print()
print('=== APPLICATION ÉTAPE 1 — RAPPORT ===')
print()
print(f'1. Backup créé              : {bak}')
print(f'2. JSON valide              : {"OUI" if json_valid else "NON"}')
print(f'3. Arêtes avant / après     : {nb_edges_avant} -> {len(edges_apres)} (+{len(new_edges_data)})')
print(f'4. OFFERTE_PAR avant/après  : {nb_op_avant} -> {nb_op_apres} (+{len(new_edges_data)} ajoutées)')
print(f'5. Arêtes orphelines        : {orphans} (attendu 0)')
print(f'6. Self-loops               : {selfloops} (attendu 0)')
print(f'7. Doublons OFFERTE_PAR     : {doublons} (attendu 0)')
print(f'8. METIERs accessibles      : {met_avant} -> {met_apres} (+{met_apres - met_avant})')
print(f'9. FILIEREs sans ETAB       : {nb_fil_no_etab_avant} -> {nb_fil_no_etab_ap} (-{nb_fil_no_etab_avant - nb_fil_no_etab_ap})')
print()
print(f'   Statut : {"OK - tous les checks passent" if orphans == 0 and selfloops == 0 and doublons == 0 else "ECHEC"}')
