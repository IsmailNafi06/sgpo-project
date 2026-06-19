"""
APPLICATION — Ajout arêtes DONNE_ACCES BAC_PC → filières Pharmacie/Médecine/Dentaire
Exclusion explicite : Professeur agrégé en Médecine Dentaire - FMD Rabat (2237e517)
"""

import json, sys, uuid, re, unicodedata, shutil
from datetime import datetime
from pathlib import Path
sys.stdout.reconfigure(encoding='utf-8')

SEP = '=' * 72
sep = '-' * 72

EDGES_PATH = Path('backend/src/main/resources/data/edges.json')
NODES_PATH = Path('backend/src/main/resources/data/nodes_all.json')

with open(EDGES_PATH, 'r', encoding='utf-8') as f:
    edges = json.load(f)
with open(NODES_PATH, 'r', encoding='utf-8') as f:
    nodes = json.load(f)

nmap = {str(n.get('id', '')): n for n in nodes}

BAC_PC = '76295ee1-7173-59d3-b492-659129349d51'
BAC_SM = 'e3f0ebb3-c0c7-5a17-bc84-2de9736e2a85'
BAC_SE = '84a28554-5207-5ee6-a33f-340e0b111cfd'

# Exclusion explicite
EXCLU_IDS = {'2237e517-3949-51f9-b2fe-d717f2c497e8'}  # Professeur agrégé FMD Rabat

PHARMA_KW   = ['PHARMACIE', 'PHARMAC', 'MEDECIN', 'MEDECINE', 'DENTAIRE', 'CHIRURGI']
METIER_KW   = ['PHARMACIEN', 'MEDECIN', 'DENTISTE', 'CHIRURGIEN', 'BIOLOGISTE']
EXCLUSION_KW = [
    'MASTER', 'MASTERE', 'RESIDANAT', 'SPECIALITE', 'SPECIALISATION',
    'DIPLOME D ETUDES SPECIALISEES', ' DES ', 'CES ', 'DESC',
    'ATTESTATION', 'POST LICENCE', 'POSTLICENCE',
]

def normalize(s):
    s = (s or '').upper().strip()
    s = unicodedata.normalize('NFD', s)
    s = ''.join(c for c in s if unicodedata.category(c) != 'Mn')
    s = re.sub(r"[''`\-]", ' ', s)
    s = re.sub(r'[^\w\s]', ' ', s)
    return re.sub(r'\s+', ' ', s).strip()

def is_excluded(nom_fr):
    n = normalize(nom_fr)
    return any(kw in n for kw in EXCLUSION_KW)

pharma_fils = {
    fid: n
    for fid, n in nmap.items()
    if n.get('type') == 'FILIERE'
    and any(k in (n.get('nom_fr') or '').upper() for k in PHARMA_KW)
}

da_edges  = [e for e in edges if e.get('type_lien') == 'DONNE_ACCES']
rec_edges = [e for e in edges if e.get('type_lien') == 'RECRUTEMENT']
da_pairs  = {(e.get('source_id'), e.get('target_id')) for e in da_edges}

fils_sm = {e['target_id'] for e in da_edges if e.get('source_id') == BAC_SM}
fils_se = {e['target_id'] for e in da_edges if e.get('source_id') == BAC_SE}
fils_sm_or_se = fils_sm | fils_se

metier_cibles = {
    str(n.get('id', ''))
    for n in nodes
    if n.get('type') == 'METIER'
    and any(k in normalize(n.get('nom_fr', '') or '') for k in METIER_KW)
}
fils_avec_recrutement = {e.get('source_id') for e in rec_edges if e.get('target_id') in metier_cibles}

def get_template(target_fid):
    for src in (BAC_SM, BAC_SE):
        for e in da_edges:
            if e.get('source_id') == src and e.get('target_id') == target_fid:
                return e
    return None

# Sélection finale (identique au dry-run, moins l'exclu)
candidats = []
for fid, fn in pharma_fils.items():
    if fid in EXCLU_IDS:
        continue
    if fid not in fils_sm_or_se:
        continue
    if fid not in fils_avec_recrutement:
        continue
    if is_excluded(fn.get('nom_fr', '') or ''):
        continue
    if (BAC_PC, fid) in da_pairs:
        continue
    candidats.append(fid)

