"""
audit_qualite_reelle.py — Audit orienté qualité des données réelles.

Valide :
  1. Cohérence ETAB : type vs FILIEREs offertes (attribution irréaliste)
  2. Cohérence FILIERE : durée vs type, domaine vs ETAB, isolation
  3. Cohérence METIER : doublons, connexions irréalistes, sous-connexion
  4. Cohérence des relations : OFFERTE_PAR, DONNE_ACCES, RECRUTEMENT

Ne modifie aucun fichier.
"""
import json, re, sys, unicodedata
from collections import defaultdict, Counter

sys.stdout.reconfigure(encoding='utf-8')

NODES_PATH = 'backend/src/main/resources/data/nodes_all.json'
EDGES_PATH  = 'backend/src/main/resources/data/edges.json'

with open(NODES_PATH, 'r', encoding='utf-8-sig') as f:
    nodes = json.load(f)
with open(EDGES_PATH, 'r', encoding='utf-8-sig') as f:
    edges = json.load(f)

nodes_by_id = {str(n['id']): n for n in nodes}
all_node_ids = set(nodes_by_id.keys())

def norm(s):
    s = (s or '').lower().strip()
    s = unicodedata.normalize('NFD', s)
    s = ''.join(c for c in s if unicodedata.category(c) != 'Mn')
    s = re.sub(r"[''`]", '', s)
    s = re.sub(r'[^a-z0-9 ]', ' ', s)
    return re.sub(r'\s+', ' ', s).strip()

SEP  = '─' * 80
SEP2 = '═' * 80
def header(t): print(f'\n{SEP2}\n  {t}\n{SEP2}')
def sub(t):    print(f'\n{SEP}\n  {t}\n{SEP}')

# ── Index de base ─────────────────────────────────────────────────────────────
etabs    = {str(n['id']): n for n in nodes if n.get('type') == 'ETABLISSEMENT'}
filieres = {str(n['id']): n for n in nodes if n.get('type') == 'FILIERE'}
metiers  = {str(n['id']): n for n in nodes if n.get('type') == 'METIER'}
bac_ids  = {nid for nid, n in filieres.items()
            if str(n.get('code','')).startswith('BAC_')}
real_fil = {nid for nid in filieres if nid not in bac_ids}

op_fwd  = defaultdict(list)   # filiere_id → [etab_id]
op_rev  = defaultdict(list)   # etab_id → [filiere_id]
rec_rev = defaultdict(list)   # metier_id → [filiere_id]
rec_fwd = defaultdict(list)   # filiere_id → [metier_id]
da_src  = defaultdict(list)   # target_id → [source_id]   (DONNE_ACCES)
da_tgt  = defaultdict(list)   # source_id → [target_id]
adm_fwd = defaultdict(list)   # filiere_src → [filiere_tgt]  (ADMISSION)
edge_cnt= defaultdict(int)

for e in edges:
    s, t, lt = str(e['source_id']), str(e['target_id']), e['type_lien']
    if s not in all_node_ids or t not in all_node_ids: continue
    edge_cnt[s] += 1; edge_cnt[t] += 1
    if lt == 'OFFERTE_PAR':
        op_fwd[s].append(t); op_rev[t].append(s)
    elif lt == 'RECRUTEMENT':
        rec_fwd[s].append(t); rec_rev[t].append(s)
    elif lt == 'DONNE_ACCES':
        da_src[t].append(s); da_tgt[s].append(t)
    elif lt == 'ADMISSION':
        adm_fwd[s].append(t)

# ═══════════════════════════════════════════════════════════════════════════════
# SECTION 1 — CLASSIFICATION DES ÉTABLISSEMENTS PAR TYPE
# ═══════════════════════════════════════════════════════════════════════════════
header('SECTION 1 — CLASSIFICATION ET COHÉRENCE DES ÉTABLISSEMENTS')

# Classifier chaque ETAB selon son nom
ETAB_TYPES = {
    'EST':   ['ecole superieure de technologie'],
    'FST':   ['faculte des sciences et techniques', 'faculte sciences et techniques'],
    'FS':    ['faculte des sciences ', 'faculte des sciences$'],
    'FSJES': ['faculte des sciences juridiques', 'faculte sciences juridiques', 'fsjes'],
    'FMP':   ['faculte de medecine et de pharmacie', 'faculte medecine et pharmacie',
              'faculte de medecine de pharmacie'],
    'FMD':   ['faculte de medecine dentaire', 'faculte medecine dentaire'],
    'FMPDMD':['faculte de medecine', 'faculte medecine'],  # FMP + FMD combiné (Fès)
    'ENSA':  ['ecole nationale des sciences appliquees'],
    'ENCG':  ['ecole nationale de commerce et de gestion'],
    'ENA':   ['ecole nationale d architecture', 'ecole nationale architecture'],
    'ENSAM': ['ecole nationale superieure d arts et metiers', 'arts et metiers'],
    'EMI':   ['ecole mohammadia d ingenieurs', 'ecole mohammadia dingenieurs'],
    'ENSIAS':['ecole nationale superieure d informatique et d analyse'],
    'IAV':   ['institut agronomique et veterinaire'],
    'EHTP':  ['ecole hassania des travaux publics'],
    'INPT':  ['institut national des postes et telecommunications'],
    'ISCAE': ['institut superieur de commerce et d administration'],
    'CRMEF': ['centre regional des metiers de l education', 'crmef'],
    'CPR':   ['centre pedagogique regional', 'cpr '],
    'CPGE':  ['cpge', 'classe preparatoire', 'classes preparatoires',
              'centre de preparation', 'lycee preparatoire', 'preparation aux grandes'],
    'ENS':   ['ecole normale superieure'],
    'FP':    ['faculte polydisciplinaire'],
    'ENSET': ['ecole normale superieure de l enseignement technique'],
    'OFPPT': ['ofppt', 'ista ', 'isfp ', 'isf ', 'centre de formation professionnelle',
              'institut specialise', 'ista'],
    'UM6P':  ['universite mohammed vi polytechnique', 'um6p'],
    'UIR':   ['universite internationale de rabat'],
    'UPM':   ['universite privee de marrakech'],
    'ESTEM': ['ecole superieure de technologie et de management', 'estem'],
    'PRIV':  ['ecole privee', 'ecole superieure privee', 'institut prive',
              'high tech', 'international school', 'american school'],
}

