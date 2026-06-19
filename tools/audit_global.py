"""
Audit global de cohérence du graphe SGPO.
Détecte les problèmes structurels classés CRITIQUE / MAJEUR / MINEUR.
Sortie : rapport textuel complet + compteurs.
"""
import json, sys, re, unicodedata
from collections import defaultdict, deque, Counter
sys.stdout.reconfigure(encoding='utf-8')

# ─── Chargement ──────────────────────────────────────────────────────────────
with open('backend/src/main/resources/data/nodes_all.json', 'r', encoding='utf-8-sig') as f:
    nodes = json.load(f)
with open('backend/src/main/resources/data/edges.json', 'r', encoding='utf-8-sig') as f:
    edges = json.load(f)

nodes_by_id = {str(n['id']): n for n in nodes}
bac_nodes = {str(n['id']) for n in nodes
             if n.get('type') == 'FILIERE' and str(n.get('code', '')).startswith('BAC_')}

filieres   = [n for n in nodes if n.get('type') == 'FILIERE' and str(n.get('id')) not in bac_nodes]
etabs      = [n for n in nodes if n.get('type') == 'ETABLISSEMENT']
metiers    = [n for n in nodes if n.get('type') == 'METIER']

# ─── Construction du graphe BFS ──────────────────────────────────────────────
op_reverse    = defaultdict(list)   # etab_id → [filiere_id]
op_forward    = defaultdict(list)   # filiere_id → [etab_id]
da_targets    = defaultdict(list)   # source_id → [target_id]  (DONNE_ACCES)
rec_by_metier = defaultdict(list)   # metier_id → [(filiere_id, edge)]
rec_by_filiere= defaultdict(list)   # filiere_id → [(metier_id, edge)]
adm_edges     = []                  # (source_id, target_id)

for e in edges:
    s, t, lt = str(e['source_id']), str(e['target_id']), e['type_lien']
    if lt == 'OFFERTE_PAR':
        op_reverse[t].append(s)
        op_forward[s].append(t)
    elif lt == 'DONNE_ACCES':
        da_targets[s].append(t)
    elif lt == 'RECRUTEMENT':
        rec_by_metier[t].append((s, e))
        rec_by_filiere[s].append((t, e))
    elif lt == 'ADMISSION':
        adm_edges.append((s, t))

graph = defaultdict(list)
for s, targets in da_targets.items():
    for t in targets:
        graph[s].append((t, 'DONNE_ACCES'))
for e in edges:
    s, t, lt = str(e['source_id']), str(e['target_id']), e['type_lien']
    if lt == 'RECRUTEMENT':
        graph[s].append((t, 'RECRUTEMENT'))
for etab_id, fils in op_reverse.items():
    for f in fils:
        graph[etab_id].append((f, 'OFFERTE_PAR_REV'))
for s, t in adm_edges:
    graph[s].append((t, 'ADMISSION'))

# BFS complet (même logique que GrapheServiceImpl)
acc_filieres = set()
acc_metiers  = set()
fil_to_etabs_in_paths = defaultdict(set)   # filiere_id → set(etab_id)
metier_to_filieres_acc = defaultdict(set)  # metier_id → set(filiere_id accessibles)
path_parent  = {}  # pour reconstruire des chemins exemple

