"""
Bilan final post-Phase C. Aucune modification de fichier.
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

filiere_etabs   = defaultdict(set)
filiere_metiers = defaultdict(set)
metier_filieres = defaultdict(set)
filiere_bacs    = defaultdict(set)
etab_filiers    = defaultdict(set)

for e in edges:
    s  = str(e.get('source_id', ''))
    t  = str(e.get('target_id', ''))
    lt = e.get('type_lien', '')
    if lt == 'OFFERTE_PAR':
        filiere_etabs[s].add(t)
        etab_filiers[t].add(s)
    elif lt == 'RECRUTEMENT':
        filiere_metiers[s].add(t)
        metier_filieres[t].add(s)
    elif lt == 'DONNE_ACCES':
        filiere_bacs[t].add(s)

filieres = [n for n in nodes if n.get('type') == 'FILIERE']
etabs    = [n for n in nodes if n.get('type') == 'ETABLISSEMENT']
metiers  = [n for n in nodes if n.get('type') == 'METIER']
niveaux  = [n for n in nodes if n.get('type') == 'NIVEAU']

edge_types = Counter(e.get('type_lien', 'INCONNU') for e in edges)

# FILIEREs sans ETAB
fil_no_etab = [n for n in filieres if not filiere_etabs.get(str(n['id']))]

# ETABs fantômes (0 FILIERE liée)
etabs_fantomes = [n for n in etabs if not etab_filiers.get(str(n['id']))]

# METIERs accessibles (BFS : FILIERE avec BAC + ETAB + METIER)
def is_accessible_metier(mid):
    return any(filiere_etabs.get(fid) and filiere_bacs.get(fid)
               for fid in metier_filieres.get(mid, set()))

metiers_acc    = [n for n in metiers if is_accessible_metier(str(n['id']))]
metiers_bloq   = [n for n in metiers if not is_accessible_metier(str(n['id']))]

# FILIEREs pleinement accessibles (BAC + ETAB + METIER)
def fil_bfs_ok(fid):
    return bool(filiere_bacs.get(fid)) and bool(filiere_etabs.get(fid)) and bool(filiere_metiers.get(fid))

filieres_full = [n for n in filieres if fil_bfs_ok(str(n['id']))]

# Classification des 344 FILIEREs restantes sans ETAB
def norm(s):
    s = (s or '').lower().strip()
    s = unicodedata.normalize('NFD', s)
    s = ''.join(c for c in s if unicodedata.category(c) != 'Mn')
    s = re.sub(r"[''`]", '', s)
    s = re.sub(r'[^a-z0-9 ]', ' ', s)
    return re.sub(r'\s+', ' ', s).strip()

cats_rem = Counter()
for n in fil_no_etab:
    nn  = norm(n.get('nom_fr', ''))
    fid = str(n['id'])
    has_bac = bool(filiere_bacs.get(fid))
    has_met = bool(filiere_metiers.get(fid))
    if any(x in nn for x in ['1ere bac','2eme bac','bac sciences math','bac lettres',
                               'bac arts','bac economie','bac sciences exp','tronc commun']):
        cats_rem['Bruit lycée (BAC)'] += 1
    elif 'doctorat' in nn and not has_bac and not has_met:
        cats_rem['Doctorat isolé (bruit)'] += 1
    elif any(x in nn for x in ['desa ','dess ','deug ']) and not has_bac and not has_met:
        cats_rem['PRE-LMD isolé (bruit)'] += 1
    elif has_bac and has_met:
        cats_rem['BAC+MET présents → ETAB inconnu (scraping)'] += 1
    elif has_bac:
        cats_rem['BAC seul → MET+ETAB inconnus (scraping)'] += 1
    elif has_met:
        cats_rem['MET seul → BAC+ETAB inconnus (scraping)'] += 1
    else:
        cats_rem['Aucun lien → scraping ou suppression'] += 1

bruit_total    = (cats_rem['Bruit lycée (BAC)'] + cats_rem['Doctorat isolé (bruit)']
                  + cats_rem['PRE-LMD isolé (bruit)'])
actionable_tot = len(fil_no_etab) - bruit_total

# ETABs fantômes — classification
etab_f_by_ville = Counter(n.get('ville', '?') for n in etabs_fantomes)

print('=' * 70)
print('BILAN FINAL — SGPO post-Phase B (Steps 1+2+3) + Phase C')
print('=' * 70)
print()
print('─── GRAPHE ────────────────────────────────────────────────────────────')
print(f'  Nœuds total         : {len(nodes):,}')
print(f'    ETABLISSEMENT     : {len(etabs):,}')
print(f'    FILIERE           : {len(filieres):,}')
print(f'    METIER            : {len(metiers):,}')
print(f'    NIVEAU            : {len(niveaux):,}')
print(f'  Arêtes total        : {len(edges):,}')
for et, cnt in edge_types.most_common():
    print(f'    {et:<28}: {cnt:,}')
print()
print('─── ACCESSIBILITÉ BFS ─────────────────────────────────────────────────')
print(f'  METIERs accessibles : {len(metiers_acc):,} / {len(metiers):,}')
print(f'  METIERs bloqués     : {len(metiers_bloq):,}')
print(f'  FILIEREs BFS-OK     : {len(filieres_full):,}  (BAC + ETAB + METIER)')
print(f'  FILIEREs sans ETAB  : {len(fil_no_etab):,}')
print()
print('─── ETABs FANTÔMES (0 FILIERE liée) ──────────────────────────────────')
print(f'  Total               : {len(etabs_fantomes):,}  / {len(etabs):,} ETABs')
print(f'  ETABs actifs        : {len(etabs) - len(etabs_fantomes):,}')
print(f'  Top villes fantômes : {etab_f_by_ville.most_common(5)}')
print()
print('─── CLASSIFICATION DES 344 FILIEREs SANS ETAB ─────────────────────────')
for cat, cnt in cats_rem.most_common():
    print(f'  {cnt:4}  {cat}')
print(f'  ────')
print(f'  {bruit_total:4}  TOTAL bruit (suppressible sans perte BFS)')
print(f'  {actionable_tot:4}  TOTAL nécessitent scraping externe')
print()
print('─── CE QUI RESTE À FAIRE POUR LIVRABLE ───────────────────────────────')
print()
print('  PRIORITÉ HAUTE (bloquant livraison)')
print()
print('  [P-01] ETABs fantômes (686 restants)')
print('         → Supprimer les ETABs fantômes sans aucune FILIERE associée.')
print('           Les 704 initiaux → 68 réactivés (Step2) = ~636 supprimables.')
print('           Recalculer le chiffre exact post-Phase C.')
print('           Impact : nettoyage du graphe, accélération BFS.')
print()
print('  [P-02] Filtre ville frontend désactivé (pathUtils.js)')
print('         → pathMatchesRequestedCity() retourne toujours true.')
print('           Réactiver avec logique souple (MINOR/MAJOR mismatch).')
print('           Impact : résultats affichés hors ville demandée.')
print()
print('  [P-03] DOMAIN_RULES isCoherentPath() (pathUtils.js)')
print('         → 848 lignes, règles codées en dur pour 14 métiers seulement.')
print('           655+ métiers sans validation. Remplacer par table générique.')
print('           Impact : parcours incohérents affichés sans filtre.')
print()
print('  PRIORITÉ MOYENNE (amélioration qualité)')
print()
print('  [P-04a] Scraping ciblé — 11 FILIEREs BAC+MET sans ETAB')
print('          → Trouver les ETABs manquants pour les 11 FILIEREs')
print('            "BAC+MET présents → ETAB inconnu".')
print('            Gain potentiel : +2 à +4 METIERs si ETABs trouvés.')
print()
print('  [P-05] Mode debug frontend (StudentPage.jsx)')
print('         → Ajouter panneau de debug pour visibilité sur les filtres.')
print()
print('  [P-06] Bruit : 42 FILIEREs suppressibles')
print('         → Doctorats/PRE-LMD/Lycée sans aucun lien : supprimables')
print('           pour alléger le graphe.')
print()
print('  HORS SCOPE (non traitable sans scraping massif)')
print()
print('  [OOS] 302 FILIEREs (MET seul / BAC seul / aucun lien)')
print('        → Données insuffisantes dans le graphe actuel.')
print('          Nécessitent collecte externe (Tawjihi, MES, sites étab).')
print()
print('─── RÉSUMÉ CHIFFRÉ ────────────────────────────────────────────────────')
print(f'  Arêtes OFFERTE_PAR ajoutées (Phase B+C) : +463')
print(f'    Step 1  : +68')
print(f'    Step 2  : +377')
print(f'    Step 3  : +3 (FLSH Rabat)')
print(f'    Phase C : +15')
print(f'  METIERs débloqués (Phase B+C)           : +147')
print(f'    Avant Phase B   : 180')
print(f'    Après Phase C   : 327')
print()
print('=' * 70)