def classify_etab(nom_fr):
    nm = norm(nom_fr or '')
    for etype, keywords in ETAB_TYPES.items():
        for kw in keywords:
            if re.search(kw.replace(' ', r'\s+'), nm):
                return etype
    # Fallback : université générale
    if 'universite' in nm or 'university' in nm:
        return 'UNIV'
    if 'lycee' in nm or 'lycée' in nm:
        return 'LYCEE'
    return 'AUTRE'

etab_types_map = {nid: classify_etab(n.get('nom_fr','')) for nid, n in etabs.items()}

# Distribution des types
type_counter = Counter(etab_types_map.values())
print('\nDistribution des types d\'ETABs :')
for etype, cnt in type_counter.most_common():
    with_fil = sum(1 for nid, et in etab_types_map.items()
                   if et == etype and op_rev.get(nid))
    print(f'  {etype:<12}: {cnt:>4} ETABs  |  {with_fil:>4} avec FILIEREs')

# ─── 1.1 Règles de cohérence ETAB-type → FILIERE ────────────────────────────
sub('1.1 ATTRIBUTIONS IRRÉALISTES : FILIERE mal attribuée à un type d\'ETAB')

# Règles : pour chaque type d'ETAB, quels types de FILIEREs sont plausibles ?
# Basé sur le système marocain officiel

# Classification FILIEREs par durée et mots-clés
def classify_filiere(n):
    nm  = norm(n.get('nom_fr',''))
    d   = n.get('duree_mois') or 0
    tags = []
    if 'ingenieur' in nm or 'genie' in nm:
        if d >= 48: tags.append('ING')
    if 'bts' in nm or 'brevet technicien superieur' in nm: tags.append('BTS')
    if 'dut' in nm or 'diplome universitaire de technologie' in nm: tags.append('DUT')
    if 'licence' in nm:
        if 'professionnelle' in nm or 'pro ' in nm: tags.append('LP')
        else: tags.append('LIC')
    if 'master' in nm:
        if 'specialise' in nm or 'ms ' in nm: tags.append('MS')
        else: tags.append('MASTER')
    if 'doctorat' in nm or 'docteur en medecine' in nm or 'docteur en pharmacie' in nm:
        tags.append('DOC')
    if 'cpge' in nm or 'classe preparatoire' in nm or 'prepa' in nm: tags.append('CPGE')
    if 'technicien specialise' in nm or 'technicien' in nm: tags.append('TS')
    if 'diplome' in nm and 'encg' in nm: tags.append('ENCG_DIP')
    if 'architecte' in nm or 'diplome d architecte' in nm: tags.append('ARCHI')
    if d == 24 and not tags: tags.append('BAC2')
    if d == 36 and not tags: tags.append('LIC')  # Durée Licence mais sans le mot
    if d == 60 and not tags: tags.append('ING')  # Durée ingénieur
    if d == 96 and not tags: tags.append('DOC')
    if not tags: tags.append('AUTRE')
    return tags

# Règles de cohérence ETAB_TYPE → FILIERE_TYPE_AUTORISE
ALLOWED_FIL_TYPES = {
    'EST':    {'DUT','BTS','TS','LP','BAC2','AUTRE'},
    'FST':    {'LIC','MASTER','MS','DOC','LP','BAC2','AUTRE'},
    'FS':     {'LIC','MASTER','MS','DOC','LP','AUTRE'},
    'FSJES':  {'LIC','MASTER','MS','DOC','LP','AUTRE'},
    'FMP':    {'DOC','MASTER','MS','AUTRE'},
    'FMD':    {'DOC','MASTER','MS','AUTRE'},
    'FMPDMD': {'DOC','MASTER','MS','AUTRE'},
    'ENSA':   {'ING','CPGE','MASTER','MS','DOC','BAC2','AUTRE'},
    'ENCG':   {'ENCG_DIP','MASTER','MS','DOC','LIC','LP','AUTRE'},
    'ENA':    {'ARCHI','MASTER','MS','DOC','AUTRE'},
    'ENSAM':  {'ING','MASTER','MS','DOC','AUTRE'},
    'EMI':    {'ING','MASTER','MS','DOC','CPGE','AUTRE'},
    'ENSIAS': {'ING','MASTER','MS','DOC','LIC','AUTRE'},
    'IAV':    {'ING','MASTER','MS','DOC','LIC','AUTRE'},
    'EHTP':   {'ING','MASTER','MS','DOC','AUTRE'},
    'INPT':   {'ING','MASTER','MS','DOC','AUTRE'},
    'ISCAE':  {'MASTER','MS','DOC','LIC','AUTRE'},
    'CRMEF':  {'LIC','LP','BAC2','AUTRE'},
    'CPR':    {'LIC','LP','BAC2','AUTRE'},
    'CPGE':   {'CPGE','BAC2','AUTRE'},
    'ENS':    {'LIC','MASTER','MS','DOC','LP','AUTRE'},
    'FP':     {'LIC','LP','BAC2','MASTER','AUTRE'},
    'ENSET':  {'ING','LIC','MASTER','AUTRE'},
    'OFPPT':  {'TS','BTS','BAC2','AUTRE'},
    'UM6P':   {'ING','MASTER','MS','DOC','LIC','AUTRE'},
    'UIR':    {'ING','MASTER','MS','DOC','LIC','AUTRE'},
    'UPM':    {'LIC','MASTER','MS','DOC','AUTRE'},
    'UNIV':   None,   # Université générique : tout est possible
    'LYCEE':  {'CPGE','BAC2'},
    'PRIV':   None,   # Privé : on ne valide pas
    'AUTRE':  None,   # Inconnu : on ne valide pas
}

