"""
DRY-RUN — Audit classification PUBLIC / PRIVÉ / INCONNU de tous les ETABLISSEMENTs
Simule pathUtils.js isPublicEducationStep / isPrivateEducationStep (ancienne logique)
Propose une whitelist publique explicite + blacklist privée étendue (nouvelle logique)
Ne modifie aucun fichier.
"""

import json, re, unicodedata, sys
from pathlib import Path
from collections import Counter

sys.stdout.reconfigure(encoding='utf-8')

DATA = 'backend/src/main/resources/data'
NODES_PATH = Path(f'{DATA}/nodes_all.json')

with open(NODES_PATH, 'r', encoding='utf-8') as f:
    nodes = json.load(f)

# ── NORMALISATION (équivalente à pathUtils.js normalizeForRules) ──────────────
def normalize(s):
    s = (s or '').upper().strip()
    s = unicodedata.normalize('NFD', s)
    s = ''.join(c for c in s if unicodedata.category(c) != 'Mn')
    s = re.sub(r"[''`\-]", ' ', s)
    s = re.sub(r'[^\w\s]', ' ', s)
    return re.sub(r'\s+', ' ', s).strip()

# ── ANCIENNE LOGIQUE (pathUtils.js actuel) ────────────────────────────────────
PRIVATE_OLD_RE = re.compile(
    r'\b(UM6SS|UM6P|MUNDIAPOLIS|ISGA|IGA|EMSI|HEM|SUPRH|VATEL|ADALIA|MATCI|OSTELEA|ISIAM'
    r'|ESCA|HECI|UIR|UPM|UNIVERSITE INTERNATIONALE DE RABAT|UNIVERSITE PRIVEE|ECOLE PRIVEE'
    r'|INSTITUT PRIVE|ECOLE MOHAMMED VI DE MEDECINE VETERINAIRE|EM6MV|EGE'
    r'|ECOLE DE GUERRE ECONOMIQUE|ABULCASIS|FPMM|ESGB|IHE PARIS|SUPMTI|HESTIM'
    r'|ISFORT|UIC|GROUPE IGS)\b'
)
PUBLIC_OLD_RE = re.compile(
    r'\b(FSJES|FACULTE|UNIVERSITE HASSAN|UNIVERSITE MOHAMMED|UNIVERSITE IBN|UNIVERSITE SIDI'
    r'|UNIVERSITE CADI|UNIVERSITE ABDELMALEK|ENA|ECOLE NATIONALE D ARCHITECTURE|ENCG|ENSA'
    r'|ECOLE NATIONALE DES SCIENCES APPLIQUEES|ENSAM|ENSIAS|ENSEM'
    r'|ECOLE NATIONALE SUPERIEURE D ELECTRICITE|EMI|EHTP|INPT|INSEA|IAV|EST|FST|FLSH'
    r'|ISCAE|INSTITUT SUPERIEUR DE COMMERCE)\b'
)

def classify_old(text):
    is_priv = bool(PRIVATE_OLD_RE.search(text))
    is_pub  = bool(PUBLIC_OLD_RE.search(text)) and not is_priv
    if is_pub:                  return 'PUBLIC'
    if is_priv:                 return 'PRIVE'
    return 'INCONNU'

# ── NOUVELLE LOGIQUE — whitelist explicite + blacklist étendue ────────────────
# Privés connus (tous les établissements privés identifiés dans le graphe)
PRIVATE_NEW_RE = re.compile(
    r'\b('
    # Existants dans l'ancienne liste
    r'UM6SS|UM6P|MUNDIAPOLIS|ISGA|IGA|EMSI|HEM|SUPRH|VATEL|ADALIA|MATCI|OSTELEA|ISIAM'
    r'|ESCA|HECI|UIR|UPM|UNIVERSITE INTERNATIONALE DE RABAT|UNIVERSITE PRIVEE|ECOLE PRIVEE'
    r'|INSTITUT PRIVE|ECOLE MOHAMMED VI DE MEDECINE VETERINAIRE|EM6MV|EGE'
    r'|ECOLE DE GUERRE ECONOMIQUE|ABULCASIS|FPMM|ESGB|IHE PARIS|SUPMTI|HESTIM'
    r'|ISFORT|UIC|GROUPE IGS'
    # Ajouts nouveaux
    r'|EUROMED|UEMF|UNIVERSITE EURO MEDITERRANEENNE'
    r'|HEC\b|HEC MAROC|HECMAROC'
    r'|POLYPREPAS|POLY PREPAS'
    r'|COMSUP|ARTCOM|ART COM|SUPH\b|SUP H\b'
    r'|SUPMANAGEMENT|SUPTECH|ESIG\b|ISEFAR|ISTT\b|ISTAG\b|CEFOR\b|CFPJ\b|CISE\b'
    r'|CREAI\b|CRIP\b|ESPOD\b|HTMS\b|SUPINFO\b'
    r'|AL AKHAWAYN'
    r'|UNIVERSITE INTERNATIONALE(?! DE RABAT)'  # catch autres UNIV INTERNAT
    r'|ECOLE SUPERIEURE PRIVEE|ECOLE PRIVEE|CENTRE PRIVE'
    r'|POLYTECH MAROC|AITECH|ISTA PRIVE'
    r')\b'
)

