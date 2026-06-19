"""
APPLICATION : Ajout des arêtes DONNE_ACCES pour FILIEREs ETAB+METIER sans BAC.
Même logique que donne_acces_dryrun.py — applique réellement sur edges.json.
"""

import json, re, unicodedata, uuid, sys, shutil
from datetime import datetime
from collections import defaultdict, Counter
from pathlib import Path

sys.stdout.reconfigure(encoding='utf-8')

DATA = 'backend/src/main/resources/data'
EDGES_PATH = Path(f'{DATA}/edges.json')

# ── Backup ────────────────────────────────────────────────────────────────────
ts  = datetime.now().strftime('%Y%m%d_%H%M%S')
bak = EDGES_PATH.with_suffix(f'.bak_donne_acces_{ts}')
shutil.copy2(EDGES_PATH, bak)
print(f'Backup : {bak}')

# ── Chargement ────────────────────────────────────────────────────────────────
with open(f'{DATA}/nodes_all.json', 'r', encoding='utf-8') as f:
    nodes = json.load(f)
with open(EDGES_PATH, 'r', encoding='utf-8') as f:
    edges = json.load(f)

edges_avant = len(edges)

nodes_by_id   = {str(n['id']): n for n in nodes}
nodes_by_code = {str(n.get('code', '')): n for n in nodes if n.get('code')}


def norm(s):
    s = (s or '').lower().strip()
    s = unicodedata.normalize('NFD', s)
    s = ''.join(c for c in s if unicodedata.category(c) != 'Mn')
    s = re.sub(r"[''`]", '', s)
    s = re.sub(r'[^a-z0-9 ]', ' ', s)
    return re.sub(r'\s+', ' ', s).strip()


filiere_etabs   = defaultdict(set)
filiere_metiers = defaultdict(set)
metier_filieres = defaultdict(set)
filiere_bacs    = defaultdict(set)
existing_da     = set()

da_avant = 0
for e in edges:
    s  = str(e.get('source_id', ''))
    t  = str(e.get('target_id', ''))
    lt = e.get('type_lien', '')
    if lt == 'OFFERTE_PAR':
        filiere_etabs[s].add(t)
    elif lt == 'RECRUTEMENT':
        filiere_metiers[s].add(t)
        metier_filieres[t].add(s)
    elif lt == 'DONNE_ACCES':
        filiere_bacs[t].add(s)
        existing_da.add((s, t))
        da_avant += 1

filieres = [n for n in nodes if n.get('type') == 'FILIERE']
metiers  = [n for n in nodes if n.get('type') == 'METIER']

targets = [n for n in filieres
           if filiere_etabs.get(str(n['id']))
           and filiere_metiers.get(str(n['id']))
           and not filiere_bacs.get(str(n['id']))]


def sid(code):
    n = nodes_by_code.get(code)
    assert n, f'NOEUD INTROUVABLE : code={code}'
    return str(n['id'])


BAC_SM    = sid('BAC_SM')
BAC_SE    = sid('BAC_SE')
BAC_PC    = sid('BAC_PC')
BAC_SVT   = sid('BAC_SVT')
BAC_ECO   = sid('BAC_ECO')
BAC_GC    = sid('BAC_GC')
BAC_LETTRES = sid('BAC_LETTRES')
BAC_SH    = sid('BAC_SH')
BAC_TECH_ELEC  = sid('BAC_TECH_ELEC')
BAC_TECH_MECA  = sid('BAC_TECH_MECA')
BAC_TECH_CIVIL = sid('BAC_TECH_CIVIL')
BAC_AGR   = sid('BAC_AGR')
BAC_ARTS_APPLIQUES = sid('BAC_ARTS_APPLIQUES')