for bac_id in bac_nodes:
    visited = {bac_id}
    queue   = deque([(bac_id, False, False, None)])  # (nid, aFL, aOP, prev_etab)
    while queue:
        nid, aFL, aOP, prev_etab = queue.popleft()
        nd = nodes_by_id.get(nid)
        if not nd:
            continue
        ntype = nd.get('type', '')
        if ntype == 'FILIERE' and nid not in bac_nodes:
            acc_filieres.add(nid)
            if prev_etab:
                fil_to_etabs_in_paths[nid].add(prev_etab)
        if ntype == 'METIER':
            acc_metiers.add(nid)
            continue
        for nb_id, etype in graph[nid]:
            if nb_id in visited:
                continue
            nb = nodes_by_id.get(nb_id)
            if not nb:
                continue
            if etype in ('OFFERTE_PAR_REV', 'ADMISSION'):
                if aFL and nb.get('type') == 'FILIERE' and (nb.get('duree_mois') or 0) >= 24:
                    continue
            if etype == 'OFFERTE_PAR_REV' and aOP:
                continue
            new_aFL = aFL
            new_aOP = (etype == 'OFFERTE_PAR_REV')
            cur = nodes_by_id.get(nid)
            if cur and cur.get('type') == 'FILIERE' and nid not in bac_nodes:
                if (cur.get('duree_mois') or 0) >= 24:
                    new_aFL = True
            new_prev_etab = prev_etab
            if ntype == 'ETABLISSEMENT':
                new_prev_etab = nid
            visited.add(nb_id)
            if nb_id not in path_parent:
                path_parent[nb_id] = (nid, etype)
            queue.append((nb_id, new_aFL, new_aOP, new_prev_etab))

# Peupler metier_to_filieres_acc
for mid, sources in rec_by_metier.items():
    for fid, _ in sources:
        if fid in acc_filieres:
            metier_to_filieres_acc[mid].add(fid)

# ─── Helpers ─────────────────────────────────────────────────────────────────
def normalize(s):
    """Normalise un nom pour comparaison : minuscules, sans accents, sans ponctuation."""
    s = s.lower().strip()
    s = unicodedata.normalize('NFD', s)
    s = ''.join(c for c in s if unicodedata.category(c) != 'Mn')
    s = re.sub(r'[^a-z0-9 ]', ' ', s)
    s = re.sub(r'\s+', ' ', s).strip()
    return s

def nom(nid):
    n = nodes_by_id.get(nid)
    return n.get('nom_fr', nid)[:70] if n else nid

def duree(nid):
    n = nodes_by_id.get(nid)
    return n.get('duree_mois') or 0 if n else 0

VILLES_MAROC = {
    'casablanca', 'rabat', 'fes', 'marrakech', 'tanger', 'agadir', 'oujda', 'meknes',
    'kenitra', 'settat', 'tetouan', 'beni mellal', 'el jadida', 'mohammedia', 'laayoune',
    'errachidia', 'khouribga', 'safi', 'nador', 'larache', 'khemisset', 'berrechid',
    'azrou', 'taza', 'ouarzazate', 'guelmim', 'ifrane', 'khenifra', 'al hoceima'
}

FOREIGN_KW = [
    'nancy', 'france', 'polytech france', 'mines paris', 'mines nancy',
    'cnrs', 'insa lyon', 'insa paris', 'paris', 'lyon', 'bordeaux', 'toulouse',
    'grenoble', 'strasbourg', 'nantes', 'lille', 'haute-france', 'essti',
    'belgique', 'tunisie', 'algerie', 'canada', 'suisse', 'espagne',
    'universitaire france', 'institut superieur france'
]

INCOMPATIBLE_PAIRS = [
    # (mots-clés métier TECHNIQUE, mots-clés formation TROP HAUTE)
    (['technicien', 'assistant', 'agent de', 'charge de', 'commercial', 'gestionnaire',
      'vendeur', 'caissier', 'livreur', 'operateur', 'manutentionnaire'],
     ['doctorat', 'these', 'phd']),
    # Médecin/dentiste uniquement via FMP/FMD
    (['medecin', 'chirurgien', 'pharmacien', 'dentiste'],
     ['bts', 'licence professionnelle', 'cycle preparatoire']),
    # Architecte uniquement via ENA ou école accrédité
    (['architecte'],
     ['bts', 'dut', 'technicien']),
]

# ─── AUDIT 1 : DOUBLONS ETAB ─────────────────────────────────────────────────
etab_by_norm = defaultdict(list)
for n in etabs:
    key = normalize(n.get('nom_fr', ''))
    etab_by_norm[key].append(str(n['id']))

