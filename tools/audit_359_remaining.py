"""
Audit des FILIEREs restantes sans ETAB.
Sépare ce qui est encore fixable sans scraping de ce qui nécessite une collecte externe.
"""

import json, re, unicodedata, sys
from collections import defaultdict, Counter

sys.stdout.reconfigure(encoding='utf-8')

DATA = 'backend/src/main/resources/data'
with open(f'{DATA}/nodes_all.json', 'r', encoding='utf-8') as f:
    nodes = json.load(f)
with open(f'{DATA}/edges.json', 'r', encoding='utf-8') as f:
    edges = json.load(f)

nodes_by_id = {str(n['id']): n for n in nodes}

def norm(s):
    s = (s or '').lower().strip()
    s = unicodedata.normalize('NFD', s)
    s = ''.join(c for c in s if unicodedata.category(c) != 'Mn')
    s = re.sub(r"[''`]", '', s)
    s = re.sub(r'[^a-z0-9 ]', ' ', s)
    return re.sub(r'\s+', ' ', s).strip()

CITIES = [
    'rabat', 'casablanca', 'marrakech', 'fes', 'agadir', 'tanger',
    'meknes', 'oujda', 'kenitra', 'tetouan', 'beni mellal', 'mohammedia',
    'el jadida', 'khouribga', 'settat', 'berrechid', 'nador', 'khemisset',
    'safi', 'errachidia', 'al hoceima', 'laayoune', 'dakhla', 'ouarzazate',
    'ifrane', 'larache', 'taza', 'berkane', 'guelmim',
]

CITY_ALIAS = {
    'casa': 'casablanca', 'fez': 'fes', 'marrakesh': 'marrakech',
    'eljadida': 'el jadida', 'alhoceima': 'al hoceima', 'benimellal': 'beni mellal',
}
def ncity(s):
    c = norm(s or '')
    return CITY_ALIAS.get(c, c)

def sig_tokens(s, min_len=3):
    STOP = {'de', 'des', 'du', 'la', 'le', 'les', 'et', 'en', 'au', 'aux',
            'a', 'l', 'd', 'par', 'sur', 'pour', 'dans', 'avec', 'un', 'une',
            'al', 'el', 'ibn', 'ben', 'ou', 'sa', 'o'}
    return [w for w in norm(s).split() if len(w) >= min_len and w not in STOP]

# ── Indexes ───────────────────────────────────────────────────────────────────
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

fil_no_etab = [n for n in filieres if not filiere_etabs.get(str(n['id']))]

# ── Construire index de tous les ETABs (token -> ETABs) ─────────────────────
etab_index_tokens = []  # (etab, set(sig_tokens), ville_norm)
for etab in etabs:
    toks = set(sig_tokens(etab.get('nom_fr', '')))
    vv   = ncity(etab.get('ville', '') or '')
    if toks:
        etab_index_tokens.append((etab, toks, vv))

KNOWN_ACRONYMS = {
    'ensa', 'encg', 'fst', 'fmp', 'fmd', 'fsjes', 'iscae', 'inpt',
    'emsi', 'ehtp', 'emi', 'iav', 'iam', 'isga', 'hec', 'enset',
    'crmef', 'esith', 'uir', 'aui', 'enp', 'isaa', 'ista', 'est',
    'flsh', 'fs', 'fp', 'ensc', 'ens', 'iug', 'iga', 'igs', 'isg',
    'cfi', 'cfp', 'insea', 'hem', 'gem', 'aiac', 'esp', 'esi',
    'isit', 'inba', 'ern', 'era', 'ism', 'isf', 'iss',
    'fm6p', 'um6ss', 'um6p', 'uid', 'uic', 'usmba',
}

# ── Classifier chaque FILIERE restante ────────────────────────────────────────
# Catégories de résultat :
#   BRUIT_LYCEE      : BAC-lycée (pas d'ETAB universitaire attendu)
#   BRUIT_PRELMD     : DESA/DESS/DEUG/DEUST sans métier ni BAC
#   BRUIT_DOC_ISOLE  : Doctorat sans BAC ni METIER
#   AUTO_ETAB_REEL   : ETAB identifiable depuis le nom + ETAB déjà dans le graphe
#   AUTO_ETAB_CREER  : ETAB identifiable depuis le nom MAIS absent du graphe (à créer)
#   SCRAPING_REQUIS  : Nom d'ETAB inconnu ou absent