# Construction des nouvelles arêtes
new_edges = []
for fid in candidats:
    tmpl = get_template(fid)
    if not tmpl:
        continue
    new_edges.append({
        'id':                        str(uuid.uuid4()),
        'source_id':                 BAC_PC,
        'target_id':                 fid,
        'type_lien':                 'DONNE_ACCES',
        'type_acces':                tmpl.get('type_acces', 'CONCOURS'),
        'taux_reussite':             tmpl.get('taux_reussite', 65),
        'cout_supplementaire':       tmpl.get('cout_supplementaire', 0),
        'duree_supplementaire_mois': tmpl.get('duree_supplementaire_mois', 0),
        'prerequis_notes':           tmpl.get('prerequis_notes', ''),
        'moyenne_minimale':          tmpl.get('moyenne_minimale', None),
    })

# BACKUP
ts  = datetime.now().strftime('%Y%m%d_%H%M%S')
bak = EDGES_PATH.with_suffix(f'.bak_bac_pc_{ts}')
shutil.copy2(EDGES_PATH, bak)

# APPLICATION
edges_updated = edges + new_edges
with open(EDGES_PATH, 'w', encoding='utf-8') as f:
    json.dump(edges_updated, f, ensure_ascii=False, indent=2)

# VALIDATION
with open(EDGES_PATH, 'r', encoding='utf-8') as f:
    check = json.load(f)

all_ids = set(nmap.keys())
new_pairs_check = set()
orphans = doublons = loops = 0
for e in new_edges:
    if e['source_id'] not in all_ids or e['target_id'] not in all_ids:
        orphans += 1
    if e['source_id'] == e['target_id']:
        loops += 1
    pair = (e['source_id'], e['target_id'])
    if pair in da_pairs or pair in new_pairs_check:
        doublons += 1
    new_pairs_check.add(pair)

# BFS check
FMPC_FIL  = '43d0776b-9262-ef44-2ebe-6a87d05f0960'
FMPC_ETAB = 'f82d2cd1-3c65-5bca-02ba-7fe265175e35'
pharmacien_ids = {
    str(n.get('id',''))
    for n in nodes
    if n.get('type') == 'METIER' and 'PHARMACIEN' in normalize(n.get('nom_fr','') or '')
}
da_check = [e for e in check if e.get('type_lien') == 'DONNE_ACCES']
fils_pc_apres = {e['target_id'] for e in da_check if e.get('source_id') == BAC_PC}
fils_vers_fmpc = {e.get('source_id') for e in check if e.get('type_lien') == 'OFFERTE_PAR' and e.get('target_id') == FMPC_ETAB}
fils_vers_pharm = {e.get('source_id') for e in check if e.get('type_lien') == 'RECRUTEMENT' and e.get('target_id') in pharmacien_ids}
bfs_valides = fils_pc_apres & fils_vers_fmpc & fils_vers_pharm

# RAPPORT
print(SEP)
print('  APPLICATION — DONNE_ACCES BAC_PC -> Pharmacie/Medecine/Dentaire')
print(SEP)
print()
print(f'  1. Backup cree           : {bak.name}')
print(f'  2. JSON valide           : {"OUI" if len(check) == len(edges_updated) else "NON — ERREUR"}')
print(f'  3. Aretes avant / apres  : {len(edges)} / {len(check)}  (+{len(check)-len(edges)})')
print(f'  4. DONNE_ACCES BAC_PC ajoutees : {len(new_edges)}')
print()
print(f'  5. FMPC Casablanca incluse : {"OUI" if FMPC_FIL in {e["target_id"] for e in new_edges} else "NON"}')
fmpc_n = nmap.get(FMPC_FIL, {})
print(f'     Filiere : {fmpc_n.get("nom_fr","")}')
print(f'     ville   : {fmpc_n.get("ville","")}')
print()
print(f'  6. Test BFS Pharmacien + BAC_PC + Casablanca + mobilite=Ville :')
print(f'     Parcours valides apres correction : {len(bfs_valides)}')
for fid in bfs_valides:
    fn = nmap.get(fid, {})
    print(f'       OK  {fn.get("nom_fr","")[:60]}  (ville={fn.get("ville","")})')
if not bfs_valides:
    print('       ECHEC — aucun parcours valide')
print()
print(f'  7. Aretes orphelines     : {orphans}')
print(f'  8. Self-loops            : {loops}')
print(f'  9. Doublons              : {doublons}')
print()
print(SEP)
print('  APPLICATION TERMINEE')
print(SEP)
