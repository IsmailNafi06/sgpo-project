"""
DRY-RUN : Ajout d'arêtes DONNE_ACCES pour les FILIEREs ayant ETAB+METIER mais aucun BAC.
Règles par famille institutionnelle. Détection des cas dangereux.
Aucune modification de fichier.
"""

import json, re, unicodedata, uuid, sys
from collections import defaultdict, Counter

sys.stdout.reconfigure(encoding='utf-8')

DATA = 'backend/src/main/resources/data'
with open(f'{DATA}/nodes_all.json', 'r', encoding='utf-8') as f:
    nodes = json.load(f)
with open(f'{DATA}/edges.json', 'r', encoding='utf-8') as f:
    edges = json.load(f)

nodes_by_id  = {str(n['id']): n for n in nodes}
nodes_by_code = {str(n.get('code','')): n for n in nodes if n.get('code')}

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
existing_da     = set()   # (source_id, target_id) pour DONNE_ACCES

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

filieres = [n for n in nodes if n.get('type') == 'FILIERE']
metiers  = [n for n in nodes if n.get('type') == 'METIER']

# ── FILIEREs cibles : ont ETAB + METIER mais aucun BAC ───────────────────────
targets = [n for n in filieres
           if filiere_etabs.get(str(n['id']))
           and filiere_metiers.get(str(n['id']))
           and not filiere_bacs.get(str(n['id']))]

# ── Nœuds BAC/CPGE sources (lookup par code) ──────────────────────────────────
def sid(code):
    """Retourne l'ID (str) du nœud ayant ce code, ou lève une erreur claire."""
    n = nodes_by_code.get(code)
    assert n, f'NOEUD INTROUVABLE : code={code}'
    return str(n['id'])

# BAC terminaux
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

# CPGE (intermédiaires pour Cycle Ingénieur grande école publique)
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
CPGE_TSI = [sid(c) for c in [
    'F9R_CPGE_TSI_CPGE_CENTRE_CASABLANCA',
    'F9R_CPGE_TSI_CPGE_CENTRE_RABAT',
    'F9R_CPGE_TSI_CPGE_CENTRE_TANGER',
    'F9R_CPGE_TSI_CPGE_CENTRE_FES',
    'F9R_CPGE_TSI_CPGE_CENTRE_MARRAKECH',
]]
CPGE_ALL = CPGE_MPSI + CPGE_PCSI   # Ingénierie scientifique
CPGE_ELEC = CPGE_MPSI + CPGE_PCSI + CPGE_TSI  # Inclut technologique

# ── Détection de niveau (évite d'accorder accès direct BAC → Master/Doctorat) ─
MASTER_KW  = ['master', 'mastere', 'mba', 'bac+5', 'bac + 5', 'm1', 'm2',
               'doctorat', 'phd', 'desa', 'dess', 'dea',
               'cycle doctoral', 'habilitation']
LICENCE_KW = ['licence', 'bac+3', 'bac + 3', 'lst', 'dut', 'deust',
               'bts', 'technicien specialise', 'technicien superieur',
               'technicien specialise', 'diplome de technicien']
CYCLE_ING_KW = ['cycle ingenieur', 'cycle d ingenieur', 'ingenieur genie',
                 'ingenieur en', 'cycle preparatoire ingenieur',
                 'classe preparatoire', 'prepas']

def detect_level(nom):
    nn = norm(nom)
    if any(k in nn for k in MASTER_KW):
        return 'MASTER'
    if any(k in nn for k in CYCLE_ING_KW):
        return 'CYCLE_ING'
    if any(k in nn for k in LICENCE_KW):
        return 'LICENCE'
    return 'INCONNU'

# ── Table des règles par famille ───────────────────────────────────────────────
# Format : (pattern_nom, label_famille, sources_BAC, note_règle)
# sources_BAC = liste d'IDs de nœuds sources (BAC ou CPGE)
# Priorité : première règle qui matche

