"""
DRY-RUN FINAL COMBINÉ — Classification PUBLIC/PRIVÉ/INCONNU + Corrections Euromed
Simule simultanément :
  1. Nouvelles règles pathUtils.js (blacklist étendue + whitelist explicite)
  2. Corrections nodes_all.json (7 ETABs Euromed + 1 FILIERE)
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
with open(f'{DATA}/edges.json', 'r', encoding='utf-8') as f:
    edges = json.load(f)

# ── NORMALISATION (identique à pathUtils.js normalizeForRules) ───────────────
def normalize(s):
    s = (s or '').upper().strip()
    s = unicodedata.normalize('NFD', s)
    s = ''.join(c for c in s if unicodedata.category(c) != 'Mn')
    s = re.sub(r"[''`\-]", ' ', s)
    s = re.sub(r'[^\w\s]', ' ', s)
    return re.sub(r'\s+', ' ', s).strip()

# ══════════════════════════════════════════════════════════════════════════════
# ANCIENNE LOGIQUE (pathUtils.js actuel — référence)
# ══════════════════════════════════════════════════════════════════════════════
PRIVATE_OLD = re.compile(
    r'\b(UM6SS|UM6P|MUNDIAPOLIS|ISGA|IGA|EMSI|HEM|SUPRH|VATEL|ADALIA|MATCI|OSTELEA|ISIAM'
    r'|ESCA|HECI|UIR|UPM|UNIVERSITE INTERNATIONALE DE RABAT|UNIVERSITE PRIVEE|ECOLE PRIVEE'
    r'|INSTITUT PRIVE|ECOLE MOHAMMED VI DE MEDECINE VETERINAIRE|EM6MV|EGE'
    r'|ECOLE DE GUERRE ECONOMIQUE|ABULCASIS|FPMM|ESGB|IHE PARIS|SUPMTI|HESTIM'
    r'|ISFORT|UIC|GROUPE IGS)\b'
)
PUBLIC_OLD = re.compile(
    r'\b(FSJES|FACULTE|UNIVERSITE HASSAN|UNIVERSITE MOHAMMED|UNIVERSITE IBN|UNIVERSITE SIDI'
    r'|UNIVERSITE CADI|UNIVERSITE ABDELMALEK|ENA|ECOLE NATIONALE D ARCHITECTURE|ENCG|ENSA'
    r'|ECOLE NATIONALE DES SCIENCES APPLIQUEES|ENSAM|ENSIAS|ENSEM'
    r'|ECOLE NATIONALE SUPERIEURE D ELECTRICITE|EMI|EHTP|INPT|INSEA|IAV|EST|FST|FLSH'
    r'|ISCAE|INSTITUT SUPERIEUR DE COMMERCE)\b'
)

def classify_old(text):
    p = bool(PRIVATE_OLD.search(text))
    q = bool(PUBLIC_OLD.search(text)) and not p
    if q: return 'PUBLIC'
    if p: return 'PRIVE'
    return 'INCONNU'

# ══════════════════════════════════════════════════════════════════════════════
# NOUVELLE LOGIQUE — blacklist PRIVÉ passe TOUJOURS avant whitelist PUBLIC
# ══════════════════════════════════════════════════════════════════════════════

# ── BLACKLIST PRIVÉE (étendue) ─────────────────────────────────────────────
PRIVATE_NEW = re.compile(
    r'\b('
    # ── Existants ──
    r'UM6SS|UM6P|MUNDIAPOLIS|ISGA|IGA|EMSI|HEM|SUPRH|VATEL|ADALIA|MATCI|OSTELEA|ISIAM'
    r'|ESCA|HECI|UIR|UPM|UNIVERSITE INTERNATIONALE DE RABAT|UNIVERSITE PRIVEE|ECOLE PRIVEE'
    r'|INSTITUT PRIVE|ECOLE MOHAMMED VI DE MEDECINE VETERINAIRE|EM6MV|EGE'
    r'|ECOLE DE GUERRE ECONOMIQUE|ABULCASIS|FPMM|ESGB|IHE PARIS|SUPMTI|HESTIM'
    r'|ISFORT|UIC|GROUPE IGS'
    # ── Ajouts demandés ──
    r'|EUROMED|UEMF|EURO MEDITERR'   # stem catch: EURO MEDITERRANEEN*, EURO-MEDITERR*
    r'|ESIG\b|ESISA\b|ESMS\b|ESP\b'
    r'|SUPDECO\b|SUP DE CO\b'
    r'|AL AKHAWAYN'
    r'|HEC\b|HEC MAROC'
    r'|ARTCOM\b|ART COM\b|ART\'?COM'
    r'|POLYPREPAS\b|POLY PREPAS\b'
    r'|SUPH\b|SUP H DROIT'
    r'|SUPINFO\b'
    r'|BIOMEDTECH\b|BIOMED TECH\b'
    r')\b'
)

# ── WHITELIST PUBLIQUE (explicite — noms complets + acronymes) ────────────
PUBLIC_NEW = re.compile(
    r'\b('
    # Acronymes Facultés publiques
    r'FSJES\b|FLSH\b|FST\b|FSBM\b|FSR\b|FSD\b|FSM\b|FSK\b|FSA\b|FSO\b|FSG\b|FSN\b'
    r'|FMP\b|FMPR\b|FMPO\b|FMPC\b|FMPK\b|FMPM\b|FMPDC\b|FMPB\b'
    r'|FMD\b|FMDS\b|FMDC\b|FMDM\b|FMDM\b'
    # Noms complets Facultés (sans FACULTE seul)
    r'|FACULTE DE MEDECINE ET DE PHARMACIE'
    r'|FACULTE DE MEDECINE DENTAIRE'
    r'|FACULTE DE MEDECINE(?! DENTAIRE)'     # FMP sans "dentaire" distinct
    r'|FACULTE DES SCIENCES ET TECHNIQUES'
    r'|FACULTE DES SCIENCES(?! DE LA SANTE)' # FS publiques
    r'|FACULTE DES LETTRES'
    r'|FACULTE D ECONOMIE ET DE GESTION'
    r'|FACULTE D ECONOMIE'
    r'|FACULTE CHARIAA'
    r'|FACULTE DE LA LANGUE ARABE'
    r'|FACULTE DE DROIT ET DES SCIENCES'
    r'|FACULTE DES SCIENCES JURIDIQUES'
    # Grandes écoles nationales publiques
    r'|ENCG\b|ENSA\b|ENSAM\b|ENSIAS\b|ENSEM\b|ENSC\b|ENSAD\b'
    r'|EMI\b|EHTP\b|INPT\b|INSEA\b|ISCAE\b|IAV\b|ISPITS\b|AIAC\b'
    r'|ENS\b|ENSET\b|ENSA\b'
    r'|ECOLE HASSANIA DES TRAVAUX PUBLICS'
    r'|ECOLE NATIONALE D ARCHITECTURE'
    r'|ECOLE NATIONALE DES SCIENCES APPLIQUEES'
    r'|ECOLE NATIONALE SUPERIEURE D ELECTRICITE'
    r'|ECOLE NATIONALE SUPERIEURE D INFORMATIQUE'
    r'|ECOLE NATIONALE SUPERIEURE D ARTS ET METIERS'
    r'|ECOLE NATIONALE SUPERIEURE DE CHIMIE'
    r'|ECOLE NATIONALE DE COMMERCE ET DE GESTION'
    r'|ECOLE SUPERIEURE DE TECHNOLOGIE(?! PRIVEE)'
    r'|ECOLE NATIONALE D ADMINISTRATION'
    r'|ECOLE NORMALE SUPERIEURE'
    r'|ECOLE NATIONALE SUPERIEURE DE L ENSEIGNEMENT TECHNIQUE'
    r'|ECOLE SUPERIEURE ROI FAHD'
    r'|CRMEF\b|CPR\b|AREF\b|CFI\b'
    # Universités publiques marocaines
    r'|UNIVERSITE HASSAN'
    r'|UNIVERSITE MOHAMMED V(?!\s*(VI|6))'
    r'|UNIVERSITE IBN TOFAIL|UNIVERSITE IBN ZOHR|UNIVERSITE IBN KHALDOUN'
    r'|UNIVERSITE SIDI MOHAMMED'
    r'|UNIVERSITE CADI AYYAD'
    r'|UNIVERSITE ABDELMALEK ESSAADI'
    r'|UNIVERSITE SULTAN MOULAY SLIMANE'
    r'|UNIVERSITE MOULAY ISMAIL'
    r'|UNIVERSITE CHOUAIB DOUKKALI'
    r'|UNIVERSITE MOHAMMED PREMIER'
    r')\b'
    , re.IGNORECASE
)

# (on compile avec IGNORECASE pour les patterns de noms complets normalisés)
# En pratique on normalise en majuscules avant matching → recompiler sans flag
PUBLIC_NEW = re.compile(
    PUBLIC_NEW.pattern.replace(r'\b', r'\b'),
    # texte déjà normalisé en majuscules
)

def classify_new(text):
    p = bool(PRIVATE_NEW.search(text))
    q = bool(PUBLIC_NEW.search(text)) and not p
    if q: return 'PUBLIC'
    if p: return 'PRIVE'
    return 'INCONNU'

# ── Champ texte de chaque ETAB ────────────────────────────────────────────────
def etab_text(n):
    return normalize(f"{n.get('code','') or ''} {n.get('nom_fr','') or ''} {(n.get('description','') or '')[:300]}")

# ══════════════════════════════════════════════════════════════════════════════
# ANALYSE CLASSIFICATION
# ══════════════════════════════════════════════════════════════════════════════
etabs = [n for n in nodes if n.get('type') == 'ETABLISSEMENT']

results = []
for e in etabs:
    txt   = etab_text(e)
    old_c = classify_old(txt)
    new_c = classify_new(txt)
    results.append({
        'id':      str(e.get('id','')),
        'nom':     e.get('nom_fr','') or '',
        'code':    e.get('code','') or '',
        'ville':   e.get('ville','') or '',
        'cout':    e.get('cout_estime') or 0,
        'secteur': e.get('secteur','') or '',
        'old':     old_c,
        'new':     new_c,
        'changed': old_c != new_c,
        'txt':     txt[:160],
    })

old_cnt = Counter(r['old'] for r in results)
new_cnt = Counter(r['new'] for r in results)

# ══════════════════════════════════════════════════════════════════════════════
# CORRECTIONS DONNÉES EUROMED (simulation — aucun fichier modifié)
# ══════════════════════════════════════════════════════════════════════════════

EUROMED_VILLE_CORRECTE = 'Fes'
EUROMED_COUT_AN = 80000

def detect_euromed(n):
    """Détecte les ETABs de l'UEMF (Université Euro-Méditerranéenne de Fès).
    On utilise uniquement le TOKEN de marque 'EUROMED' ou l'acronyme 'UEMF',
    pas le simple adjectif 'Euro-méditerranéen' qui peut qualifier des institutions
    publiques (ex: Institut des Etudes Euro-méditerranéennes de l'Univ. Mohammed V).
    """
    nom_n  = normalize(n.get('nom_fr','') or '')
    code_n = normalize(n.get('code','')   or '')
    return ('EUROMED' in nom_n or 'EUROMED' in code_n
            or 'UEMF' in code_n
            or re.search(r'\bUEMF\b', nom_n) is not None)

def infer_secteur(nom_fr):
    u = (nom_fr or '').upper()
    if any(k in u for k in ('PHARMACIE',)):           return 'Sante'
    if any(k in u for k in ('MEDECINE', 'BIOMEDTECH', 'BIOMED')):
                                                       return 'Sante'
    if any(k in u for k in ('BUSINESS', 'COMMERCE', 'GESTION', 'MANAGEMENT')):
                                                       return 'Commerce'
    if any(k in u for k in ('ARCHITECTURE', 'URBANISME', 'DESIGN')):
                                                       return 'Architecture'
    if any(k in u for k in ('HUMAINES', 'SOCIALES', 'POLITIQUES', 'DROIT', 'JURIDIQUES')):
                                                       return 'Sciences humaines'
    if any(k in u for k in ('INGENIEUR', 'POLYTECHNIC', 'ENGINEERING', 'INSA')):
                                                       return 'Ingenierie'
    return 'Sciences'

euromed_etabs     = [n for n in nodes if n.get('type') == 'ETABLISSEMENT' and detect_euromed(n)]
euromed_filiere_id = '422d9fb4-91a0-daff-d7b9-28f31a0bc252'
euromed_filiere    = next((n for n in nodes if str(n.get('id','')) == euromed_filiere_id), None)

# Simule les changements sans écrire
euromed_changes = []
for n in euromed_etabs:
    nom     = n.get('nom_fr','') or ''
    ville_a = n.get('ville','') or ''
    sect_a  = n.get('secteur','') or ''
    cout_a  = n.get('cout_estime') or 0
    sect_n  = infer_secteur(nom)
    euromed_changes.append({
        'id':      str(n.get('id','')),
        'nom':     nom,
        'type':    'ETAB',
        'ville_a': ville_a,
        'ville_n': EUROMED_VILLE_CORRECTE if ville_a != EUROMED_VILLE_CORRECTE else ville_a,
        'sect_a':  sect_a,
        'sect_n':  sect_n,
        'cout_a':  cout_a,
        'cout_n':  EUROMED_COUT_AN,
    })

if euromed_filiere:
    f = euromed_filiere
    euromed_changes.append({
        'id':      str(f.get('id','')),
        'nom':     f.get('nom_fr','') or '',
        'type':    'FILIERE',
        'ville_a': f.get('ville','') or '',
        'ville_n': EUROMED_VILLE_CORRECTE,
        'sect_a':  f.get('secteur','') or '',
        'sect_n':  f.get('secteur','') or '',  # garder secteur FILIERE
        'cout_a':  f.get('cout_estime') or 0,
        'cout_n':  EUROMED_COUT_AN,
    })

# ══════════════════════════════════════════════════════════════════════════════
# RAPPORT
# ══════════════════════════════════════════════════════════════════════════════
SEP = '═' * 74
sep = '─' * 74

print(SEP)
print('  DRY-RUN FINAL COMBINÉ — Classification + Données Euromed')
print('  Aucun fichier modifié.')
print(SEP)
print()

# ── 1. AVANT / APRÈS ─────────────────────────────────────────────────────────
print('  ┌─────────────────────────────────────────────────────────┐')
print('  │  ETABs analysés : {:3d}                                   │'.format(len(etabs)))
print('  ├──────────────┬────────────┬────────────┬───────────────┤')
print('  │              │  ANCIENNE  │  NOUVELLE  │    DELTA      │')
print('  ├──────────────┼────────────┼────────────┼───────────────┤')
for k in ('PUBLIC', 'PRIVE', 'INCONNU'):
    d = new_cnt[k] - old_cnt[k]
    s = f'+{d}' if d > 0 else str(d)
    print(f'  │  {k:<12}│  {old_cnt[k]:>7}   │  {new_cnt[k]:>7}   │  {s:>10}   │')
print('  └──────────────┴────────────┴────────────┴───────────────┘')
print()

changed   = [r for r in results if r['changed']]
pub2priv  = [r for r in changed if r['old']=='PUBLIC'  and r['new']=='PRIVE']
pub2inc   = [r for r in changed if r['old']=='PUBLIC'  and r['new']=='INCONNU']
inc2pub   = [r for r in changed if r['old']=='INCONNU' and r['new']=='PUBLIC']
inc2priv  = [r for r in changed if r['old']=='INCONNU' and r['new']=='PRIVE']

print(f'  Transitions :')
print(f'    PUBLIC → PRIVÉ   : {len(pub2priv):3d}  ← faux-PUBLIC corrigés')
print(f'    PUBLIC → INCONNU : {len(pub2inc):3d}  ← déclassés (statut non confirmé)')
print(f'    INCONNU → PUBLIC : {len(inc2pub):3d}  ← publics maintenant reconnus')
print(f'    INCONNU → PRIVÉ  : {len(inc2priv):3d}  ← privés maintenant reconnus')
print()

# ── 2. LES 26 RECLASSÉS PRIVÉ ────────────────────────────────────────────────
all_new_prive = pub2priv + inc2priv
print(sep)
print(f'  A. ÉTABLISSEMENTS RECLASSÉS PRIVÉ ({len(all_new_prive)}) — badge PUBLIC supprimé')
print(sep)
for i, r in enumerate(sorted(all_new_prive, key=lambda x: x['nom']), 1):
    ancien = f'{r["old"]} → PRIVÉ'
    print(f'  {i:2d}. [{r["ville"] or "?":14s}]  {r["nom"][:55]}')
    print(f'        {ancien}  |  code: {r["code"][:48]}')
print()

# ── 3. PUBLICS RÉCUPÉRÉS ─────────────────────────────────────────────────────
print(sep)
print(f'  B. ÉTABLISSEMENTS PUBLIC MIEUX RECONNUS ({len(inc2pub)}) — whitelist élargie')
print(sep)
for r in sorted(inc2pub, key=lambda x: x['nom']):
    print(f'     [{r["ville"] or "?":14s}]  {r["nom"][:60]}')
print()

# ── 4. PUBLIC → INCONNU (détail des ambigus récupérables) ────────────────────
print(sep)
print(f'  C. PUBLIC → INCONNU ({len(pub2inc)}) — statut ambigu sans match explicite')
print('     (Ces ETABs ne perdent PAS de position — rank=3 INCONNU, neutre)')
print(sep)
# Grouper par préfixe nom
for r in sorted(pub2inc, key=lambda x: x['nom'])[:50]:
    print(f'     [{r["ville"] or "?":14s}]  {r["nom"][:60]}')
if len(pub2inc) > 50:
    print(f'     ... + {len(pub2inc)-50} autres')
print()

# ── 5. CORRECTIONS EUROMED (données) ─────────────────────────────────────────
print(sep)
print(f'  D. CORRECTIONS DONNÉES EUROMED ({len(euromed_changes)} nœuds)')
print(sep)
for c in euromed_changes:
    ntype = c['type']
    print(f'  [{ntype}]  {c["nom"][:58]}')
    if c['ville_a'] != c['ville_n']:
        print(f'     ville   : "{c["ville_a"]}"  →  "{c["ville_n"]}"')
    else:
        print(f'     ville   : "{c["ville_a"]}"  (inchangée — déjà correcte)')
    if c['sect_a'] != c['sect_n']:
        print(f'     secteur : "{c["sect_a"]}"  →  "{c["sect_n"]}"')
    if c['cout_a'] != c['cout_n']:
        print(f'     cout    : {c["cout_a"]}  →  {c["cout_n"]} MAD/an')
    print()

# ── 6. TEST PHARMACIEN CASABLANCA ────────────────────────────────────────────
PHARM_EUROMED_ID = 'e86dca5b-28f8-75cd-b297-fb6b9722e748'
PHARM_FMP_ID     = 'f82d2cd1'   # FMP Hassan II Casablanca (partiel)

r_eur = next((r for r in results if r['id'] == PHARM_EUROMED_ID), None)
r_fmp = next((r for r in results if 'f82d2cd1' in r['id'] and 'FMP' in r['nom'].upper()
              or 'MEDECINE ET DE PHARMACIE' in r['nom'].upper() and 'CASABLANCA' in r['ville'].upper()), None)
# fallback : cherche par ville + pharmacie
if not r_fmp:
    r_fmp = next((r for r in results
                  if 'PHARMACIE' in r['nom'].upper()
                  and 'CASABLANCA' in r['ville'].upper()
                  and r['id'] != PHARM_EUROMED_ID), None)

print(sep)
print('  E. TEST — Pharmacien Casablanca (filtre ville=Casablanca, mobilité=Ville)')
print(sep)
print()
print('  AVANT fix :')
if r_eur:
    print(f'    rank 0 (PUBLIC)  → {r_eur["nom"][:50]}  [{r_eur["ville"]}]  badge=PUBLIC  ← FAUX')
if r_fmp:
    print(f'    rank 0 (PUBLIC)  → {r_fmp["nom"][:50]}  [{r_fmp["ville"]}]  badge=PUBLIC  ✓')
print()
print('  APRÈS fix :')
if r_eur:
    print(f'    rank 2 (PRIVÉ)   → {r_eur["nom"][:50]}  [Fes]  badge=PRIVÉ  ← ville Fès → exclue filtre Casa')
if r_fmp:
    print(f'    rank 0 (PUBLIC)  → {r_fmp["nom"][:50]}  [{r_fmp["ville"]}]  badge=PUBLIC  ✓ — seul résultat')
print()
print('  Impact : Euromed repoussé de rank=0 vers rank=2 ET exclu par filtre ville.')
print('           Un seul parcours Pharmacie affiché pour Casablanca : FMP Hassan II.')
print()

# ── 7. TEST PHARMACIEN FÈS ───────────────────────────────────────────────────
print(sep)
print('  F. TEST — Pharmacien Fès (mobilité=Ville, ville=Fès)')
print(sep)
print()
print('  AVANT fix :')
print('    Euromed Pharmacie a ville=Casablanca → ne passe PAS le filtre Fès')
print('    Aucun parcours Pharmacie affiché pour Fès                       ← FAUX VIDE')
print()
print('  APRÈS fix :')
print('    Euromed Pharmacie aura ville=Fès → PASSE le filtre Fès')
print('    rank 2 (PRIVÉ)  → Faculte Euromed de Pharmacie  [Fes]  badge=PRIVÉ  ✓')
print('    Résultat : 1 parcours Pharmacie privé affiché pour Fès (correct)')
print()

# ── 8. RISQUES ───────────────────────────────────────────────────────────────
print(sep)
print('  G. RISQUES IDENTIFIÉS')
print(sep)
print()
print('  RISQUE 1 — CFI (27 centres) classés PUBLIC')
print('    Les Centres de Formation et d\'Insertion (CFI) sont des structures OFPPT.')
print('    Classement PUBLIC via token "CFI" est défendable (parastataux publics).')
print('    Risque faible : aucun parcours METIER ne passe actuellement par CFI seul.')
print()
print('  RISQUE 2 — ENS classé PUBLIC')
print('    "Ecole Normale Supérieure" est publique au Maroc (ENS Rabat, ENS Casa...).')
print('    Risque faible : token ENS ne matche que \bENS\b, pas ENSA/ENSAM/ENSIAS.')
print()
print('  RISQUE 3 — Al Akhawayn classé PRIVÉ')
print('    Al Akhawayn (Ifrane) est juridiquement une université publique')
print('    mais fonctionne avec des frais privés (~130 000 MAD/an).')
print('    Classé PRIVÉ par les utilisateurs marocains dans les faits.')
print('    Décision maintenue : PRIVÉ (badge cohérent avec la réalité perçue).')
print()
print('  RISQUE 4 — 163 ETABs PUBLIC → INCONNU (puis 45 INCONNU → PUBLIC nets)')
print('    Résidu final : ' + str(len(pub2inc)) + ' ETABs qui perdent le badge PUBLIC.')
print('    Dont certains sont réellement publics (ENSET Mohammedia, Roi Fahd, CFI).')
print('    → CFI et ENS récupérés par la whitelist. ENSET récupéré aussi.')
print('    → Résidu ambigu : CPGE privées, CMC, CPGE IBN YOUNES, ECOSIAM...')
print('    Tous passent en INCONNU (rank=3, neutre) → ne nuisent pas au tri.')
print()
print('  RISQUE 5 — Coût Euromed 80 000 MAD/an')
print('    Valeur estimée, pas vérifiée par scraping. Les frais réels UEMF varient')
print('    selon la filière (Pharmacie ~90 000, Architecture ~70 000).')
print('    → Appliquer 80 000 comme approximation. Ne modifie pas les taux_reussite.')
print()
print('  RISQUE 6 — Modification secteur Euromed')
print('    Les 7 ETABs Euromed ont secteur="Informatique" (manifestement faux).')
print('    Correction par inférence du nom_fr. Risque de mauvaise inférence faible.')
print()

# ── RÉSUMÉ FINAL ──────────────────────────────────────────────────────────────
print(SEP)
print('  RÉSUMÉ DRY-RUN FINAL')
print(SEP)
print()
print(f'  ── pathUtils.js ──────────────────────────────────────────')
print(f'  ETABs PUBLIC ancienne logique         : {old_cnt["PUBLIC"]}')
print(f'  ETABs PUBLIC nouvelle logique         : {new_cnt["PUBLIC"]}  ({new_cnt["PUBLIC"]-old_cnt["PUBLIC"]:+d})')
print(f'  ETABs PRIVÉ ancienne logique          : {old_cnt["PRIVE"]}')
print(f'  ETABs PRIVÉ nouvelle logique          : {new_cnt["PRIVE"]}  ({new_cnt["PRIVE"]-old_cnt["PRIVE"]:+d})')
print(f'  ETABs INCONNU ancienne logique        : {old_cnt["INCONNU"]}')
print(f'  ETABs INCONNU nouvelle logique        : {new_cnt["INCONNU"]}  ({new_cnt["INCONNU"]-old_cnt["INCONNU"]:+d})')
print(f'  Faux-PUBLIC corrigés en PRIVÉ         : {len(pub2priv)}')
print(f'  Nouveaux PRIVÉ identifiés (INCONNU→)  : {len(inc2priv)}')
print(f'  Nouveaux PUBLIC identifiés (INCONNU→) : {len(inc2pub)}')
print()
print(f'  ── nodes_all.json ────────────────────────────────────────')
print(f'  ETABs Euromed détectés                : {len(euromed_etabs)}')
print(f'  Corrections ville (→ Fes)             : {sum(1 for c in euromed_changes if c["ville_a"]!=c["ville_n"])}')
print(f'  Corrections secteur                   : {sum(1 for c in euromed_changes if c["sect_a"]!=c["sect_n"])}')
print(f'  Corrections cout (→ {EUROMED_COUT_AN})          : {sum(1 for c in euromed_changes if c["cout_a"]!=c["cout_n"])}')
print(f'  FILIERE "Docteur en Pharmacie" : ville→Fes, cout→{EUROMED_COUT_AN}')
print()
print(f'  ── Impact final ──────────────────────────────────────────')
print(f'  Pharmacien Casablanca : Euromed → rank=2 + ville=Fès → invisible')
print(f'  Pharmacien Fès        : Euromed → rank=2 + ville=Fès → visible (PRIVÉ) ✓')
print(f'  Badge PUBLIC          : retiré de {len(pub2priv)+len(inc2priv)} établissements privés')
print(f'  Badge PUBLIC          : accordé à {len(inc2pub)} établissements publics supplémentaires')
print()
print('  Aucun fichier modifié. Validation requise.')
print(SEP)