dup_etab_groups = {k: ids for k, ids in etab_by_norm.items() if len(ids) > 1}

# Impact : combien de METIERs du top 100 touchés ?
metier_score = sorted(
    [(len(metier_to_filieres_acc.get(str(m['id']), [])), str(m['id']), m.get('nom_fr', ''))
     for m in metiers if str(m['id']) in acc_metiers],
    key=lambda x: -x[0]
)
top100_mids = {mid for _, mid, _ in metier_score[:100]}

dup_etab_ids = {eid for ids in dup_etab_groups.values() for eid in ids}

# Pour chaque FILIERE accessible : quels ETABs liés sont dupliqués ?
dup_impact_metiers = set()
dup_fil_count = 0
for mid in top100_mids:
    for fid in metier_to_filieres_acc.get(mid, set()):
        etabs_f = set(op_forward.get(fid, []))
        if etabs_f & dup_etab_ids:
            dup_impact_metiers.add(mid)
            dup_fil_count += 1
            break

# Synonymes connus (groupes sémantiques à détecter au-delà de l'exact match)
SYNONYM_PREFIXES = [
    ('faculte des sciences juridiques economiques et sociales', 'fsjes'),
    ('faculte des sciences juridiques', 'fsjes'),
    ('ecole nationale des sciences appliquees', 'ensa'),
    ('ecole nationale superieure d informatique', 'ensias'),
    ('ecole nationale superieure d arts et metiers', 'ensam'),
    ('ecole mohammadia d ingenieurs', 'emi'),
    ('ecole hassania des travaux publics', 'ehtp'),
    ('ecole nationale de commerce et de gestion', 'encg'),
    ('institut superieur de commerce et d administration des entreprises', 'iscae'),
    ('faculte de medecine et de pharmacie', 'fmp'),
    ('faculte des sciences et techniques', 'fst'),
    ('faculte des sciences', 'fs '),
    ('ecole nationale d architecture', 'ena'),
    ('institut agronomique et veterinaire', 'iav'),
    ('office de la formation professionnelle', 'ofppt'),
    ('institut superieur de technologie appliquee', 'ista'),
]

synonym_groups = defaultdict(set)
for n in etabs:
    nf = normalize(n.get('nom_fr', ''))
    nid = str(n['id'])
    for long_form, abbr in SYNONYM_PREFIXES:
        if long_form in nf or abbr in nf:
            synonym_groups[(long_form, abbr)].add(nid)

synonym_real_dupes = {}
for (lf, ab), ids in synonym_groups.items():
    if len(ids) > 1:
        synonym_real_dupes[(lf, ab)] = ids

# ─── AUDIT 2 : ETABS ÉTRANGERS DANS PARCOURS ACCESSIBLES ────────────────────
foreign_etabs = []
for n in etabs:
    nf = n.get('nom_fr', '').lower()
    for kw in FOREIGN_KW:
        if kw in nf:
            eid = str(n['id'])
            # Vérifier si cet ETAB mène à des FILIEREs accessibles
            fils_acc = [f for f in op_reverse.get(eid, []) if f in acc_filieres]
            foreign_etabs.append({
                'id': eid, 'nom': n.get('nom_fr', ''),
                'kw': kw, 'fils_accessibles': len(fils_acc),
                'ville': n.get('ville', '')
            })
            break

# ─── AUDIT 3 : FORMATIONS SANS VILLE ACCESSIBLES ────────────────────────────
fil_sans_ville = []
for fid in acc_filieres:
    f = nodes_by_id.get(fid)
    if not f or str(f.get('code', '')).startswith('BAC_'):
        continue
    if not f.get('ville'):
        has_op   = bool(op_forward.get(fid))
        etab_ids = op_forward.get(fid, [])
        etab_villes = [nodes_by_id.get(eid, {}).get('ville', '') for eid in etab_ids]
        fil_sans_ville.append({
            'id': fid, 'nom': f.get('nom_fr', ''),
            'duree': f.get('duree_mois') or 0,
            'has_op': has_op,
            'etab_villes': [v for v in etab_villes if v],
            'metiers_count': len(rec_by_filiere.get(fid, []))
        })
