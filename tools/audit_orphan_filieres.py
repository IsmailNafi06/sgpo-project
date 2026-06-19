import json, re, unicodedata, sys
from collections import defaultdict, Counter
sys.stdout.reconfigure(encoding='utf-8')

def norm(s):
    s = (s or '').lower().strip()
    s = unicodedata.normalize('NFD', s)
    s = ''.join(c for c in s if unicodedata.category(c) != 'Mn')
    s = re.sub(r"['’`]", '', s)
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
    s = str(e.get('source_id', ''))
    t = str(e.get('target_id', ''))
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

fil_no_etab  = [n for n in filieres if not filiere_etabs.get(str(n['id']))]
etab_phantom = [n for n in etabs if not etab_filiers.get(str(n['id']))]
etab_real    = [n for n in etabs if etab_filiers.get(str(n['id']))]

# ---- MATCHING HINTS ----
HINT_PATTERNS = [
    'ensa', 'encg', 'iscae', 'fsjes', 'fst', 'fmp', 'fmd',
    'inpt', 'emsi', 'ehtp', 'emi', 'iav', 'iam', 'isga', 'uir',
    'hec', 'enset', 'crmef', 'enp', 'aui', 'esith', 'enim',
    'ofppt', 'ista', 'isaa', 'escola', 'est ',
    'faculte', 'ecole nationale', 'ecole superieure', 'institut',
]

def extract_hints(nom_filiere):
    n = norm(nom_filiere)
    return [p.strip() for p in HINT_PATTERNS if p.strip() in n]

# ---- Q2 : Matching auto ----
auto_real     = []
phantom_match = []
no_match      = []

for fil in fil_no_etab:
    hints = extract_hints(fil.get('nom_fr', ''))
    ville_fil = norm(fil.get('ville', '') or '')
    found_real = None
    found_ph   = None

    for etab in etab_real:
        en = norm(etab.get('nom_fr', ''))
        ev = norm(etab.get('ville', '') or '')
        for h in hints:
            if h in en and (not ville_fil or not ev or ville_fil == ev):
                found_real = etab; break
        if found_real: break

    if not found_real:
        for etab in etab_phantom:
            en = norm(etab.get('nom_fr', ''))
            ev = norm(etab.get('ville', '') or '')
            for h in hints:
                if h in en and (not ville_fil or not ev or ville_fil == ev):
                    found_ph = etab; break
            if found_ph: break

    if found_real:
        auto_real.append((fil, found_real))
    elif found_ph:
        phantom_match.append((fil, found_ph))
    else:
        no_match.append(fil)

print('=== 2. MATCHING AUTOMATIQUE ===')
print(f'  Matchees vers ETAB REEL (OFFERTE_PAR direct)    : {len(auto_real)}')
print(f'  Matchees vers ETAB FANTOME (reactive si rattach) : {len(phantom_match)}')
print(f'  Sans match -> scraping/recherche externe         : {len(no_match)}')
print()
print('  Exemples -> ETAB REEL :')
for fil, etab in auto_real[:6]:
    print(f'    FIL : "{fil.get("nom_fr","")[:50]}"')
    print(f'    ETAB: "{etab.get("nom_fr","")[:50]}" ({etab.get("ville","")})')
print()
print('  Exemples -> ETAB FANTOME (reactivation) :')
for fil, etab in phantom_match[:6]:
    print(f'    FIL : "{fil.get("nom_fr","")[:50]}"')
    print(f'    ETAB: "{etab.get("nom_fr","")[:50]}" ({etab.get("ville","")})')
print()
print('  Exemples sans match (scraping requis) :')
for fil in no_match[:8]:
    print(f'    "{fil.get("nom_fr","")[:60]}"  ville={fil.get("ville","")}')

# ---- Q3 : Scraping nécessaire ----
print()
print('=== 3. SCRAPING REQUIS ===')
no_match_cats = Counter()
for fil in no_match:
    nm = norm(fil.get('nom_fr',''))
    if 'bac' in nm and ('1ere' in nm or '2eme' in nm or 'premiere' in nm or 'baccalaureat' in nm):
        cat = 'BAC_PREP (lycee)'
    elif 'architecture' in nm:
        cat = 'Architecture'
    elif 'universite internationale' in nm or 'uir' in nm or 'uid' in nm:
        cat = 'Univ. privees internationales'
    elif 'tourisme' in nm or 'hotellerie' in nm:
        cat = 'Tourisme/Hotellerie'
    elif 'agriculture' in nm or 'agronomie' in nm:
        cat = 'Agriculture'
    elif 'art' in nm:
        cat = 'Arts'
    elif 'sport' in nm or 'eps' in nm:
        cat = 'Sport'
    elif 'licence' in nm:
        cat = 'Licences (etab inconnu)'
    elif 'master' in nm:
        cat = 'Masters (etab inconnu)'
    elif 'doctorat' in nm:
        cat = 'Doctorats (etab inconnu)'
    elif 'ingenieur' in nm or 'genie' in nm:
        cat = 'Ingenierie (etab inconnu)'
    else:
        cat = 'Autres'
    no_match_cats[cat] += 1

for cat, cnt in no_match_cats.most_common():
    print(f'  {cnt:4}  {cat}')

