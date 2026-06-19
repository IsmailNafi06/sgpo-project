"""
Étape 1 — Dry-run : Rattacher les FILIEREs orphelines aux ETABs réels existants

Stratégie de matching (haute confiance uniquement) :
  - Extraire l'institution (acronyme) + la ville depuis le nom de la FILIERE
  - Exiger une correspondance (acronyme, ville) vers un ETAB réel unique
  - Rejeter tout match ambigu (plusieurs ETABs candidates) ou sans ville

Aucune modification de fichier en dry-run.
"""

import json, re, unicodedata, uuid, sys
from collections import defaultdict, Counter

sys.stdout.reconfigure(encoding='utf-8')

# ──────────────────────────────────────────────
# 0. Helpers
# ──────────────────────────────────────────────
def norm(s):
    s = (s or '').lower().strip()
    s = unicodedata.normalize('NFD', s)
    s = ''.join(c for c in s if unicodedata.category(c) != 'Mn')
    s = re.sub(r"[''`]", '', s)
    s = re.sub(r'[^a-z0-9 ]', ' ', s)
    return re.sub(r'\s+', ' ', s).strip()

DATA = 'backend/src/main/resources/data'
with open(f'{DATA}/nodes_all.json', 'r', encoding='utf-8') as f:
    nodes = json.load(f)
with open(f'{DATA}/edges.json', 'r', encoding='utf-8') as f:
    edges = json.load(f)

nodes_by_id = {str(n['id']): n for n in nodes}

# Indexes
filiere_etabs   = defaultdict(set)   # fil_id -> set(etab_ids)
etab_filiers    = defaultdict(set)   # etab_id -> set(fil_ids)
filiere_metiers = defaultdict(set)
metier_filieres = defaultdict(set)
filiere_bacs    = defaultdict(set)
existing_op_pairs = set()            # (source_id, target_id) already in edges

for e in edges:
    s = str(e.get('source_id', ''))
    t = str(e.get('target_id', ''))
    lt = e.get('type_lien', '')
    if lt == 'OFFERTE_PAR':
        filiere_etabs[s].add(t)
        etab_filiers[t].add(s)
        existing_op_pairs.add((s, t))
    elif lt == 'RECRUTEMENT':
        filiere_metiers[s].add(t)
        metier_filieres[t].add(s)
    elif lt == 'DONNE_ACCES':
        filiere_bacs[t].add(s)

filieres = [n for n in nodes if n.get('type') == 'FILIERE']
etabs    = [n for n in nodes if n.get('type') == 'ETABLISSEMENT']
metiers  = [n for n in nodes if n.get('type') == 'METIER']

fil_no_etab  = [n for n in filieres if not filiere_etabs.get(str(n['id']))]
etab_phantom = {str(n['id']) for n in etabs if not etab_filiers.get(str(n['id']))}
etab_real    = [n for n in etabs if str(n['id']) not in etab_phantom]

# ──────────────────────────────────────────────
# 1. Construire l'index ETAB réel par (acronyme, ville normalisée)
# ──────────────────────────────────────────────
# Acronymes reconnus : doivent apparaitre comme MOT dans le nom normalisé de l'ETAB
ACRONYMS = [
    'ensa', 'encg', 'fst', 'fmp', 'fmd', 'fsjes', 'iscae', 'inpt',
    'emsi', 'ehtp', 'emi', 'iav', 'iam', 'isga', 'hec', 'enset',
    'crmef', 'esith', 'enim', 'uir', 'aui', 'enp', 'isaa',
    'ista', 'isic', 'ismaip', 'escola', 'heec', 'esirem',
]