CPGE_MPSI = [sid(c) for c in [
    'F9R_CPGE_MPSI_MP_CPGE_CENTRE_TANGER',
    'F9R_CPGE_MPSI_MP_CPGE_CENTRE_CASABLANCA',
    'F9R_CPGE_MPSI_MP_CPGE_CENTRE_RABAT',
    'F9R_CPGE_MPSI_MP_CPGE_CENTRE_FES',
    'F9R_CPGE_MPSI_MP_CPGE_CENTRE_MARRAKECH',
]]
CPGE_PCSI = [sid(c) for c in [
    'F9R_CPGE_PCSI_PSI_CPGE_CENTRE_RABAT',
    'F9R_CPGE_PCSI_PSI_CPGE_CENTRE_MARRAKECH',
    'F9R_CPGE_PCSI_PSI_CPGE_CENTRE_CASABLANCA',
    'F9R_CPGE_PCSI_PSI_CPGE_CENTRE_FES',
    'F9R_CPGE_PCSI_PSI_CPGE_CENTRE_TANGER',
]]
CPGE_ECT = [sid(c) for c in [
    'F9R_CPGE_ECT_CPGE_CENTRE_CASABLANCA',
    'F9R_CPGE_ECT_CPGE_CENTRE_RABAT',
    'F9R_CPGE_ECT_CPGE_CENTRE_TANGER',
    'F9R_CPGE_ECT_CPGE_CENTRE_FES',
    'F9R_CPGE_ECT_CPGE_CENTRE_MARRAKECH',
]]
CPGE_ALL = CPGE_MPSI + CPGE_PCSI

MASTER_KW  = ['master', 'mastere', 'mba', 'bac+5', 'bac + 5', 'm1', 'm2',
               'doctorat', 'phd', 'desa', 'dess', 'dea',
               'cycle doctoral', 'habilitation']
LICENCE_KW = ['licence', 'bac+3', 'bac + 3', 'lst', 'dut', 'deust',
               'bts', 'technicien specialise', 'technicien superieur',
               'diplome de technicien']
CYCLE_ING_KW = ['cycle ingenieur', 'cycle d ingenieur', 'ingenieur genie',
                 'ingenieur en', 'cycle preparatoire ingenieur',
                 'ecole nationale des sciences',
                 'ecole mohammadia', 'ecole hassania',
                 'ecole nationale superieure']


def detect_level(nn):
    if any(kw in nn for kw in MASTER_KW):
        return 'MASTER'
    if any(kw in nn for kw in CYCLE_ING_KW):
        return 'CYCLE_ING'
    if any(kw in nn for kw in LICENCE_KW):
        return 'LICENCE'
    return 'AUTRE'


def should_get_direct_bac(nom):
    nn = norm(nom)
    level = detect_level(nn)
    if level == 'MASTER':
        return False, level
    return True, level


