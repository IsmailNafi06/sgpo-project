"""
Application : suppression des 384 ETABs fantômes inutiles.
Backup nodes_all.json avant toute modification.
Aucune modification de edges.json.
"""

import json, re, unicodedata, sys, shutil
from datetime import datetime
from collections import defaultdict, Counter

sys.stdout.reconfigure(encoding='utf-8')

DATA    = 'backend/src/main/resources/data'
NODES_F = f'{DATA}/nodes_all.json'
EDGES_F = f'{DATA}/edges.json'

def norm(s):
    s = (s or '').lower().strip()
    s = unicodedata.normalize('NFD', s)
    s = ''.join(c for c in s if unicodedata.category(c) != 'Mn')
    s = re.sub(r"[''`]", '', s)
    s = re.sub(r'[^a-z0-9 ]', ' ', s)
    return re.sub(r'\s+', ' ', s).strip()

# ── Backup ────────────────────────────────────────────────────────────────────
ts  = datetime.now().strftime('%Y%m%d_%H%M%S')
bak = f'{NODES_F}.bak_etab_cleanup_{ts}'
shutil.copy2(NODES_F, bak)

with open(NODES_F, 'r', encoding='utf-8') as f:
    nodes = json.load(f)
with open(EDGES_F, 'r', encoding='utf-8') as f:
    edges = json.load(f)

# ── Construire index des ETABs dans les arêtes ────────────────────────────────
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

# ── Whitelist ─────────────────────────────────────────────────────────────────
WHITELIST_SUBSTRINGS = [
    'ensias', 'inpt', 'ehtp', 'emi ', 'emia',
    'ensa ', 'ensa',
    'encg', 'iscae',
    'fst ', 'fst',
    'fsjes', 'flsh',
    'fmp ', 'fmp',
    'fmd ', 'fmd',
    'faculte des sciences',
    'faculte des lettres',
    'faculte de medecine',
    'faculte de droit',
    'faculte des sciences juridiques',
    'faculte des sciences de la sante',
    'iav ', 'hassan ii agro',
    'ofppt', 'ista ', 'ista',
    'cmc ', 'centre des metiers',
    'ispits',
    'crmef',
    'ispb', 'isrp', 'paramedical',
    'infirmier', 'sages femmes',
    'uir ', 'universite internationale de rabat',
    'um6p', 'mohammed vi polytechnic',
    'mundiapolis',
    'al akhawayn',
    'hem ', 'hautes etudes management',
    'hes ', 'hautes etudes sociales',
    'supdeco',
    'isca ', 'isca',
    'iam rabat', 'iam casablanca', 'iam',
    'esith',
    'hec maroc', 'cesem',
    'aui',
    'isga',
    'esig',
    'euromed',
    'ostelea',
    'vatel',
    'universite privee',
    'ecole superieure',
    'ecole nationale',
    'ecole royale',
    'ecole hassania',
    'ecole des travaux publics',
    'ecole polytechnique',
    'ecole d ingenieur', 'ecole d ingenierie',
    'institut superieur',
    'institut national',
    'institut de technologie',
    'centre de formation',
    'cfa ', 'cfp ', 'cfi ',
    'cpge ',
    'universite mohammed', 'universite hassan', 'universite ibn',
    'universite cadi', 'universite sidi', 'universite abdelmalek',
    'universite ibnou', 'universite moulay',
]

def is_whitelisted(etab):
    nn = norm(etab.get('nom_fr', '') or '')
    return any(kw in nn for kw in WHITELIST_SUBSTRINGS)

# ── Identifier les suppressibles ──────────────────────────────────────────────
etabs = [n for n in nodes if n.get('type') == 'ETABLISSEMENT']
fantomes = [n for n in etabs if not etab_filiers.get(str(n['id']))]

ids_to_delete = set()
for etab in fantomes:
    eid = str(etab['id'])
    nb_edges = etab_edge_count.get(eid, 0)
    if not is_whitelisted(etab) and nb_edges == 0:
        ids_to_delete.add(eid)

# ── Vérification finale avant suppression ────────────────────────────────────
would_orphan = [e for e in edges
                if str(e.get('source_id', '')) in ids_to_delete
                or str(e.get('target_id', '')) in ids_to_delete]

assert len(would_orphan) == 0, f'ERREUR : {len(would_orphan)} arêtes orphelines détectées — ANNULATION'

# ── Écriture ─────────────────────────────────────────────────────────────────
nodes_avant = len(nodes)
nodes_apres_list = [n for n in nodes if str(n['id']) not in ids_to_delete]
nodes_apres = len(nodes_apres_list)

with open(NODES_F, 'w', encoding='utf-8') as f:
    json.dump(nodes_apres_list, f, ensure_ascii=False, indent=2)

# ── Vérifications post-écriture ───────────────────────────────────────────────
all_ids_apres = {str(n['id']) for n in nodes_apres_list}
orphaned_edges = [e for e in edges
                  if str(e.get('source_id', '')) not in all_ids_apres
                  or str(e.get('target_id', '')) not in all_ids_apres]

selfloops = sum(1 for e in edges if str(e.get('source_id', '')) == str(e.get('target_id', '')))

pairs_c = Counter()
for e in edges:
    lt = e.get('type_lien', '')
    pairs_c[(str(e.get('source_id','')), str(e.get('target_id','')), lt)] += 1
doublons = sum(1 for v in pairs_c.values() if v > 1)

type_counts_apres = Counter(n.get('type') for n in nodes_apres_list)

print(f'1. Backup créé          : {bak}')
print(f'2. JSON valide          : OUI')
print(f'3. Nœuds avant/après    : {nodes_avant} -> {nodes_apres} (-{nodes_avant - nodes_apres})')
print(f'   ETABLISSEMENT        : {sum(1 for n in nodes if n.get("type")=="ETABLISSEMENT")} -> {type_counts_apres["ETABLISSEMENT"]}')
print(f'   FILIERE              : {type_counts_apres["FILIERE"]} (inchangé)')
print(f'   METIER               : {type_counts_apres["METIER"]} (inchangé)')
print(f'4. Arêtes               : {len(edges)} (inchangé)')
print(f'5. Arêtes orphelines    : {len(orphaned_edges)}   (attendu 0)')
print(f'6. Self-loops           : {selfloops}   (attendu 0)')
print(f'7. Doublons             : {doublons}   (attendu 0)')
ok = len(orphaned_edges) == 0 and selfloops == 0 and doublons == 0
print(f'   Statut : {"OK" if ok else "ECHEC"}')
