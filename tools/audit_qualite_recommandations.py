"""
AUDIT QUALITÉ RECOMMANDATIONS UTILISATEUR — SGPO
Lecture seule. Aucune modification. Rapport priorisé par impact utilisateur.
"""

import json, re, unicodedata, sys
from collections import defaultdict, Counter
from pathlib import Path

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

filieres  = {str(n['id']): n for n in nodes if n.get('type') == 'FILIERE'}
etabs     = {str(n['id']): n for n in nodes if n.get('type') == 'ETABLISSEMENT'}
metiers   = {str(n['id']): n for n in nodes if n.get('type') == 'METIER'}

filiere_etabs   = defaultdict(set)
etab_filieres   = defaultdict(set)
filiere_metiers = defaultdict(set)
metier_filieres = defaultdict(set)
filiere_bacs    = defaultdict(set)

for e in edges:
    s  = str(e.get('source_id', ''))
    t  = str(e.get('target_id', ''))
    lt = e.get('type_lien', '')
    if lt == 'OFFERTE_PAR':
        filiere_etabs[s].add(t)
        etab_filieres[t].add(s)
    elif lt == 'RECRUTEMENT':
        filiere_metiers[s].add(t)
        metier_filieres[t].add(s)
    elif lt == 'DONNE_ACCES':
        filiere_bacs[t].add(s)

# ─────────────────────────────────────────────────────────────────────────────
# CLASSIFICATION PRIVÉ / PUBLIC
# ─────────────────────────────────────────────────────────────────────────────
PRIVE_KEYWORDS = [
    'hem ', 'hem-', 'hec ', 'iga ', 'isiam', 'imbt', 'supemir', 'esith',
    'esgis', 'isfort', 'ofppt', 'privé', 'prive', 'ecole superieure privee',
    'institut superieur prive', 'groupe', 'campus', 'business school',
    'management school', 'engineering school', 'polytechnique agadir',
    'polytechnique de casablanca', 'mundiapolis', 'uir ', 'universite internationale',
    'universite privee', 'universite mohammed vi ', 'um6p', 'um6ss',
    'al akhawayn', 'aui', 'bouskoura', 'vatel', 'ostelea', 'esmod',
    'isit ', 'isd ', 'esig ', 'isga ', 'isca ', 'isg ', 'esgae',
    'centre de formation prive', 'cfp ', 'cfi ', 'sba ', 'adalia',
    'oxford', 'paris', 'internacional', 'global', 'excellence',
    'essec', 'emlyon', 'hec paris', 'sciences po',
    'ism ', 'iéseg', 'ieseg', 'isfcm', 'isefac',
    'emsi ', 'emsi-', 'groupe emsi', 'ecole marocaine des sciences',
    'ecole superieure de commerce', 'sup de co', 'escom',
    'esig', 'esac', 'esba', 'esmt', 'escp',
    'enam prive', 'formation continue',
    'digital school', 'code school', 'coding', 'bootcamp',
    'ensa prive', 'eps prive',
]

PUBLIC_KEYWORDS = [
    'universite cadi ayyad', 'universite mohammed v', 'universite ibnou tofail',
    'universite abdelmalek', 'universite hassan ii', 'universite mohammed premier',
    'universite ibn zohr', 'universite moulay ismail', 'universite sidi mohammed',
    'universite sultan moulay slimane', 'universite chouaib doukkali',
    'faculte', 'ecole nationale des sciences appliquees', 'ensa ',
    'ecole nationale de commerce', 'encg', 'emi ', 'ehtp', 'ensias', 'inpt',
    'ensam', 'iav ', 'enam ', 'cpge centre', 'centre cpge',
    'ispits', 'fmp ', 'fmd ', 'flsh', 'fsjes', 'fst ', 'fs ',
    'centre bts', 'centre ofppt', 'ista ', 'ismontic',
    'iscae', 'insea', 'iam rabat', 'crmef', 'enset',
    'ecole royale', 'academie royale', 'academie militaire',
    'ecole militaire', 'marine royale', 'gendarmerie',
]

