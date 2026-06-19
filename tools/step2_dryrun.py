"""
Étape 2 — DRY-RUN : Réactiver les ETABs fantômes utiles et rattacher leurs FILIEREs.

Logique :
  - Un ETAB fantôme est "utile" si une FILIERE orpheline mentionne explicitement
    son nom (ou son acronyme + ville) dans nom_fr.
  - Pour chaque paire (FILIERE orpheline, ETAB fantôme utile), ajouter une arête OFFERTE_PAR.
  - L'ETAB n'est pas "supprimé" ou "modifié" : il existe déjà, il reçoit juste des FILIEREs.

Aucune modification de fichier en dry-run.
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

CITY_ALIAS = {
    'casa': 'casablanca', 'fez': 'fes', 'marrakesh': 'marrakech',
    'sala': 'sale', 'eljadida': 'el jadida',
    'alhoceima': 'al hoceima', 'benimellal': 'beni mellal',
}
def normalize_city(s):
    c = norm(s or '')
    return CITY_ALIAS.get(c, c)

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

fil_no_etab   = [n for n in filieres if not filiere_etabs.get(str(n['id']))]
etab_phantom  = [n for n in etabs if not etab_filiers.get(str(n['id']))]
etab_real_ids = {str(n['id']) for n in etabs if etab_filiers.get(str(n['id']))}

# ── Matching FILIEREs orphelines -> ETABs fantômes ──────────────────────────
# Stratégie : le nom de la FILIERE doit mentionner le nom normalisé de l'ETAB fantôme
# OU partager (acronyme + ville) avec l'ETAB fantôme.

ACRONYMS = [
    'ensa', 'encg', 'fst', 'fmp', 'fmd', 'fsjes', 'iscae', 'inpt',
    'emsi', 'ehtp', 'emi', 'iav', 'iam', 'isga', 'hec', 'enset',
    'crmef', 'esith', 'enim', 'uir', 'aui', 'enp', 'isaa',
    'ista', 'isic', 'ismaip', 'escola', 'heec', 'esirem',
    # ETABs fantômes identifiés : EST, ISTA, ENSET, ENSA, IAV
    'est',
]
CITIES = [
    'rabat', 'casablanca', 'marrakech', 'fes', 'agadir', 'tanger',
    'meknes', 'oujda', 'kenitra', 'tetouan', 'beni mellal', 'mohammedia',
    'el jadida', 'khouribga', 'settat', 'berrechid', 'nador', 'khemisset',
    'safi', 'errachidia', 'al hoceima', 'laayoune', 'dakhla', 'ouarzazate',
    'ifrane', 'larache', 'taza', 'berkane', 'guelmim',
]

# Construire l'index des ETABs fantômes par (acronyme, ville)
phantom_index = defaultdict(list)   # (acr, ville) -> [etab, ...]
phantom_by_normname = {}            # norm(nom_fr) -> etab (pour match direct nom)

for etab in etab_phantom:
    en = norm(etab.get('nom_fr', ''))
    ev = normalize_city(etab.get('ville', '') or '')
    phantom_by_normname[en] = etab
    words = en.split()
    for acr in ACRONYMS:
        if acr in words or acr in en:
            phantom_index[(acr, ev)].append(etab)

def find_phantom_match(nom_fil, ville_fil):
    """
    Cherche un ETAB fantôme correspondant à la FILIERE.
    Retourne (etab, confiance) ou (None, None).
    Priorité :
      1. HIGH  : nom normalisé de l'ETAB présent dans le nom de la FILIERE + ville match
      2. HIGH  : acronyme + ville depuis nom FILIERE -> ETAB fantôme unique
      3. MED   : acronyme + ville du noeud FILIERE -> ETAB fantôme unique
    """
    nf = norm(nom_fil)
    vf = normalize_city(ville_fil or '')

    # Stratégie 1 : nom complet de l'ETAB dans le nom de la FILIERE
    for enorm, etab in phantom_by_normname.items():
        # Chercher les 3-4 premiers mots significatifs du nom ETAB dans la FILIERE
        etab_words = [w for w in enorm.split() if len(w) > 2][:4]
        if len(etab_words) >= 2 and all(w in nf for w in etab_words):
            ev = normalize_city(etab.get('ville', '') or '')
            if not vf or not ev or vf == ev:
                return etab, 'HIGH'

    # Stratégie 2 : acronyme + ville dans nom FILIERE
    for acr in ACRONYMS:
        words = nf.split()
        if acr not in words and acr not in nf:
            continue
        for city in sorted(CITIES, key=len, reverse=True):
            if city in nf:
                key = (acr, city)
                elist = phantom_index.get(key, [])
                if len(elist) == 1:
                    return elist[0], 'HIGH'
                elif len(elist) > 1:
                    # Choisir celui avec le nom le plus proche
                    top = sorted(elist, key=lambda e: len(norm(e.get('nom_fr', ''))), reverse=True)
                    return top[0], 'MED'

    # Stratégie 3 : acronyme dans nom + ville du noeud FILIERE
    if vf:
        for acr in ACRONYMS:
            words = nf.split()
            if acr not in words and acr not in nf:
                continue
            key = (acr, vf)
            elist = phantom_index.get(key, [])
            if len(elist) == 1:
                return elist[0], 'MED'

    return None, None

# Parcourir toutes les FILIEREs orphelines (après Step1, certaines ont un ETAB)
matches   = []
seen_fid  = set()

for fil in fil_no_etab:
    fid = str(fil['id'])
    if fid in seen_fid:
        continue
    # Après Step1, certaines ont été rattachées — ré-vérifier
    if filiere_etabs.get(fid):
        continue

    etab, conf = find_phantom_match(fil.get('nom_fr', ''), fil.get('ville', ''))
    if etab is None:
        continue
    eid = str(etab['id'])
    if (fid, eid) in existing_op:
        continue

    seen_fid.add(fid)
    matches.append((fil, etab, conf))

# Identifier les ETABs fantômes uniques couverts
phantom_ids_used = {str(etab['id']) for _, etab, _ in matches}

# Générer les arêtes (dry-run : pas d'écriture)
new_edges_preview = []
for fil, etab, conf in matches:
    new_edges_preview.append({
        "id":                       str(uuid.uuid4()),
        "source_id":                str(fil['id']),
        "target_id":                str(etab['id']),
        "type_lien":                "OFFERTE_PAR",
        "taux_reussite":            100,
        "cout_supplementaire":      0,
        "duree_supplementaire_mois": 0,
        "prerequis_notes":          "Lien etabli Phase B Step2.",
        "moyenne_minimale":         None,
        "type_acces":               "OUVERT",
    })

# ── Gain BFS estimé ──────────────────────────────────────────────────────────
sim_fil_etabs = defaultdict(set)
for fid, eids in filiere_etabs.items():
    sim_fil_etabs[fid].update(eids)
for fil, etab, _ in matches:
    sim_fil_etabs[str(fil['id'])].add(str(etab['id']))

def count_acc(fil_et):
    return sum(1 for n in metiers
               if any(fil_et.get(fid) and filiere_bacs.get(fid)
                      for fid in metier_filieres.get(str(n['id']), set())))

met_avant = count_acc(filiere_etabs)
met_apres = count_acc(sim_fil_etabs)
debloques = met_apres - met_avant

# METIERs débloqués
sim_acc = {str(n['id']) for n in metiers
           if any(sim_fil_etabs.get(fid) and filiere_bacs.get(fid)
                  for fid in metier_filieres.get(str(n['id']), set()))}
avant_acc = {str(n['id']) for n in metiers
             if any(filiere_etabs.get(fid) and filiere_bacs.get(fid)
                    for fid in metier_filieres.get(str(n['id']), set()))}
metiers_debloques = sim_acc - avant_acc

# ── Vérifications ────────────────────────────────────────────────────────────
all_ids   = {str(n['id']) for n in nodes}
orphans   = sum(1 for e in new_edges_preview
                if str(e['source_id']) not in all_ids or str(e['target_id']) not in all_ids)
selfloops = sum(1 for e in new_edges_preview
                if str(e['source_id']) == str(e['target_id']))
pairs_new = [(str(e['source_id']), str(e['target_id'])) for e in new_edges_preview]
doublons  = sum(1 for p in pairs_new if p in existing_op)
types_src = Counter(nodes_by_id.get(str(e['source_id']), {}).get('type', '?') for e in new_edges_preview)
types_tgt = Counter(nodes_by_id.get(str(e['target_id']), {}).get('type', '?') for e in new_edges_preview)

# ── Rapport ──────────────────────────────────────────────────────────────────
print('=' * 68)
print('DRY-RUN — ETAPE 2 : Réactiver ETABs fantômes utiles + rattacher FILIEREs')
print('=' * 68)
print()
print(f'[1] FILIEREs orphelines traitées        : {len(fil_no_etab)}')
print(f'    Matchées vers ETAB FANTOME           : {len(matches)}')
print(f'    ETABs fantômes réactivés             : {len(phantom_ids_used)}')
print()
print(f'[2] Nouvelles arêtes OFFERTE_PAR        : {len(new_edges_preview)}')
print(f'    Doublons ignorés                     : {doublons}')
print(f'    Arêtes orphelines                    : {orphans}')
print(f'    Self-loops                           : {selfloops}')
print(f'    Types source                         : {dict(types_src)}')
print(f'    Types cible                          : {dict(types_tgt)}')
print()

# Détail par ETAB fantôme réactivé
print('[3] ETABS FANTÔMES RÉACTIVÉS (avec FILIEREs rattachées) :')
print()
phantom_coverage = defaultdict(list)
for fil, etab, conf in matches:
    phantom_coverage[str(etab['id'])].append((fil, conf))
for eid, fils_conf in sorted(phantom_coverage.items(), key=lambda x: -len(x[1])):
    etab = nodes_by_id.get(eid, {})
    h = sum(1 for _, c in fils_conf if c == 'HIGH')
    m = sum(1 for _, c in fils_conf if c == 'MED')
    print(f'  [{len(fils_conf):2} FIL  H={h} M={m}]  "{etab.get("nom_fr","")[:45]}"  ({etab.get("ville","")})')

print()
print('[4] TOP 20 RATTACHEMENTS FILIERE -> ETAB FANTOME :')
print()
for i, (fil, etab, conf) in enumerate(matches[:20], 1):
    tag = 'HIGH' if conf == 'HIGH' else 'MED '
    print(f'  {i:2}. [{tag}]  "{fil.get("nom_fr","")[:48]}"')
    print(f'            ->  "{etab.get("nom_fr","")[:48]}"  ({etab.get("ville","")})')
print()

if len(matches) > 20:
    print(f'  ... et {len(matches) - 20} autres rattachements.')
    print()

print(f'[5] GAIN BFS ESTIMÉ :')
print(f'    METIERs accessibles avant : {met_avant}')
print(f'    METIERs accessibles après : {met_apres}')
print(f'    Gain                      : +{debloques} METIERs débloqués')
print()
if metiers_debloques:
    print('    METIERs qui deviendraient accessibles :')
    for mid in sorted(metiers_debloques, key=lambda m: -len(metier_filieres.get(m, set())))[:15]:
        m = nodes_by_id.get(mid, {})
        print(f'      "{m.get("nom_fr","")[:55]}"')
print()

conf_h = sum(1 for _, _, c in matches if c == 'HIGH')
conf_m = sum(1 for _, _, c in matches if c == 'MED')
print(f'[RECAP CONFIANCE] HIGH={conf_h} | MED={conf_m}')
print()
print('─' * 68)
print('STATUT : DRY-RUN UNIQUEMENT — aucun fichier modifié.')
print('Pour appliquer : step2_apply.py')
print('─' * 68)