# ---- Q4 : ETABs fantomes utiles vs inutiles ----
phantom_coverage = defaultdict(list)
for fil, etab in phantom_match:
    phantom_coverage[str(etab['id'])].append(fil)

useful_ph  = {eid for eid in phantom_coverage}
useless_ph = [n for n in etab_phantom if str(n['id']) not in useful_ph]

print()
print('=== 4. ETABS FANTOMES : UTILES vs INUTILES ===')
print(f'  Total fantomes                              : {len(etab_phantom)}')
print(f'  Fantomes avec FILIEREs orphelines matchees  : {len(useful_ph)}')
print(f'  Fantomes vraiment inutiles (0 match)        : {len(useless_ph)}')
print()
print('  Top fantomes avec le plus de FILIEREs matchables :')
top = sorted(phantom_coverage.items(), key=lambda x: -len(x[1]))[:12]
for eid, fils in top:
    etab = nodes_by_id.get(eid, {})
    print(f'  [{len(fils):3} FIL]  "{etab.get("nom_fr","")[:45]}" ({etab.get("ville","")})')

print()
print('  Exemples fantomes vraiment inutiles :')
for n in useless_ph[:8]:
    print(f'    "{n.get("nom_fr","")[:55]}" ({n.get("ville","")})')

# ---- Q5 : Gain BFS si FILIEREs rattachées ----
fil_almost = [(n, str(n['id'])) for n in fil_no_etab
              if filiere_bacs.get(str(n['id'])) and filiere_metiers.get(str(n['id']))]

metiers_debloques = set()
for n, nid in fil_almost:
    for mid in filiere_metiers.get(nid, set()):
        fils_du_m = metier_filieres.get(mid, set())
        already_ok = any(filiere_etabs.get(fid) and filiere_bacs.get(fid) for fid in fils_du_m)
        if not already_ok:
            metiers_debloques.add(mid)

print()
print('=== 5. GAIN BFS ESTIME ===')
print(f'  FILIEREs orphelines avec BAC+METIER (1 OFFERTE_PAR suffit) : {len(fil_almost)}')
print(f'  METIERs inaccessibles qui seraient debloqués si rattachees  : {len(metiers_debloques)} / 489')
print()
if metiers_debloques:
    print('  Exemples METIERs qui deviendraient accessibles :')
    for mid in list(metiers_debloques)[:12]:
        m = nodes_by_id.get(mid, {})
        nb = len(metier_filieres.get(mid, set()))
        print(f'    "{m.get("nom_fr","")[:55]}"  [{nb} FIL recrutement]')

# ---- Q6 : Action maximale sur les 489 METIERs ----
print()
print('=== 6. CAUSE RACINE ET ACTION MAXIMALE ===')

# Décomposer les 489 inaccessibles
met_inacc     = []
met_0rec      = []
met_fil_no_et = []

for n in metiers:
    nid = str(n['id'])
    fils = metier_filieres.get(nid, set())
    ok = any(filiere_etabs.get(fid) and filiere_bacs.get(fid) for fid in fils)
    if not ok:
        met_inacc.append(n)
        if not fils:
            met_0rec.append(n)
        else:
            met_fil_no_et.append(n)

print(f'  489 METIERs inaccessibles decomposés :')
print(f'    [A] {len(met_0rec):3} METIERs : 0 FILIERE RECRUTEMENT du tout -> scraping obligatoire')
print(f'    [B] {len(met_fil_no_et):3} METIERs : ont des FILIEREs mais FILIEREs sans ETAB -> fixable ici')
print()

# Combien des [B] seraient fixables par rattachement auto ?
met_b_fixable = 0
for n in met_fil_no_et:
    nid = str(n['id'])
    fils_sans_etab = [fid for fid in metier_filieres.get(nid,set()) if not filiere_etabs.get(fid)]
    fils_avec_bac  = [fid for fid in metier_filieres.get(nid,set()) if filiere_bacs.get(fid)]
    if fils_sans_etab and fils_avec_bac:
        met_b_fixable += 1

print(f'  Des {len(met_fil_no_et)} METIERs type [B] :')
print(f'    -> {met_b_fixable} fixables en rattachant leurs FILIEREs orphelines a un ETAB')
print()
print('  CONCLUSION CAUSE RACINE :')
print('  La cause principale des 489 METIERs inaccessibles est la RUPTURE du lien')
print('  FILIERE -> OFFERTE_PAR -> ETAB sur 807 FILIEREs.')
print()
print('  ACTIONS PAR GAIN DECROISSANT :')
print(f'  1. Rattacher FILIEREs -> ETAB REEL existant  : {len(auto_real)} FILIEREs, gain immediat')
print(f'  2. Reactiver ETABs FANTOMES utiles            : {len(useful_ph)} ETABs, {len(phantom_match)} FILIEREs')
print(f'  3. Supprimer ETABs fantomes vraiment inutiles : {len(useless_ph)} ETABs (apres etapes 1+2)')
print(f'  4. Scraping pour {len(no_match)} FILIEREs sans match')
print()
print(f'  NE PAS SUPPRIMER LES {len(etab_phantom)} FANTOMES AVANT ETAPE 1+2.')
print(f'  {len(useful_ph)} / {len(etab_phantom)} fantomes ({100*len(useful_ph)//len(etab_phantom)}%) ont des FILIEREs orphelines matchables.')
