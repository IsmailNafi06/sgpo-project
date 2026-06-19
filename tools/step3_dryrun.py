"""
Étape 3 — DRY-RUN : Rattacher les 24 FILIEREs "presque prêtes" (BAC+METIER, ETAB manquant).

Stratégie de matching HIGH confiance :
  Pour chaque FILIERE "presque prête", tenter de trouver l'ETAB correspondant
  par deux méthodes cumulables :
    M1 - Tokens du nom ETAB présents dans le nom FILIERE (≥2 mots significatifs,
         ville cohérente si disponible)
    M2 - Correspondance explicite institution+ville dans le nom FILIERE (acronyme élargi)

CFI Rabat traité en priorité absolue (matching direct sur acronyme "cfi").
Aucune modification de fichier en dry-run.
"""

import json, re, unicodedata, uuid, sys
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

CITY_ALIAS = {
    'casa': 'casablanca', 'fez': 'fes', 'marrakesh': 'marrakech',
    'sala': 'sale', 'eljadida': 'el jadida',
    'alhoceima': 'al hoceima', 'benimellal': 'beni mellal',
}
def ncity(s):
    c = norm(s or '')
    return CITY_ALIAS.get(c, c)

CITIES = [
    'rabat', 'casablanca', 'marrakech', 'fes', 'agadir', 'tanger',
    'meknes', 'oujda', 'kenitra', 'tetouan', 'beni mellal', 'mohammedia',
    'el jadida', 'khouribga', 'settat', 'berrechid', 'nador', 'khemisset',
    'safi', 'errachidia', 'al hoceima', 'laayoune', 'dakhla', 'ouarzazate',
    'ifrane', 'larache', 'taza', 'berkane', 'guelmim',
]

# ── Index des arêtes ──────────────────────────────────────────────────────────
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

# ── FILIEREs "presque prêtes" : BAC + METIER présents, ETAB seul manquant ────
presque = [n for n in fil_no_etab
           if filiere_bacs.get(str(n['id'])) and filiere_metiers.get(str(n['id']))]

# ── Construction d'index ETAB : TOUS les ETABs (réels + fantômes) ─────────────
# On cherche parmi tous car certains fantômes n'ont pas encore de FILIEREs
# et certains réels pourraient avoir des FILIEREs supplémentaires valides.

# Stopwords à ignorer dans les tokens de noms d'ETAB
STOPWORDS = {'de', 'des', 'du', 'la', 'le', 'les', 'et', 'en', 'au', 'aux',
             'a', 'l', 'd', 'par', 'sur', 'pour', 'dans', 'avec', 'un', 'une',
             'al', 'el', 'ibn', 'ben', 'ou', 'sa', 'o'}

def sig_tokens(s, min_len=3):
    """Tokens significatifs (>= min_len chars, hors stopwords)."""
    return [w for w in norm(s).split() if len(w) >= min_len and w not in STOPWORDS]

# Index ETABs par sig_tokens (pour M1 : nom ETAB dans nom FILIERE)
etab_token_index = []   # [(etab, set(sig_tokens), ville_norm)]
for etab in etabs:
    toks = set(sig_tokens(etab.get('nom_fr', '')))
    vv   = ncity(etab.get('ville', '') or '')
    if len(toks) >= 2:
        etab_token_index.append((etab, toks, vv))

# Acronymes étendus pour M2 (inclut cfi et autres non couverts aux steps 1-2)
ACRONYMS_EXT = [
    'ensa', 'encg', 'fst', 'fmp', 'fmd', 'fsjes', 'iscae', 'inpt',
    'emsi', 'ehtp', 'emi', 'iav', 'iam', 'isga', 'hec', 'enset',
    'crmef', 'esith', 'enim', 'uir', 'aui', 'enp', 'isaa',
    'ista', 'isic', 'escola', 'heec', 'esirem', 'est',
    # Ajouts Step 3 (manquants aux steps précédents)
    'cfi', 'cfp', 'igs', 'esg', 'iga', 'isg', 'isf', 'iss', 'ism',
    'isit', 'iscae', 'inba', 'ern', 'era', 'esp', 'esi', 'ese',
    'hem', 'gem', 'aiac', 'insea', 'sup', 'supinfo',
    'fs ', 'flsh', 'fp ', 'ensc', 'ismaip',
]