# Publics confirmés — whitelist stricte (acronymes + noms d'universités publiques)
PUBLIC_NEW_RE = re.compile(
    r'\b('
    # Facultés publiques (acronymes)
    r'FSJES\b|FLSH\b|FST\b|FSBM\b|FSR\b|FSD\b|FSM\b|FSK\b|FSA\b|FSO\b|FSG\b'
    r'|FMP\b|FMPR\b|FMPO\b|FMPC\b|FMPK\b|FMPM\b|FMPDC\b'
    r'|FMD\b|FMDS\b|FMDC\b|FMDM\b'
    # Grandes écoles publiques nationales
    r'|ENCG\b|ENSA\b|ENSAM\b|ENSIAS\b|ENSEM\b|ENSC\b'
    r'|EMI\b|EHTP\b|INPT\b|INSEA\b|ISCAE\b|IAV\b|ISPITS\b'
    # Accronymes unambigus publics
    r'|ECOLE NATIONALE D ARCHITECTURE'
    r'|ECOLE NATIONALE DES SCIENCES APPLIQUEES'
    r'|ECOLE NATIONALE SUPERIEURE D ELECTRICITE'
    r'|ECOLE NATIONALE SUPERIEURE D INFORMATIQUE'
    r'|ECOLE NATIONALE SUPERIEURE D ARTS ET METIERS'
    r'|ECOLE HASSANIA DES TRAVAUX PUBLICS'
    r'|ECOLE NATIONALE SUPERIEURE DE CHIMIE'
    r'|ECOLE SUPERIEURE DE TECHNOLOGIE(?!.*PRIVEE)'
    r'|ECOLE NATIONALE DE COMMERCE ET DE GESTION'
    r'|INSTITUT NATIONAL DE STATISTIQUE'
    r'|INSTITUT NATIONAL DES POSTES'
    r'|ECOLE NATIONALE SUPERIEURE D ADMINISTRATION'
    r'|CRMEF\b|CPR\b|AREF\b'
    # Universités publiques marocaines (noms caractéristiques)
    r'|UNIVERSITE HASSAN'
    r'|UNIVERSITE MOHAMMED V(?! *(VI|6))'   # évite UM6P/UM6SS
    r'|UNIVERSITE IBN TOFAIL|UNIVERSITE IBN ZOHR|UNIVERSITE IBN KHALDOUN'
    r'|UNIVERSITE SIDI MOHAMMED'
    r'|UNIVERSITE CADI AYYAD'
    r'|UNIVERSITE ABDELMALEK ESSAADI'
    r'|UNIVERSITE SULTAN MOULAY SLIMANE'
    r'|UNIVERSITE MOULAY ISMAIL'
    r'|UNIVERSITE CHOUAIB DOUKKALI'
    r'|UNIVERSITE MOHAMMED PREMIER'
    r'|UNIVERSITE MOHAMMED VI(?!.*(?:SANTE|MEDECINE|VETERINAIRE|UM6))'  # cas limite
    r')\b'
)

def classify_new(text):
    is_priv = bool(PRIVATE_NEW_RE.search(text))
    is_pub  = bool(PUBLIC_NEW_RE.search(text)) and not is_priv
    if is_pub:   return 'PUBLIC'
    if is_priv:  return 'PRIVE'
    return 'INCONNU'

# ── ANALYSE ───────────────────────────────────────────────────────────────────
etabs = [n for n in nodes if n.get('type') == 'ETABLISSEMENT']

results = []
for etab in etabs:
    nom   = etab.get('nom_fr', '') or ''
    code  = etab.get('code', '') or ''
    desc  = etab.get('description', '') or ''
    ville = etab.get('ville', '') or ''
    cout  = etab.get('cout_estime') or 0
    text  = normalize(f"{code} {nom} {desc[:300]}")

    old_c = classify_old(text)
    new_c = classify_new(text)
    results.append({
        'id':   etab.get('id', ''),
        'nom':  nom,
        'code': code,
        'ville': ville,
        'cout': cout,
        'old':  old_c,
        'new':  new_c,
        'changed': old_c != new_c,
        'txt': text[:150],
    })