FAMILY_RULES = [
    (['ensa agadir', 'ensa al hoceima', 'ensa beni mellal', 'ensa berrechid',
      'ensa fes', 'ensa kenitra', 'ensa khouribga', 'ensa marrakech',
      'ensa meknes', 'ensa oujda', 'ensa safi', 'ensa settat', 'ensa tanger',
      'ensa tetouan', 'ecole nationale des sciences appliquees',
      'ensa ', 'ensam'],
     'ENSA (Cycle Ingénieur)', CPGE_ALL,
     'Via CPGE MPSI+PCSI uniquement — concours national ENSA'),

    (['emi rabat', 'ecole mohammadia', 'ecole mohammadia d ingenieurs'],
     'EMI', CPGE_ALL,
     'Via CPGE MPSI+PCSI — grande école d\'ingénieurs EMI Rabat'),

    (['ehtp', 'ecole hassania des travaux publics'],
     'EHTP', CPGE_ALL,
     'Via CPGE MPSI+PCSI — grande école d\'ingénieurs EHTP'),

    (['ensias', 'ecole nationale superieure d informatique'],
     'ENSIAS', CPGE_ALL,
     'Via CPGE MPSI+PCSI — grande école informatique ENSIAS Rabat'),

    (['inpt', 'institut national des postes et telecommunications'],
     'INPT', CPGE_ALL,
     'Via CPGE MPSI+PCSI — grande école télécoms INPT Rabat'),

    (['insea', 'statistique et economie appliquee'],
     'INSEA', CPGE_ECT + CPGE_MPSI,
     'Via CPGE ECT ou MPSI — école de statistiques INSEA Rabat'),

    (['iscae', 'cycle superieur de gestion'],
     'ISCAE', [BAC_SM, BAC_SE, BAC_ECO, BAC_GC],
     'Accès direct BAC — concours ISCAE'),

    (['encg', 'ecole nationale de commerce et de gestion',
      'diplome en gestion des entreprises'],
     'ENCG (Diplôme)', [BAC_SM, BAC_SE, BAC_ECO, BAC_GC],
     'Accès direct BAC via concours national ENCG'),

    (['lst genie informatique', 'lst genie electrique',
      'lst genie industriel', 'licence sciences et techniques genie',
      'licence sciences et techniques reseaux'],
     'FST – LST Ingénierie', [BAC_SM, BAC_SE, BAC_PC, BAC_TECH_ELEC],
     'Accès direct BAC SM/SE/PC/TECH_ELEC — LST ou DUT (sans BAC_TECH_MECA)'),

    (['licence sciences et techniques', 'lst ', ' lst '],
     'FST – LST générique', [BAC_SM, BAC_SE, BAC_PC],
     'Accès direct BAC SM/SE/PC — Licence Sciences et Techniques'),

    # FSJES scientifique — doit passer AVANT la règle générale FSJES
    (['sciences mathematiques et informatiques', 'smi fsjes', 'smi ', ' smi',
      'mathematiques informatiques', 'data science', 'intelligence artificielle',
      'sciences exactes', 'licence informatique mathematique',
      'licence mathematiques et informatique'],
     'Sciences exactes (FSJES context)', [BAC_SM, BAC_SE, BAC_PC],
     'Programme scientifique dans FSJES — BAC scientifique uniquement'),

    (['fsjes', 'sciences juridiques', 'sciences economiques et sociales',
      'licence en droit', 'licence economie et gestion',
      'licence droit', 'licence sciences juridiques'],
     'FSJES (Droit/Éco)', [BAC_SM, BAC_SE, BAC_ECO, BAC_GC, BAC_LETTRES, BAC_SH],
     'Accès direct BAC — programmes Droit/Éco ouvert à plusieurs BAC'),

    (['licence informatique', 'licence physique', 'licence chimie',
      'licence mathematiques', 'licence biologie', 'licence svt',
      'licence sciences de la vie', 'licence geologie'],
     'FS – Licence Sciences', [BAC_SM, BAC_SE, BAC_PC, BAC_SVT],
     'Accès direct BAC SM/SE/PC/SVT — Licence FS'),

    (['ispits', 'infirmier', 'sage femme', 'sages femmes',
      'imagerie medicale', 'radiologie therapeutique',
      'laboratoire medical', 'kinesitherapie', 'orthophonie',
      'technicien de laboratoire', 'soins infirmiers',
      'anesthesie reanimation', 'bloc operatoire'],
     'ISPITS / Paramédical', [BAC_SVT, BAC_PC, BAC_SE],
     'Accès direct BAC SVT/PC/SE — formations paramédicales'),

    (['ingenieur agronome', 'agroalimentaire', 'agronomie', 'veterinaire',
      'ingenieur en agroalimentaire', 'iav', 'enam',
      'ingenieur des eaux et forets'],
     'IAV / Agriculture', [BAC_SM, BAC_SE, BAC_PC, BAC_SVT, BAC_AGR],
     'Via CPGE ou direct BAC SM/SE/SVT — filière agronomique'),

    (['tourisme', 'hotellerie', 'restauration', 'management touristique',
      'arts culinaires', 'gestion hoteliere', 'ostelea', 'vatel',
      'hospitality', 'hebergement'],
     'Tourisme / Hôtellerie', [BAC_SM, BAC_SE, BAC_ECO, BAC_LETTRES],
     'Accès direct BAC — programmes tourisme/hôtellerie'),

    (['management gestion', 'management des affaires', 'business administration',
      'ecole de commerce', 'ecole superieure de commerce',
      'bachelor management', 'bac+3 management',
      'licence management', 'licence en management',
      'sciences de gestion', 'administration des affaires'],
     'Commerce / Management (Licence)', [BAC_SM, BAC_SE, BAC_ECO, BAC_GC],
     'Accès direct BAC — programmes Management Licence'),

    (['design graphique', 'design mode', 'communication visuelle',
      'arts visuels', 'arts appliques', 'animation 3d',
      'audiovisuel', 'cinema', 'photographie'],
     'Design / Arts', [BAC_ARTS_APPLIQUES, BAC_SM, BAC_SE, BAC_LETTRES],
     'Accès direct BAC — Arts Appliqués ou BAC général'),

    (['ingenieur genie informatique', 'cycle ingenieur informatique',
      'ingenieur en informatique', 'ingenieur data',
      'cycle ingenieur data', 'ingenieur cybersecurite',
      'ingenieur reseaux', 'ingenieur cloud', 'ingenieur devops'],
     'Ingénierie Informatique (privé/cycle)', CPGE_ALL + [BAC_SM, BAC_SE, BAC_PC],
     'Via CPGE ou direct BAC pour école privée — Génie Informatique'),

    (['genie civil', 'btp', 'construction', 'travaux publics',
      'topographie', 'geometre', 'amenagement'],
     'Génie Civil / BTP', CPGE_ALL + [BAC_SM, BAC_SE, BAC_PC, BAC_TECH_CIVIL],
     'Via CPGE ou BAC SM/TECH CIVIL — Génie Civil'),

    (['electrotechnique', 'electronique', 'genie electrique',
      'genie mecanique', 'maintenance industrielle',
      'automatisme', 'robotique', 'energetique',
      'genie electromagnetique', 'electromecanique'],
     'Ingénierie Élec/Méca', CPGE_ALL + [BAC_SM, BAC_SE, BAC_PC, BAC_TECH_ELEC],
     'Via CPGE MPSI/PCSI ou BAC SM/SE/PC/TECH_ELEC — sans CPGE_TSI ni BAC_TECH_MECA'),

    (['licence comptabilite', 'licence finance', 'licence audit',
      'bac+3 finance', 'bac+3 comptabilite',
      'licence gestion comptable', 'assurance banque finance'],
     'Finance / Compta (Licence)', [BAC_SM, BAC_SE, BAC_ECO, BAC_GC],
     'Accès direct BAC — Licence Finance/Compta'),

    (['licence droit prive', 'licence droit public', 'licence droit des affaires',
      'droit general', 'sciences politiques'],
     'Droit (générique)', [BAC_ECO, BAC_LETTRES, BAC_SH, BAC_SM, BAC_SE],
     'Accès direct BAC — Droit ouvert à plusieurs filières'),

    (['parcours professionnalisant', 'technicien specialise',
      'dut ', ' dut', 'bts ', 'deust'],
     'BTS / DUT / Technicien Spé', [BAC_SM, BAC_SE, BAC_PC, BAC_ECO,
                                     BAC_TECH_ELEC, BAC_TECH_MECA, BAC_GC],
     'Accès direct BAC — formation technique courte (BTS/DUT)'),
]

