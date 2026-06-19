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
filiere_etabs = defaultdict(set)
filiere_metiers = defaultdict(set)
filiere_bacs = defaultdict(set)
etab_filiers = defaultdict(set)
metier_filieres = defaultdict(set)

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
etab_phantom = {str(n['id']) for n in etabs if not etab_filiers.get(str(n['id']))}
fil_no_etab  = [n for n in filieres if not filiere_etabs.get(str(n['id']))]

# ── Vérifier les 34 FILIEREs FSJES ──────────────────────────────────────────
print('=== VERIFICATION FSJES ===')
fsjes_etabs = [n for n in etabs if 'fsjes' in norm(n.get('nom_fr', ''))]
print(f'ETABs FSJES reels dans le graphe : {len(fsjes_etabs)}')
for e in sorted(fsjes_etabs, key=lambda x: x.get('ville','')):
    nf = len(etab_filiers.get(str(e['id']), set()))
    print(f'  [{nf:3} FIL]  "{e.get("nom_fr","")[:48]}"  ({e.get("ville","")})')

print()
fsjes_orphelines = [n for n in fil_no_etab if 'fsjes' in norm(n.get('nom_fr', ''))]
print(f'FILIEREs orphelines contenant FSJES : {len(fsjes_orphelines)}')
for f in fsjes_orphelines[:12]:
    fid = str(f['id'])
    has_bac = bool(filiere_bacs.get(fid))
    has_met = bool(filiere_metiers.get(fid))
    print(f'  BAC={int(has_bac)} MET={int(has_met)}  "{f.get("nom_fr","")[:55]}"')

# ── Comprendre le faible gain BFS ────────────────────────────────────────────
print()
print('=== RAISON DU FAIBLE GAIN BFS (+9) ===')

ACRONYMS = [
    'ensa', 'encg', 'fst', 'fmp', 'fmd', 'fsjes', 'iscae', 'inpt',
    'emsi', 'ehtp', 'emi', 'iav', 'iam', 'isga', 'hec', 'enset',
    'crmef', 'esith', 'enim', 'uir', 'aui', 'enp', 'isaa',
    'ista', 'isic', 'ismaip', 'escola', 'heec', 'esirem',
]
CITIES = [
    'rabat', 'casablanca', 'marrakech', 'fes', 'agadir', 'tanger',
    'meknes', 'oujda', 'kenitra', 'tetouan', 'beni mellal', 'mohammedia',
    'el jadida', 'khouribga', 'settat', 'berrechid', 'nador', 'khemisset',
    'safi', 'errachidia', 'al hoceima', 'laayoune', 'dakhla', 'ouarzazate',
    'ifrane', 'larache', 'taza', 'berkane', 'guelmim',
]

matched_68 = []
for fil in fil_no_etab:
    n = norm(fil.get('nom_fr', ''))
    words = n.split()
    has_acr  = any(acr in words or acr in n for acr in ACRONYMS)
    has_city = any(city in n for city in CITIES)
    if has_acr and has_city:
        matched_68.append(fil)

print(f'FILIEREs orphelines matchées (acr+ville) : {len(matched_68)}')
print()

bac_met = bac_only = met_only = neither = 0
for fil in matched_68:
    fid = str(fil['id'])
    hb = bool(filiere_bacs.get(fid))
    hm = bool(filiere_metiers.get(fid))
    if hb and hm:
        bac_met += 1
    elif hb:
        bac_only += 1
    elif hm:
        met_only += 1
    else:
        neither += 1

print(f'  Ont BAC + METIER (BFS possible si ETAB ajoute) : {bac_met}')
print(f'  Ont BAC seulement (RECRUTEMENT manquant)       : {bac_only}')
print(f'  Ont METIER seulement (DONNE_ACCES manquant)    : {met_only}')
print(f'  Ni BAC ni METIER (ETAB seul ne debloquerait rien) : {neither}')
print()
print('INTERPRETATION :')
print('  Le gain BFS de +9 est correct. La majorite des 68 FILIEREs')
print('  matchees n ont pas encore de DONNE_ACCES ou RECRUTEMENT.')
print('  Ajouter OFFERTE_PAR seul ne suffit pas quand les deux autres')
print('  liens manquent egalement.')
print()
print('  Les 129 FILIEREs "presque prets" identifiees precedemment')
print('  (BAC+METIER sans ETAB) ne font PAS partie des 68 matches HIGH.')
print('  Ces 129 sont plutot dans les 499 FILIEREs "sans match" dont')
print('  l etab doit etre identifie par scraping ou recherche manuelle.')

# Verifier les 129 "presque prets"
print()
print('=== ANALYSE DES 129 FILIERES "PRESQUE PRETES" ===')
presque_pretes = [n for n in fil_no_etab
                  if filiere_bacs.get(str(n['id'])) and filiere_metiers.get(str(n['id']))]
print(f'FILIEREs avec BAC+METIER mais sans ETAB : {len(presque_pretes)}')

# Combien sont dans les 68 matches ?
matched_68_ids = {str(f['id']) for f in matched_68}
presque_in_68 = [n for n in presque_pretes if str(n['id']) in matched_68_ids]
presque_not_in_68 = [n for n in presque_pretes if str(n['id']) not in matched_68_ids]

print(f'  Parmi les 68 matches (ETAB identifiable auto) : {len(presque_in_68)}')
print(f'  Hors des 68 (ETAB inconnu -> scraping)        : {len(presque_not_in_68)}')
print()
print('  Exemples des NON-matchees (ETAB inconnu, haute valeur BFS) :')
for f in presque_not_in_68[:10]:
    fid = str(f['id'])
    nb_bac = len(filiere_bacs.get(fid, set()))
    nb_met = len(filiere_metiers.get(fid, set()))
    mets = [nodes_by_id.get(mid, {}).get('nom_fr', '')[:25] for mid in list(filiere_metiers.get(fid, set()))[:2]]
    print(f'  BAC={nb_bac} MET={nb_met}  "{f.get("nom_fr","")[:50]}"')
    print(f'    -> Metiers: {mets}')