# ── RAPPORT ───────────────────────────────────────────────────────────────────
SEP  = '═' * 72
sep  = '─' * 72

print(SEP)
print('  DRY-RUN — AUDIT CLASSIFICATION PUBLIC / PRIVÉ / INCONNU')
print('  Aucun fichier modifié.')
print(SEP)
print()

old_counts = Counter(r['old'] for r in results)
new_counts = Counter(r['new'] for r in results)

print('  ── ANCIENNE LOGIQUE (pathUtils.js actuel) ──────────────────────────')
for k in ('PUBLIC', 'PRIVE', 'INCONNU'):
    print(f'     {k:<10} : {old_counts[k]:4d} ETABs')
print()

print('  ── NOUVELLE LOGIQUE (whitelist + blacklist étendue) ────────────────')
for k in ('PUBLIC', 'PRIVE', 'INCONNU'):
    delta = new_counts[k] - old_counts[k]
    sign = f'+{delta}' if delta > 0 else str(delta)
    print(f'     {k:<10} : {new_counts[k]:4d} ETABs  ({sign})')
print()

# Statistiques des changements
changed = [r for r in results if r['changed']]
pub_to_prive   = [r for r in changed if r['old'] == 'PUBLIC'  and r['new'] == 'PRIVE']
pub_to_inconnu = [r for r in changed if r['old'] == 'PUBLIC'  and r['new'] == 'INCONNU']
inc_to_pub     = [r for r in changed if r['old'] == 'INCONNU' and r['new'] == 'PUBLIC']
inc_to_prive   = [r for r in changed if r['old'] == 'INCONNU' and r['new'] == 'PRIVE']
priv_to_pub    = [r for r in changed if r['old'] == 'PRIVE'   and r['new'] == 'PUBLIC']

print(f'  ── CHANGEMENTS ({len(changed)} ETABs concernés) ─────────────────────────')
print(f'     PUBLIC → PRIVÉ          : {len(pub_to_prive):4d}')
print(f'     PUBLIC → INCONNU        : {len(pub_to_inconnu):4d}  ← RECLASSIFIÉS')
print(f'     INCONNU → PUBLIC        : {len(inc_to_pub):4d}  ← MAINTENANT IDENTIFIÉS')
print(f'     INCONNU → PRIVÉ         : {len(inc_to_prive):4d}  ← MAINTENANT IDENTIFIÉS')
print(f'     PRIVÉ → PUBLIC          : {len(priv_to_pub):4d}  ← À VÉRIFIER')
print()

# ── DETAIL : PUBLIC → PRIVÉ (les plus urgents) ────────────────────────────────
print(sep)
print(f'  A. PUBLIC → PRIVÉ ({len(pub_to_prive)} ETABs) — Badge incorrect : PUBLIC affiché pour privé')
print(sep)
for r in sorted(pub_to_prive, key=lambda x: x['nom'])[:40]:
    print(f'     [{r["ville"] or "?":15s}]  {r["nom"][:60]}')
    print(f'                        code: {r["code"][:55]}')
print()

# ── DETAIL : PUBLIC → INCONNU ─────────────────────────────────────────────────
print(sep)
print(f'  B. PUBLIC → INCONNU ({len(pub_to_inconnu)} ETABs) — Était PUBLIC, statut ambigu')
print(sep)
for r in sorted(pub_to_inconnu, key=lambda x: x['nom'])[:40]:
    print(f'     [{r["ville"] or "?":15s}]  {r["nom"][:60]}')
print()

# ── DETAIL : INCONNU → PUBLIC (bonus) ────────────────────────────────────────
if inc_to_pub:
    print(sep)
    print(f'  C. INCONNU → PUBLIC ({len(inc_to_pub)} ETABs) — Maintenant reconnus comme publics')
    print(sep)
    for r in sorted(inc_to_pub, key=lambda x: x['nom'])[:20]:
        print(f'     [{r["ville"] or "?":15s}]  {r["nom"][:60]}')
    print()

# ── DETAIL : INCONNU → PRIVÉ ─────────────────────────────────────────────────
if inc_to_prive:
    print(sep)
    print(f'  D. INCONNU → PRIVÉ ({len(inc_to_prive)} ETABs) — Maintenant reconnus comme privés')
    print(sep)
    for r in sorted(inc_to_prive, key=lambda x: x['nom'])[:20]:
        print(f'     [{r["ville"] or "?":15s}]  {r["nom"][:60]}')
    print()

# ── TOP 30 ETABs LES PLUS AFFECTÉS (classés par gravité) ─────────────────────
print(sep)
print('  TOP 30 — ETABs dont le changement a le plus d\'impact utilisateur')
print(sep)
priority = pub_to_prive + pub_to_inconnu
for i, r in enumerate(priority[:30], 1):
    print(f'  {i:2d}. {r["old"]:8s} → {r["new"]:8s}  [{r["ville"] or "?":12s}]  {r["nom"][:55]}')