fil_sans_ville.sort(key=lambda x: -x['metiers_count'])

# ─── AUDIT 4 : DURÉES INCOHÉRENTES ──────────────────────────────────────────
duration_issues = []
for f in filieres:
    nom_f = f.get('nom_fr', '').lower()
    d     = f.get('duree_mois') or 0
    fid   = str(f['id'])
    issues = []
    if d == 0:
        issues.append('DUREE_ZERO')
    if re.search(r'\bbts\b', nom_f) and not nom_f.startswith('master') and d not in (0, 24):
        issues.append(f'BTS_DUR_{d}m≠24m')
    if re.search(r'\bdut\b', nom_f) and d not in (0, 24):
        issues.append(f'DUT_DUR_{d}m≠24m')
    if re.search(r'\bdoctorat\b', nom_f) and 0 < d < 72:
        issues.append(f'DOCTORAT_{d}m<72m')
    if re.search(r'\b(cpge|classe preparatoire aux grandes ecoles)\b', nom_f) and d not in (0, 24):
        issues.append(f'CPGE_{d}m≠24m')
    if re.search(r'\bcycle preparatoire\b', nom_f) and d == 60:
        issues.append(f'CPGE_CYCLE_{d}m≠24m')
    if re.search(r'\blicence\b', nom_f) and d not in (0, 36) and d < 60:
        issues.append(f'LICENCE_{d}m≠36m')
    if re.search(r'\b(master|desa|dess)\b', nom_f) and d not in (0, 24) and d < 36:
        issues.append(f'MASTER_{d}m<24m')
    if issues:
        duration_issues.append({
            'id': fid, 'nom': f.get('nom_fr', ''), 'duree': d, 'issues': issues,
            'accessible': fid in acc_filieres
        })

duration_issues.sort(key=lambda x: (-int(x['accessible']), x['duree']))

# ─── AUDIT 5 : PARCOURS INCOMPATIBLES (Doctorat → Technicien etc.) ───────────
incompat_paths = []
for cnt, mid, mnom in metier_score[:200]:
    mnom_low = mnom.lower()
    for tech_kws, high_kws in INCOMPATIBLE_PAIRS:
        is_tech = any(k in mnom_low for k in tech_kws)
        if not is_tech:
            continue
        high_fils = []
        for fid in metier_to_filieres_acc.get(mid, set()):
            fnom = nodes_by_id.get(fid, {}).get('nom_fr', '').lower()
            for hk in high_kws:
                if hk in fnom:
                    high_fils.append(nodes_by_id[fid].get('nom_fr', ''))
                    break
        if high_fils:
            incompat_paths.append({
                'metier': mnom, 'metier_id': mid,
                'incompatibles': high_fils, 'count': len(high_fils)
            })
        break

incompat_paths.sort(key=lambda x: -x['count'])

# ─── AUDIT 6 : FORMATIONS GÉNÉRIQUES FLOTTANTES ─────────────────────────────
# Une FILIERE est "générique" si : pas de ville + pas d'ETAB réel + nom sans ville explicite
GENERIC_PATTERNS = re.compile(
    r'^(licence|master|bts|dut|bac\+|bachelor|formation|programme|cycle|diplome)\s', re.I
)
generic_fils = []
for fid in acc_filieres:
    f = nodes_by_id.get(fid)
    if not f:
        continue
    nom_f = f.get('nom_fr', '')
    has_ville = bool(f.get('ville'))
    has_op    = bool(op_forward.get(fid))
    has_da    = any(t == fid for s, targets in da_targets.items()
                    for t in targets if s in bac_nodes)
    # Générique : pas de ville, pas d'ETAB via OP, nom commence par type générique
    if not has_ville and not has_op and GENERIC_PATTERNS.match(nom_f):
        met_count = len(rec_by_filiere.get(fid, []))
        generic_fils.append({'id': fid, 'nom': nom_f,
                              'duree': f.get('duree_mois') or 0,
                              'metiers': met_count})

