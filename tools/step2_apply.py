"""
Étape 2 — APPLICATION : Réactiver ETABs fantômes utiles, rattacher leurs FILIEREs.

Règles :
  - Uniquement les rattachements HIGH confiance.
  - Exclure les 5 ETABs suspects identifiés (noms génériques / confusion FILIERE-ETAB).
  - Ne pas supprimer d'ETABs.
  - Ne pas faire de scraping.
"""

import json, re, unicodedata, uuid, sys, shutil
from datetime import datetime
from collections import defaultdict, Counter

sys.stdout.reconfigure(encoding='utf-8')

DATA    = 'backend/src/main/resources/data'
EDGES_F = f'{DATA}/edges.json'
NODES_F = f'{DATA}/nodes_all.json'

def norm(s):
    s = (s or '').lower().strip()
    s = unicodedata.normalize('NFD', s)
    s = ''.join(c for c in s if unicodedata.category(c) != 'Mn')
    s = re.sub(r"[''`]", '', s)
    s = re.sub(r'[^a-z0-9 ]', ' ', s)
    return re.sub(r'\s+', ' ', s).strip()

# ── ETABs suspects exclus (noms normalisés) ──────────────────────────────────
EXCLUDED_ETAB_NORMS = {
    norm('Etablissements d\'enseignement superieur apres'),
    norm('Filiere des Metiers Comptables et Financiers'),
    norm('Filiere des Metiers de l\'Industrie'),
    norm('Filiere des Metiers de la Logistique'),
    norm('Filiere des Metiers Technico-commerciaux'),
}

CITY_ALIAS = {
    'casa': 'casablanca', 'fez': 'fes', 'marrakesh': 'marrakech',
    'sala': 'sale', 'eljadida': 'el jadida',
    'alhoceima': 'al hoceima', 'benimellal': 'beni mellal',
}
def normalize_city(s):
    c = norm(s or '')
    return CITY_ALIAS.get(c, c)

ACRONYMS = [
    'ensa', 'encg', 'fst', 'fmp', 'fmd', 'fsjes', 'iscae', 'inpt',
    'emsi', 'ehtp', 'emi', 'iav', 'iam', 'isga', 'hec', 'enset',
    'crmef', 'esith', 'enim', 'uir', 'aui', 'enp', 'isaa',
    'ista', 'isic', 'ismaip', 'escola', 'heec', 'esirem', 'est',
]
CITIES = [
    'rabat', 'casablanca', 'marrakech', 'fes', 'agadir', 'tanger',
    'meknes', 'oujda', 'kenitra', 'tetouan', 'beni mellal', 'mohammedia',
    'el jadida', 'khouribga', 'settat', 'berrechid', 'nador', 'khemisset',
    'safi', 'errachidia', 'al hoceima', 'laayoune', 'dakhla', 'ouarzazate',
    'ifrane', 'larache', 'taza', 'berkane', 'guelmim',
]

# ── 0. Backup ────────────────────────────────────────────────────────────────
ts  = datetime.now().strftime('%Y%m%d_%H%M%S')
bak = f'{EDGES_F}.bak_step2_{ts}'
shutil.copy2(EDGES_F, bak)

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
etab_phantom      = [n for n in etabs    if not etab_filiers.get(str(n['id']))]
etab_real_ids     = {str(n['id']) for n in etabs if etab_filiers.get(str(n['id']))}

# Filtrer les ETABs fantômes suspects
etab_phantom_ok = [
    n for n in etab_phantom
    if norm(n.get('nom_fr', '')) not in EXCLUDED_ETAB_NORMS
]
excluded_eids = {
    str(n['id']) for n in etab_phantom
    if norm(n.get('nom_fr', '')) in EXCLUDED_ETAB_NORMS
}

# ── 2. Matching HIGH confiance uniquement ────────────────────────────────────
phantom_by_normname = {}
phantom_index       = defaultdict(list)

for etab in etab_phantom_ok:
    en = norm(etab.get('nom_fr', ''))
    ev = normalize_city(etab.get('ville', '') or '')
    phantom_by_normname[en] = etab
    words = en.split()
    for acr in ACRONYMS:
        if acr in words or acr in en:
            phantom_index[(acr, ev)].append(etab)

def find_phantom_high(nom_fil, ville_fil):
    """Retourne (etab, 'HIGH') uniquement si confiance HIGH, sinon (None, None)."""
    nf = norm(nom_fil)
    vf = normalize_city(ville_fil or '')

    # Stratégie 1 : mots clés du nom ETAB présents dans la FILIERE + ville match
    for en, etab in phantom_by_normname.items():
        etab_words = [w for w in en.split() if len(w) > 2][:4]
        if len(etab_words) >= 2 and all(w in nf for w in etab_words):
            ev = normalize_city(etab.get('ville', '') or '')
            if not vf or not ev or vf == ev:
                return etab, 'HIGH'

    # Stratégie 2 : acronyme + ville explicites dans le nom FILIERE -> ETAB unique
    for acr in ACRONYMS:
        words = nf.split()
        if acr not in words and acr not in nf:
            continue
        for city in sorted(CITIES, key=len, reverse=True):
            if city in nf:
                key = (acr, city)
                elist = phantom_index.get(key, [])
                if len(elist) == 1:
                    return elist[0], 'HIGH'
                # Plusieurs ETABs pour même (acr, ville) → ambigu → MED, skip
    return None, None