print()

# ── CORRECTIONS VILLE / COÛT MANIFESTES ──────────────────────────────────────
print(sep)
print('  E. CORRECTIONS VILLE / COÛT PROPOSÉES (données manifestement fausses)')
print(sep)

EUROMED_IDS_KNOWN = []
for r in results:
    nom_up = r['nom'].upper()
    code_up = r['code'].upper()
    if 'EUROMED' in nom_up or 'EUROMED' in code_up or 'UEMF' in code_up:
        EUROMED_IDS_KNOWN.append(r)

print(f'  Établissements Euromed/UEMF détectés : {len(EUROMED_IDS_KNOWN)}')
for r in EUROMED_IDS_KNOWN:
    ville_actuelle = r['ville'] or 'None'
    cout_actuel    = r['cout']
    print(f'     {r["nom"][:55]}')
    print(f'       ville  : {ville_actuelle:20s}  → Fes (correction)')
    print(f'       cout   : {cout_actuel:<10}  → ~80000 MAD/an (à confirmer)')
    print(f'       statut : {r["old"]:8s}  → {r["new"]}')
    print()

# ── IMPACT ATTENDU SUR LE TRI ─────────────────────────────────────────────────
print(sep)
print('  F. IMPACT ATTENDU SUR LE TRI DES PARCOURS')
print(sep)
n_pub_old = old_counts['PUBLIC']
n_pub_new = new_counts['PUBLIC']
n_priv_new = new_counts['PRIVE']
print(f'  Parcours actuellement classés PUBLIC (rank=0) : ~{n_pub_old} ETABs')
print(f'  Après correction, PUBLIC (rank=0)              : ~{n_pub_new} ETABs')
print(f'  Après correction, PRIVÉ (rank=2)               : ~{n_priv_new} ETABs')
print()
print('  Conséquence sur le tri (sortPathsForDisplay):')
print('    rank 0 (PUBLIC pur)      → parcours publics remontent en premier ✓')
print('    rank 1 (MIXTE pub+priv)  → parcours partiellement publics')
print('    rank 2 (PRIVÉ pur)       → parcours privés repoussés en fin')
print('    rank 3 (INCONNU)         → parcours non classifiés')
print()
print(f'  Réduction faux-PUBLIC : {n_pub_old - n_pub_new} ETABs corrigés')
print()

# ── TEST PHARMACIEN CASABLANCA ────────────────────────────────────────────────
print(sep)
print('  G. TEST : Pharmacien Casablanca')
print(sep)
EUROMED_PHARM_ID = 'e86dca5b-28f8-75cd-b297-fb6b9722e748'
r_euromed = next((r for r in results if r['id'] == EUROMED_PHARM_ID), None)
if r_euromed:
    print(f'  ETAB : {r_euromed["nom"]}')
    print(f'  Ancienne classification : {r_euromed["old"]}  (badge PUBLIC affiché, rank=0)')
    print(f'  Nouvelle classification : {r_euromed["new"]}  (badge corrigé, rank=2)')
    print()
    print('  Classement attendu après fix :')
    print('    rank 0 → FMP Hassan II Casablanca (PUBLIC) — seul vrai public')
    print('    rank 2 → Euromed Pharmacie (PRIVÉ) — repoussé en fin + badge PRIVE')
    print('    + correction ville Fès → ne passe plus le filtre Casablanca')
else:
    print('  ETAB Euromed non trouvé — vérifier ID')
print()

# ── RÉSUMÉ FINAL ──────────────────────────────────────────────────────────────
print(SEP)
print('  RÉSUMÉ DRY-RUN')
print(SEP)
print(f'  ETABs analysés              : {len(etabs)}')
print(f'  Ancienne logique PUBLIC     : {old_counts["PUBLIC"]}')
print(f'  Nouvelle logique PUBLIC     : {new_counts["PUBLIC"]} (vrais publics identifiés)')
print(f'  Nouvelle logique PRIVÉ      : {new_counts["PRIVE"]}')
print(f'  Nouvelle logique INCONNU    : {new_counts["INCONNU"]}')
print(f'  PUBLIC mal classifiés → PRIVÉ   : {len(pub_to_prive)}')
print(f'  PUBLIC mal classifiés → INCONNU : {len(pub_to_inconnu)}')
print(f'  Corrections ville/cout Euromed  : {len(EUROMED_IDS_KNOWN)} ETABs')
print()
print('  Aucun fichier modifié. Validation requise avant application.')
print(SEP)