FAMILY_RULES = [
    # ── GRANDES ÉCOLES PUBLIQUES D'INGÉNIERIE ──────────────────────────────
    # Accès via CPGE scientifique (MPSI+MP ou PCSI+PSI) — JAMAIS direct BAC
    (['ensa ', 'ensa agadir', 'ensa al hoceima', 'ensa berrechid',
      'ensa beni mellal', 'ensa el jadida', 'ensa errachidia',
      'ensa fes', 'ensa kenitra', 'ensa khouribga', 'ensa laayoune',
      'ensa marrakech', 'ensa oujda', 'ensa safi', 'ensa tanger',
      'ensa tetouan'],
     'ENSA (Cycle Ingénieur)', CPGE_ALL,
     'Via CPGE MPSI+PCSI uniquement — concours national'),

    (['ecole mohammadia', 'emi rabat', ' emi '],
     'EMI', CPGE_ALL,
     'Via CPGE MPSI+PCSI — grande école d\'ingénieurs'),

    (['ehtp', 'ecole hassania', 'travaux publics'],
     'EHTP', CPGE_ALL,
     'Via CPGE MPSI+PCSI — grande école d\'ingénieurs'),

    (['ensias', 'ecole nationale superieure d informatique'],
     'ENSIAS', CPGE_ALL,
     'Via CPGE MPSI+PCSI — grande école informatique'),

    (['inpt', 'institut national des postes', 'telecom paris'],
     'INPT', CPGE_ALL,
     'Via CPGE MPSI+PCSI — grande école télécoms'),

    (['insea', 'actuariat', 'statistique appliquee'],
     'INSEA', CPGE_ECT + CPGE_MPSI,
     'Via CPGE ECT ou MPSI — école de statistiques'),

    # Cycle préparatoire intégré (accès direct BAC, mène à cycle ingénieur)
    (['cycle preparatoire', 'prepas integrees', 'classe preparatoire integree'],
     'Prépa intégrée privée', [BAC_SM, BAC_SE, BAC_PC],
     'Accès direct BAC SM/SE/PC — prépa intégrée'),

    # ── ENCG ────────────────────────────────────────────────────────────────
    (['diplome encg', 'diplome de l ecole nationale de commerce',
      'encg finance', 'encg management', 'encg marketing',
      'encg gestion', 'encg logistique', 'encg ressources'],
     'ENCG (Diplôme)', [BAC_SM, BAC_SE, BAC_ECO, BAC_GC],
     'Accès direct BAC via concours national ENCG'),

    # ── ISCAE ────────────────────────────────────────────────────────────────
    (['iscae', 'ecole superieure de commerce et gestion'],
     'ISCAE', [BAC_SM, BAC_SE, BAC_ECO, BAC_GC],
     'Accès direct BAC — concours ISCAE'),

    # ── FST / LST (Licences Sciences et Techniques) ──────────────────────
    (['lst genie informatique', 'lst genie electrique',
      'lst genie industriel', 'licence sciences et techniques genie',
      'licence sciences et techniques reseaux'],
     'FST – LST Ingénierie', [BAC_SM, BAC_SE, BAC_PC, BAC_TECH_ELEC],
     'Accès direct BAC SM/SE/PC/TECH_ELEC — LST ou DUT (sans BAC_TECH_MECA)'),

    (['licence sciences et techniques', 'lst ', ' lst '],
     'FST – LST générique', [BAC_SM, BAC_SE, BAC_PC],
     'Accès direct BAC SM/SE/PC — Licence Sciences et Techniques'),

    # ── FSJES — programmes scientifiques (doit passer AVANT la règle générale FSJES)
    (['sciences mathematiques et informatiques', 'smi fsjes', 'smi ', ' smi',
      'mathematiques informatiques', 'data science', 'intelligence artificielle',
      'sciences exactes', 'licence informatique mathematique',
      'licence mathematiques et informatique'],
     'Sciences exactes (FSJES context)', [BAC_SM, BAC_SE, BAC_PC],
     'Programme scientifique dans FSJES — BAC scientifique uniquement, exclut BAC_LETTRES'),

    # ── FSJES (Droit / Économie) ─────────────────────────────────────────
    (['fsjes', 'sciences juridiques', 'sciences economiques et sociales',
      'licence en droit', 'licence economie et gestion',
      'licence droit', 'licence sciences juridiques'],
     'FSJES (Droit/Éco)', [BAC_SM, BAC_SE, BAC_ECO, BAC_GC, BAC_LETTRES, BAC_SH],
     'Accès direct BAC — programmes Droit/Éco ouvert à plusieurs BAC'),

    # ── FS (Faculté des Sciences) — Licences uniquement ─────────────────
    (['licence informatique', 'licence physique', 'licence chimie',
      'licence mathematiques', 'licence biologie', 'licence svt',
      'licence sciences de la vie', 'licence geologie'],
     'FS – Licence Sciences', [BAC_SM, BAC_SE, BAC_PC, BAC_SVT],
     'Accès direct BAC SM/SE/PC/SVT — Licence FS'),

    # ── ISPITS / Paramédical ─────────────────────────────────────────────
    (['ispits', 'infirmier', 'sage femme', 'sages femmes',
      'imagerie medicale', 'radiologie therapeutique',
      'laboratoire medical', 'kinesitherapie', 'orthophonie',
      'technicien de laboratoire', 'soins infirmiers',
      'anesthesie reanimation', 'bloc operatoire'],
     'ISPITS / Paramédical', [BAC_SVT, BAC_PC, BAC_SE],
     'Accès direct BAC SVT/PC/SE — formations paramédicales'),

    # ── IAV / Agriculture ────────────────────────────────────────────────
    (['ingenieur agronome', 'agroalimentaire', 'agronomie', 'veterinaire',
      'ingenieur en agroalimentaire', 'iav', 'enam',
      'ingenieur des eaux et forets'],
     'IAV / Agriculture', [BAC_SM, BAC_SE, BAC_PC, BAC_SVT, BAC_AGR],
     'Via CPGE ou direct BAC SM/SE/SVT — filière agronomique'),

    # ── Tourisme / Hôtellerie ────────────────────────────────────────────
    (['tourisme', 'hotellerie', 'restauration', 'management touristique',
      'arts culinaires', 'gestion hoteliere', 'ostelea', 'vatel',
      'hospitality', 'hebergement'],
     'Tourisme / Hôtellerie', [BAC_SM, BAC_SE, BAC_ECO, BAC_LETTRES],
     'Accès direct BAC — programmes tourisme/hôtellerie'),

    # ── Commerce / Management (privé) ────────────────────────────────────
    (['management gestion', 'management des affaires', 'business administration',
      'ecole de commerce', 'ecole superieure de commerce',
      'bachelor management', 'bac+3 management',
      'licence management', 'licence en management',
      'sciences de gestion', 'administration des affaires'],
     'Commerce / Management (Licence)', [BAC_SM, BAC_SE, BAC_ECO, BAC_GC],
     'Accès direct BAC — programmes Management Licence'),

    # ── Design / Arts appliqués ──────────────────────────────────────────
    (['design graphique', 'design mode', 'communication visuelle',
      'arts visuels', 'arts appliques', 'animation 3d',
      'audiovisuel', 'cinema', 'photographie'],
     'Design / Arts', [BAC_ARTS_APPLIQUES, BAC_SM, BAC_SE, BAC_LETTRES],
     'Accès direct BAC — Arts Appliqués ou BAC général'),

    # ── Informatique / Numérique (Licence privée / grande école privée) ──
    (['ingenieur genie informatique', 'cycle ingenieur informatique',
      'ingenieur en informatique', 'ingenieur data',
      'cycle ingenieur data', 'ingenieur cybersecurite',
      'ingenieur reseaux', 'ingenieur cloud', 'ingenieur devops'],
     'Ingénierie Informatique (privé/cycle)', CPGE_ALL + [BAC_SM, BAC_SE, BAC_PC],
     'Via CPGE ou direct BAC pour école privée — Génie Informatique'),

    # ── Ingénierie Génie Civil / BTP ─────────────────────────────────────
    (['genie civil', 'btp', 'construction', 'travaux publics',
      'topographie', 'geometre', 'amenagement'],
     'Génie Civil / BTP', CPGE_ALL + [BAC_SM, BAC_SE, BAC_PC, BAC_TECH_CIVIL],
     'Via CPGE ou BAC SM/TECH CIVIL — Génie Civil'),

    # ── Ingénierie Électrique / Mécanique ────────────────────────────────
    (['electrotechnique', 'electronique', 'genie electrique',
      'genie mecanique', 'maintenance industrielle',
      'automatisme', 'robotique', 'energetique',
      'genie electromagnetique', 'electromecanique'],
     'Ingénierie Élec/Méca', CPGE_ALL + [BAC_SM, BAC_SE, BAC_PC, BAC_TECH_ELEC],
     'Via CPGE MPSI/PCSI ou BAC SM/SE/PC/TECH_ELEC — sans CPGE_TSI ni BAC_TECH_MECA'),

    # ── Finance / Comptabilité (Licence) ─────────────────────────────────
    (['licence comptabilite', 'licence finance', 'licence audit',
      'bac+3 finance', 'bac+3 comptabilite',
      'licence gestion comptable', 'assurance banque finance'],
     'Finance / Compta (Licence)', [BAC_SM, BAC_SE, BAC_ECO, BAC_GC],
     'Accès direct BAC — Licence Finance/Compta'),

    # ── Droit (générique) ─────────────────────────────────────────────────
    (['licence droit prive', 'licence droit public', 'licence droit des affaires',
      'droit general', 'sciences politiques'],
     'Droit (générique)', [BAC_ECO, BAC_LETTRES, BAC_SH, BAC_SM, BAC_SE],
     'Accès direct BAC — Droit ouvert à plusieurs filières'),

    # ── Parcours professionnalisants / BTS spéciaux ──────────────────────
    (['parcours professionnalisant', 'technicien specialise',
      'dut ', ' dut', 'bts ', 'deust'],
     'BTS / DUT / Technicien Spé', [BAC_SM, BAC_SE, BAC_PC, BAC_ECO,
                                     BAC_TECH_ELEC, BAC_TECH_MECA, BAC_GC],
     'Accès direct BAC — formation technique courte (BTS/DUT)'),
]

