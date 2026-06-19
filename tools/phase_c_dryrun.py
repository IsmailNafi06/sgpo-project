"""
Phase C — DRY-RUN ciblé haute valeur.
Rattache uniquement les FILIEREs dont l'ETAB est identifié avec certitude dans le graphe.
Aucune création de nouveau noeud ETAB (seules des arêtes OFFERTE_PAR sont ajoutées).
Aucune modification de fichier.
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

fil_no_etab = {str(n['id']): n for n in filieres if not filiere_etabs.get(str(n['id']))}

# ── Résolution manuelle des ETABs cibles ─────────────────────────────────────
# (confirmés par recherche dans le graphe + connaissance institutionnelle)

# ETAB IDs confirmés :
ETAB_FS_CASA      = 'b8219b76-6458-309e-2e04-2227a7d269b9'  # Faculte des Sciences Casablanca
ETAB_EUROMED_POLY = 'e523a696-01a6-40ee-4cdd-84cf86d70230'  # Euromed Polytechnic School (Genie Civil)
ETAB_OSTELEA_RBT  = 'a9cf5b5d-9728-0c6c-1b10-924640269ee8'  # OSTELEA Rabat
ETAB_MUNDIALIS_BS = 'a0418b58-805c-a9c1-5fdd-a6b1832e473c'  # Business School Univ Mundiapolis

# Vérifier présence dans le graphe
for eid, label in [
    (ETAB_FS_CASA,      'Faculte des Sciences Casablanca'),
    (ETAB_EUROMED_POLY, 'Euromed Polytechnic School'),
    (ETAB_OSTELEA_RBT,  'OSTELEA Rabat'),
    (ETAB_MUNDIALIS_BS, 'Business School Univ Mundiapolis'),
]:
    assert eid in nodes_by_id, f'ETAB introuvable : {label} ({eid})'

# ── Table des rattachements Phase C ──────────────────────────────────────────
# Format : (pattern_norm_filiere, etab_id, raison)
# pattern = tous ces mots normalisés doivent être dans le nom normalisé de la FILIERE

LINKS_PHASE_C = [
    # ── FS Casablanca : 8 FILIEREs ────────────────────────────────────────────
    # Note: "Faculte des Sciences Casablanca" (b8219b76) est le noeud générique correct.
    # La ville Casablanca est confirmée dans les noms. Bias vers FS Casablanca (pas Ain Chock)
    # car les programmes (Biologie, Info, Maths, SVT) correspondent à l'offre générale.
    (['licence', 'biologie', 'faculte', 'sciences', 'casablanca'],   ETAB_FS_CASA, 'FS-Casa'),
    (['licence', 'informatique', 'faculte', 'sciences', 'casablanca'], ETAB_FS_CASA, 'FS-Casa'),
    (['licence', 'mathematiques', 'faculte', 'sciences', 'casablanca'], ETAB_FS_CASA, 'FS-Casa'),
    (['licence', 'physique', 'chimie', 'faculte', 'sciences', 'casablanca'], ETAB_FS_CASA, 'FS-Casa'),
    (['licence', 'sciences', 'vie', 'terre', 'faculte', 'sciences', 'casablanca'], ETAB_FS_CASA, 'FS-Casa'),
    (['master', 'biologie', 'sante', 'faculte', 'sciences', 'casablanca'], ETAB_FS_CASA, 'FS-Casa'),
    (['master', 'data', 'science', 'faculte', 'sciences', 'casablanca'], ETAB_FS_CASA, 'FS-Casa'),

    # ── EuroMed Polytechnic School : 2 FILIEREs Génie Civil ───────────────────
    # "Euromed Polytechnic School -" est le seul ETAB EuroMed avec vocation ingénierie/polytechnic.
    # "BiomedTech Euromed" est exclu (discipline différente).
    (['cycle', 'ingenieur', 'euromed', 'genie', 'civil'],       ETAB_EUROMED_POLY, 'EuroMed-Poly'),
    (['cycle', 'preparatoire', 'euromed', 'genie', 'civil'],    ETAB_EUROMED_POLY, 'EuroMed-Poly'),

    # ── OSTELEA Rabat : 1 FILIERE ─────────────────────────────────────────────
    # "OSTELEA Rabat" (a9cf5b5d) existe dans le graphe avec 2 FILIEREs.
    # La FILIERE "OSTELEA Rabat - Presentation" (fid=537fcb7b) est orpheline.
    (['ostelea', 'rabat'],                                       ETAB_OSTELEA_RBT,  'Ostelea-Rabat'),

    # ── Mundiapolis Business School : 2 FILIEREs Management ──────────────────
    # "Business School Universite Mundiapolis" (a0418b58) gère les programmes Management.
    # Finance et Marketing correspondent à son périmètre officiel.
    (['licence', 'management', 'gestion', 'entreprises', 'finance', 'mundiapolis'],
     ETAB_MUNDIALIS_BS, 'Mundiapolis-BS'),
    (['licence', 'management', 'gestion', 'entreprises', 'marketing', 'mundiapolis'],
     ETAB_MUNDIALIS_BS, 'Mundiapolis-BS'),
]

# ── Exclusions explicites (non appliquées en Phase C) ─────────────────────────
EXCLUDED_PATTERNS = [
    # FM6P : toutes les FILIEREs FM6P ont BAC=0 -> gain BFS nul
    'fm6p', 'um6ss', 'um6p',
    # Filière des Métiers de la Logistique -> ETAB suspect exclu
    # ISIL -> ETAB inconnu
    # Vatel -> pas de noeud Vatel confirmé dans le graphe
    # "Master Data Science Casablanca" doublon (FINAL_FI...) -> géré par pattern ci-dessus si unique
]

# ── Matching des FILIEREs orphelines ─────────────────────────────────────────
proposals = []   # (fil, etab, raison)

for kws, etab_id, raison in LINKS_PHASE_C:
    etab = nodes_by_id[etab_id]
    for fid, fil in fil_no_etab.items():
        nn = norm(fil.get('nom_fr', ''))
        # Tous les mots-clés doivent être présents dans le nom normalisé
        if all(kw in nn for kw in kws):
            if (fid, etab_id) not in existing_op:
                # Vérifier que ce n'est pas une exclusion
                is_excl = any(ex in nn for ex in EXCLUDED_PATTERNS)
                if not is_excl:
                    # Éviter doublons dans proposals
                    if not any(str(p[0]['id']) == fid and str(p[1]['id']) == etab_id
                               for p in proposals):
                        proposals.append((fil, etab, raison))

# ── Générer les arêtes (dry-run) ──────────────────────────────────────────────
new_edges = [{
    "id":                        str(uuid.uuid4()),
    "source_id":                 str(fil['id']),
    "target_id":                 str(etab['id']),
    "type_lien":                 "OFFERTE_PAR",
    "taux_reussite":             100,
    "cout_supplementaire":       0,
    "duree_supplementaire_mois": 0,
    "prerequis_notes":           "Lien etabli Phase C.",
    "moyenne_minimale":          None,
    "type_acces":                "OUVERT",
} for fil, etab, _ in proposals]

# ── Gain BFS ──────────────────────────────────────────────────────────────────
sim_fil_et = defaultdict(set, {k: set(v) for k, v in filiere_etabs.items()})
for fil, etab, _ in proposals:
    sim_fil_et[str(fil['id'])].add(str(etab['id']))

def metier_blocked_now(mid):
    return not any(filiere_etabs.get(fid) and filiere_bacs.get(fid)
                   for fid in metier_filieres.get(mid, set()))

def metier_accessible_after(mid):
    return any(sim_fil_et.get(fid) and filiere_bacs.get(fid)
               for fid in metier_filieres.get(mid, set()))

debloques = {str(n['id']) for n in metiers
             if metier_blocked_now(str(n['id'])) and metier_accessible_after(str(n['id']))}

# Gain par groupe
gain_by_raison = defaultdict(set)
for fil, etab, raison in proposals:
    fid = str(fil['id'])
    for mid in filiere_metiers.get(fid, set()):
        if mid in debloques:
            gain_by_raison[raison].add(mid)

# ── Vérifications ─────────────────────────────────────────────────────────────
all_ids   = {str(n['id']) for n in nodes}
orphans   = sum(1 for e in new_edges
                if str(e['source_id']) not in all_ids or str(e['target_id']) not in all_ids)
selfloops = sum(1 for e in new_edges
                if str(e['source_id']) == str(e['target_id']))
doublons  = sum(1 for e in new_edges
                if (str(e['source_id']), str(e['target_id'])) in existing_op)
types_src = Counter(nodes_by_id.get(str(e['source_id']), {}).get('type', '?') for e in new_edges)
types_tgt = Counter(nodes_by_id.get(str(e['target_id']), {}).get('type', '?') for e in new_edges)

# FILIEREs sans ETAB après
sim_fil_etabs_set = defaultdict(set)
for fid, eids in filiere_etabs.items():
    sim_fil_etabs_set[fid].update(eids)
for e in new_edges:
    sim_fil_etabs_set[str(e['source_id'])].add(str(e['target_id']))
nb_fil_no_etab_avant = sum(1 for n in filieres if not filiere_etabs.get(str(n['id'])))
nb_fil_no_etab_apres = sum(1 for n in filieres if not sim_fil_etabs_set.get(str(n['id'])))

met_avant = sum(1 for n in metiers if not metier_blocked_now(str(n['id'])))

# ── RAPPORT ───────────────────────────────────────────────────────────────────
print('=' * 68)
print('DRY-RUN PHASE C — Rattachements ciblés haute valeur')
print('=' * 68)
print()

# Ce qui est exclu et pourquoi
print('EXCLUSIONS (non applicables en Phase C sans scraping) :')
print('  FM6P / UM6SS    : toutes les FILIEREs ont BAC=0 -> gain BFS nul')
print('  Vatel           : aucun noeud "Vatel" confirmé dans le graphe')
print('  Filière Logistique : ETAB homonyme est un suspect exclu (Step 2)')
print('  ISIL            : ETAB inconnu, pas dans le graphe')
print()

print(f'FILIÈRES RATTACHÉES : {len(proposals)}')
print(f'ARÊTES OFFERTE_PAR à ajouter : {len(new_edges)}')
print()

print('─── LISTE COMPLÈTE DES RATTACHEMENTS ───')
print()
by_group = defaultdict(list)
for fil, etab, raison in proposals:
    by_group[raison].append((fil, etab))

for raison, entries in by_group.items():
    etab0 = entries[0][1]
    nf_act = len(etab_filiers.get(str(etab0['id']), set()))
    gain_m = gain_by_raison.get(raison, set())
    print(f'  [{raison}]  ETAB: "{etab0.get("nom_fr","")[:45]}" ({etab0.get("ville","")})')
    print(f'  {len(entries)} FILIEREs  |  {nf_act} FIL actuelles  |  +{len(gain_m)} METIERs débloqués')
    for fil, _ in entries:
        fid = str(fil['id'])
        has_bac = bool(filiere_bacs.get(fid))
        has_met = bool(filiere_metiers.get(fid))
        nb_bac  = len(filiere_bacs.get(fid, set()))
        nb_rec  = len(filiere_metiers.get(fid, set()))
        gain_f  = [nodes_by_id.get(mid,{}).get('nom_fr','')[:30]
                   for mid in filiere_metiers.get(fid,set()) if mid in debloques]
        print(f'    BAC={nb_bac} REC={nb_rec}  "{fil.get("nom_fr","")[:55]}"')
        if gain_f:
            print(f'      -> débloque : {gain_f}')
    if gain_m:
        print(f'  METIERs débloqués : {[nodes_by_id.get(m,{}).get("nom_fr","")[:35] for m in gain_m]}')
    print()

print('─── GAIN BFS GLOBAL ───')
print()
print(f'  METIERs accessibles avant  : {met_avant}')
print(f'  METIERs accessibles après  : {met_avant + len(debloques)}  (+{len(debloques)})')
print()
print(f'  METIERs débloqués :')
for mid in sorted(debloques, key=lambda m: -len(metier_filieres.get(m, set()))):
    m = nodes_by_id.get(mid, {})
    print(f'    "{m.get("nom_fr","")[:55]}"')
print()

print('─── VÉRIFICATIONS INTÉGRITÉ ───')
print()
print(f'  Arêtes orphelines    : {orphans}   (attendu 0)')
print(f'  Self-loops           : {selfloops}   (attendu 0)')
print(f'  Doublons             : {doublons}   (attendu 0)')
print(f'  Types source         : {dict(types_src)}')
print(f'  Types cible          : {dict(types_tgt)}')
ok = orphans == 0 and selfloops == 0 and doublons == 0
print(f'  -> {"OK" if ok else "ECHEC"}')
print()

print('─── FILIEREs SANS ETAB ───')
print()
print(f'  Avant Phase C : {nb_fil_no_etab_avant}')
print(f'  Après Phase C : {nb_fil_no_etab_apres}  (-{nb_fil_no_etab_avant - nb_fil_no_etab_apres})')
print()

print('─── CE QUI RESTE APRÈS PHASE C (sans scraping) ───')
print()
# Catégoriser ce qui reste
remaining = [n for n in filieres if not sim_fil_etabs_set.get(str(n['id']))]
cats_rem = Counter()
for n in remaining:
    nn = norm(n.get('nom_fr',''))
    fid = str(n['id'])
    has_bac = bool(filiere_bacs.get(fid))
    has_met = bool(filiere_metiers.get(fid))
    if any(x in nn for x in ['1ere bac','2eme bac','bac sciences math','bac lettres',
                               'bac arts','bac economie','bac sciences exp','tronc commun']):
        cats_rem['BAC lycée (bruit)'] += 1
    elif any(x in nn for x in ['desa ', 'dess ']) and not has_bac and not has_met:
        cats_rem['PRE_LMD isolé (bruit)'] += 1
    elif 'doctorat' in nn and not has_bac and not has_met:
        cats_rem['Doctorat isolé (bruit)'] += 1
    elif has_bac and has_met:
        cats_rem['BAC+MET présents (scraping requis - ETAB inconnu)'] += 1
    elif has_bac:
        cats_rem['BAC seulement (scraping requis pour MET+ETAB)'] += 1
    elif has_met:
        cats_rem['MET seulement (scraping requis pour BAC+ETAB)'] += 1
    else:
        cats_rem['Aucun lien (scraping requis ou bruit)'] += 1

for cat, cnt in cats_rem.most_common():
    print(f'  {cnt:4}  {cat}')
print()

print('─' * 68)
print('STATUT : DRY-RUN — aucun fichier modifié.')
print('─' * 68)