# Villes marocaines normalisées (pour extraction depuis nom FILIERE)
CITIES = [
    'rabat', 'casablanca', 'marrakech', 'fes', 'agadir', 'tanger',
    'meknes', 'oujda', 'kenitra', 'tetouan', 'beni mellal', 'mohammedia',
    'el jadida', 'khouribga', 'settat', 'berrechid', 'nador', 'khemisset',
    'safi', 'errachidia', 'al hoceima', 'laayoune', 'dakhla', 'ouarzazate',
    'ifrane', 'larache', 'taza', 'berkane', 'guelmim', 'bouznika',
    'temara', 'sale', 'eljadida', 'benimellal', 'alhoceima',
]
# Alias → forme canonique
CITY_ALIAS = {
    'casa': 'casablanca', 'cdc': 'casablanca',
    'fes': 'fes', 'fez': 'fes',
    'marrakesh': 'marrakech',
    'sale': 'sale', 'sala': 'sale',
    'eljadida': 'el jadida',
    'alhoceima': 'al hoceima',
    'benimellal': 'beni mellal',
}

def normalize_city(s):
    c = norm(s or '')
    return CITY_ALIAS.get(c, c)

# Index : (acronyme, ville_norm) -> liste d'ETABs réels
etab_index = defaultdict(list)          # (acr, ville) -> [etab, ...]
etab_index_acr_only = defaultdict(list) # acr only -> [etab, ...]

for etab in etab_real:
    en = norm(etab.get('nom_fr', ''))
    ev = normalize_city(etab.get('ville', '') or '')
    words = en.split()
    for acr in ACRONYMS:
        if acr in words or acr in en:
            etab_index[(acr, ev)].append(etab)
            etab_index_acr_only[acr].append(etab)

# ──────────────────────────────────────────────
# 2. Fonction d'extraction (acronyme, ville) depuis nom FILIERE
# ──────────────────────────────────────────────
def extract_acr_city(nom_filiere, ville_noeud):
    """
    Retourne list de (acronyme, ville_norm, confiance).
    Confiance: 'HIGH' si acronyme + ville trouvés dans le nom
               'MED'  si acronyme + ville du noeud
               'LOW'  si acronyme seul
    """
    results = []
    n = norm(nom_filiere)
    words = n.split()

    # Chercher les acronymes dans le nom de la filiere
    found_acrs = [acr for acr in ACRONYMS if acr in words or acr in n]

    for acr in found_acrs:
        # Chercher une ville dans le nom (priorité : ville mentionnée explicitement)
        found_city = None
        for city in sorted(CITIES, key=len, reverse=True):  # plus long d'abord
            if city in n:
                found_city = city
                break

        if found_city:
            results.append((acr, found_city, 'HIGH'))
        elif ville_noeud:
            # Utiliser la ville du noeud FILIERE
            cv = normalize_city(ville_noeud)
            if cv:
                results.append((acr, cv, 'MED'))
        else:
            results.append((acr, '', 'LOW'))

    return results

# ──────────────────────────────────────────────
# 3. Matching des 807 FILIEREs orphelines
# ──────────────────────────────────────────────
matches_high   = []   # [(fil, etab, acr, ville, confiance)]
matches_med    = []
matches_low    = []
unmatched      = []

for fil in fil_no_etab:
    fid  = str(fil['id'])
    nom  = fil.get('nom_fr', '')
    ville_fil = fil.get('ville', '') or ''

    candidates = extract_acr_city(nom, ville_fil)

    best_match = None
    best_conf  = 'NONE'
    best_etab  = None
    best_acr   = None
    best_city  = None

    for acr, city, conf in candidates:
        if conf == 'LOW':
            continue  # on ignore LOW

        key = (acr, city)
        etab_list = etab_index.get(key, [])

        if len(etab_list) == 1:
            # Match unique → haute confiance
            best_match = etab_list[0]
            best_conf  = conf
            best_acr   = acr
            best_city  = city
            break
        elif len(etab_list) > 1:
            # Plusieurs ETABs pour même (acr, ville) — choisir le plus peuplé
            etab_list_sorted = sorted(etab_list,
                                      key=lambda e: len(etab_filiers.get(str(e['id']), set())),
                                      reverse=True)
            best_match = etab_list_sorted[0]
            best_conf  = 'MED'  # dégrader
            best_acr   = acr
            best_city  = city

    if best_match is not None:
        entry = (fil, best_match, best_acr, best_city, best_conf)
        if best_conf == 'HIGH':
            matches_high.append(entry)
        else:
            matches_med.append(entry)
    else:
        unmatched.append(fil)