generic_fils.sort(key=lambda x: -x['metiers'])

# ─── AUDIT 7 : SECTEUR INFORMATIQUE SUR FORMATIONS NON-IT ────────────────────
NON_IT_SIGNALS = [
    'medecin', 'pharmacie', 'biologie', 'chimie', 'physique', 'agronomie',
    'veterinaire', 'architecture', 'droit', 'juridique', 'finance', 'comptabilite',
    'audit', 'fiscalite', 'tourisme', 'hotellerie', 'enseignement', 'education',
    'crmef', 'lettres', 'litterature', 'histoire', 'geographie', 'sociologie',
    'psychologie', 'genie civil', 'batiment', 'btp', 'electrique', 'mecanique',
    'thermique', 'hydraulique', 'energie', 'peche', 'forestier', 'sport', 'eps',
    'marine', 'maritime', 'cinema', 'audiovisuel', 'graphisme', 'design',
    'musique', 'arts'
]
bad_secteur_it = []
for f in filieres:
    if str(f.get('secteur', '')).lower() != 'informatique':
        continue
    nom_f = f.get('nom_fr', '').lower()
    for sig in NON_IT_SIGNALS:
        if sig in nom_f:
            bad_secteur_it.append({'id': str(f['id']), 'nom': f.get('nom_fr', ''),
                                   'signal': sig, 'accessible': str(f['id']) in acc_filieres})
            break

bad_secteur_it.sort(key=lambda x: -int(x['accessible']))

# ─── AUDIT 8 : DOUBLONS DE FORMATIONS (même nom, IDs différents) ─────────────
fil_by_norm = defaultdict(list)
for f in filieres:
    key = normalize(f.get('nom_fr', ''))
    if len(key) > 10:
        fil_by_norm[key].append(str(f['id']))

dup_filieres = {k: ids for k, ids in fil_by_norm.items() if len(ids) > 1}

# Impact : combien d'arêtes redondantes ?
dup_fil_edge_waste = 0
for k, ids in dup_filieres.items():
    for fid in ids[1:]:
        dup_fil_edge_waste += len(rec_by_filiere.get(fid, []))

# ─── AUDIT 9 : METIERS AVEC ZÉRO RECRUTEMENT ACCESSIBLE ─────────────────────
dead_metiers = []
for m in metiers:
    mid = str(m['id'])
    if mid in acc_metiers:
        continue
    sources = rec_by_metier.get(mid, [])
    dead_metiers.append({
        'id': mid, 'nom': m.get('nom_fr', ''),
        'secteur': m.get('secteur', ''),
        'recrutement_total': len(sources),
        'recrutement_acc': 0  # par définition inaccessible
    })

dead_metiers.sort(key=lambda x: -x['recrutement_total'])

# ─── AUDIT 10 : ARÊTES DUPLIQUÉES ───────────────────────────────────────────
edge_pairs = Counter()
for e in edges:
    key = (str(e['source_id']), str(e['target_id']), e['type_lien'])
    edge_pairs[key] += 1

dup_edges = {k: v for k, v in edge_pairs.items() if v > 1}

# ─── AUDIT 11 : MONOPOLE ETABLISSEMENT PAR METIER ────────────────────────────
# Un METIER dont 80%+ des FILIEREs accessibles viennent du même ETAB = suspect
monopoly = []
for cnt, mid, mnom in metier_score[:200]:
    acc_fils = list(metier_to_filieres_acc.get(mid, set()))
    if len(acc_fils) < 5:
        continue
    etab_counter = Counter()
    for fid in acc_fils:
        for eid in op_forward.get(fid, []):
            etab_counter[eid] += 1
    if not etab_counter:
        continue
    top_etab, top_cnt = etab_counter.most_common(1)[0]
    ratio = top_cnt / len(acc_fils)
    if ratio >= 0.7:
        monopoly.append({
            'metier': mnom, 'total_fils': len(acc_fils),
            'top_etab': nom(top_etab), 'top_etab_count': top_cnt,
            'ratio': ratio
        })