def classify_etab(etab):
    n = norm(etab.get('nom_fr', '') + ' ' + etab.get('code', ''))
    s = norm(etab.get('secteur', ''))
    if any(kw in n for kw in PUBLIC_KEYWORDS):
        return 'public'
    if any(kw in n for kw in PRIVE_KEYWORDS):
        return 'prive'
    if 'public' in s or 'national' in s or 'royal' in s:
        return 'public'
    if 'prive' in s or 'private' in s:
        return 'prive'
    return 'inconnu'

etab_status = {eid: classify_etab(etab) for eid, etab in etabs.items()}

# ─────────────────────────────────────────────────────────────────────────────
# ANOMALIES DÉTECTÉES
# ─────────────────────────────────────────────────────────────────────────────

issues = []  # (priorité, catégorie, description, nœuds_impactés, recommandation, fix_type)
# fix_type : 'AUTO' | 'HUMAIN' | 'SCRAPING_WEB'

# ═══════════════════════════════════════════════════════════════════════════
# A1 — COÛTS PRIVÉ (IMPACT TRÈS HAUT)
# ═══════════════════════════════════════════════════════════════════════════
prives = [(eid, e) for eid, e in etabs.items() if etab_status[eid] == 'prive']
inconnus = [(eid, e) for eid, e in etabs.items() if etab_status[eid] == 'inconnu']
publics = [(eid, e) for eid, e in etabs.items() if etab_status[eid] == 'public']

prives_cout_zero = [(eid, e) for eid, e in prives if (e.get('cout_estime') or 0) == 0]
prives_cout_nonzero = [(eid, e) for eid, e in prives if (e.get('cout_estime') or 0) > 0]

# Frais sur filières privées
filieres_privees_sans_cout = []
for fid, fil in filieres.items():
    cout = fil.get('cout_estime') or 0
    for eid in filiere_etabs.get(fid, set()):
        if etab_status.get(eid) == 'prive' and cout == 0:
            filieres_privees_sans_cout.append((fid, fil, eid, etabs.get(eid,{})))
            break

issues.append((
    1, 'COÛTS — Établissements privés sans coût',
    f'{len(prives_cout_zero)} ETABs privés ont cout_estime=0. '
    f'Un élève ne peut pas comparer public/privé sans cette info.',
    len(prives_cout_zero),
    'Renseigner cout_estime (MAD/an) pour chaque ETAB privé',
    'SCRAPING_WEB'
))

issues.append((
    1, 'COÛTS — Filières privées sans coût',
    f'{len(filieres_privees_sans_cout)} filières dans un ETAB privé ont cout_estime=0.',
    len(filieres_privees_sans_cout),
    'Récupérer les frais de scolarité par programme sur les sites officiels',
    'SCRAPING_WEB'
))

# ═══════════════════════════════════════════════════════════════════════════
# A2 — INCOHÉRENCES DE VILLE (IMPACT TRÈS HAUT)
# ═══════════════════════════════════════════════════════════════════════════
ville_incoherences = []
for fid, fil in filieres.items():
    fil_ville = (fil.get('ville') or '').strip()
    if not fil_ville:
        continue
    for eid in filiere_etabs.get(fid, set()):
        etab = etabs.get(eid, {})
        etab_ville = (etab.get('ville') or '').strip()
        if etab_ville and fil_ville and norm(fil_ville) != norm(etab_ville):
            ville_incoherences.append({
                'filiere': fil.get('nom_fr','')[:55],
                'fil_ville': fil_ville,
                'etab': etab.get('nom_fr','')[:55],
                'etab_ville': etab_ville,
            })

issues.append((
    2, 'VILLE — Filière dans une ville ≠ ETAB',
    f'{len(ville_incoherences)} filières ont une ville différente de leur ETAB. '
    f'Le BFS retourne des résultats géographiquement incohérents.',
    len(ville_incoherences),
    'Propager la ville de l\'ETAB vers ses filières (ville_fil ← ville_etab)',
    'AUTO'
))

# ═══════════════════════════════════════════════════════════════════════════
# A3 — DURÉES ABERRANTES (IMPACT HAUT)
# ═══════════════════════════════════════════════════════════════════════════
duree_zero = [(fid, f) for fid, f in filieres.items()
              if (f.get('duree_mois') or 0) == 0
              and f.get('code','').startswith('F') ]  # vraies filières post-bac