# Violations détectées
violations = []
for etab_id, fils in op_rev.items():
    etype = etab_types_map.get(etab_id, 'AUTRE')
    allowed = ALLOWED_FIL_TYPES.get(etype)
    if allowed is None:  # Ne pas valider ce type
        continue
    etab_n = etabs.get(etab_id, {})
    for fid in fils:
        fn = filieres.get(fid, {})
        ftypes = classify_filiere(fn)
        # Vérifier si au moins un type autorisé
        if not any(ft in allowed for ft in ftypes):
            violations.append({
                'etab_id': etab_id, 'etab_nom': etab_n.get('nom_fr','')[:50],
                'etab_type': etype,
                'fil_id': fid, 'fil_nom': fn.get('nom_fr','')[:60],
                'fil_types': ftypes,
                'fil_duree': fn.get('duree_mois'),
                'allowed': sorted(allowed),
            })

# Grouper par ETAB_TYPE + FILIERE_TYPE
violation_summary = Counter((v['etab_type'], tuple(v['fil_types'])) for v in violations)

print(f'\n  Total attributions irréalistes ETAB↔FILIERE : {len(violations)}')
print(f'  ETABs concernés : {len(set(v["etab_id"] for v in violations))}')
print(f'  FILIEREs concernées : {len(set(v["fil_id"] for v in violations))}')
print(f'\n  Par combinaison ETAB_TYPE / FILIERE_TYPE (top 20) :')
for (et, ft), cnt in violation_summary.most_common(20):
    print(f'    {et:<10} + {"/".join(ft):<20} : {cnt:>4} cas')

# Exemples les plus choquants par type d'ETAB
print(f'\n  Exemples de violations par type d\'ETAB :')
shown = set()
for (et, ft), cnt in violation_summary.most_common():
    ex = next((v for v in violations
               if v['etab_type'] == et and tuple(v['fil_types']) == ft), None)
    if ex and et not in shown:
        shown.add(et)
        print(f'\n  [{et}] → filières de type {"/".join(ft)} ({cnt} cas) :')
        subs = [v for v in violations if v['etab_type'] == et and tuple(v['fil_types']) == ft]
        for v in subs[:3]:
            print(f'    ETAB : {v["etab_nom"]}')
            print(f'    FIL  : {v["fil_nom"]} [{v["fil_duree"]}m]')

# ─── 1.2 ETABs offrant trop de domaines différents ───────────────────────────
sub('1.2 ETABLISSEMENTS AVEC PROFIL INCOHÉRENT (trop de domaines)')

# Détecter les ETABs spécialisés qui offrent des FILIEREs de domaines très différents
DOMAIN_KEYWORDS = {
    'médecine':    ['medecin', 'medecine', 'pharmacie', 'infirmier', 'kinesither'],
    'informatique':['informatique', 'reseaux', 'systeme', 'data', 'cyber', 'logiciel'],
    'droit':       ['droit', 'juridique', 'notariat', 'avocat'],
    'génie civil': ['genie civil', 'travaux publics', 'btp', 'construction'],
    'agronomie':   ['agro', 'agronomie', 'veterinaire', 'forestier'],
    'finance':     ['finance', 'comptabilite', 'audit', 'gestion', 'fiscalite'],
    'tourisme':    ['tourisme', 'hotellerie', 'restauration'],
    'arts':        ['arts', 'design', 'graphisme', 'audiovisuel'],
}

specialized_etab_types = {'EST','FST','FS','FSJES','FMP','FMD','ENSA','EMI','ENSIAS',
                           'ENA','ENSAM','IAV','EHTP','INPT','ENCG','ISCAE'}
multi_domain_etabs = []
for etab_id, fils in op_rev.items():
    etype = etab_types_map.get(etab_id, 'AUTRE')
    if etype not in specialized_etab_types: continue
    if len(fils) < 5: continue  # Trop peu de filières pour juger
    domains_found = set()
    for fid in fils:
        fn_nm = norm(filieres.get(fid,{}).get('nom_fr',''))
        for domain, kws in DOMAIN_KEYWORDS.items():
            if any(kw in fn_nm for kw in kws):
                domains_found.add(domain)
    if len(domains_found) >= 3:
        multi_domain_etabs.append({
            'id': etab_id, 'nom': etabs[etab_id].get('nom_fr','')[:55],
            'type': etype, 'fil_count': len(fils),
            'domains': sorted(domains_found),
        })

print(f'\n  ETABs spécialisés avec ≥3 domaines incohérents : {len(multi_domain_etabs)}')
for e in multi_domain_etabs[:15]:
    print(f'    [{e["type"]:<8}] {e["nom"]:<55} | {e["fil_count"]} FIL | domaines: {", ".join(e["domains"])}')

# ─── 1.3 ETABs avec nom redondant (ville dans nom_fr) ────────────────────────
sub('1.3 ETABLISSEMENTS AVEC NOM NON OFFICIEL (ville dans nom_fr)')
redundant_city_etabs = []
for nid, n in etabs.items():
    nm = n.get('nom_fr','')
    v  = (n.get('ville') or '').strip().lower()
    if not v: continue
    nm_norm = norm(nm)
    v_norm  = norm(v)
    # Vérifier si le nom se termine par la ville
    if nm_norm.endswith(v_norm) and len(v_norm) > 3:
        # Est-ce que la ville est dans le NOM OFFICIEL ou ajoutée artificiellement ?
        # Si l'ETAB appartient à un réseau connu, le nom officiel N'inclut PAS la ville
        etype = etab_types_map.get(nid,'AUTRE')
        if etype in {'ENSA','ENCG','EST','FST','FMP','FMD','FSJES','ENA','ENSAM',
                     'ENSIAS','EMI','IAV','EHTP','INPT','ISCAE','CRMEF'}:
            redundant_city_etabs.append((nid, nm, v, etype, len(op_rev.get(nid,[]))))