monopoly.sort(key=lambda x: -x['ratio'])

# ─── AUDIT 12 : FORMATIONS DONT LA VILLE EST DANS LE NOM MAIS PAS DANS LE CHAMP ─
ville_mismatch = []
for f in filieres:
    nom_f = f.get('nom_fr', '').lower()
    ville_f = (f.get('ville') or '').lower()
    fid = str(f['id'])
    if fid not in acc_filieres:
        continue
    for v in VILLES_MAROC:
        if v in nom_f and not ville_f:
            # Ville dans le nom mais champ ville vide
            ville_mismatch.append({'id': fid, 'nom': f.get('nom_fr', ''), 'ville_trouvee': v})
            break

ville_mismatch.sort(key=lambda x: x['ville_trouvee'])

# ─── RAPPORT ─────────────────────────────────────────────────────────────────
SEP = '─' * 80

def section(title):
    print(f'\n{SEP}')
    print(f'  {title}')
    print(SEP)

print('=' * 80)
print('  AUDIT GLOBAL DU GRAPHE SGPO — RAPPORT COMPLET')
print(f'  {len(nodes)} nœuds | {len(edges)} arêtes | {len(acc_metiers)}/{len(metiers)} METIERs accessibles')
print('=' * 80)

# ══════════════════════════════════════════════════════════════
print('\n\n██████████████████  CRITIQUE  ██████████████████')
# ══════════════════════════════════════════════════════════════

section(f'C1 — DOUBLONS D\'ETABLISSEMENTS ({len(dup_etab_groups)} groupes, {len(dup_etab_ids)} IDs)')
print(f'  Impact : {len(dup_impact_metiers)}/{len(top100_mids)} METIERs du Top-100 affectés')
print()
for k, ids in sorted(dup_etab_groups.items(), key=lambda x: -len(x[1]))[:25]:
    for eid in ids:
        n = nodes_by_id.get(eid)
        ville = n.get('ville', '?') if n else '?'
        nom_f = n.get('nom_fr', eid)[:60] if n else eid
        print(f'  [{eid[:8]}] {nom_f}  ({ville})')
    print()

section(f'C2 — METIERS INACCESSIBLES ({len(dead_metiers)} METIERs sur {len(metiers)} — {len(dead_metiers)/len(metiers)*100:.1f}%)')
print(f'  (hors Top-100, classés par nombre de RECRUTEMENT existants)')
print()
for m in dead_metiers[:30]:
    src_label = f'{m["recrutement_total"]} RECRUTEMENT(s) mais tous inacc.' if m['recrutement_total'] else 'AUCUN RECRUTEMENT'
    print(f'  ✗ [{m["secteur"][:25]:<25}] {m["nom"][:50]:<50} | {src_label}')

section(f'C3 — PARCOURS INCOMPATIBLES ({len(incompat_paths)} METIERs affectés)')
print(f'  Cas : Doctorat/Thèse → Métier technicien/commercial/agent')
print()
for p in incompat_paths[:20]:
    print(f'  METIER : {p["metier"]}')
    for inc in p['incompatibles'][:3]:
        print(f'    ← {inc[:70]}')
    print()

section(f'C4 — ETABLISSEMENTS ÉTRANGERS ACCESSIBLES ({len(foreign_etabs)} ETABs)')
print()
for e in foreign_etabs:
    label = f'[{e["fils_accessibles"]} FILIEREs acc.]' if e['fils_accessibles'] else '[0 FIL acc.]'
    print(f'  {label} {e["nom"][:65]}  ({e["ville"] or "?"}) ← kw: "{e["kw"]}"')

# ══════════════════════════════════════════════════════════════
print('\n\n██████████████████  MAJEUR  ██████████████████')
# ══════════════════════════════════════════════════════════════

