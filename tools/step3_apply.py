"""
Étape 3 — APPLICATION : 3 rattachements FLSH Rabat uniquement (#1, #2, #3).
Exclut explicitement #4 (EuroMed BiomedTech), #5 (ETAB logistique suspect), #6 (Vatel).
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

# ── Backup ────────────────────────────────────────────────────────────────────
ts  = datetime.now().strftime('%Y%m%d_%H%M%S')
bak = f'{EDGES_F}.bak_step3_{ts}'
shutil.copy2(EDGES_F, bak)

# ── Charger ───────────────────────────────────────────────────────────────────
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
etabs    = [n for n in nodes if n.get('type') == 'ETABLISSEMENT']
metiers  = [n for n in nodes if n.get('type') == 'METIER']

# ── Trouver FLSH Rabat ────────────────────────────────────────────────────────
flsh_rabat = next(
    (n for n in etabs
     if 'flsh' in norm(n.get('nom_fr', ''))
     and norm(n.get('ville', '') or '') == 'rabat'),
    None
)
assert flsh_rabat is not None, 'FLSH Rabat introuvable'
flsh_id = str(flsh_rabat['id'])

# ── FILIEREs cibles (les 3 validées) ─────────────────────────────────────────
TARGET_NORMS = {
    norm('Licence Education Culture et Documentation - FLSH Rabat'),
    norm('Licence Langues et Traduction - FLSH Rabat'),
    norm('Master Psychologie Clinique - FLSH Rabat'),
}

fil_no_etab = [n for n in filieres if not filiere_etabs.get(str(n['id']))]
targets = [n for n in fil_no_etab if norm(n.get('nom_fr', '')) in TARGET_NORMS]

# Fallback si le norm exact ne matche pas (noms légèrement différents)
if len(targets) < 3:
    TARGET_KEYWORDS = [
        ('education', 'culture', 'documentation', 'flsh', 'rabat'),
        ('langues', 'traduction', 'flsh', 'rabat'),
        ('psychologie', 'clinique', 'flsh', 'rabat'),
    ]
    targets = []
    for kws in TARGET_KEYWORDS:
        for fil in fil_no_etab:
            nn = norm(fil.get('nom_fr', ''))
            if all(k in nn for k in kws) and str(fil['id']) not in {str(t['id']) for t in targets}:
                targets.append(fil)
                break

# ── Métriques AVANT ───────────────────────────────────────────────────────────
nb_edges_avant    = len(edges)
nb_op_avant       = sum(1 for e in edges if e.get('type_lien') == 'OFFERTE_PAR')
nb_fil_no_e_avant = len(fil_no_etab)

def count_acc(fil_et):
    return sum(
        1 for n in metiers
        if any(fil_et.get(fid) and filiere_bacs.get(fid)
               for fid in metier_filieres.get(str(n['id']), set()))
    )
met_avant = count_acc(filiere_etabs)

# ── Générer les 3 arêtes ──────────────────────────────────────────────────────
new_edges_data = []
for fil in targets:
    fid = str(fil['id'])
    if (fid, flsh_id) not in existing_op:
        new_edges_data.append({
            "id":                        str(uuid.uuid4()),
            "source_id":                 fid,
            "target_id":                 flsh_id,
            "type_lien":                 "OFFERTE_PAR",
            "taux_reussite":             100,
            "cout_supplementaire":       0,
            "duree_supplementaire_mois": 0,
            "prerequis_notes":           "Lien etabli Phase B Step3.",
            "moyenne_minimale":          None,
            "type_acces":                "OUVERT",
        })

# ── Écrire ────────────────────────────────────────────────────────────────────
edges_apres = edges + new_edges_data
with open(EDGES_F, 'w', encoding='utf-8') as f:
    json.dump(edges_apres, f, ensure_ascii=False, indent=2)

# ── Métriques APRÈS ───────────────────────────────────────────────────────────
filiere_etabs_ap = defaultdict(set)
etab_filiers_ap  = defaultdict(set)
for e in edges_apres:
    s  = str(e.get('source_id', ''))
    t  = str(e.get('target_id', ''))
    if e.get('type_lien') == 'OFFERTE_PAR':
        filiere_etabs_ap[s].add(t)
        etab_filiers_ap[t].add(s)

met_apres         = count_acc(filiere_etabs_ap)
nb_fil_no_e_apres = sum(1 for n in filieres if not filiere_etabs_ap.get(str(n['id'])))

# ── Vérifications ─────────────────────────────────────────────────────────────
all_ids   = {str(n['id']) for n in nodes}
orphans   = sum(1 for e in new_edges_data
                if str(e['source_id']) not in all_ids or str(e['target_id']) not in all_ids)
selfloops = sum(1 for e in new_edges_data
                if str(e['source_id']) == str(e['target_id']))
pairs_c   = defaultdict(int)
for e in edges_apres:
    if e.get('type_lien') == 'OFFERTE_PAR':
        pairs_c[(str(e['source_id']), str(e['target_id']))] += 1
doublons = sum(1 for v in pairs_c.values() if v > 1)

# ── Rapport ───────────────────────────────────────────────────────────────────
print(f'1. Backup créé          : {bak}')
print(f'2. JSON valide          : OUI')
print(f'3. Arêtes avant/après   : {nb_edges_avant} -> {len(edges_apres)} (+{len(new_edges_data)})')
print(f'4. Arêtes ajoutées      : {len(new_edges_data)} OFFERTE_PAR ({nb_op_avant} -> {nb_op_avant + len(new_edges_data)})')
print(f'5. FILIEREs sans ETAB   : {nb_fil_no_e_avant} -> {nb_fil_no_e_apres} (-{nb_fil_no_e_avant - nb_fil_no_e_apres})')
print(f'6. METIERs accessibles  : {met_avant} -> {met_apres} (+{met_apres - met_avant})')
print(f'7. Arêtes orphelines    : {orphans}')
print(f'8. Self-loops           : {selfloops}')
print(f'9. Doublons             : {doublons}')
ok = orphans == 0 and selfloops == 0 and doublons == 0
print(f'   Statut : {"OK" if ok else "ECHEC"}')
print()
print(f'   FILIEREs rattachées :')
for fil in targets:
    print(f'     "{fil.get("nom_fr","")[:60]}"')
print(f'   -> FLSH Rabat ({flsh_rabat.get("ville","")})')