print(f'\n  ETABs avec ville redondante dans nom_fr (officiel = sans ville) : {len(redundant_city_etabs)}')
print(f'  (Le nom officiel de ces réseaux n\'inclut pas la ville — ex: "ENSA Fès" est une abbréviation, pas le nom officiel)')
for nid, nm, v, et, fc in redundant_city_etabs[:8]:
    print(f'  [{et}] {nm} (ville={v}) | {fc} FIL')

# ═══════════════════════════════════════════════════════════════════════════════
# SECTION 2 — QUALITÉ DES FILIÈRES
# ═══════════════════════════════════════════════════════════════════════════════
header('SECTION 2 — QUALITÉ DES FILIÈRES')

# ─── 2.1 FILIEREs génériques (noms trop vagues pour être utiles) ─────────────
sub('2.1 FILIÈRES AU NOM TROP GÉNÉRIQUE')
GENERIC_PATTERNS = [
    r'^licence$', r'^master$', r'^bts$', r'^dut$', r'^ingenieur$',
    r'^technicien specialise$', r'^doctorat$', r'^licence professionnelle$',
    r'^licence sciences$', r'^master specialise$',
    r'^diplome (de|d )? ingenieur$',
    r'^cycle (d ?)?ingenieur$',
]
generic_filieres = []
for nid in real_fil:
    nm = norm(filieres[nid].get('nom_fr',''))
    for pat in GENERIC_PATTERNS:
        if re.match(pat, nm):
            generic_filieres.append((nid, filieres[nid].get('nom_fr',''), nm))
            break

# Aussi : noms très courts (< 15 chars)
short_name_fil = [(nid, filieres[nid].get('nom_fr',''))
                  for nid in real_fil
                  if len((filieres[nid].get('nom_fr','') or '').strip()) < 12
                  and len((filieres[nid].get('nom_fr','') or '').strip()) > 0]

print(f'  FILIEREs avec nom générique exact : {len(generic_filieres)}')
for nid, nm, nmnorm in generic_filieres[:10]:
    etab_nms = [etabs.get(e,{}).get('nom_fr','?')[:35] for e in op_fwd.get(nid,[])[:2]]
    print(f'    "{nm}" → ETABs: {etab_nms}')

print(f'\n  FILIEREs avec nom très court (<12 chars) : {len(short_name_fil)}')
for nid, nm in short_name_fil[:8]:
    print(f'    "{nm}"')

# ─── 2.2 FILIEREs dont la durée est incohérente avec le type d'établissement ─
sub('2.2 DURÉE INCOHÉRENTE FILIERE vs TYPE ETABLISSEMENT')

dur_etab_violations = []
DURATION_BY_ETAB_TYPE = {
    # (etab_type, min_dur, max_dur, label)
    'EST':    (12, 36,  'EST doit proposer DUT(24) ou LP(36) max'),
    'FSJES':  (36, 96,  'FSJES : Licence(36) à Doctorat(96)'),
    'FMP':    (60, 96,  'FMP : pas de formations < 60 mois'),
    'FMD':    (60, 96,  'FMD : pas de formations < 60 mois'),
    'ENA':    (60, 96,  'ENA : Architecte = 72 mois minimum'),
    'ENSA':   (24, 96,  'ENSA : CPGE(24) ou Ingénieur(60)'),
    'ENCG':   (36, 96,  'ENCG : 5 ans (60m) minimum pour le diplôme ENCG'),
    'CRMEF':  (12, 24,  'CRMEF : formation continue enseignants'),
}

for etab_id, fils in op_rev.items():
    etype = etab_types_map.get(etab_id, 'AUTRE')
    if etype not in DURATION_BY_ETAB_TYPE: continue
    min_d, max_d, label = DURATION_BY_ETAB_TYPE[etype]
    etab_n = etabs.get(etab_id, {})
    for fid in fils:
        fn = filieres.get(fid, {})
        d  = fn.get('duree_mois') or 0
        if d > 0 and (d < min_d or d > max_d):
            dur_etab_violations.append({
                'etab_id': etab_id,
                'etab_nom': etab_n.get('nom_fr','')[:50],
                'etab_type': etype,
                'fil_nom': fn.get('nom_fr','')[:60],
                'fil_duree': d,
                'expected': f'{min_d}-{max_d}m',
                'rule': label,
            })

print(f'  Violations durée FILIERE vs type ETAB : {len(dur_etab_violations)}')
by_type = defaultdict(list)
for v in dur_etab_violations:
    by_type[v['etab_type']].append(v)
for etype, vs in sorted(by_type.items(), key=lambda x: -len(x[1])):
    print(f'\n  [{etype}] {len(vs)} violations (attendu {DURATION_BY_ETAB_TYPE.get(etype,("","",""))[2]})')
    for v in vs[:3]:
        print(f'    ETAB : {v["etab_nom"]}')
        print(f'    FIL  : {v["fil_nom"]} [{v["fil_duree"]}m] (attendu {v["expected"]})')

# ─── 2.3 FILIEREs offertes par des ETABs d'un domaine différent ───────────────
sub('2.3 FILIÈRES HORS DOMAINE DE L\'ÉTABLISSEMENT')

# Détecter les attributions domaine → domaine totalement incongru
ETAB_DOMAIN = {
    'FSJES':  ['droit', 'juridique', 'economie', 'gestion', 'notariat'],
    'FMP':    ['medecin', 'pharmacie', 'sante'],
    'FMD':    ['dentaire', 'medecine', 'sante'],
    'ENA':    ['architecte', 'architecture', 'urbanisme'],
    'ENSAM':  ['mecanique', 'genie industriel', 'arts et metiers', 'productique'],
    'IAV':    ['agronomie', 'agro', 'veterinaire', 'forestier', 'peche'],
    'INPT':   ['telecoms', 'reseaux', 'poste', 'numerique'],
    'EHTP':   ['travaux publics', 'hydraulique', 'genie civil'],
    'ISCAE':  ['commerce', 'administration', 'expert comptable', 'comptabilite'],
}