section(f'M1 — DURÉES INCOHÉRENTES ({len(duration_issues)} formations)')
print()
by_type = defaultdict(list)
for d in duration_issues:
    for iss in d['issues']:
        key = iss.split('_')[0]
        by_type[key].append(d)

for typ, items in sorted(by_type.items(), key=lambda x: -len(x[1])):
    print(f'  [{len(items)} cas] {typ}')
    for it in items[:5]:
        acc_label = 'ACC' if it['accessible'] else 'inacc'
        print(f'    [{acc_label}][{it["duree"]}m] {it["nom"][:65]}')
    if len(items) > 5:
        print(f'    ... et {len(items)-5} autres')
    print()

section(f'M2 — FORMATIONS SANS VILLE ACCESSIBLES ({len(fil_sans_ville)} FILIEREs)')
print(f'  (classées par nombre de METIERs connectés)')
print()
for f in fil_sans_ville[:30]:
    etab_hint = f' → ETABs villes: {", ".join(f["etab_villes"][:2])}' if f['etab_villes'] else ''
    print(f'  [{f["duree"]}m][{f["metiers_count"]} METIERs] {f["nom"][:60]}{etab_hint}')

section(f'M3 — FORMATIONS GÉNÉRIQUES FLOTTANTES ({len(generic_fils)} FILIEREs sans ETAB réel)')
print(f'  Pas de ville + pas d\'ETAB (OFFERTE_PAR) + nom générique')
print()
for f in generic_fils[:25]:
    print(f'  [{f["duree"]}m][→{f["metiers"]} METIERs] {f["nom"][:70]}')

section(f'M4 — DOUBLONS DE FORMATIONS ({len(dup_filieres)} groupes)')
print(f'  Même nom normalisé, IDs différents (arêtes redondantes gaspillées: ~{dup_fil_edge_waste})')
print()
for k, ids in sorted(dup_filieres.items(), key=lambda x: -len(x[1]))[:20]:
    print(f'  [{len(ids)} copies] "{k[:60]}"')
    for fid in ids[:3]:
        acc_l = 'ACC' if fid in acc_filieres else 'inacc'
        print(f'    [{acc_l}] id={fid[:36]} | {duree(fid)}m | ville={nodes_by_id.get(fid, {}).get("ville", "?") or "?"}')
    print()

section(f'M5 — MONOPOLE D\'ETABLISSEMENT ({len(monopoly)} METIERs)')
print(f'  METIER où ≥70% des FILIEREs accessibles viennent du même ETAB (non réaliste)')
print()
for m in monopoly[:15]:
    print(f'  {m["metier"][:50]:<50} | {m["top_etab_count"]}/{m["total_fils"]} FILIEREs ({m["ratio"]*100:.0f}%) via {m["top_etab"][:40]}')

section(f'M6 — VILLE DANS NOM MAIS CHAMP VILLE VIDE ({len(ville_mismatch)} FILIEREs)')
print()
by_ville = defaultdict(list)
for v in ville_mismatch:
    by_ville[v['ville_trouvee']].append(v['nom'])
for v, noms in sorted(by_ville.items(), key=lambda x: -len(x[1])):
    print(f'  {v.title()} ({len(noms)} FILIEREs)')
    for n in noms[:3]:
        print(f'    {n[:70]}')
    if len(noms) > 3:
        print(f'    ... et {len(noms)-3} autres')
    print()

# ══════════════════════════════════════════════════════════════
print('\n\n██████████████████  MINEUR  ██████████████████')
# ══════════════════════════════════════════════════════════════

section(f'mi1 — SECTEUR="Informatique" SUR FORMATIONS NON-IT ({len(bad_secteur_it)} formations)')
print()
by_signal = defaultdict(list)
for b in bad_secteur_it:
    by_signal[b['signal']].append(b)