# Index M2 : (acr, ville) -> ETABs
acr_city_index = defaultdict(list)
for etab in etabs:
    en = norm(etab.get('nom_fr', ''))
    ev = ncity(etab.get('ville', '') or '')
    words = en.split()
    for acr in ACRONYMS_EXT:
        acr_s = acr.strip()
        if acr_s in words or acr_s in en:
            acr_city_index[(acr_s, ev)].append(etab)

# ── Fonction de matching HIGH confiance ──────────────────────────────────────
def find_etab_high(nom_fil, ville_fil):
    """
    Retourne (etab, methode, description) ou (None, None, None).
    Priorité : M1 (tokens) > M2 (acr+ville).
    HIGH uniquement : pas de match ambigu, ville toujours vérifiée si connue.
    """
    nf = norm(nom_fil)
    vf = ncity(ville_fil or '')
    fil_words = set(nf.split())

    # ── M1 : tokens du nom ETAB dans le nom FILIERE ──────────────────────────
    # Condition HIGH : au moins 3 tokens sig de l'ETAB sont dans le nom FILIERE,
    # ou 2 tokens si l'un d'eux est discriminant (acronyme court type 'cfi', 'hem').
    candidates_m1 = []
    for etab, toks, ev in etab_token_index:
        overlap = toks & set(nf.split())
        # Exiger ≥3 tokens OU ≥2 si l'un est un acronyme court (<5 chars)
        short_acr = any(len(t) <= 4 for t in overlap)
        if len(overlap) >= 3 or (len(overlap) >= 2 and short_acr):
            # Vérifier cohérence ville
            if not vf or not ev or vf == ev:
                candidates_m1.append((etab, len(overlap), ev))
            elif any(city in nf for city in [ev] if ev):
                # La ville de l'ETAB est mentionnée dans le nom FILIERE
                candidates_m1.append((etab, len(overlap), ev))

    if len(candidates_m1) == 1:
        etab, _, _ = candidates_m1[0]
        return etab, 'M1-tokens', f'{len(candidates_m1[0][0].get("nom_fr",""))}'
    elif len(candidates_m1) > 1:
        # Garder le meilleur overlap uniquement si non ambigu
        candidates_m1.sort(key=lambda x: -x[1])
        if candidates_m1[0][1] > candidates_m1[1][1]:
            return candidates_m1[0][0], 'M1-tokens-best', ''

    # ── M2 : acronyme + ville dans nom FILIERE ────────────────────────────────
    for acr in ACRONYMS_EXT:
        acr_s = acr.strip()
        if acr_s not in fil_words and acr_s not in nf:
            continue
        for city in sorted(CITIES, key=len, reverse=True):
            if city in nf:
                key = (acr_s, city)
                elist = acr_city_index.get(key, [])
                if len(elist) == 1:
                    return elist[0], 'M2-acr+city', f'{acr_s}+{city}'
                # Ambigu → skip (pas HIGH)

    return None, None, None

# ── Matching des 24 "presque prêtes" ─────────────────────────────────────────
matches   = []   # (fil, etab, methode, desc)
no_match  = []   # fil

for fil in presque:
    fid  = str(fil['id'])
    nom  = fil.get('nom_fr', '')
    vcity = fil.get('ville', '') or ''

    etab, meth, desc = find_etab_high(nom, vcity)
    if etab is None:
        no_match.append(fil)
        continue
    eid = str(etab['id'])
    if (fid, eid) in existing_op:
        no_match.append(fil)
        continue
    matches.append((fil, etab, meth, desc))

