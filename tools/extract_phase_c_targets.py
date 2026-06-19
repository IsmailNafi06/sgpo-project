"""
Extraire les FILIEREs cibles de la Phase C avec leur contexte complet.
"""
import json, re, unicodedata, sys
from collections import defaultdict

sys.stdout.reconfigure(encoding='utf-8')

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

fil_no_etab = [n for n in filieres if not filiere_etabs.get(str(n['id']))]

def accessible(fid):
    return bool(filiere_bacs.get(fid)) and bool(filiere_metiers.get(fid))

def metier_currently_blocked(mid):
    fils = metier_filieres.get(mid, set())
    return not any(filiere_etabs.get(fid) and filiere_bacs.get(fid) for fid in fils)

def gain_if_linked(fid):
    mets = set()
    for mid in filiere_metiers.get(fid, set()):
        if metier_currently_blocked(mid):
            mets.add(mid)
    return mets

# ── Groupe 1 : FM6P / UM6P / UM6SS ──────────────────────────────────────────
g1 = [n for n in fil_no_etab
      if any(x in norm(n.get('nom_fr','')) for x in ['fm6p','um6ss','um6p','mohammed vi','m6'])]

# ── Groupe 2 : FS Casablanca ──────────────────────────────────────────────────
g2 = [n for n in fil_no_etab
      if 'faculte des sciences' in norm(n.get('nom_fr',''))
      and 'casablanca' in norm(n.get('nom_fr',''))]

# ── Groupe 3 : BAC + METIER présents (haute valeur BFS) ──────────────────────
g3_bruit_norms = {
    'bac lycee', '1ere bac', '2eme bac', 'desa ', 'dess ', 'deug ',
    'prelmd', 'pre lmd',
}
def is_bruit(n):
    nm = norm(n.get('nom_fr',''))
    return any(x in nm for x in ['1ere bac','2eme bac','bac sciences math','bac lettres',
                                   'bac arts','bac economie','bac sciences exp','tronc commun',
                                   'desa ','dess ','deug '])

g3_candidates = [n for n in fil_no_etab
                 if accessible(str(n['id'])) and not is_bruit(n)
                 and n not in g1 and n not in g2]

# ── Groupe 4 : EuroMed Génie Civil ───────────────────────────────────────────
g4 = [n for n in fil_no_etab
      if 'euromed' in norm(n.get('nom_fr',''))
      and ('genie civil' in norm(n.get('nom_fr','')) or
           'cycle preparatoire' in norm(n.get('nom_fr','')))]

# ── Groupe 5 : Mundiapolis ────────────────────────────────────────────────────
g5 = [n for n in fil_no_etab
      if 'mundiapolis' in norm(n.get('nom_fr','')) or 'mundialis' in norm(n.get('nom_fr',''))]

# ── Groupe 6 : Autres privés à valeur (Ostelea, PolyPrepa) ───────────────────
g6 = [n for n in fil_no_etab
      if any(x in norm(n.get('nom_fr','')) for x in ['ostelea','polyprep','poly prep','rabat business'])
      and accessible(str(n['id']))]

# Dédupliquer tous les groupes
all_targets = {}
for grp_name, grp in [
    ('FM6P / UM6P / UM6SS', g1),
    ('FS Casablanca', g2),
    ('BAC+MET haute valeur', g3_candidates),
    ('EuroMed Génie Civil', g4),
    ('Mundiapolis', g5),
    ('Privés haute valeur', g6),
]:
    for n in grp:
        fid = str(n['id'])
        if fid not in all_targets:
            all_targets[fid] = (n, grp_name)

# ── Afficher les cibles ───────────────────────────────────────────────────────
print('=== PHASE C — FILIÈRES CIBLES EXACTES ===')
print()

for grp_name, grp in [
    ('FM6P / UM6P / UM6SS', g1),
    ('FS Casablanca', g2),
    ('BAC+MET haute valeur', g3_candidates),
    ('EuroMed Génie Civil', g4),
    ('Mundiapolis', g5),
    ('Privés haute valeur', g6),
]:
    print(f'── {grp_name} ({len(grp)} FILIEREs) ──')
    for n in grp:
        fid = str(n['id'])
        nb_bac = len(filiere_bacs.get(fid, set()))
        nb_rec = len(filiere_metiers.get(fid, set()))
        mets_blocked = gain_if_linked(fid)
        mets_names = [nodes_by_id.get(mid,{}).get('nom_fr','')[:25]
                      for mid in list(mets_blocked)[:3]]
        print(f'  ID={fid[:8]}  BAC={nb_bac} REC={nb_rec}  +{len(mets_blocked)} MET')
        print(f'    NOM : "{n.get("nom_fr","")[:65]}"')
        print(f'    VILLE: {n.get("ville","?")}  SECTEUR: {n.get("secteur","?")}  DUREE: {n.get("duree_mois","?")}m')
        if mets_names:
            print(f'    METS: {mets_names}')
    print()

# Gain total
total_gain = set()
for fid, (n, _) in all_targets.items():
    total_gain.update(gain_if_linked(fid))
print(f'TOTAL cibles : {len(all_targets)} FILIEREs')
print(f'Gain BFS max : +{len(total_gain)} METIERs si tous rattachés')
print()
print('=== METIERs débloquables (haute valeur) ===')
for mid in sorted(total_gain, key=lambda m: -len(metier_filieres.get(m,set()))):
    m = nodes_by_id.get(mid,{})
    print(f'  "{m.get("nom_fr","")[:55]}"')