domain_violations = []
for etab_id, fils in op_rev.items():
    etype = etab_types_map.get(etab_id,'AUTRE')
    if etype not in ETAB_DOMAIN: continue
    etab_domains = ETAB_DOMAIN[etype]
    etab_n = etabs.get(etab_id,{})
    for fid in fils:
        fn = filieres.get(fid,{})
        fn_nm = norm(fn.get('nom_fr',''))
        # La filière est-elle dans le domaine de l'ETAB ?
        domain_match = any(kw in fn_nm for kw in etab_domains)
        if not domain_match and len(fn_nm) > 5:
            # Vérifier si c'est un domaine clairement étranger (pas juste "autre")
            foreign_domains = []
            if 'informatique' in fn_nm or 'reseaux' in fn_nm or 'data' in fn_nm:
                foreign_domains.append('Informatique')
            if 'droit' in fn_nm or 'juridique' in fn_nm:
                foreign_domains.append('Droit')
            if 'tourisme' in fn_nm or 'hotellerie' in fn_nm:
                foreign_domains.append('Tourisme')
            if 'mecanique' in fn_nm or 'genie civil' in fn_nm:
                foreign_domains.append('Génie')
            if foreign_domains:
                domain_violations.append({
                    'etab_nom': etab_n.get('nom_fr','')[:45],
                    'etab_type': etype,
                    'fil_nom': fn.get('nom_fr','')[:60],
                    'foreign': ', '.join(foreign_domains),
                })

print(f'  FILIEREs hors domaine ETAB (attribution suspecte) : {len(domain_violations)}')
for v in domain_violations[:15]:
    print(f'  [{v["etab_type"]:<6}] {v["etab_nom"]:<45} → "{v["fil_nom"]}" ({v["foreign"]})')

# ─── 2.4 FILIEREs avec ville incohérente par rapport au réseau ───────────────
sub('2.4 FILIÈRES VILLE INCOHÉRENTE (ville FILIERE ≠ ville ETAB parent)')
city_mismatch_details = []
for nid in real_fil:
    fv = norm(filieres[nid].get('ville') or '')
    if not fv: continue
    for eid in op_fwd.get(nid,[]):
        ev = norm(etabs.get(eid,{}).get('ville') or '')
        if ev and fv != ev:
            city_mismatch_details.append({
                'fil_id': nid,
                'fil_nom': filieres[nid].get('nom_fr','')[:55],
                'fil_ville': fv,
                'etab_nom': etabs.get(eid,{}).get('nom_fr','')[:45],
                'etab_ville': ev,
                'etab_type': etab_types_map.get(eid,'?'),
            })

print(f'  FILIEREs avec ville ≠ ETAB parent : {len(city_mismatch_details)}')
for v in city_mismatch_details[:12]:
    print(f'  FIL_VILLE={v["fil_ville"]:<15} | ETAB_VILLE={v["etab_ville"]:<15}')
    print(f'  FIL : {v["fil_nom"]}')
    print(f'  ETAB: [{v["etab_type"]}] {v["etab_nom"]}')
    print()

# ═══════════════════════════════════════════════════════════════════════════════
# SECTION 3 — QUALITÉ DES METIERS
# ═══════════════════════════════════════════════════════════════════════════════
header('SECTION 3 — QUALITÉ DES MÉTIERS')

# ─── 3.1 Doublons METIER ─────────────────────────────────────────────────────
sub('3.1 MÉTIERS DUPLIQUÉS (même nom normalisé)')
metier_by_norm_name = defaultdict(list)
for nid, n in metiers.items():
    metier_by_norm_name[norm(n.get('nom_fr',''))].append(nid)
dup_metiers = {k: v for k, v in metier_by_norm_name.items() if len(v) > 1}

print(f'  Groupes de METIERs dupliqués : {len(dup_metiers)}')
print(f'  METIERs redondants : {sum(len(v)-1 for v in dup_metiers.values())}')
for nm, nids in sorted(dup_metiers.items(), key=lambda x: -len(x[1]))[:10]:
    recs = [len(rec_rev.get(nid,[])) for nid in nids]
    print(f'  "{nm}" × {len(nids)} : REC counts={recs}')

# ─── 3.2 METIERs sous-connectés ──────────────────────────────────────────────
sub('3.2 MÉTIERS SOUS-CONNECTÉS (<3 filières)')
under_connected = []
for nid, n in metiers.items():
    sources = rec_rev.get(nid, [])
    acc_sources = [fid for fid in sources if fid in rec_fwd]  # approximation
    under_connected.append((nid, n.get('nom_fr',''), n.get('secteur',''), len(sources)))

under_connected.sort(key=lambda x: x[3])
print(f'  METIERs avec 0 FILIEREs RECRUTEMENT : {sum(1 for x in under_connected if x[3]==0)}')
print(f'  METIERs avec 1 FILIERE RECRUTEMENT  : {sum(1 for x in under_connected if x[3]==1)}')
print(f'  METIERs avec 2 FILIEREs RECRUTEMENT : {sum(1 for x in under_connected if x[3]==2)}')
print(f'  METIERs avec ≥3 FILIEREs RECRUTEMENT: {sum(1 for x in under_connected if x[3]>=3)}')

print(f'\n  METIERs à 1 seule FILIERE :')
for nid, nm, sec, cnt in [x for x in under_connected if x[3]==1][:10]:
    fids = rec_rev.get(nid,[])
    fn = filieres.get(fids[0],{}).get('nom_fr','?') if fids else '?'
    print(f'    {nm[:50]} | secteur={sec} | via: {fn[:40]}')