# ── Générer les arêtes (pas d'écriture) ──────────────────────────────────────
new_edges = [{
    "id":                        str(uuid.uuid4()),
    "source_id":                 str(fil['id']),
    "target_id":                 str(etab['id']),
    "type_lien":                 "OFFERTE_PAR",
    "taux_reussite":             100,
    "cout_supplementaire":       0,
    "duree_supplementaire_mois": 0,
    "prerequis_notes":           "Lien etabli Phase B Step3.",
    "moyenne_minimale":          None,
    "type_acces":                "OUVERT",
} for fil, etab, _, _ in matches]

# ── Gain BFS ─────────────────────────────────────────────────────────────────
sim_fil_et = defaultdict(set)
for fid, eids in filiere_etabs.items():
    sim_fil_et[fid].update(eids)
for fil, etab, _, _ in matches:
    sim_fil_et[str(fil['id'])].add(str(etab['id']))

def acc(fil_et):
    return {str(n['id']) for n in metiers
            if any(fil_et.get(fid) and filiere_bacs.get(fid)
                   for fid in metier_filieres.get(str(n['id']), set()))}

avant_set = acc(filiere_etabs)
apres_set = acc(sim_fil_et)
debloques = apres_set - avant_set

# ── Vérifications intégrité ───────────────────────────────────────────────────
all_ids   = {str(n['id']) for n in nodes}
orphans   = sum(1 for e in new_edges
                if str(e['source_id']) not in all_ids or str(e['target_id']) not in all_ids)
selfloops = sum(1 for e in new_edges
                if str(e['source_id']) == str(e['target_id']))
pairs_new = [(str(e['source_id']), str(e['target_id'])) for e in new_edges]
doublons  = sum(1 for p in pairs_new if p in existing_op)
types_src = Counter(nodes_by_id.get(str(e['source_id']), {}).get('type', '?') for e in new_edges)
types_tgt = Counter(nodes_by_id.get(str(e['target_id']), {}).get('type', '?') for e in new_edges)

# ── Rapport DRY-RUN ───────────────────────────────────────────────────────────
print('=' * 66)
print('DRY-RUN — ÉTAPE 3 : Rattachement des FILIEREs "presque prêtes"')
print('=' * 66)
print()
print(f'[1] FILIEREs "presque prêtes" analysées  : {len(presque)}')
print(f'    Matchées HIGH confiance               : {len(matches)}')
print(f'    Sans match (ETAB inconnu)             : {len(no_match)}')
print()
print(f'[2] Nouvelles arêtes OFFERTE_PAR          : {len(new_edges)}')
print()

print('[3] LISTE COMPLÈTE DES RATTACHEMENTS :')
print()
# Trier : CFI Rabat en premier, puis par nb METIERs débloqués
def metiers_debloqued_by_fil(fil):
    fid = str(fil['id'])
    count = 0
    for mid in filiere_metiers.get(fid, set()):
        if mid in debloques:
            count += 1
    return count

matches_sorted = sorted(matches, key=lambda x: (
    0 if 'cfi' in norm(x[1].get('nom_fr','')) else 1,
    -metiers_debloqued_by_fil(x[0])
))

for i, (fil, etab, meth, desc) in enumerate(matches_sorted, 1):
    nb_met = metiers_debloqued_by_fil(fil)
    phantom_tag = '' if etab_filiers.get(str(etab['id'])) else ' [fantôme]'
    print(f'  {i:2}. [{meth}]  +{nb_met} MET')
    print(f'      FIL  : "{fil.get("nom_fr","")[:55]}"')
    print(f'      ETAB : "{etab.get("nom_fr","")[:55]}" ({etab.get("ville","")}){phantom_tag}')
print()

print('[4] GAIN BFS :')
print(f'    METIERs accessibles avant : {len(avant_set)}')
print(f'    METIERs accessibles après : {len(apres_set)}')
print(f'    Gain                      : +{len(debloques)} METIERs débloqués')
print()
if debloques:
    print('    METIERs débloqués :')
    for mid in sorted(debloques, key=lambda m: -len(metier_filieres.get(m, set()))):
        m = nodes_by_id.get(mid, {})
        print(f'      "{m.get("nom_fr","")[:55]}"')
print()