duree_trop_longue = [(fid, f) for fid, f in filieres.items()
                     if (f.get('duree_mois') or 0) > 120]  # >10 ans

duree_incoherente = []  # Mêmes noms, durées très différentes
nom_durees = defaultdict(list)
for fid, fil in filieres.items():
    nn = norm(fil.get('nom_fr',''))[:40]
    d  = fil.get('duree_mois') or 0
    if d > 0 and nn:
        nom_durees[nn].append((d, fid, fil.get('nom_fr','')))

for nn, lst in nom_durees.items():
    durees = [x[0] for x in lst]
    if len(durees) >= 2 and max(durees) - min(durees) > 24:
        duree_incoherente.append((nn, lst))

issues.append((
    2, 'DURÉE — Filières post-bac avec durée=0',
    f'{len(duree_zero)} filières post-bac ont duree_mois=0. '
    f'Impossible de calculer la durée totale d\'un parcours.',
    len(duree_zero),
    'Inférer la durée depuis le nom (Licence→36, Master→60, BTS→24, DUT→24, Ingénieur→60)',
    'AUTO'
))

issues.append((
    3, 'DURÉE — Même filière avec durées très différentes',
    f'{len(duree_incoherente)} groupes de filières similaires ont des durées qui diffèrent >24 mois.',
    sum(len(v) for v in duree_incoherente),
    'Normaliser les durées par type de diplôme',
    'HUMAIN'
))

if duree_trop_longue:
    issues.append((
        3, 'DURÉE — Filières avec durée > 10 ans',
        f'{len(duree_trop_longue)} filières ont duree_mois > 120 mois.',
        len(duree_trop_longue),
        'Corriger manuellement',
        'HUMAIN'
    ))

# ═══════════════════════════════════════════════════════════════════════════
# A4 — SECTEUR VIDE OU INCOHÉRENT (IMPACT HAUT)
# ═══════════════════════════════════════════════════════════════════════════
fil_sans_secteur = [(fid, f) for fid, f in filieres.items()
                    if not (f.get('secteur') or '').strip()
                    and f.get('code','').startswith('F')]

etab_sans_secteur = [(eid, e) for eid, e in etabs.items()
                     if not (e.get('secteur') or '').strip()]

metier_sans_secteur = [(mid, m) for mid, m in metiers.items()
                       if not (m.get('secteur') or '').strip()]

issues.append((
    2, 'SECTEUR — Filières sans secteur',
    f'{len(fil_sans_secteur)} filières post-bac ont secteur="" — impossible de vérifier cohérence métier.',
    len(fil_sans_secteur),
    'Inférer secteur depuis le nom de la filière (règles par mots-clés)',
    'AUTO'
))

issues.append((
    3, 'SECTEUR — ETABs sans secteur',
    f'{len(etab_sans_secteur)} établissements ont secteur="".',
    len(etab_sans_secteur),
    'Inférer depuis le nom (ENSA→Ingénierie, FSJES→Droit/Économie...)',
    'AUTO'
))

# ═══════════════════════════════════════════════════════════════════════════
# A5 — INCOHÉRENCE MÉTIER ↔ FORMATION (IMPACT TRÈS HAUT)
# ═══════════════════════════════════════════════════════════════════════════
DOMAIN_MAP = {
    'medecin': ['medecine', 'fmp', 'chirurgie', 'sante'],
    'pharmacien': ['pharmacie', 'fmp'],
    'dentiste': ['dentaire', 'fmd', 'odontologie'],
    'avocat': ['droit', 'fsjes', 'juridique'],
    'notaire': ['droit', 'notariat'],
    'architecte': ['architecture', 'ensau'],
    'ingenieur': ['genie', 'ingenieur', 'cpge', 'ensa', 'emi', 'ehtp'],
    'comptable': ['comptabilite', 'finance', 'audit', 'gestion'],
    'infirmier': ['soins', 'infirm', 'paramedical', 'ispits'],
    'enseignant': ['enseignement', 'crmef', 'pedagogie'],
    'journaliste': ['journalisme', 'communication', 'media'],
    'informaticien': ['informatique', 'numerique', 'data', 'cyber', 'reseaux'],
    'agronome': ['agronomie', 'iav', 'agriculture'],
}