results = {
    'BRUIT_LYCEE': [],
    'BRUIT_PRELMD': [],
    'BRUIT_DOC_ISOLE': [],
    'AUTO_REEL': [],        # ETAB existant identifiable sans ambiguïté
    'AUTO_CREER': [],       # ETAB identifiable dans le nom mais absent du graphe
    'SCRAPING': [],         # ETAB inconnu / ambiguïté irrésoluble
}

SUSPECT_ETAB_NORMS = {
    norm("Etablissements d'enseignement superieur apres"),
    norm("Filiere des Metiers Comptables et Financiers"),
    norm("Filiere des Metiers de l'Industrie"),
    norm("Filiere des Metiers de la Logistique"),
    norm("Filiere des Metiers Technico-commerciaux"),
}

def is_bruit_lycee(n):
    nm = norm(n.get('nom_fr', ''))
    return any(x in nm for x in [
        '1ere bac', '2eme bac', 'premiere bac', 'deuxieme bac',
        'bac sciences math', 'bac lettres', 'bac arts appliq',
        'bac economie', 'bac sciences exp', 'bac technolog',
        'bac sciences agro', 'bac arts ', 'tronc commun',
    ])

def is_bruit_prelmd(n):
    nm = norm(n.get('nom_fr', ''))
    has_link = filiere_bacs.get(str(n['id'])) or filiere_metiers.get(str(n['id']))
    return any(x in nm for x in ['desa ', 'dess ', 'deug ']) and not has_link

def is_bruit_doc_isole(n):
    nm = norm(n.get('nom_fr', ''))
    fid = str(n['id'])
    has_bac = bool(filiere_bacs.get(fid))
    has_met = bool(filiere_metiers.get(fid))
    return 'doctorat' in nm and not has_bac and not has_met

def find_etab_in_graph(nom_fil, ville_fil):
    """
    Cherche l'ETAB dans le graphe par token overlap.
    Retourne (etab, 'reel'/'phantom') ou (None, None).
    HIGH confidence : ≥3 tokens sig partagés, ou ≥2 avec acronyme court.
    Exclut les ETABs suspects.
    """
    nf   = norm(nom_fil)
    vf   = ncity(ville_fil or '')
    candidates = []

    for etab, toks, ev in etab_index_tokens:
        if norm(etab.get('nom_fr', '')) in SUSPECT_ETAB_NORMS:
            continue
        overlap = toks & set(nf.split())
        short   = any(len(t) <= 4 and t in KNOWN_ACRONYMS for t in overlap)
        if len(overlap) >= 3 or (len(overlap) >= 2 and short):
            city_ok = (not vf or not ev or vf == ev or ev in nf)
            if city_ok:
                phantom = not etab_filiers.get(str(etab['id']))
                candidates.append((etab, len(overlap), phantom))

    if not candidates:
        return None, None
    if len(candidates) == 1:
        etab, _, phantom = candidates[0]
        return etab, 'phantom' if phantom else 'reel'
    # Plusieurs : garder le meilleur score si non ambigu
    candidates.sort(key=lambda x: -x[1])
    if candidates[0][1] > candidates[1][1]:
        etab, _, phantom = candidates[0]
        return etab, 'phantom' if phantom else 'reel'
    return None, None  # ambigu

def extract_etab_name_hint(nom_fil):
    """Extraire le fragment qui ressemble à un nom d'ETAB dans le nom de la FILIERE."""
    nm = norm(nom_fil)
    # Pattern typique : "... - NOM ETAB Ville" ou "NOM ETAB Ville - ..."
    # Chercher des fragments après " - " ou contenant un acronyme connu
    for acr in sorted(KNOWN_ACRONYMS, key=len, reverse=True):
        if acr in nm.split():
            idx = nm.split().index(acr)
            fragment = ' '.join(nm.split()[max(0, idx-1):idx+3])
            return fragment
    return None

for fil in fil_no_etab:
    fid  = str(fil['id'])
    nom  = fil.get('nom_fr', '')
    vcity = fil.get('ville', '') or ''
    nn   = norm(nom)
    has_bac = bool(filiere_bacs.get(fid))
    has_met = bool(filiere_metiers.get(fid))

    if is_bruit_lycee(fil):
        results['BRUIT_LYCEE'].append(fil)
        continue
    if is_bruit_prelmd(fil):
        results['BRUIT_PRELMD'].append(fil)
        continue
    if is_bruit_doc_isole(fil):
        results['BRUIT_DOC_ISOLE'].append(fil)
        continue

    etab, etab_type = find_etab_in_graph(nom, vcity)
    if etab is not None and (etab, etab_type) != (None, None):
        if (fid, str(etab['id'])) in existing_op:
            # Déjà lié — ne devrait pas arriver ici
            results['SCRAPING'].append(fil)
        elif etab_type == 'reel':
            results['AUTO_REEL'].append((fil, etab))
        else:
            results['AUTO_CREER'].append((fil, etab))
    else:
        # Vérifier si un nom d'ETAB externe est mentionné dans le nom
        hint = extract_etab_name_hint(nom)
        results['SCRAPING'].append((fil, hint))