# Règle par défaut (si aucune famille détectée)
DEFAULT_SOURCES = [BAC_SM, BAC_SE, BAC_ECO]

# ── Niveaux → filtrer les MASTERS pour ne PAS leur donner BAC direct ─────────
def should_get_direct_bac(nom):
    nn = norm(nom)
    level = detect_level(nn)
    # Masters, Doctorats, DESA/DESS : ne reçoivent PAS d'accès direct BAC
    if level == 'MASTER':
        return False, level
    return True, level

# ── Matcher chaque FILIERE cible ──────────────────────────────────────────────
proposals = []      # (fil, source_id, famille, rule_note)
dangerous = []      # (fil, raison)
skipped_masters = []
family_stats = defaultdict(lambda: {'fils': set(), 'edges': 0, 'mets': set()})

seen_pairs = set()

for fil in targets:
    fid  = str(fil['id'])
    nom  = fil.get('nom_fr', '')
    nn   = norm(nom)

    ok, level = should_get_direct_bac(nom)
    if not ok:
        skipped_masters.append((fil, level))
        continue

    matched_family  = None
    matched_sources = None
    matched_note    = None

    for patterns, family, sources, note in FAMILY_RULES:
        if any(p in nn for p in patterns):
            matched_family  = family
            matched_sources = sources
            matched_note    = note
            break

    if not matched_family:
        matched_family  = 'Autres (règle générique)'
        matched_sources = DEFAULT_SOURCES
        matched_note    = 'Aucune famille détectée — BAC SM/SE/ECO par défaut'

    # Vérifications de cohérence
    nb_sources = len(matched_sources)
    if nb_sources > 12:
        dangerous.append((fil, f'{matched_family} : {nb_sources} sources — risque de sur-connexion'))

    # Détecter incohérences : BAC_LETTRES → programme scientifique
    sci_patterns = ['informatique', 'genie', 'physique', 'chimie', 'mathematique',
                    'electricite', 'mecanique', 'ingenieur', 'electronique']
    is_sci = any(p in nn for p in sci_patterns)
    if BAC_LETTRES in matched_sources and is_sci:
        dangerous.append((fil, f'{matched_family} : BAC_LETTRES dans programme scientifique "{nom[:40]}"'))

    for src in matched_sources:
        pair = (src, fid)
        if pair not in existing_da and pair not in seen_pairs:
            seen_pairs.add(pair)
            proposals.append((fil, src, matched_family, matched_note))
            family_stats[matched_family]['fils'].add(fid)
            family_stats[matched_family]['edges'] += 1
            for mid in filiere_metiers.get(fid, set()):
                family_stats[matched_family]['mets'].add(mid)

