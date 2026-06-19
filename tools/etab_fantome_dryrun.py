"""
Dry-run : suppression des ETABs fantômes réellement inutiles.
Critère : type=ETABLISSEMENT, 0 OFFERTE_PAR entrante, 0 apparition dans aucune arête.
Whitelist : institutions utiles pour scraping futur → CONSERVÉES.
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

def norm(s):
    s = (s or '').lower().strip()
    s = unicodedata.normalize('NFD', s)
    s = ''.join(c for c in s if unicodedata.category(c) != 'Mn')
    s = re.sub(r"[''`]", '', s)
    s = re.sub(r'[^a-z0-9 ]', ' ', s)
    return re.sub(r'\s+', ' ', s).strip()

nodes_by_id = {str(n['id']): n for n in nodes}

# Compter toutes les apparitions dans les arêtes (source OU target, tous types)
etab_edge_count = Counter()
etab_filiers    = defaultdict(set)

for e in edges:
    s  = str(e.get('source_id', ''))
    t  = str(e.get('target_id', ''))
    lt = e.get('type_lien', '')
    etab_edge_count[s] += 1
    etab_edge_count[t] += 1
    if lt == 'OFFERTE_PAR':
        etab_filiers[t].add(s)

etabs    = [n for n in nodes if n.get('type') == 'ETABLISSEMENT']
filieres = [n for n in nodes if n.get('type') == 'FILIERE']

# ETABs fantômes : 0 OFFERTE_PAR entrante
etabs_fantomes = [n for n in etabs if not etab_filiers.get(str(n['id']))]

# ── WHITELIST ─────────────────────────────────────────────────────────────────
# Un ETAB est CONSERVÉ si son nom normalisé contient l'un de ces tokens/phrases.
# Objectif : garder toutes les institutions utiles pour scraping futur.

# Termes exacts dans le nom normalisé (token ou sous-chaîne)
WHITELIST_SUBSTRINGS = [
    # Grandes écoles publiques d'ingénierie
    'ensias', 'inpt', 'ehtp', 'emi ', 'emia',
    'ensa ', 'ensa',          # Écoles Nationales des Sciences Appliquées
    # Commerce / gestion publiques
    'encg', 'iscae',
    # Facultés universitaires publiques
    'fst ', 'fst',            # Faculté Sciences & Techniques
    'fsjes', 'flsh',
    'fmp ', 'fmp',            # Faculté Médecine & Pharmacie
    'fmd ', 'fmd',            # Faculté Médecine Dentaire
    'faculte des sciences',   # FS génériques
    'faculte des lettres',
    'faculte de medecine',
    'faculte de droit',
    'faculte des sciences juridiques',
    'faculte des sciences de la sante',
    # Instituts agronomiques / vétérinaires
    'iav ', 'hassan ii agro',
    # OFPPT et centres de formation vocatifs
    'ofppt', 'ista ', 'ista',
    'cmc ', 'centre des metiers',
    'ispits',
    # CRMEF (formation des enseignants)
    'crmef',
    # Instituts spécialisés santé / paramédical
    'ispb', 'isrp', 'paramedical',
    'infirmier', 'sages femmes',
    # Privés reconnus et accrédités
    'uir ', 'universite internationale de rabat',
    'um6p', 'mohammed vi polytechnic',
    'mundiapolis',
    'al akhawayn',
    'hem ', 'hautes etudes management',
    'hes ', 'hautes etudes sociales',
    'supdeco',
    'isca ', 'isca',
    'iam rabat', 'iam casablanca', 'iam',
    'esith',      # École Supérieure des Industries du Textile et de l'Habillement
    'hec maroc', 'cesem',
    'aui',        # Al Akhawayn University
    'isga',
    'esig',
    'euromed',    # Université Euromed (plusieurs écoles)
    'ostelea',
    'vatel',
    'universite privee',
    'ecole superieure',  # large but catches many real institutions
    'ecole nationale',
    'ecole royale',
    'ecole hassania',
    'ecole des travaux publics',
    'ecole polytechnique',
    'ecole d ingenieur', 'ecole d ingenierie',
    'institut superieur',
    'institut national',
    'institut de technologie',
    'centre de formation',  # CFP, CFA, CFI → utiles pour scraping
    'cfa ', 'cfp ', 'cfi ',
    'cpge ',       # Classes prépa
    # Universités publiques (garder nœuds génériques)
    'universite mohammed', 'universite hassan', 'universite ibn',
    'universite cadi', 'universite sidi', 'universite abdelmalek',
    'universite ibnou', 'universite moulay',
]

def is_whitelisted(etab):
    nn = norm(etab.get('nom_fr', '') or '')
    return any(kw in nn for kw in WHITELIST_SUBSTRINGS)

# Séparer : supprimables vs conservés
supprimables = []
conserves    = []

for etab in etabs_fantomes:
    eid = str(etab['id'])
    # Vérifier qu'il n'apparaît dans AUCUNE arête (sécurité supplémentaire)
    nb_edges = etab_edge_count.get(eid, 0)
    if is_whitelisted(etab):
        conserves.append((etab, 'WHITELIST'))
    elif nb_edges > 0:
        # Apparaît dans des arêtes non-OFFERTE_PAR (ex: ADMISSION) → conserver
        conserves.append((etab, f'DANS_ARETES ({nb_edges})'))
    else:
        supprimables.append(etab)

# ── Vérification orphelins ────────────────────────────────────────────────────
ids_to_delete = {str(n['id']) for n in supprimables}
would_orphan  = [e for e in edges
                 if str(e.get('source_id', '')) in ids_to_delete
                 or str(e.get('target_id', '')) in ids_to_delete]

# Nœuds restants après suppression
nodes_after = len(nodes) - len(supprimables)

# ── Rapport ───────────────────────────────────────────────────────────────────
print('=' * 68)
print('DRY-RUN — Suppression ETABs fantômes inutiles')
print('=' * 68)
print()
print(f'1. ETABs fantômes totaux      : {len(etabs_fantomes)}')
print(f'   → Supprimables (aucun lien + hors whitelist) : {len(supprimables)}')
print(f'   → Conservés (whitelist ou présents arêtes)   : {len(conserves)}')
print()
print(f'2. Nœuds actuels              : {len(nodes):,}')
print(f'   Nœuds après suppression    : {nodes_after:,}  (-{len(supprimables)})')
print()
print(f'3. Arêtes qui deviendraient orphelines : {len(would_orphan)}  (attendu 0)')
print()

print('─── 30 PREMIERS SUPPRIMABLES ───')
print()
for i, etab in enumerate(supprimables[:30], 1):
    print(f'  {i:3}. {etab.get("ville","?"):15}  "{etab.get("nom_fr","")[:55]}"')
print()
if len(supprimables) > 30:
    print(f'  ... + {len(supprimables) - 30} autres')
    print()

print('─── ETABs FANTÔMES CONSERVÉS (whitelist) ───')
print()
by_reason = defaultdict(list)
for etab, reason in conserves:
    by_reason[reason].append(etab)

for reason, lst in sorted(by_reason.items()):
    print(f'  [{reason}]  {len(lst)} ETABs')
    for etab in lst[:10]:
        print(f'    {etab.get("ville","?"):15}  "{etab.get("nom_fr","")[:55]}"')
    if len(lst) > 10:
        print(f'    ... + {len(lst) - 10} autres')
    print()

print('─── RISQUE ───')
print()
if len(would_orphan) == 0:
    print('  RISQUE NUL : aucune arête ne devient orpheline.')
    print('  Tous les ETABs supprimables ont 0 apparition dans edges.json.')
else:
    print(f'  RISQUE DETECTE : {len(would_orphan)} arêtes impliquent ces ETABs.')
    for e in would_orphan[:5]:
        print(f'    {e.get("type_lien")} : {e.get("source_id")} -> {e.get("target_id")}')
print()
print(f'  Suppression réversible via backup edges.json.bak_phasec_*')
print(f'  (nodes_all.json n\'a pas de backup séparé — créer avant application)')
print()
print('─' * 68)
print('STATUT : DRY-RUN — aucun fichier modifié.')
print('─' * 68)