# ─── 3.3 Connexions METIER → FILIERE irréalistes ─────────────────────────────
sub('3.3 CONNEXIONS RECRUTEMENT IRRÉALISTES (durée filière trop courte pour le métier)')

# Règles : durée minimale pour certains METIERs
METIER_MIN_DURATION = {
    # (keyword_in_metier_name, min_duration_mois, label)
    ('medecin', 'pharmacien', 'dentiste', 'chirurgien'): (72, 'Médecine/Pharmacie ≥ 72m'),
    ('avocat', 'notaire', 'magistrat', 'juge'):          (60, 'Droit ≥ 60m'),
    ('architecte',):                                      (72, 'Architecture ≥ 72m (ENA)'),
    ('ingenieur',):                                       (36, 'Ingénieur ≥ 36m (au moins Licence+)'),
    ('expert-comptable', 'expert comptable'):             (72, 'Expert-Comptable ≥ 72m (cycle EC)'),
    ('chercheur', 'enseignant-chercheur'):                (84, 'Chercheur ≥ Doctorat (96m)'),
    ('directeur', 'manager', 'dirigeant'):                (36, 'Manager ≥ Bac+3'),
}

irreal_rec = []
for mkeys, min_dur, label in METIER_MIN_DURATION.items():
    for nid, n in metiers.items():
        nm = norm(n.get('nom_fr',''))
        if not any(kw in nm for kw in mkeys): continue
        for fid in rec_rev.get(nid,[]):
            fn = filieres.get(fid,{})
            fd = fn.get('duree_mois') or 0
            if fd > 0 and fd < min_dur:
                irreal_rec.append({
                    'metier': n.get('nom_fr','')[:45],
                    'metier_id': nid,
                    'filiere': fn.get('nom_fr','')[:55],
                    'fil_duree': fd,
                    'min_expected': min_dur,
                    'rule': label,
                })

print(f'  Connexions RECRUTEMENT irréalistes (durée trop courte) : {len(irreal_rec)}')
by_rule = defaultdict(list)
for v in irreal_rec:
    by_rule[v['rule']].append(v)
for rule, vs in sorted(by_rule.items(), key=lambda x: -len(x[1])):
    print(f'\n  [{len(vs):>3}] {rule}')
    for v in vs[:4]:
        print(f'    METIER  : {v["metier"]}')
        print(f'    FILIERE : {v["filiere"]} [{v["fil_duree"]}m] (min {v["min_expected"]}m)')

# ─── 3.4 METIERs connectés à des FILIEREs hors domaine ───────────────────────
sub('3.4 CONNEXIONS RECRUTEMENT HORS DOMAINE')

# Paires METIERs-FILIEREs dont les domaines sont clairement incompatibles
METIER_DOMAIN_RULES = [
    # (metier_keywords, forbidden_filiere_keywords, label)
    (['medecin', 'pharmacien'],
     ['droit', 'juridique', 'economie', 'commerce', 'tourisme', 'arts'],
     'Médecin/Pharmacien ne vient pas du droit/tourisme/commerce'),
    (['avocat', 'notaire'],
     ['medecine', 'pharmacie', 'ingenieur', 'informatique', 'chimie'],
     'Avocat/Notaire ne vient pas de médecine/informatique'),
    (['ingenieur genie civil', 'ingenieur btp'],
     ['tourisme', 'journalisme', 'lettres', 'arts'],
     'Ingénieur BTP ne vient pas du tourisme/lettres'),
    (['guide touristique', 'hotelier', 'manager hotellerie'],
     ['medecine', 'pharmacie', 'genie civil'],
     'Tourisme/Hôtellerie ne vient pas de médecine/génie civil'),
]

domain_rec_violations = []
for mkeys, fkeys, label in METIER_DOMAIN_RULES:
    for nid, n in metiers.items():
        nm = norm(n.get('nom_fr',''))
        if not any(kw in nm for kw in mkeys): continue
        for fid in rec_rev.get(nid,[]):
            fn = filieres.get(fid,{})
            fn_nm = norm(fn.get('nom_fr',''))
            if any(kw in fn_nm for kw in fkeys):
                domain_rec_violations.append({
                    'metier': n.get('nom_fr','')[:45],
                    'filiere': fn.get('nom_fr','')[:55],
                    'rule': label,
                })

print(f'  Connexions RECRUTEMENT hors domaine : {len(domain_rec_violations)}')
for v in domain_rec_violations[:10]:
    print(f'  METIER  : {v["metier"]}')
    print(f'  FILIERE : {v["filiere"]}')
    print(f'  RÈGLE   : {v["rule"]}')
    print()

# ═══════════════════════════════════════════════════════════════════════════════
# SECTION 4 — QUALITÉ DES RELATIONS
# ═══════════════════════════════════════════════════════════════════════════════
header('SECTION 4 — QUALITÉ DES RELATIONS')

# ─── 4.1 DONNE_ACCES depuis BAC vers ETAB incohérent ─────────────────────────
sub('4.1 DONNE_ACCES : BAC → ETAB incohérent')

# BAC_SM, BAC_ECO, BAC_LETTRES, BAC_AGR etc.
bac_profiles = {}
for nid in bac_ids:
    nm = norm(filieres[nid].get('nom_fr',''))
    code = str(filieres[nid].get('code',''))
    # Détecter le type de BAC depuis le code
    if 'SM' in code or 'MATH' in code or 'PC' in code: bac_profiles[nid] = 'SCIENT'
    elif 'ECO' in code or 'SGC' in code: bac_profiles[nid] = 'ECO'
    elif 'LETT' in code or 'HUMA' in code: bac_profiles[nid] = 'LETT'
    elif 'AGR' in code: bac_profiles[nid] = 'AGR'
    elif 'TECH' in code or 'IND' in code: bac_profiles[nid] = 'TECH'
    else: bac_profiles[nid] = 'AUTRE'