# Detail CFI Rabat
cfi_fils = [(fil, etab) for fil, etab, _, _ in matches_sorted
            if 'cfi' in norm(etab.get('nom_fr', ''))]
print('[5] DÉTAIL CFI RABAT :')
if cfi_fils:
    cfi_etab = cfi_fils[0][1]
    print(f'    ETAB  : "{cfi_etab.get("nom_fr","")}" ({cfi_etab.get("ville","")})')
    print(f'    Statut : {"réel (a déjà des FILIEREs)" if etab_filiers.get(str(cfi_etab["id"])) else "fantôme (0 FIL actuellement)"}')
    print(f'    FILIEREs rattachées :')
    for fil, _ in cfi_fils:
        fid = str(fil['id'])
        nb = metiers_debloqued_by_fil(fil)
        nb_bac = len(filiere_bacs.get(fid, set()))
        nb_met_rec = len(filiere_metiers.get(fid, set()))
        print(f'      +{nb} MET  BAC={nb_bac} REC={nb_met_rec}  "{fil.get("nom_fr","")[:55]}"')
    cfi_mets = set()
    for fil, _ in cfi_fils:
        for mid in filiere_metiers.get(str(fil['id']), set()):
            if mid in debloques:
                cfi_mets.add(mid)
    print(f'    METIERs débloqués par CFI Rabat : {len(cfi_mets)}')
    for mid in cfi_mets:
        m = nodes_by_id.get(mid, {})
        print(f'      "{m.get("nom_fr","")[:55]}"')
else:
    print('    Aucune FILIERE "presque prête" matchée vers CFI Rabat.')
    print('    (CFI Rabat peut ne pas figurer parmi les 24 "presque prêtes")')
    # Rechercher CFI Rabat dans le graphe
    cfi_nodes = [n for n in etabs if 'cfi' in norm(n.get('nom_fr', ''))]
    print(f'    ETABs "cfi" dans le graphe : {len(cfi_nodes)}')
    for n in cfi_nodes:
        nf = len(etab_filiers.get(str(n['id']), set()))
        print(f'      [{nf} FIL]  "{n.get("nom_fr","")}" ({n.get("ville","")})')
    # FILIEREs orphelines mentionnant CFI
    cfi_orphans = [n for n in fil_no_etab if 'cfi' in norm(n.get('nom_fr', ''))]
    print(f'    FILIEREs orphelines mentionnant CFI : {len(cfi_orphans)}')
    for n in cfi_orphans:
        fid = str(n['id'])
        print(f'      BAC={bool(filiere_bacs.get(fid))} MET={bool(filiere_metiers.get(fid))}  '
              f'"{n.get("nom_fr","")[:55]}"')
print()

print('[6] VÉRIFICATION INTÉGRITÉ :')
print(f'    Arêtes orphelines   : {orphans}  (attendu 0)')
print(f'    Self-loops          : {selfloops}  (attendu 0)')
print(f'    Doublons            : {doublons}  (attendu 0)')
print(f'    Types source        : {dict(types_src)}  (attendu FILIERE)')
print(f'    Types cible         : {dict(types_tgt)}  (attendu ETABLISSEMENT)')
ok = orphans == 0 and selfloops == 0 and doublons == 0
print(f'    -> {"OK" if ok else "ECHEC"}')
print()

print('[7] FILIERES RESTANTES APRÈS APPLICATION :')
print(f'    Sans ETAB avant Step 3 : {len(fil_no_etab)}')
print(f'    Rattachées par Step 3  : {len(matches)}')
print(f'    Restantes après        : {len(fil_no_etab) - len(matches)}')
print()
if no_match:
    print('    FILIEREs "presque prêtes" sans match (ETAB introuvable) :')
    for fil in no_match:
        fid = str(fil['id'])
        nb_bac = len(filiere_bacs.get(fid, set()))
        nb_rec = len(filiere_metiers.get(fid, set()))
        print(f'      BAC={nb_bac} REC={nb_rec}  "{fil.get("nom_fr","")[:60]}"')
print()
print('─' * 66)
print('STATUT : DRY-RUN — aucun fichier modifié.')
print('─' * 66)