mismatches = []
for mid, met in metiers.items():
    met_norm = norm(met.get('nom_fr', ''))
    met_sector = norm(met.get('secteur', ''))
    domain_kw = None
    for kw, domain_fils in DOMAIN_MAP.items():
        if kw in met_norm:
            domain_kw = (kw, domain_fils)
            break
    if not domain_kw:
        continue
    kw, domain_fils = domain_kw
    for fid in metier_filieres.get(mid, set()):
        fil = filieres.get(fid, {})
        fil_norm = norm(fil.get('nom_fr', ''))
        if fil_norm and not any(d in fil_norm for d in domain_fils):
            # Filière clairement hors domaine
            if any(bad in fil_norm for bad in ['tourisme', 'hotellerie', 'arabe', 'lettres', 'litterature']):
                mismatches.append({
                    'metier': met.get('nom_fr','')[:45],
                    'filiere': fil.get('nom_fr','')[:55],
                    'fid': fid, 'mid': mid,
                })

issues.append((
    1, 'COHÉRENCE — RECRUTEMENT métier→filière pédagogiquement absurde',
    f'{len(mismatches)} liaisons RECRUTEMENT relient une filière à un métier '
    f'de domaine incompatible (ex: Médecin via formation Tourisme).',
    len(set(x["mid"] for x in mismatches)),
    'Supprimer les arêtes RECRUTEMENT incohérentes entre domaines',
    'HUMAIN'
))

# ═══════════════════════════════════════════════════════════════════════════
# A6 — FILIÈRES DUPLIQUÉES / À FUSIONNER (IMPACT MOYEN)
# ═══════════════════════════════════════════════════════════════════════════
nom_counts = Counter()
nom_filieres = defaultdict(list)
for fid, fil in filieres.items():
    nn = norm(fil.get('nom_fr', ''))
    if len(nn) > 10:
        nom_counts[nn] += 1
        nom_filieres[nn].append((fid, fil))

exact_dups = {nn: lst for nn, lst in nom_filieres.items() if len(lst) >= 2}

# Quasi-doublons (même nom, établissements différents, même ville)
quasi_dups_meme_etab = []
for nn, lst in exact_dups.items():
    etab_sets = []
    for fid, fil in lst:
        etab_sets.append(filiere_etabs.get(fid, set()))
    # Plusieurs filières même nom dans le même ETAB
    if len(lst) >= 3:
        flat = [e for es in etab_sets for e in es]
        if len(flat) != len(set(flat)):
            quasi_dups_meme_etab.append((nn, lst))

issues.append((
    3, 'DOUBLONS — Filières avec nom identique',
    f'{len(exact_dups)} noms de filières apparaissent ≥2 fois '
    f'({sum(len(v) for v in exact_dups.values())} filières au total). '
    f'Risque de parcours dupliqués dans les résultats.',
    sum(len(v) for v in exact_dups.values()),
    'Dédupliquer ou grouper les résultats identiques dans l\'UI',
    'HUMAIN'
))

# ═══════════════════════════════════════════════════════════════════════════
# A7 — ÉTABLISSEMENTS PRIVÉS SURREPRÉSENTÉS (IMPACT HAUT)
# ═══════════════════════════════════════════════════════════════════════════
prive_fil_count = Counter()
public_fil_count = Counter()

for eid, e in etabs.items():
    nb = len(etab_filieres.get(eid, set()))
    if nb == 0:
        continue
    if etab_status[eid] == 'prive':
        prive_fil_count[e.get('nom_fr','')[:50]] = nb
    elif etab_status[eid] == 'public':
        public_fil_count[e.get('nom_fr','')[:50]] = nb

top_prive = prive_fil_count.most_common(15)
top_public = public_fil_count.most_common(15)

total_fil_prive  = sum(len(etab_filieres.get(eid,set())) for eid,_ in prives)
total_fil_public = sum(len(etab_filieres.get(eid,set())) for eid,_ in publics)

issues.append((
    2, 'BIAIS — Répartition public/privé dans les filières',
    f'Privé : {total_fil_prive} filières liées. Public : {total_fil_public} filières liées. '
    f'Ratio: {total_fil_prive/(total_fil_public+1):.1f}x plus de filières privées que publiques. '
    f'Risque de survaloriser des écoles privées moins réputées.',
    total_fil_prive,
    'Ajouter un badge PUBLIC/PRIVÉ visible + trier public en premier à score égal',
    'AUTO'
))