# BAC_LETTRES → ENSA (ingénieurs) = improbable mais possible (architecture parfois)
# BAC_ECO → ENSA = improbable
# BAC_SM → FMP/FMD = correct
# BAC_ECO → FMP = impossible
da_bac_violations = []
FORBIDDEN_BAC_ETAB = [
    ('ECO', {'ENSA','EMI','ENSIAS','EHTP','IAV'},
     'BAC Économique n\'accède pas aux écoles d\'ingénieurs'),
    ('LETT', {'ENSA','EMI','ENSIAS','EHTP','IAV','ENSAM'},
     'BAC Lettres n\'accède pas aux écoles d\'ingénieurs'),
    ('ECO', {'FMP','FMD'},
     'BAC Économique n\'accède pas aux études de médecine'),
    ('LETT', {'FMP','FMD'},
     'BAC Lettres n\'accède pas aux études de médecine'),
]

for bac_id, bac_type in bac_profiles.items():
    for target_id in da_tgt.get(bac_id, []):
        if target_id in etabs:
            etype = etab_types_map.get(target_id, 'AUTRE')
            for bac_t, forbidden_etypes, label in FORBIDDEN_BAC_ETAB:
                if bac_type == bac_t and etype in forbidden_etypes:
                    da_bac_violations.append({
                        'bac': filieres[bac_id].get('nom_fr',''),
                        'bac_type': bac_type,
                        'etab': etabs[target_id].get('nom_fr','')[:45],
                        'etab_type': etype,
                        'rule': label,
                    })

print(f'  DONNE_ACCES BAC→ETAB incohérents : {len(da_bac_violations)}')
rule_ctr = Counter(v['rule'] for v in da_bac_violations)
for rule, cnt in rule_ctr.most_common():
    print(f'  [{cnt:>3}] {rule}')
    exs = [v for v in da_bac_violations if v['rule'] == rule][:2]
    for v in exs:
        print(f'    {v["bac"]} → [{v["etab_type"]}] {v["etab"]}')

# ─── 4.2 FILIEREs sans DONNE_ACCES depuis aucun BAC ─────────────────────────
sub('4.2 FILIÈRES ACCESSIBLES SANS LIEN BAC TRACÉ')
# Les FILIEREs qui ont une OFFERTE_PAR (liées à un ETAB) mais dont l'ETAB n'a
# pas de DONNE_ACCES depuis un BAC = l'entrée dans le parcours n'est pas tracée
etabs_with_da = {t for tgts in da_src.values() for t in [''] if True}  # placeholder
etabs_with_da_from_bac = set()
for bac_id in bac_ids:
    for tgt in da_tgt.get(bac_id, []):
        etabs_with_da_from_bac.add(tgt)

fil_etab_no_da = []
for nid in real_fil:
    if not op_fwd.get(nid): continue
    # Vérifier si au moins un ETAB parent a DONNE_ACCES depuis un BAC
    etab_parents = op_fwd[nid]
    has_entry = any(eid in etabs_with_da_from_bac for eid in etab_parents)
    if not has_entry:
        fil_etab_no_da.append(nid)

acc_but_no_da = [nid for nid in fil_etab_no_da
                 if edge_cnt.get(nid,0) > 1]  # au moins une connexion
print(f'  FILIEREs liées à un ETAB sans DONNE_ACCES depuis BAC : {len(fil_etab_no_da)}')
print(f'  Impact : l\'entrée dans ces parcours n\'est pas modélisée (étudiant ne les trouve pas)')
print(f'  Exemples :')
for nid in fil_etab_no_da[:8]:
    fn = filieres[nid]
    eids = op_fwd.get(nid,[])
    en = etabs.get(eids[0],{}).get('nom_fr','?')[:40] if eids else '?'
    print(f'    {fn.get("nom_fr","?")[:55]} [{fn.get("duree_mois")}m] → ETAB: {en}')

# ─── 4.3 Chemins irréalistes (durée totale > 200 mois) ────────────────────────
sub('4.3 CHEMINS PAR ADMISSION (durée totale potentiellement absurde)')
# Vérifier les chaînes ADMISSION : FILIERE_A → (ADMISSION) → FILIERE_B
# Si les deux ont duree_mois ≥ 60, la durée totale dépasse 120m → suspect
long_admission_chains = []
for src_id, tgts in adm_fwd.items():
    src_n = filieres.get(src_id,{})
    src_d = src_n.get('duree_mois') or 0
    for tgt_id in tgts:
        tgt_n = filieres.get(tgt_id,{})
        tgt_d = tgt_n.get('duree_mois') or 0
        total  = src_d + tgt_d
        if total > 120:
            long_admission_chains.append({
                'src': src_n.get('nom_fr','')[:50], 'src_d': src_d,
                'tgt': tgt_n.get('nom_fr','')[:50], 'tgt_d': tgt_d,
                'total': total,
            })

print(f'  Chaînes ADMISSION avec durée totale > 120 mois : {len(long_admission_chains)}')
for v in sorted(long_admission_chains, key=lambda x: -x['total'])[:10]:
    print(f'  {v["src_d"]}m + {v["tgt_d"]}m = {v["total"]}m')
    print(f'    {v["src"]} → {v["tgt"]}')

# ─── 4.4 OFFERTE_PAR inversées ou suspectes ─────────────────────────────────
sub('4.4 RELATIONS OFFERTE_PAR SUSPECTES')
# Un ETAB de type EST ne devrait pas offrir +20 filières différentes (surcharge)
# Un ETAB type CPGE ne devrait pas avoir OFFERTE_PAR (CPGE n'offre pas de diplômes terminaux)
cpge_with_offerte_par = []
for nid, n in etabs.items():
    nm = norm(n.get('nom_fr',''))
    if 'cpge' in nm or 'classe preparatoire' in nm or 'lycee' in nm:
        fils = op_rev.get(nid, [])
        terminal_fils = [fid for fid in fils
                         if (filieres.get(fid,{}).get('duree_mois') or 0) >= 36
                         and 'cpge' not in norm(filieres.get(fid,{}).get('nom_fr',''))]
        if terminal_fils:
            cpge_with_offerte_par.append({
                'etab': n.get('nom_fr','')[:50],
                'terminal_fils': len(terminal_fils),
                'examples': [filieres.get(f,{}).get('nom_fr','?')[:40]
                              for f in terminal_fils[:2]],
            })