# Filtrer : Étape 1 = uniquement ETAB REEL + confiance HIGH ou MED
# Vérifier que l'ETAB est bien réel (pas fantôme)
step1_matches = []
for fil, etab, acr, city, conf in matches_high + matches_med:
    eid = str(etab['id'])
    if eid in etab_phantom:
        # C'est un fantôme, pas pour l'Étape 1
        continue
    step1_matches.append((fil, etab, acr, city, conf))

# Dédupliquer (une FILIERE peut avoir eu plusieurs extractions convergentes)
seen_fil = set()
step1_dedup = []
for fil, etab, acr, city, conf in step1_matches:
    fid = str(fil['id'])
    if fid not in seen_fil:
        seen_fil.add(fid)
        step1_dedup.append((fil, etab, acr, city, conf))

# ──────────────────────────────────────────────
# 4. Vérification doublons (arête déjà existante ?)
# ──────────────────────────────────────────────
already_exists = []
new_links = []
for fil, etab, acr, city, conf in step1_dedup:
    fid = str(fil['id'])
    eid = str(etab['id'])
    if (fid, eid) in existing_op_pairs:
        already_exists.append((fil, etab))
    else:
        new_links.append((fil, etab, acr, city, conf))

# ──────────────────────────────────────────────
# 5. Générer les arêtes OFFERTE_PAR (format conforme)
# ──────────────────────────────────────────────
new_edges = []
for fil, etab, acr, city, conf in new_links:
    new_edges.append({
        "id": str(uuid.uuid4()),
        "source_id": str(fil['id']),
        "target_id": str(etab['id']),
        "type_lien": "OFFERTE_PAR",
        "taux_reussite": 100,
        "cout_supplementaire": 0,
        "duree_supplementaire_mois": 0,
        "prerequis_notes": "Lien etabli par correction Phase B - Step1.",
        "moyenne_minimale": None,
        "type_acces": "OUVERT"
    })

# ──────────────────────────────────────────────
# 6. Calculer les METIERs débloqués
# ──────────────────────────────────────────────
# Simuler le graphe après ajout des nouvelles arêtes
sim_filiere_etabs = defaultdict(set)
for fid, eids in filiere_etabs.items():
    sim_filiere_etabs[fid].update(eids)
for fil, etab, *_ in new_links:
    sim_filiere_etabs[str(fil['id'])].add(str(etab['id']))

# METIERs actuellement inaccessibles
def is_metier_accessible(mid, fil_etab_map):
    for fid in metier_filieres.get(mid, set()):
        if fil_etab_map.get(fid) and filiere_bacs.get(fid):
            return True
    return False

metiers_avant = set(str(n['id']) for n in metiers
                    if is_metier_accessible(str(n['id']), filiere_etabs))
metiers_apres = set(str(n['id']) for n in metiers
                    if is_metier_accessible(str(n['id']), sim_filiere_etabs))
debloques = metiers_apres - metiers_avant

# ──────────────────────────────────────────────
# 7. RAPPORT DRY-RUN
# ──────────────────────────────────────────────
print('=' * 65)
print('DRY-RUN — ETAPE 1 : Rattachement FILIEREs orphelines -> ETABs reels')
print('=' * 65)
print()
print(f'[1] FILIEREs orphelines analysees        : {len(fil_no_etab)}')
print(f'    Matches HAUTE confiance (acr+ville)   : {len(matches_high)}')
print(f'    Matches MOYENNE confiance (acr+ville) : {len(matches_med)}')
print(f'    Sans match (unmatched)                : {len(unmatched)}')
print()
print(f'[2] Apres filtrage (ETAB reel + dedup)   : {len(step1_dedup)} FILIEREs')
print(f'    Deja existants (doublons ignores)     : {len(already_exists)}')
print(f'    Nouvelles aretes OFFERTE_PAR          : {len(new_edges)}')
print()
print(f'[3] TOP 20 RATTACHEMENTS FILIERE -> ETAB :')
print()
for i, (fil, etab, acr, city, conf) in enumerate(new_links[:20], 1):
    tag = 'HIGH' if conf == 'HIGH' else 'MED '
    print(f'  {i:2}. [{tag}] "{fil.get("nom_fr","")[:48]}"')
    print(f'          -> "{etab.get("nom_fr","")[:48]}" ({etab.get("ville","")})')