# ═══════════════════════════════════════════════════════════════════════════
# A8 — ETABs PUBLICS IMPORTANTS ABSENTS (IMPACT HAUT)
# ═══════════════════════════════════════════════════════════════════════════
ETABS_PUBLICS_MANQUANTS_REFERENCES = [
    'Ecole Nationale Superieure d\'Electricite et de Mecanique',
    'Ecole Mohammadia d\'Ingenieurs',  # vérifié présent
    'Ecole Nationale Superieure des Mines de Rabat',
    'Institut National des Postes et Telecommunications',  # vérifié présent
    'CRMEF — Centre Regional des Metiers de l\'Education',
    'Ecole Nationale de Commerce et de Gestion de Settat',
    'Ecole Nationale de Commerce et de Gestion de Tanger',
    'Institut National d\'Aménagement et d\'Urbanisme',
    'Ecole Nationale Forestiere des Ingenieurs',
    'Institut Agronomique et Veterinaire Hassan II Rabat',  # IAV vérifié présent
]

etab_noms_norm = {norm(e.get('nom_fr','')): eid for eid, e in etabs.items()}
manquants_confirms = []
for ref in ETABS_PUBLICS_MANQUANTS_REFERENCES:
    nn = norm(ref)
    # Recherche partielle
    found = any(nn[:25] in k or k[:25] in nn for k in etab_noms_norm)
    if not found:
        manquants_confirms.append(ref)

issues.append((
    2, 'DONNÉES MANQUANTES — ETABs publics importants absents ou sans filières',
    f'{len(manquants_confirms)} établissements publics de référence potentiellement '
    f'absents du graphe (à vérifier).',
    len(manquants_confirms),
    'Scraper et ajouter ces établissements avec leurs filières',
    'SCRAPING_WEB'
))

# ═══════════════════════════════════════════════════════════════════════════
# A9 — FILIÈRES TROP GÉNÉRIQUES (IMPACT MOYEN)
# ═══════════════════════════════════════════════════════════════════════════
generiques = [(fid, f) for fid, f in filieres.items()
              if norm(f.get('nom_fr','')) in [
                  'licence', 'master', 'doctorat', 'bts', 'dut',
                  'formation', 'diplome', 'cycle ingenieur', 'bac+3', 'bac+5'
              ]]

issues.append((
    4, 'QUALITÉ NOM — Filières avec nom trop générique',
    f'{len(generiques)} filières ont un nom non informatif pour l\'élève.',
    len(generiques),
    'Renommer avec le domaine (ex: "Licence" → "Licence en Informatique")',
    'HUMAIN'
))

# ═══════════════════════════════════════════════════════════════════════════
# A10 — SCORE_IA = 0 PARTOUT (IMPACT HAUT)
# ═══════════════════════════════════════════════════════════════════════════
scores_zero_fil = sum(1 for f in filieres.values() if (f.get('score_ia') or 0) == 0)
scores_zero_met = sum(1 for m in metiers.values() if (m.get('score_ia') or 0) == 0)
scores_zero_etab = sum(1 for e in etabs.values() if (e.get('score_ia') or 0) == 0)

issues.append((
    2, 'SCORE — score_ia = 0 sur tous les nœuds',
    f'{scores_zero_fil}/{len(filieres)} filières, {scores_zero_met}/{len(metiers)} métiers '
    f'et {scores_zero_etab}/{len(etabs)} ETABs ont score_ia=0. '
    f'Le tri par pertinence IA est inopérant.',
    scores_zero_fil + scores_zero_met + scores_zero_etab,
    'Calculer un score_ia basé sur : demande marché + taux_reussite + cout + durée + réputation ETAB',
    'HUMAIN'
))

# ═══════════════════════════════════════════════════════════════════════════
# A11 — TAUX_REUSSITE UNIFORMES (IMPACT MOYEN)
# ═══════════════════════════════════════════════════════════════════════════
taux = [e.get('taux_reussite') for e in edges if e.get('taux_reussite') is not None]
taux_counter = Counter(taux)
top_taux = taux_counter.most_common(5)
uniform_taux = sum(c for v, c in taux_counter.items() if v in [74, 76, 100, 65, 60])