# ── Simulation BFS ────────────────────────────────────────────────────────────
def metier_acc_now(mid):
    return any(filiere_etabs.get(fid) and filiere_bacs.get(fid)
               for fid in metier_filieres.get(mid, set()))

# Simuler les nouveaux filiere_bacs
sim_bacs = defaultdict(set, {k: set(v) for k, v in filiere_bacs.items()})
for fil, src, _, _ in proposals:
    sim_bacs[str(fil['id'])].add(src)

def metier_acc_after(mid):
    return any(filiere_etabs.get(fid) and sim_bacs.get(fid)
               for fid in metier_filieres.get(mid, set()))

met_avant  = [n for n in metiers if     metier_acc_now(str(n['id']))]
met_apres  = [n for n in metiers if     metier_acc_after(str(n['id']))]
newly_unbl = [n for n in metiers if not metier_acc_now(str(n['id'])) and metier_acc_after(str(n['id']))]

# Gain par famille
family_gain = {}
for fam, stats in family_stats.items():
    gain = set()
    for mid in stats['mets']:
        if not metier_acc_now(mid) and metier_acc_after(mid):
            gain.add(mid)
    family_gain[fam] = gain

# ── RAPPORT ───────────────────────────────────────────────────────────────────
print('=' * 72)
print('DRY-RUN — Ajout d\'arêtes DONNE_ACCES (FILIEREs ETAB+METIER sans BAC)')
print('=' * 72)
print()
print(f'FILIEREs cibles (ETAB+METIER+noBAC) : {len(targets)}')
print(f'  → FILIEREs de niveau MASTER/Doc ignorées : {len(skipped_masters)}')
print(f'  → FILIEREs traitées                      : {len(targets) - len(skipped_masters)}')
print(f'Arêtes DONNE_ACCES à ajouter              : {len(proposals)}')
print(f'Doublons évités                           : {sum(1 for p in seen_pairs)}')
print()