# ── Rapport ────────────────────────────────────────────────────────────────────
print('=' * 66)
print('AUDIT : FILIEREs restantes sans ETAB (post Step 3)')
print('=' * 66)
print()

total = len(fil_no_etab)
nb_bruit    = len(results['BRUIT_LYCEE']) + len(results['BRUIT_PRELMD']) + len(results['BRUIT_DOC_ISOLE'])
nb_auto_r   = len(results['AUTO_REEL'])
nb_auto_c   = len(results['AUTO_CREER'])
nb_scraping = len(results['SCRAPING'])

print(f'Total FILIEREs sans ETAB : {total}')
print()
print(f'  BRUIT (pas d\'ETAB universitaire attendu) : {nb_bruit}')
print(f'    BAC lycée                              : {len(results["BRUIT_LYCEE"])}')
print(f'    PRE_LMD sans BAC ni METIER             : {len(results["BRUIT_PRELMD"])}')
print(f'    Doctorat isolé (sans BAC ni METIER)    : {len(results["BRUIT_DOC_ISOLE"])}')
print()
print(f'  FIXABLE SANS SCRAPING                    : {nb_auto_r + nb_auto_c}')
print(f'    -> ETAB réel existant identifiable     : {nb_auto_r}')
print(f'    -> ETAB fantôme identifiable           : {nb_auto_c}')
print()
print(f'  SCRAPING REQUIS                          : {nb_scraping}')
print()

# Détail AUTO_REEL
if results['AUTO_REEL']:
    print(f'── FIXABLE SANS SCRAPING : ETAB RÉEL ({nb_auto_r}) ──')
    print()
    # Grouper par ETAB
    by_etab = defaultdict(list)
    for fil, etab in results['AUTO_REEL']:
        by_etab[str(etab['id'])].append((fil, etab))
    for eid, entries in sorted(by_etab.items(), key=lambda x: -len(x[1])):
        etab = entries[0][1]
        nf   = len(etab_filiers.get(eid, set()))
        mets = set()
        for fil, _ in entries:
            fid = str(fil['id'])
            if filiere_bacs.get(fid) and filiere_metiers.get(fid):
                for mid in filiere_metiers.get(fid, set()):
                    fils_m = metier_filieres.get(mid, set())
                    if not any(filiere_etabs.get(f2) and filiere_bacs.get(f2) for f2 in fils_m):
                        mets.add(mid)
        has_bac_met = sum(1 for fil, _ in entries
                          if filiere_bacs.get(str(fil['id'])) and filiere_metiers.get(str(fil['id'])))
        print(f'  [{len(entries):2} FIL  +{len(mets)} MET]  '
              f'"{etab.get("nom_fr","")[:42]}" ({etab.get("ville","")})  [{nf} FIL act.]')
        for fil, _ in entries[:4]:
            fid = str(fil['id'])
            bac = bool(filiere_bacs.get(fid))
            met = bool(filiere_metiers.get(fid))
            print(f'      BAC={int(bac)} MET={int(met)}  "{fil.get("nom_fr","")[:52]}"')
        if len(entries) > 4:
            print(f'      ... et {len(entries)-4} autres')
    print()

# Détail AUTO_CREER (fantômes)
if results['AUTO_CREER']:
    print(f'── FIXABLE SANS SCRAPING : ETAB FANTÔME ({nb_auto_c}) ──')
    print()
    by_etab2 = defaultdict(list)
    for fil, etab in results['AUTO_CREER']:
        by_etab2[str(etab['id'])].append((fil, etab))
    for eid, entries in sorted(by_etab2.items(), key=lambda x: -len(x[1])):
        etab = entries[0][1]
        mets = set()
        for fil, _ in entries:
            fid = str(fil['id'])
            if filiere_bacs.get(fid) and filiere_metiers.get(fid):
                for mid in filiere_metiers.get(fid, set()):
                    fils_m = metier_filieres.get(mid, set())
                    if not any(filiere_etabs.get(f2) and filiere_bacs.get(f2) for f2 in fils_m):
                        mets.add(mid)
        print(f'  [{len(entries):2} FIL  +{len(mets)} MET]  '
              f'"{etab.get("nom_fr","")[:42]}" ({etab.get("ville","")})  [fantôme]')
        for fil, _ in entries[:3]:
            fid = str(fil['id'])
            bac = bool(filiere_bacs.get(fid))
            met = bool(filiere_metiers.get(fid))
            print(f'      BAC={int(bac)} MET={int(met)}  "{fil.get("nom_fr","")[:52]}"')
        if len(entries) > 3:
            print(f'      ... et {len(entries)-3} autres')
    print()