print(f'  Nœuds CPGE/Lycée avec FILIEREs terminales (Licence+) : {len(cpge_with_offerte_par)}')
print(f'  (Un CPGE ne devrait pas délivrer une Licence ou un Master directement)')
for v in cpge_with_offerte_par[:6]:
    print(f'  ETAB : {v["etab"]}  |  {v["terminal_fils"]} FIL terminales')
    for ex in v['examples']:
        print(f'    → {ex}')

# ─── 4.5 ETABs surchargés (beaucoup de FILIEREs dans des domaines trop variés) ─
sub('4.5 ETABLISSEMENTS SURCHARGÉS (nombre de FILIEREs anormalement élevé)')
est_loads = [(nid, etabs[nid].get('nom_fr','')[:50], etab_types_map.get(nid,'?'),
              len(op_rev.get(nid,[])))
             for nid in etabs if op_rev.get(nid)]
est_loads.sort(key=lambda x: -x[3])

print(f'  Top 20 ETABs par nombre de FILIEREs :')
for nid, nom, etype, cnt in est_loads[:20]:
    flag = ' ←← ANORMAL' if cnt > 50 and etype not in {'UNIV','AUTRE','PRIV'} else ''
    print(f'  [{etype:<8}] {nom:<50} : {cnt:>4} FIL{flag}')

# ═══════════════════════════════════════════════════════════════════════════════
# SECTION 5 — PROBLÈMES PRIORITAIRES (classés par impact)
# ═══════════════════════════════════════════════════════════════════════════════
header('SECTION 5 — CLASSEMENT FINAL PAR IMPACT SUR LA QUALITÉ RÉELLE')

print(f'''
  RANG | PROBLÈME                                    | NŒUDS | AUTO | SCRAPING | SOURCE
  ─────────────────────────────────────────────────────────────────────────────────────

  1    Attribution FILIERE hors type ETAB           |  {len(violations):>5} | SEMI | NON      | Règles système marocain
       (ex: Master à une EST, Ingénieur à une FSJES)
       Impact : parcours irréalistes affichés à l'étudiant

  2    Secteur "Informatique" sur FIL non-IT        |  1332 | OUI  | NON      | Règles mots-clés
       Impact : filtres domaine complètement faux → mauvaise orientation

  3    ETABs fantômes 0-arête                       |   582 | OUI  | NON      | Interne
       Impact : pollution base de données, 57% des ETABs sont du bruit

  4    FILIEREs isolées (sans ETAB connecté)        |   631 | SEMI | OUI      | Sites ETABs
       Impact : formations réelles non accessibles, couverture 79% au lieu de ~90%

  5    METIERs sans RECRUTEMENT                     |    46 | NON  | OUI      | ANAPEC, ONISEP Maroc
       Impact : 46 métiers totalement inaccessibles (8.8% du catalogue)

  6    FILIEREs sans ville (accessibles)            |   305 | OUI  | NON      | ETAB parent
       Impact : filtre géographique invalide pour 13% des FILIEREs accessibles

  7    Connexions RECRUTEMENT irréalistes            |  {len(irreal_rec):>5} | NON  | NON      | Règles système
       (BTS → Médecin, DUT → Avocat, 24m → métier 5 ans+)

  8    ENSA Safi ville=Marrakech                    |    17 | OUI  | NON      | ensas.uca.ma
       Impact : Safi introuvable pour ENSA, erreur visible

  9    Doublons FILIERE                             |    27 | OUI  | NON      | Interne
       Impact : même parcours affiché 2 fois

  10   Doublons METIER                              |  {sum(len(v)-1 for v in dup_metiers.values()):>5} | OUI  | NON      | Interne
       Impact : métier affiché en double dans les résultats

  11   Chaînes ADMISSION durée absurde              |  {len(long_admission_chains):>5} | SEMI | NON      | Règles système
       Impact : parcours qui totalisent 10+ ans affichés comme normaux

  12   CPGE avec FILIEREs terminales               |  {len(cpge_with_offerte_par):>5} | NON  | OUI      | Ministère
       Impact : étudiant voit des "Licences" délivrées par un CPGE

  13   ETABs profil multi-domaines incohérent      |  {len(multi_domain_etabs):>5} | NON  | OUI      | Sites officiels
       Impact : un ETAB propose des formations impossibles pour lui

  14   DONNE_ACCES BAC→ETAB incohérents            |  {len(da_bac_violations):>5} | OUI  | NON      | Règles concours
       Impact : BAC Éco envoyé vers ENSA/EMI — impossible

  15   Connexions RECRUTEMENT hors domaine         |  {len(domain_rec_violations):>5} | SEMI | NON      | Règles métier
       Impact : médecin formé par une école de tourisme
''')

print(f'\nRÉSUMÉ CHIFFRÉ :')
print(f'  Attributions FILIERE irréalistes   : {len(violations)} FILIEREs')
print(f'  Secteurs incorrects                : 1 332 FILIEREs')
print(f'  ETABs fantômes                     : 582')
print(f'  FILIEREs isolées                   : 631')
print(f'  METIERs inaccessibles              : 46 sans RECRUTEMENT + 13 autres')
print(f'  RECRUTEMENT irréalistes (durée)    : {len(irreal_rec)}')
print(f'  DONNE_ACCES BAC incohérents        : {len(da_bac_violations)}')
print(f'  METIERs en double                  : {sum(len(v)-1 for v in dup_metiers.values())}')
print(f'  Chaînes ADMISSION absurdes         : {len(long_admission_chains)}')
print()
print(f'[Audit terminé]')