print('─── PAR FAMILLE ─────────────────────────────────────────────────────────')
print()
print(f'  {"FAMILLE":<45} {"FIL":>4} {"EDGES":>5} {"MET_BLQ":>7} {"GAIN":>5}  NOTE')
print(f'  {"─"*45} {"─"*4} {"─"*5} {"─"*7} {"─"*5}  {"─"*35}')
for fam, stats in sorted(family_stats.items(), key=lambda x: -len(family_gain.get(x[0], set()))):
    gain = family_gain.get(fam, set())
    note = ''
    for _, _, f2, n2 in proposals:
        if f2 == fam:
            note = n2[:40]
            break
    print(f'  {fam:<45} {len(stats["fils"]):>4} {stats["edges"]:>5} {len(stats["mets"]):>7} {len(gain):>5}  {note}')

print()
print('─── SIMULATION BFS ──────────────────────────────────────────────────────')
print()
print(f'  METIERs accessibles avant  : {len(met_avant)}')
print(f'  METIERs accessibles après  : {len(met_apres)}  (+{len(met_apres)-len(met_avant)})')
print(f'  Gain réel (nouveaux METIERs débloqués) : {len(newly_unbl)}')
print(f'  Couverture finale estimée  : {len(met_apres)}/{len(metiers)} ({100*len(met_apres)//len(metiers)}%)')
print()

print('─── METIERs débloqués (top 30 par volume de FILIEREs) ─────────────────')
print()
newly_sorted = sorted(newly_unbl, key=lambda m: -len(metier_filieres.get(str(m['id']),set())))
for i, m in enumerate(newly_sorted[:30], 1):
    mid = str(m['id'])
    nb  = len(metier_filieres.get(mid, set()))
    print(f'  {i:3}. ({nb:2} FIL)  "{m.get("nom_fr","")[:60]}"')
print()
if len(newly_sorted) > 30:
    print(f'  ... + {len(newly_sorted)-30} autres METIERs débloqués')
print()

print('─── MASTERS/DOCTORATS IGNORÉS (pas d\'accès direct BAC) ────────────────')
print()
for fil, level in sorted(skipped_masters, key=lambda x: x[0].get('nom_fr','')):
    print(f'  [{level}]  "{fil.get("nom_fr","")[:65]}"')
print()

print('─── CAS DANGEREUX ────────────────────────────────────────────────────────')
print()
if not dangerous:
    print('  AUCUN cas dangereux détecté.')
else:
    for fil, raison in dangerous:
        print(f'  DANGER : {raison}')
        print(f'    FIL : "{fil.get("nom_fr","")[:60]}"')
print()

print('─── VÉRIFICATIONS ───────────────────────────────────────────────────────')
print()
# Doublons dans les nouvelles arêtes
dup_check = Counter((str(fil['id']), src) for fil, src, _, _ in proposals)
nb_dup = sum(1 for v in dup_check.values() if v > 1)
# Source nodes valides
all_ids = {str(n['id']) for n in nodes}
invalid_src = sum(1 for _, src, _, _ in proposals if src not in all_ids)
invalid_tgt = sum(1 for fil, _, _, _ in proposals if str(fil['id']) not in all_ids)
print(f'  Doublons dans nouvelles arêtes  : {nb_dup}  (attendu 0)')
print(f'  Sources invalides               : {invalid_src}  (attendu 0)')
print(f'  Cibles invalides                : {invalid_tgt}  (attendu 0)')
print()
print('─' * 72)
print('STATUT : DRY-RUN — aucun fichier modifié.')
print('─' * 72)