DEFAULT_SOURCES = [BAC_SM, BAC_SE, BAC_ECO]


def metier_acc_now(mid):
    return any(filiere_etabs.get(fid) and filiere_bacs.get(fid)
               for fid in metier_filieres.get(mid, set()))


met_avant = sum(1 for n in metiers if metier_acc_now(str(n['id'])))

# ── Construire les arêtes à ajouter ──────────────────────────────────────────
new_edges = []
seen_pairs = set()

for fil in targets:
    fid = str(fil['id'])
    nom = fil.get('nom_fr', '')
    nn  = norm(nom)

    ok, _ = should_get_direct_bac(nom)
    if not ok:
        continue

    matched_sources = None
    for patterns, family, sources, note in FAMILY_RULES:
        if any(p in nn for p in patterns):
            matched_sources = sources
            break
    if not matched_sources:
        matched_sources = DEFAULT_SOURCES

    for src in matched_sources:
        pair = (src, fid)
        if pair not in existing_da and pair not in seen_pairs:
            seen_pairs.add(pair)
            new_edges.append({
                'id':          str(uuid.uuid4()),
                'source_id':   src,
                'target_id':   fid,
                'type_lien':   'DONNE_ACCES',
                'note':        'Ajouté automatiquement — règle famille SGPO',
                'duree_mois':  None,
                'moyenne_minimale': None,
                'prerequis_notes': '',
            })

# ── Appliquer ─────────────────────────────────────────────────────────────────
edges_apres_list = edges + new_edges
with open(EDGES_PATH, 'w', encoding='utf-8') as f:
    json.dump(edges_apres_list, f, ensure_ascii=False, indent=2)

# ── Validation JSON ───────────────────────────────────────────────────────────
with open(EDGES_PATH, 'r', encoding='utf-8') as f:
    edges_check = json.load(f)

json_valid  = len(edges_check) == len(edges_apres_list)
edges_apres = len(edges_check)
da_apres    = sum(1 for e in edges_check if e.get('type_lien') == 'DONNE_ACCES')