issues.append((
    3, 'SCORE — taux_reussite figé sur quelques valeurs',
    f'Sur {len(taux)} arêtes avec taux_reussite, {uniform_taux} ({100*uniform_taux//max(len(taux),1)}%) '
    f'ont des valeurs figées ({top_taux}). '
    f'Le taux affiché est une valeur par défaut, pas une vraie donnée.',
    len(taux),
    'Calculer taux_reussite réel depuis données officielles (statistiques concours)',
    'SCRAPING_WEB'
))

# ═══════════════════════════════════════════════════════════════════════════
# A12 — ETABs PRIVÉS AVEC NOMS GÉNÉRIQUES / NON-IDENTIFIABLES (IMPACT MOYEN)
# ═══════════════════════════════════════════════════════════════════════════
NOMS_SUSPECTS = ['prive', 'privee', 'superieur prive', 'formation prive',
                 'etablissement consolide', 'enrichir les parcours']
etabs_nom_suspect = [(eid, e) for eid, e in etabs.items()
                     if any(kw in norm(e.get('nom_fr','')) for kw in NOMS_SUSPECTS)
                     or any(kw in norm(e.get('description','')) for kw in NOMS_SUSPECTS)]

issues.append((
    3, 'QUALITÉ NOM — ETABs avec description générique ("Etablissement consolide...")',
    f'{len(etabs_nom_suspect)} établissements ont une description générique non-informative '
    f'("Etablissement consolide pour enrichir les parcours"). '
    f'Un élève ne peut pas identifier l\'établissement.',
    len(etabs_nom_suspect),
    'Rédiger une description courte réelle pour chaque ETAB',
    'HUMAIN'
))

# ═══════════════════════════════════════════════════════════════════════════
# A13 — FILIÈRES SANS VILLE (IMPACT HAUT — filtre géo inopérant)
# ═══════════════════════════════════════════════════════════════════════════
# Filières avec ETAB qui a une ville, mais la filière elle-même n'a pas de ville
fil_sans_ville_mais_etab_a_ville = []
for fid, fil in filieres.items():
    if fil.get('ville'):
        continue
    for eid in filiere_etabs.get(fid, set()):
        etab = etabs.get(eid, {})
        if etab.get('ville'):
            fil_sans_ville_mais_etab_a_ville.append((fid, fil, etab))
            break

issues.append((
    2, 'VILLE — Filières sans ville alors que l\'ETAB est localisé',
    f'{len(fil_sans_ville_mais_etab_a_ville)} filières n\'ont pas de ville '
    f'mais leur ETAB si. Le filtre géographique ne fonctionne pas pour elles.',
    len(fil_sans_ville_mais_etab_a_ville),
    'Propager automatiquement la ville de l\'ETAB vers ses filières',
    'AUTO'
))

# ═══════════════════════════════════════════════════════════════════════════
# A14 — MÉTIERS SANS DESCRIPTION UTILE (IMPACT MOYEN)
# ═══════════════════════════════════════════════════════════════════════════
met_desc_generique = [(mid, m) for mid, m in metiers.items()
                      if not m.get('description')
                      or norm(m.get('description','')) in ['', 'metier cible du secteur']
                      or m.get('description','').startswith('Metier cible du secteur')]

issues.append((
    4, 'QUALITÉ — Métiers avec description vide ou générique',
    f'{len(met_desc_generique)} métiers ont une description "Metier cible du secteur X" '
    f'ou vide — inutile pour un élève qui explore les options de carrière.',
    len(met_desc_generique),
    'Enrichir les descriptions depuis ANAPEC / Tawjihi / fiches métier officielles',
    'SCRAPING_WEB'
))

# ═══════════════════════════════════════════════════════════════════════════
# A15 — FILIÈRES EN ARABE SANS NOM FRANÇAIS (IMPACT MOYEN)
# ═══════════════════════════════════════════════════════════════════════════
fil_sans_nom_fr = [(fid, f) for fid, f in filieres.items()
                   if not (f.get('nom_fr') or '').strip()
                   and (f.get('nom_ar') or '').strip()]

