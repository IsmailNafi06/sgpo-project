"""
Phase C — APPLICATION : 15 rattachements ciblés haute valeur.
Backup automatique. Même structure que Steps 1/2/3.
"""

import json, re, unicodedata, uuid, sys, shutil
from datetime import datetime
from collections import defaultdict

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

ts  = datetime.now().strftime('%Y%m%d_%H%M%S')
bak = f'{EDGES_F}.bak_phasec_{ts}'
shutil.copy2(EDGES_F, bak)

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
metiers  = [n for n in nodes if n.get('type') == 'METIER']

fil_no_etab = {str(n['id']): n for n in filieres if not filiere_etabs.get(str(n['id']))}

ETAB_FS_CASA      = 'b8219b76-6458-309e-2e04-2227a7d269b9'
ETAB_EUROMED_POLY = 'e523a696-01a6-40ee-4cdd-84cf86d70230'
ETAB_OSTELEA_RBT  = 'a9cf5b5d-9728-0c6c-1b10-924640269ee8'
ETAB_MUNDIALIS_BS = 'a0418b58-805c-a9c1-5fdd-a6b1832e473c'

LINKS_PHASE_C = [
    (['licence', 'biologie', 'faculte', 'sciences', 'casablanca'],             ETAB_FS_CASA,      'FS-Casa'),
    (['licence', 'informatique', 'faculte', 'sciences', 'casablanca'],         ETAB_FS_CASA,      'FS-Casa'),
    (['licence', 'mathematiques', 'faculte', 'sciences', 'casablanca'],        ETAB_FS_CASA,      'FS-Casa'),
    (['licence', 'physique', 'chimie', 'faculte', 'sciences', 'casablanca'],   ETAB_FS_CASA,      'FS-Casa'),
    (['licence', 'sciences', 'vie', 'terre', 'faculte', 'sciences', 'casablanca'], ETAB_FS_CASA,  'FS-Casa'),
    (['master', 'biologie', 'sante', 'faculte', 'sciences', 'casablanca'],     ETAB_FS_CASA,      'FS-Casa'),
    (['master', 'data', 'science', 'faculte', 'sciences', 'casablanca'],       ETAB_FS_CASA,      'FS-Casa'),
    (['cycle', 'ingenieur', 'euromed', 'genie', 'civil'],                       ETAB_EUROMED_POLY, 'EuroMed-Poly'),
    (['cycle', 'preparatoire', 'euromed', 'genie', 'civil'],                    ETAB_EUROMED_POLY, 'EuroMed-Poly'),
    (['ostelea', 'rabat'],                                                       ETAB_OSTELEA_RBT,  'Ostelea-Rabat'),
    (['licence', 'management', 'gestion', 'entreprises', 'finance', 'mundiapolis'],   ETAB_MUNDIALIS_BS, 'Mundiapolis-BS'),
    (['licence', 'management', 'gestion', 'entreprises', 'marketing', 'mundiapolis'], ETAB_MUNDIALIS_BS, 'Mundiapolis-BS'),
]

EXCLUDED_PATTERNS = ['fm6p', 'um6ss', 'um6p']

proposals = []
seen = set()
for kws, etab_id, raison in LINKS_PHASE_C:
    for fid, fil in fil_no_etab.items():
        nn = norm(fil.get('nom_fr', ''))
        if all(kw in nn for kw in kws):
            if (fid, etab_id) not in existing_op:
                if not any(ex in nn for ex in EXCLUDED_PATTERNS):
                    key = (fid, etab_id)
                    if key not in seen:
                        seen.add(key)
                        proposals.append((fil, nodes_by_id[etab_id], raison))

nb_edges_avant = len(edges)
nb_op_avant    = sum(1 for e in edges if e.get('type_lien') == 'OFFERTE_PAR')
nb_fil_no_e_av = len(fil_no_etab)

def count_acc(fil_et):
    return sum(
        1 for n in metiers
        if any(fil_et.get(fid) and filiere_bacs.get(fid)
               for fid in metier_filieres.get(str(n['id']), set()))
    )

met_avant = count_acc(filiere_etabs)

new_edges_data = [{
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

edges_apres = edges + new_edges_data

with open(EDGES_F, 'w', encoding='utf-8') as f:
    json.dump(edges_apres, f, ensure_ascii=False, indent=2)

filiere_etabs_ap = defaultdict(set)
for e in edges_apres:
    s  = str(e.get('source_id', ''))
    t  = str(e.get('target_id', ''))
    if e.get('type_lien') == 'OFFERTE_PAR':
        filiere_etabs_ap[s].add(t)

def metier_blocked_now(mid):
    return not any(filiere_etabs.get(fid) and filiere_bacs.get(fid)
                   for fid in metier_filieres.get(mid, set()))

def metier_accessible_after(mid):
    return any(filiere_etabs_ap.get(fid) and filiere_bacs.get(fid)
               for fid in metier_filieres.get(mid, set()))

debloques = [n for n in metiers
             if metier_blocked_now(str(n['id'])) and metier_accessible_after(str(n['id']))]

met_apres         = count_acc(filiere_etabs_ap)
nb_fil_no_e_apres = sum(1 for n in filieres if not filiere_etabs_ap.get(str(n['id'])))

all_ids   = {str(n['id']) for n in nodes}
orphans   = sum(1 for e in new_edges_data
                if str(e['source_id']) not in all_ids or str(e['target_id']) not in all_ids)
selfloops = sum(1 for e in new_edges_data
                if str(e['source_id']) == str(e['target_id']))
from collections import Counter
pairs_c = Counter()
for e in edges_apres:
    if e.get('type_lien') == 'OFFERTE_PAR':
        pairs_c[(str(e['source_id']), str(e['target_id']))] += 1
doublons = sum(1 for v in pairs_c.values() if v > 1)

print(f'1. Backup créé          : {bak}')
print(f'2. JSON valide          : OUI')
print(f'3. Arêtes avant/après   : {nb_edges_avant} -> {len(edges_apres)} (+{len(new_edges_data)})')
print(f'4. OFFERTE_PAR ajoutées : {len(new_edges_data)}  ({nb_op_avant} -> {nb_op_avant + len(new_edges_data)})')
print(f'5. FILIEREs sans ETAB   : {nb_fil_no_e_av} -> {nb_fil_no_e_apres} (-{nb_fil_no_e_av - nb_fil_no_e_apres})')
print(f'6. METIERs accessibles  : {met_avant} -> {met_apres} (+{met_apres - met_avant})')
print(f'7. METIERs débloqués :')
for m in debloques:
    print(f'     "{m.get("nom_fr","")[:55]}"')
print(f'8. Arêtes orphelines    : {orphans}')
print(f'9. Self-loops           : {selfloops}')
print(f'10. Doublons            : {doublons}')
ok = orphans == 0 and selfloops == 0 and doublons == 0
print(f'    Statut : {"OK" if ok else "ECHEC"}')