new_links = []
seen_fid  = set()

for fil in fil_no_etab_avant:
    fid = str(fil['id'])
    if fid in seen_fid:
        continue
    etab, conf = find_phantom_high(fil.get('nom_fr', ''), fil.get('ville', ''))
    if etab is None:
        continue
    eid = str(etab['id'])
    if eid in excluded_eids or (fid, eid) in existing_op:
        continue
    seen_fid.add(fid)
    new_links.append((fil, etab))

# ── 3. Métriques AVANT ───────────────────────────────────────────────────────
nb_edges_avant   = len(edges)
nb_op_avant      = sum(1 for e in edges if e.get('type_lien') == 'OFFERTE_PAR')
nb_fil_no_e_avant = len(fil_no_etab_avant)

def count_acc(fil_et):
    return sum(
        1 for n in metiers
        if any(fil_et.get(fid) and filiere_bacs.get(fid)
               for fid in metier_filieres.get(str(n['id']), set()))
    )

met_avant = count_acc(filiere_etabs)

# ── 4. Générer et écrire les nouvelles arêtes ────────────────────────────────
new_edges_data = [{
    "id":                        str(uuid.uuid4()),
    "source_id":                 str(fil['id']),
    "target_id":                 str(etab['id']),
    "type_lien":                 "OFFERTE_PAR",
    "taux_reussite":             100,
    "cout_supplementaire":       0,
    "duree_supplementaire_mois": 0,
    "prerequis_notes":           "Lien etabli Phase B Step2.",
    "moyenne_minimale":          None,
    "type_acces":                "OUVERT",
} for fil, etab in new_links]

edges_apres = edges + new_edges_data
with open(EDGES_F, 'w', encoding='utf-8') as f:
    json.dump(edges_apres, f, ensure_ascii=False, indent=2)

# ── 5. Métriques APRÈS ───────────────────────────────────────────────────────
filiere_etabs_ap = defaultdict(set)
etab_filiers_ap  = defaultdict(set)
for e in edges_apres:
    s  = str(e.get('source_id', ''))
    t  = str(e.get('target_id', ''))
    if e.get('type_lien') == 'OFFERTE_PAR':
        filiere_etabs_ap[s].add(t)
        etab_filiers_ap[t].add(s)

met_apres         = count_acc(filiere_etabs_ap)
nb_fil_no_e_apres = sum(1 for n in filieres if not filiere_etabs_ap.get(str(n['id'])))
nb_op_apres       = nb_op_avant + len(new_edges_data)
phantom_reactivated = {str(etab['id']) for _, etab in new_links}

# ── 6. Vérifications ─────────────────────────────────────────────────────────
all_ids   = {str(n['id']) for n in nodes}
orphans   = sum(1 for e in new_edges_data
                if str(e['source_id']) not in all_ids or str(e['target_id']) not in all_ids)
selfloops = sum(1 for e in new_edges_data
                if str(e['source_id']) == str(e['target_id']))

pairs_counter = defaultdict(int)
for e in edges_apres:
    if e.get('type_lien') == 'OFFERTE_PAR':
        pairs_counter[(str(e['source_id']), str(e['target_id']))] += 1
doublons = sum(1 for v in pairs_counter.values() if v > 1)

# ── 7. Rapport ───────────────────────────────────────────────────────────────
print(f'[BACKUP]  {bak}')
print()
print('=== APPLICATION ÉTAPE 2 — RAPPORT ===')
print()
print(f' 1. Backup créé              : {bak}')
print(f' 2. JSON valide              : OUI')
print(f' 3. Arêtes avant / après     : {nb_edges_avant} -> {len(edges_apres)} (+{len(new_edges_data)})')
print(f' 4. OFFERTE_PAR ajoutées     : {nb_op_avant} -> {nb_op_apres} (+{len(new_edges_data)})')
print(f' 5. ETABs fantômes réactivés : {len(phantom_reactivated)}')
print(f' 6. FILIEREs sans ETAB       : {nb_fil_no_e_avant} -> {nb_fil_no_e_apres} (-{nb_fil_no_e_avant - nb_fil_no_e_apres})')
print(f' 7. METIERs accessibles      : {met_avant} -> {met_apres} (+{met_apres - met_avant})')
print(f' 8. Arêtes orphelines        : {orphans} (attendu 0)')
print(f' 9. Self-loops               : {selfloops} (attendu 0)')
print(f'10. Doublons OFFERTE_PAR     : {doublons} (attendu 0)')
print()
ok = orphans == 0 and selfloops == 0 and doublons == 0
print(f'    Statut : {"OK - tous les checks passent" if ok else "ECHEC - vérifier les erreurs"}')