issues.append((
    4, 'QUALITÉ — Filières sans nom français',
    f'{len(fil_sans_nom_fr)} filières ont uniquement un nom arabe. '
    f'L\'interface francophone ne les affiche pas correctement.',
    len(fil_sans_nom_fr),
    'Translittérer ou traduire le nom arabe',
    'HUMAIN'
))

# ─────────────────────────────────────────────────────────────────────────────
# RAPPORT
# ─────────────────────────────────────────────────────────────────────────────
SEP = '═' * 72
sep = '─' * 72

print(SEP)
print('  AUDIT QUALITÉ RECOMMANDATIONS — SGPO / E-Tawjihi')
print(SEP)
print()
print(f'  Nœuds analysés : {len(nodes):,} | Arêtes : {len(edges):,}')
print(f'  ETABs : {len(etabs)} total | Privés : {len(prives)} | Publics : {len(publics)} | Inconnus : {len(inconnus)}')
print()

issues.sort(key=lambda x: x[0])

FIX_LABELS = {'AUTO': '[AUTO]  ', 'HUMAIN': '[HUMAIN]', 'SCRAPING_WEB': '[WEB]   '}
PRIO_LABELS = {1: '🔴 P1 — CRITIQUE', 2: '🟠 P2 — HAUT', 3: '🟡 P3 — MOYEN', 4: '🟢 P4 — FAIBLE'}

for prio, cat, desc, nb, reco, fix in issues:
    label = PRIO_LABELS.get(prio, str(prio))
    fix_label = FIX_LABELS.get(fix, fix)
    print(f'┌── {label} ─ {cat}')
    print(f'│  Nœuds impactés : {nb}')
    # Wrap description
    words = desc.split()
    line = ''
    for w in words:
        if len(line) + len(w) > 68:
            print(f'│  {line}')
            line = w + ' '
        else:
            line += w + ' '
    if line.strip():
        print(f'│  {line.strip()}')
    print(f'│  Correction : {reco[:68]}')
    print(f'│  Fix type   : {fix_label}')
    print(f'└{"─"*70}')
    print()

# ─────────────────────────────────────────────────────────────────────────────
# SYNTHÈSE COÛTS — PRIVÉ
# ─────────────────────────────────────────────────────────────────────────────
print(SEP)
print('  AUDIT COÛTS — ÉTABLISSEMENTS PRIVÉS')
print(SEP)
print()
print(f'  ETABs privés détectés       : {len(prives)}')
print(f'  ETABs privés cout_estime=0  : {len(prives_cout_zero)}  ({100*len(prives_cout_zero)//max(len(prives),1)}%)')
print(f'  ETABs privés avec un coût   : {len(prives_cout_nonzero)}')
print()
if prives_cout_nonzero:
    print('  ETABs privés avec coût renseigné :')
    for eid, e in sorted(prives_cout_nonzero, key=lambda x: -(x[1].get('cout_estime') or 0)):
        print(f'    {e.get("cout_estime",0):>8} MAD/an — {e.get("nom_fr","")[:55]}')
    print()

print('  Top 20 ETABs privés détectés (sans coût) :')
shown = 0
for eid, e in prives_cout_zero[:20]:
    nb_fil = len(etab_filieres.get(eid, set()))
    print(f'    [{nb_fil:3} FIL]  {e.get("nom_fr","")[:60]}')
    shown += 1
print()

print('  Fourchettes tarifaires réelles (référence web marocaine) :')
TARIFS_REF = [
    ('École privée type IGA / ISIAM / HEM / EMSI',   '25 000 – 55 000 MAD/an'),
    ('UIR (Université Internationale de Rabat)',       '50 000 – 80 000 MAD/an'),
    ('Al Akhawayn University (AUI)',                   '90 000 – 130 000 MAD/an'),
    ('UM6P (Université Mohammed VI Polytechnique)',    '60 000 – 90 000 MAD/an'),
    ('Mundiapolis',                                    '35 000 – 55 000 MAD/an'),
    ('HEC Maroc / ISCAE (concours public)',            '12 000 – 25 000 MAD/an'),
    ('ENCG (public concours)',                         '5 000 – 8 000 MAD/an'),
    ('ENSA / EMI / EHTP / ENSIAS (public concours)',   '2 000 – 6 000 MAD/an'),
    ('Faculté publique (FSJES / FST / FS)',            '500 – 2 000 MAD/an'),
    ('ISPITS (public — paraméd.)',                     '1 000 – 3 000 MAD/an'),
    ('OFPPT / ISTA (public — formation pro)',          '1 000 – 2 500 MAD/an'),
]
for label, tarif in TARIFS_REF:
    print(f'    {label:<50}  {tarif}')