# Détail SCRAPING
print(f'── SCRAPING REQUIS ({nb_scraping}) ──')
print()
# Analyser les raisons du scraping
scraping_cats = Counter()
for item in results['SCRAPING']:
    fil = item[0] if isinstance(item, tuple) else item
    hint = item[1] if isinstance(item, tuple) else None
    nm = norm(fil.get('nom_fr', ''))
    fid = str(fil['id'])
    has_bac = bool(filiere_bacs.get(fid))
    has_met = bool(filiere_metiers.get(fid))
    if 'universite internationale' in nm or 'uid ' in nm or 'uir' in nm or 'mundiapolis' in nm:
        scraping_cats['Universités privées internationales'] += 1
    elif 'fm6p' in nm or 'um6ss' in nm or 'um6p' in nm:
        scraping_cats['Fondation Mohammed VI / UM6P'] += 1
    elif 'faculte des sciences' in nm and 'casablanca' in nm:
        scraping_cats['FS Casablanca (nœud manquant ou Ain Chock ambigu)'] += 1
    elif 'polyprep' in nm or 'poly prep' in nm:
        scraping_cats['PolyPrepa (privé inconnu)'] += 1
    elif 'ostelea' in nm:
        scraping_cats['Ostelea (inconnu)'] += 1
    elif 'vatel' in nm or 'hospitality' in nm:
        scraping_cats['Vatel / Hotellerie internationale'] += 1
    elif 'euromed' in nm and 'genie civil' in nm:
        scraping_cats['EuroMed Génie Civil (bon ETAB inconnu)'] += 1
    elif has_bac and has_met:
        scraping_cats['Autres (BAC+MET présents - haute valeur)'] += 1
    elif has_bac:
        scraping_cats['Autres (BAC seulement)'] += 1
    elif has_met:
        scraping_cats['Autres (MET seulement)'] += 1
    else:
        scraping_cats['Autres (aucun lien)'] += 1

for cat, cnt in scraping_cats.most_common():
    print(f'  {cnt:4}  {cat}')

# METIERs encore débloquables si scraping résolu
print()
scraping_mets = set()
for item in results['SCRAPING']:
    fil = item[0] if isinstance(item, tuple) else item
    fid = str(fil['id'])
    if filiere_bacs.get(fid) and filiere_metiers.get(fid):
        for mid in filiere_metiers.get(fid, set()):
            fils_m = metier_filieres.get(mid, set())
            if not any(filiere_etabs.get(f2) and filiere_bacs.get(f2) for f2 in fils_m):
                scraping_mets.add(mid)

auto_mets = set()
for fil, etab in results['AUTO_REEL'] + results['AUTO_CREER']:
    fid = str(fil['id'])
    if filiere_bacs.get(fid) and filiere_metiers.get(fid):
        for mid in filiere_metiers.get(fid, set()):
            fils_m = metier_filieres.get(mid, set())
            if not any(filiere_etabs.get(f2) and filiere_bacs.get(f2) for f2 in fils_m):
                auto_mets.add(mid)

print()
print('── BILAN METIERs ──')
print()
print(f'  METIERs débloquables sans scraping (via AUTO) : {len(auto_mets)}')
print(f'  METIERs débloquables avec scraping            : {len(scraping_mets)}')
print(f'  METIERs actuellement accessibles              : {sum(1 for n in metiers if any(filiere_etabs.get(fid) and filiere_bacs.get(fid) for fid in metier_filieres.get(str(n["id"]),set())))}')
print()
print('── RÉCAPITULATIF DÉCISIONNEL ──')
print()
print(f'  {nb_bruit:3} FILIEREs -> IGNORER  (bruit : lycée/PRÉ_LMD/doctorat isolé)')
print(f'  {nb_auto_r + nb_auto_c:3} FILIEREs -> FIXER    (ETAB identifiable dans le graphe, pas de scraping)')
print(f'  {nb_scraping:3} FILIEREs -> SCRAPER  (ETAB inconnu ou absent du graphe)')
print()
print(f'  Gain potentiel sans scraping : +{len(auto_mets)} METIERs')
print(f'  Gain potentiel avec scraping : +{len(scraping_mets)} METIERs supplémentaires')