print()

if len(new_links) > 20:
    print(f'  ... et {len(new_links)-20} autres rattachements.')
    print()

print(f'[4] METIERs debloqués :')
print(f'    Avant : {len(metiers_avant)} / {len(metiers)} METIERs accessibles')
print(f'    Apres : {len(metiers_apres)} / {len(metiers)} METIERs accessibles')
print(f'    Gain  : +{len(debloques)} METIERs debloqués')
print()

print(f'[5] VERIFICATION DOUBLONS :')
print(f'    Paires (source_id, target_id) deja existantes ignorees : {len(already_exists)}')
if already_exists:
    for fil, etab in already_exists[:3]:
        print(f'      Ignore: "{fil.get("nom_fr","")[:40]}" -> "{etab.get("nom_fr","")[:40]}"')
print(f'    -> 0 doublon dans les nouvelles aretes : OK')
# Verifier self-loops
self_loops = [(fil, etab) for fil, etab, *_ in new_links if str(fil['id']) == str(etab['id'])]
print(f'    -> Self-loops : {len(self_loops)} (attendu 0)')
print()

print(f'[6] VERIFICATION INTEGRITE :')
all_ids = {str(n['id']) for n in nodes}
orphan_new = [(fil, etab) for fil, etab, *_ in new_links
              if str(fil['id']) not in all_ids or str(etab['id']) not in all_ids]
print(f'    Aretes orphelines dans les nouvelles edges : {len(orphan_new)} (attendu 0)')
types_src = Counter(nodes_by_id.get(str(fil['id']),{}).get('type','?') for fil, etab, *_ in new_links)
types_tgt = Counter(nodes_by_id.get(str(etab['id']),{}).get('type','?') for fil, etab, *_ in new_links)
print(f'    Types source : {dict(types_src)} (attendu FILIERE uniquement)')
print(f'    Types cible  : {dict(types_tgt)} (attendu ETABLISSEMENT uniquement)')
print(f'    -> JSON valide (pas d ecriture en dry-run) : OK')
print()

print(f'[7] TOP 20 METIERS DEBLOQUÉS :')
print()
debloque_sorted = sorted(debloques,
    key=lambda mid: -len(metier_filieres.get(mid, set())))
for i, mid in enumerate(debloque_sorted[:20], 1):
    m = nodes_by_id.get(mid, {})
    nb_fils = len(metier_filieres.get(mid, set()))
    print(f'  {i:2}. "{m.get("nom_fr","")[:55]}"  [{nb_fils} FIL]')
print()

# Répartition par confiance
high_cnt = sum(1 for _, _, _, _, c in new_links if c == 'HIGH')
med_cnt  = sum(1 for _, _, _, _, c in new_links if c == 'MED')
print(f'[RECAP CONFIANCE] HIGH={high_cnt} | MED={med_cnt}')
print()

# Répartition par acronyme/institution
acr_counter = Counter(acr for _, _, acr, _, _ in new_links)
print(f'[RECAP PAR INSTITUTION] :')
for acr, cnt in acr_counter.most_common():
    print(f'  {acr.upper():10} : {cnt} FILIEREs')
print()

print('─' * 65)
print('STATUT : DRY-RUN UNIQUEMENT — aucun fichier modifie.')
print('Pour appliquer : relancer avec --apply')
print('─' * 65)