# ── Simuler BFS post-application ─────────────────────────────────────────────
sim_bacs = defaultdict(set, {k: set(v) for k, v in filiere_bacs.items()})
for ne in new_edges:
    sim_bacs[ne['target_id']].add(ne['source_id'])


def metier_acc_after(mid):
    return any(filiere_etabs.get(fid) and sim_bacs.get(fid)
               for fid in metier_filieres.get(mid, set()))


met_apres   = sum(1 for n in metiers if metier_acc_after(str(n['id'])))
newly_unbl  = [n for n in metiers
               if not metier_acc_now(str(n['id'])) and metier_acc_after(str(n['id']))]

# ── Vérifications intégrité ───────────────────────────────────────────────────
ids_noeuds  = {str(n['id']) for n in nodes}
self_loops  = sum(1 for e in new_edges if e['source_id'] == e['target_id'])
orphelins   = sum(1 for e in new_edges
                  if e['source_id'] not in ids_noeuds or e['target_id'] not in ids_noeuds)
all_ids     = [e['id'] for e in edges_check if e.get('id')]
doublons_id = len(all_ids) - len(set(all_ids))
pairs_total = [(e.get('source_id'), e.get('target_id'), e.get('type_lien')) for e in edges_check]
doublons_pair = len(pairs_total) - len(set(pairs_total))

# ── RAPPORT ───────────────────────────────────────────────────────────────────
print()
print('=' * 64)
print('APPLICATION DONNE_ACCES — RAPPORT FINAL')
print('=' * 64)
print()
print(f'1. Backup créé                    : {bak.name}')
print(f'2. JSON valide                    : {"OUI" if json_valid else "NON — ERREUR"}')
print(f'3. Arêtes avant / après           : {edges_avant:,} → {edges_apres:,}  (+{edges_apres - edges_avant:,})')
print(f'4. DONNE_ACCES avant / après      : {da_avant:,} → {da_apres:,}  (+{da_apres - da_avant:,})')
print(f'5. METIERs accessibles avant/après: {met_avant} → {met_apres}  (+{met_apres - met_avant})')
print(f'6. Couverture finale              : {met_apres}/{len(metiers)} ({100*met_apres//len(metiers)}%)')
print(f'7. Arêtes orphelines              : {orphelins}  (attendu 0)')
print(f'8. Self-loops                     : {self_loops}  (attendu 0)')
print(f'9. Doublons (ID)                  : {doublons_id}  (attendu 0)')
print(f'   Doublons (paire src/tgt/type)  : {doublons_pair}  (attendu 0)')
print()

# ── 10 tests BFS rapides ──────────────────────────────────────────────────────
print('10. Tests BFS — métiers débloqués importants')
print()
test_jobs = [
    'Administrateur base de donnees',
    'Developpeur Web Full Stack',
    'Supply Chain Manager',
    'Ingenieur genie informatique',
    'Ingenieur cybersecurite',
    'Gestionnaire RH',
    'Ingenieur Genie Civil',
    'Infirmier anesthesiste',
    'Comptable fournisseur',
    'Ingenieur electrique',
]

met_by_nom = {norm(n.get('nom_fr', '')): n for n in metiers}

for job in test_jobs:
    nn_job = norm(job)
    m = met_by_nom.get(nn_job)
    if not m:
        # recherche partielle
        matches = [n for n in metiers if nn_job[:20] in norm(n.get('nom_fr', ''))]
        m = matches[0] if matches else None
    if m:
        mid = str(m['id'])
        avant = metier_acc_now(mid)
        apres = metier_acc_after(mid)
        nb_fil = len([fid for fid in metier_filieres.get(mid, set())
                      if sim_bacs.get(fid) and filiere_etabs.get(fid)])
        status = 'DEBLOQUE' if (not avant and apres) else ('DEJA_OK' if avant else 'TOUJOURS_BLOQUE')
        print(f'  [{status:17}]  {m.get("nom_fr","")[:45]:45}  ({nb_fil} FIL accessibles)')
    else:
        print(f'  [NON_TROUVE     ]  {job}')

print()
print('─' * 64)
print(f'STATUT : APPLICATION TERMINÉE — {len(new_edges):,} arêtes DONNE_ACCES ajoutées.')
print('─' * 64)
