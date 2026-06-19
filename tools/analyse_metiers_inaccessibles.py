"""
Analyse complète des 342 METIERs inaccessibles.
Catégorie / Importance / Effort pour chaque METIER.
Aucune modification de fichier.
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

def tokens(s):
    return set(w for w in norm(s).split() if len(w) > 2)

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
metiers  = [n for n in nodes if n.get('type') == 'METIER']

def is_acc(fid):
    return bool(filiere_bacs.get(fid)) and bool(filiere_etabs.get(fid))

def metier_accessible(mid):
    return any(is_acc(fid) for fid in metier_filieres.get(mid, set()))

accessibles  = [n for n in metiers if     metier_accessible(str(n['id']))]
inaccessibles= [n for n in metiers if not metier_accessible(str(n['id']))]

acc_tokens = {str(n['id']): tokens(n.get('nom_fr','')) for n in accessibles}

# ── Doublon : chevauchement fort avec un METIER accessible ────────────────────
def is_doublon(mid, name):
    toks = tokens(name)
    if len(toks) < 2:
        return False, None
    best_score = 0
    best_match = None
    for aid, atoks in acc_tokens.items():
        shared = len(toks & atoks)
        union  = len(toks | atoks)
        if union == 0:
            continue
        jaccard = shared / union
        # Jaccard >= 0.6 ET au moins 2 mots significatifs partagés
        if jaccard >= 0.6 and shared >= 2 and jaccard > best_score:
            best_score = jaccard
            best_match = nodes_by_id.get(aid, {}).get('nom_fr', '')
    return best_score >= 0.6, best_match

# ── Importance : mots-clés professions recherchées ───────────────────────────
HIGH_KW = [
    'enseignant','professeur','formateur','educateur',
    'technicien','operateur','agent','responsable',
    'ingenieur','directeur','chef','manager','gestionnaire',
    'comptable','auditeur','commercial','juriste','avocat',
    'infirmier','medecin','pharmacien','kinesitherapeute',
    'developpeur','informaticien','data','analyste',
    'architecte','urbaniste','geometre','topographe',
    'electricien','mecanicien','plombier','charpentier',
    'traducteur','journaliste','animateur','guide',
    'assistant','charge','conseiller','consultant',
]
LOW_KW = [
    'stagiaire','apprenti','auxiliaire','aide ',
    'adjoint niveau','agent niveau','executant',
    'operateur de saisie',
]

def importance(mid, name, nb_fils):
    nn = norm(name)
    if any(kw in nn for kw in LOW_KW):
        return 'Faible'
    hi = sum(1 for kw in HIGH_KW if kw in nn)
    if nb_fils >= 5 or hi >= 2:
        return 'Haute'
    if nb_fils >= 2 or hi >= 1:
        return 'Moyenne'
    return 'Faible'

# ── Catégorisation de chaque METIER inaccessible ──────────────────────────────
results = []
effort_counts   = Counter()
category_counts = Counter()
importance_counts = Counter()

for m in inaccessibles:
    mid  = str(m['id'])
    name = m.get('nom_fr', '')
    fils = list(metier_filieres.get(mid, set()))
    nb_fils = len(fils)

    # Doublon ?
    is_dup, dup_match = is_doublon(mid, name)
    if is_dup:
        cat    = 'DOUBLON'
        effort = 'Ignorer'
        imp    = 'Faible'
        note   = f'≈ "{dup_match[:45]}"'
        results.append((m, cat, imp, effort, nb_fils, note))
        effort_counts[effort] += 1
        category_counts[cat]  += 1
        importance_counts[imp]+= 1
        continue

    if nb_fils == 0:
        cat    = 'FANTOME (0 RECRUTEMENT)'
        effort = 'Impossible'
        imp    = 'Faible'
        note   = 'Aucune FILIERE ne recrute pour ce METIER'
        results.append((m, cat, imp, effort, nb_fils, note))
        effort_counts[effort] += 1
        category_counts[cat]  += 1
        importance_counts[imp]+= 1
        continue

    # Analyser les FILIEREs disponibles
    fils_data = []
    for fid in fils:
        fil  = nodes_by_id.get(fid, {})
        hb   = bool(filiere_bacs.get(fid))
        he   = bool(filiere_etabs.get(fid))
        nb_b = len(filiere_bacs.get(fid, set()))
        nb_e = len(filiere_etabs.get(fid, set()))
        fils_data.append({'fid': fid, 'nom': fil.get('nom_fr',''), 'hb': hb, 'he': he,
                          'nb_b': nb_b, 'nb_e': nb_e})

    has_bac_any  = any(d['hb'] for d in fils_data)
    has_etab_any = any(d['he'] for d in fils_data)
    has_both_any = any(d['hb'] and d['he'] for d in fils_data)
    has_bac_etab_missing = any(d['hb'] and not d['he'] for d in fils_data)
    has_etab_bac_missing = any(d['he'] and not d['hb'] for d in fils_data)
    all_no_bac   = all(not d['hb'] for d in fils_data)
    all_no_etab  = all(not d['he'] for d in fils_data)
    all_bare     = all(not d['hb'] and not d['he'] for d in fils_data)

    if has_both_any:
        # Ne devrait pas arriver (METIER devrait être accessible)
        cat    = 'ERREUR LOGIQUE'
        effort = 'Vérifier'
        imp    = 'Haute'
        note   = 'FILIERE avec BAC+ETAB existe mais METIER marqué inaccessible'
    elif has_bac_etab_missing:
        # FILIEREs avec BAC mais sans ETAB → meilleur cas
        best_fil = next(d for d in fils_data if d['hb'] and not d['he'])
        cat    = 'FILIERE sans ETAB (a BAC)'
        effort = 'Rattachement'
        imp    = importance(mid, name, nb_fils)
        note   = f'{sum(1 for d in fils_data if d["hb"] and not d["he"])} FIL BAC+noETAB | ex: "{best_fil["nom"][:40]}"'
    elif has_etab_bac_missing:
        # FILIEREs avec ETAB mais sans BAC
        best_fil = next(d for d in fils_data if d['he'] and not d['hb'])
        cat    = 'FILIERE sans BAC (a ETAB)'
        effort = 'Ajout arête DONNE_ACCES'
        imp    = importance(mid, name, nb_fils)
        note   = f'{sum(1 for d in fils_data if d["he"] and not d["hb"])} FIL ETAB+noBAC | ex: "{best_fil["nom"][:40]}"'
    elif all_bare:
        cat    = 'FILIERE sans BAC et sans ETAB'
        effort = 'Scraping'
        imp    = importance(mid, name, nb_fils)
        note   = f'{nb_fils} FILIEREs, aucune avec BAC ou ETAB'
    else:
        # Mix
        cat    = 'FILIERE partielle (mix)'
        effort = 'Scraping'
        imp    = importance(mid, name, nb_fils)
        note   = f'bac_any={has_bac_any} etab_any={has_etab_any}'

    results.append((m, cat, imp, effort, nb_fils, note))
    effort_counts[effort]    += 1
    category_counts[cat]     += 1
    importance_counts[imp]   += 1

# ── Trier par importance puis nb_fils ─────────────────────────────────────────
IMP_ORDER = {'Haute': 0, 'Moyenne': 1, 'Faible': 2}
EFF_ORDER = {'Rattachement': 0, 'Ajout arête DONNE_ACCES': 1, 'Ignorer': 2,
             'Scraping': 3, 'Impossible': 4, 'Vérifier': 0}

results.sort(key=lambda r: (IMP_ORDER.get(r[2], 3), EFF_ORDER.get(r[3], 5), -r[4]))

# ── Métriques de débloquage ────────────────────────────────────────────────────
sans_scraping  = sum(1 for r in results if r[3] in ('Rattachement', 'Ajout arête DONNE_ACCES', 'Vérifier'))
avec_scraping  = sum(1 for r in results if r[3] == 'Scraping')
ignorables     = sum(1 for r in results if r[3] in ('Ignorer', 'Impossible'))
haute_imp      = sum(1 for r in results if r[2] == 'Haute')
haute_sans_scr = sum(1 for r in results if r[2] == 'Haute' and r[3] in ('Rattachement', 'Ajout arête DONNE_ACCES'))

# ── RAPPORT ────────────────────────────────────────────────────────────────────
print('=' * 72)
print('ANALYSE — 342 METIERs inaccessibles')
print('=' * 72)
print()
print(f'  METIERs accessibles   : {len(accessibles):3} / {len(metiers)}')
print(f'  METIERs inaccessibles : {len(inaccessibles):3} / {len(metiers)}')
print()

print('─── PAR CATÉGORIE ───')
for cat, cnt in category_counts.most_common():
    print(f'  {cnt:4}  {cat}')
print()

print('─── PAR EFFORT REQUIS ───')
for eff, cnt in effort_counts.most_common():
    print(f'  {cnt:4}  {eff}')
print()

print('─── PAR IMPORTANCE ───')
for imp, cnt in importance_counts.most_common():
    print(f'  {cnt:4}  {imp}')
print()

print('─── SYNTHÈSE DÉCISIONNELLE ───')
print()
print(f'  Débloquables SANS scraping  : {sans_scraping:4}')
print(f'    dont importance HAUTE     : {haute_sans_scr:4}')
print(f'  Nécessitent scraping        : {avec_scraping:4}')
print(f'  Ignorables (doublon/fantôme): {ignorables:4}')
print()

print('─── TOP 50 METIERs INACCESSIBLES (triés Importance / Effort / nb_FILs) ───')
print()
print(f'  {"#":3} {"IMPORTANCE":10} {"EFFORT":30} {"nb":3} NOM + NOTE')
print(f'  {"─"*3} {"─"*10} {"─"*30} {"─"*3} {"─"*45}')
for i, (m, cat, imp, effort, nb_fils, note) in enumerate(results[:50], 1):
    name = m.get('nom_fr', '')[:50]
    print(f'  {i:3}. [{imp:8}] [{effort[:28]:28}] {nb_fils:3}  "{name}"')
    print(f'       Cat: {cat[:55]}')
    print(f'       {note[:68]}')
    print()

print('─── DÉTAIL : MÉTIERS HAUTE IMPORTANCE DÉBLOQUABLES SANS SCRAPING ───')
print()
haute_faisable = [r for r in results if r[2] == 'Haute' and r[3] in ('Rattachement', 'Ajout arête DONNE_ACCES')]
for i, (m, cat, imp, effort, nb_fils, note) in enumerate(haute_faisable, 1):
    name = m.get('nom_fr', '')
    print(f'  {i:3}. "{name[:60]}"')
    print(f'       [{cat}] → {effort}')
    print(f'       {note[:68]}')
    print()

print('─── CONCLUSION ───')
print()
print(f'  Sur {len(inaccessibles)} METIERs bloqués :')
print(f'    {sans_scraping} peuvent être débloqués sans scraping ({100*sans_scraping//len(inaccessibles)}%)')
print(f'    {avec_scraping} nécessitent du scraping ({100*avec_scraping//len(inaccessibles)}%)')
print(f'    {ignorables} peuvent être ignorés sans impact utilisateur ({100*ignorables//len(inaccessibles)}%)')
print()
doublons_count = category_counts.get('DOUBLON', 0)
fantomes_count = category_counts.get('FANTOME (0 RECRUTEMENT)', 0)
print(f'  Suppressibles (doublon + fantôme) : {doublons_count + fantomes_count}')
print()
print('─' * 72)
print('STATUT : DRY-RUN — aucun fichier modifié.')
print('─' * 72)