print()

# ─────────────────────────────────────────────────────────────────────────────
# VILLE — DÉTAIL
# ─────────────────────────────────────────────────────────────────────────────
print(SEP)
print('  INCOHÉRENCES DE VILLE — DÉTAIL (30 premiers)')
print(SEP)
print()
for v in ville_incoherences[:30]:
    print(f'  FIL : {v["filiere"][:52]}  [ville={v["fil_ville"]}]')
    print(f'  ETAB: {v["etab"][:52]}  [ville={v["etab_ville"]}]')
    print()

# ─────────────────────────────────────────────────────────────────────────────
# RECRUTEMENT INCOHÉRENT — DÉTAIL
# ─────────────────────────────────────────────────────────────────────────────
print(SEP)
print('  RECRUTEMENT INCOHÉRENT — DÉTAIL (30 premiers)')
print(SEP)
print()
for m in mismatches[:30]:
    print(f'  METIER  : {m["metier"]}')
    print(f'  FILIERE : {m["filiere"]}')
    print()

# ─────────────────────────────────────────────────────────────────────────────
# FILIÈRES SANS VILLE — DÉTAIL (20)
# ─────────────────────────────────────────────────────────────────────────────
print(SEP)
print('  FILIÈRES SANS VILLE (ETAB localisé) — 20 premiers')
print(SEP)
print()
for fid, fil, etab in fil_sans_ville_mais_etab_a_ville[:20]:
    print(f'  FIL  : {fil.get("nom_fr","")[:55]}')
    print(f'  ETAB : {etab.get("nom_fr","")[:55]}  → ville={etab.get("ville","")}')
    print()

# ─────────────────────────────────────────────────────────────────────────────
# DURÉES INCOHERENTES — DÉTAIL
# ─────────────────────────────────────────────────────────────────────────────
print(SEP)
print(f'  DURÉES ABERRANTES — FILIÈRES POST-BAC (duree_mois=0) — 30 premiers')
print(SEP)
print()
for fid, f in list(duree_zero)[:30]:
    nb_etabs = len(filiere_etabs.get(fid, set()))
    print(f'  [{nb_etabs:2} ETAB]  {f.get("nom_fr","")[:60]}')
print()

# ─────────────────────────────────────────────────────────────────────────────
# SYNTHÈSE FINALE
# ─────────────────────────────────────────────────────────────────────────────
print(SEP)
print('  SYNTHÈSE — PRIORITÉ D\'ACTION')
print(SEP)
print()
print('  CE QUI PEUT ÊTRE CORRIGÉ AUTOMATIQUEMENT :')
auto_items = [(cat, nb) for _, cat, _, nb, _, fix in issues if fix == 'AUTO']
for cat, nb in auto_items:
    print(f'    • {cat[:60]}  ({nb} nœuds)')
print()

print('  CE QUI NÉCESSITE VALIDATION HUMAINE :')
humain_items = [(cat, nb) for _, cat, _, nb, _, fix in issues if fix == 'HUMAIN']
for cat, nb in humain_items:
    print(f'    • {cat[:60]}  ({nb} nœuds)')
print()

print('  CE QUI NÉCESSITE SCRAPING / VÉRIFICATION WEB :')
web_items = [(cat, nb) for _, cat, _, nb, _, fix in issues if fix == 'SCRAPING_WEB']
for cat, nb in web_items:
    print(f'    • {cat[:60]}  ({nb} nœuds)')
print()

total_p1 = sum(nb for p, _, _, nb, _, _ in issues if p == 1)
total_p2 = sum(nb for p, _, _, nb, _, _ in issues if p == 2)
print(f'  Nœuds impactés P1 (CRITIQUE) : {total_p1:,}')
print(f'  Nœuds impactés P2 (HAUT)     : {total_p2:,}')
print()
print('  STATUT : DRY-RUN — aucun fichier modifié.')
print(sep)