for sig, items in sorted(by_signal.items(), key=lambda x: -len(x[1]))[:12]:
    print(f'  [{len(items)} cas] mot-clé détecté: "{sig}"')
    for it in items[:3]:
        acc_l = 'ACC' if it['accessible'] else 'inacc'
        print(f'    [{acc_l}] {it["nom"][:65]}')
    if len(items) > 3:
        print(f'    ... et {len(items)-3} autres')
    print()

section(f'mi2 — ARÊTES DUPLIQUÉES ({len(dup_edges)} paires)')
print(f'  (impact BFS nul, mais gonfle le fichier de {sum(v-1 for v in dup_edges.values())} arêtes)')
print()
by_type = Counter(lt for _, _, lt in dup_edges.keys())
for lt, cnt in by_type.most_common():
    print(f'  {cnt} paires en {lt}')

section('mi3 — SYNONYMES D\'ETABLISSEMENTS (noms différents, même institution)')
print(f'  ({len(synonym_real_dupes)} groupes de synonymes détectés)')
print()
for (lf, ab), ids in list(synonym_real_dupes.items())[:10]:
    print(f'  Groupe "{ab.upper()}" ({len(ids)} IDs) :')
    for eid in list(ids)[:3]:
        n = nodes_by_id.get(eid)
        if n:
            print(f'    [{eid[:8]}] {n.get("nom_fr","")[:60]}  ({n.get("ville","?")})')
    print()

# ─── SYNTHÈSE FINALE ────────────────────────────────────────────────────────
print('\n' + '=' * 80)
print('  SYNTHÈSE — PRIORITÉ DE CORRECTION')
print('=' * 80)
print(f"""
CRITIQUE (bloquer correction immédiate) :
  C1 — {len(dup_etab_groups)} groupes d'ETABs dupliqués  →  fausse décompte, double les parcours
       Impact : {len(dup_impact_metiers)}/{len(top100_mids)} METIERs Top-100 affectés
  C2 — {len(dead_metiers)} METIERs inaccessibles ({len(dead_metiers)/len(metiers)*100:.1f}%)  →  jamais affichés aux étudiants
  C3 — {len(incompat_paths)} METIERs techniques accessibles via Doctorat  →  parcours irréalistes
  C4 — {len(foreign_etabs)} ETABs étrangers présents  →  orientation hors Maroc

MAJEUR (dégradent la qualité des résultats) :
  M1 — {len(duration_issues)} durées incohérentes (BTS≠24m, Doctorat<72m, CPGE≠24m)
  M2 — {len(fil_sans_ville)} FILIEREs accessibles sans ville  →  impossible filtrer géographiquement
  M3 — {len(generic_fils)} FILIEREs génériques sans ETAB réel  →  parcours irréels
  M4 — {len(dup_filieres)} groupes de FILIEREs dupliquées  →  chemins redondants
  M5 — {len(monopoly)} METIERs avec >70% parcours depuis 1 ETAB  →  absence de diversité
  M6 — {len(ville_mismatch)} FILIEREs avec ville dans le nom mais champ vide  →  filtre ville KO

MINEUR (cosmétique / optimisation) :
  mi1 — {len(bad_secteur_it)} FILIEREs avec secteur="Informatique" incorrect
  mi2 — {len(dup_edges)} paires d'arêtes dupliquées (+{sum(v-1 for v in dup_edges.values())} arêtes superflues)
  mi3 — {len(synonym_real_dupes)} groupes de synonymes d'ETABs (noms différents = même école)
""")

print('Ordre de traitement recommandé :')
print('  Jour 1 : C1 (merge ETABs) + C4 (supprimer ETABs étrangers) + M1 (corriger durées)')
print('  Jour 2 : M6 (remplir ville depuis nom) + M2 (FILIEREs sans ville via ETAB)')
print('  Jour 3 : C3 (supprimer arêtes RECRUTEMENT incohérentes) + M4 (dédupliquer FILIEREs)')
print('  Jour 4 : C2 (ajouter RECRUTEMENT pour METIERs morts) + mi1 (corriger secteurs)')
