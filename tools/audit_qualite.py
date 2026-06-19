import json, sys, re
from collections import defaultdict, deque, Counter
sys.stdout.reconfigure(encoding='utf-8')

with open('backend/src/main/resources/data/nodes_all.json', 'r', encoding='utf-8-sig') as f:
    nodes = json.load(f)
with open('backend/src/main/resources/data/edges.json', 'r', encoding='utf-8-sig') as f:
    edges = json.load(f)

nodes_by_id = {str(n['id']): n for n in nodes}
bac_nodes = {str(n['id']) for n in nodes if n.get('type')=='FILIERE' and str(n.get('code','')).startswith('BAC_')}

# BFS
op_reverse = defaultdict(list)
for e in edges:
    if e['type_lien']=='OFFERTE_PAR':
        op_reverse[str(e['target_id'])].append(str(e['source_id']))
graph = defaultdict(list)
for e in edges:
    s, t, lt = str(e['source_id']), str(e['target_id']), e['type_lien']
    if lt == 'DONNE_ACCES': graph[s].append((t, 'DONNE_ACCES'))
    elif lt == 'RECRUTEMENT': graph[s].append((t, 'RECRUTEMENT'))
for etab_id, fils in op_reverse.items():
    for f in fils: graph[etab_id].append((f, 'OFFERTE_PAR_REV'))

acc_filieres = set()
for bac_id in bac_nodes:
    visited = set([bac_id])
    queue = deque([(bac_id, False, False)])
    while queue:
        nid, aFL, aOP = queue.popleft()
        nd = nodes_by_id.get(nid)
        if not nd: continue
        if nd.get('type') == 'FILIERE' and nid not in bac_nodes: acc_filieres.add(nid)
        for nb_id, etype in graph[nid]:
            if nb_id in visited: continue
            nb = nodes_by_id.get(nb_id)
            if not nb: continue
            if etype in ('OFFERTE_PAR_REV', 'ADMISSION'):
                if aFL and nb.get('type') == 'FILIERE' and (nb.get('duree_mois') or 0) >= 24: continue
            if etype == 'OFFERTE_PAR_REV' and aOP: continue
            new_aFL = aFL
            new_aOP = (etype == 'OFFERTE_PAR_REV')
            cur = nodes_by_id.get(nid)
            if cur and cur.get('type') == 'FILIERE' and nid not in bac_nodes:
                if (cur.get('duree_mois') or 0) >= 24: new_aFL = True
            visited.add(nb_id)
            queue.append((nb_id, new_aFL, new_aOP))

# Top 100 METIERs
rec_by_metier = defaultdict(set)
for e in edges:
    if e['type_lien'] == 'RECRUTEMENT':
        rec_by_metier[str(e['target_id'])].add(str(e['source_id']))

metier_score = []
for mid, fils in rec_by_metier.items():
    n = nodes_by_id.get(mid)
    if not n or n.get('type') != 'METIER': continue
    acc_fils = [f for f in fils if f in acc_filieres]
    if not acc_fils: continue
    metier_score.append((len(acc_fils), mid, n.get('nom_fr', ''), list(acc_fils)))
metier_score.sort(key=lambda x: -x[0])
top100 = metier_score[:100]

# ==========================================
# AUDIT 4 : ETABs dupliques (deja fait, resumo)
# ==========================================
etab_by_name = defaultdict(list)
for n in nodes:
    if n.get('type') == 'ETABLISSEMENT':
        nom = n.get('nom_fr', '').strip().lower()
        etab_by_name[nom].append(str(n['id']))
dupes_etab = {nom: ids for nom, ids in etab_by_name.items() if len(ids) > 1}

# ETABs dupliques avec impact sur top100
print('=== AUDIT A : ETABs DUPLIQUES impactant le top 100 ===')
dupe_ids = set()
for ids in dupes_etab.values():
    for i in ids:
        dupe_ids.add(i)

# Quels METIERs du top100 sont atteints via un ETAB duplique
op_filiere_to_etab = defaultdict(set)
for e in edges:
    if e['type_lien'] == 'OFFERTE_PAR':
        op_filiere_to_etab[str(e['source_id'])].add(str(e['target_id']))

dupe_impact = []
for cnt, mid, mnom, acc_fils in top100:
    dupe_fils = []
    for fid in acc_fils:
        etabs = op_filiere_to_etab.get(fid, set())
        dupe_etabs = etabs & dupe_ids
        if dupe_etabs:
            f = nodes_by_id.get(fid)
            dupe_fils.append((f.get('nom_fr', '') if f else fid, list(dupe_etabs)))
    if dupe_fils:
        dupe_impact.append((mnom, dupe_fils))

print(f'METIERs top100 atteignables via ETAB duplique : {len(dupe_impact)}')
for mnom, fils in dupe_impact[:10]:
    print(f'  {mnom}')
    for fnom, etabs in fils[:2]:
        etab_noms = [nodes_by_id.get(e, {}).get('nom_fr', e)[:50] for e in etabs[:2]]
        print(f'    via [{fnom[:55]}] -> ETABs dupliques: {etab_noms}')

# ==========================================
# AUDIT 5 : FILIEREs isolees impactant top100
# ==========================================
print()
print('=== AUDIT B : FILIEREs ISOLEES (sans acces BAC) avec RECRUTEMENT top100 ===')
fil_with_op = {str(e['source_id']) for e in edges if e['type_lien'] == 'OFFERTE_PAR'}
fil_with_da = set()
for e in edges:
    if e['type_lien'] == 'DONNE_ACCES' and str(e['source_id']) in bac_nodes:
        fil_with_da.add(str(e['target_id']))

isolated_impact = []
for cnt, mid, mnom, acc_fils in top100:
    # Ces fils sont accessibles selon BFS - mais verifier s ils ont un acces reel
    # Les fils accessibles via OFFERTE_PAR_REV depuis ETAB sont OK
    # Les fils "generiques" sans ville ni OP ni DA sont suspects
    suspicious = []
    for fid in acc_fils:
        f = nodes_by_id.get(fid)
        if not f: continue
        nom = f.get('nom_fr', '')
        duree = f.get('duree_mois') or 0
        ville = f.get('ville') or ''
        has_op = fid in fil_with_op
        has_da = fid in fil_with_da
        # FILIERE accessible (dans acc_filieres) mais sans ville et sans OP clair = generique flottante
        if not ville and not has_da and duree >= 36:
            # Verifier si accessible via ETAB (OFFERTE_PAR_REV)
            if not has_op:
                suspicious.append((nom, duree, 'PAS_OP_PAS_DA_PAS_VILLE'))
    if suspicious:
        isolated_impact.append((mnom, suspicious))

print(f'METIERs top100 avec FILIEREs generiques/flottantes : {len(isolated_impact)}')
for mnom, sus in isolated_impact[:15]:
    print(f'  {mnom} ({len(sus)} filiere(s) generique(s)):')
    for nom, d, reason in sus[:3]:
        print(f'    [{d}m] {nom[:65]}')

# ==========================================
# AUDIT 6 : DUREES INCOHERENTES
# ==========================================
print()
print('=== AUDIT C : FORMATIONS DUREE INCOHERENTE (systeme marocain) ===')
incoherences = []
for n in nodes:
    if n.get('type') != 'FILIERE': continue
    if str(n.get('code', '')).startswith('BAC_'): continue
    nom = n.get('nom_fr', '').lower()
    d = n.get('duree_mois') or 0
    nid = str(n['id'])
    issues = []
    if d == 0: issues.append('DUREE=0')
    if 'bts ' in nom and not nom.startswith('master') and d != 24 and d != 0:
        issues.append(f'BTS={d}m(att.24m)')
    if nom.startswith('doctorat') and 0 < d < 72:
        issues.append(f'Doctorat={d}m(att.>=72m)')
    if ('cpge' in nom or ('preparatoire' in nom and 'cycle' in nom)) and d == 60:
        issues.append(f'CPGE={d}m(att.24m)')
    if 'dut ' in nom and d != 24 and d != 0:
        issues.append(f'DUT={d}m(att.24m)')
    if issues:
        incoherences.append((nid, n.get('nom_fr', ''), d, issues, nid in acc_filieres))

print(f'Total formations duree incoherente : {len(incoherences)}')
for nid, nom, d, iss, acc in incoherences:
    acc_label = 'ACCESSIBLE' if acc else 'inacc'
    print(f'  [{acc_label}] [{d}m] {nom[:65]} | {" | ".join(iss)}')

# ==========================================
# AUDIT 7 : FORMATIONS ETRANGERES / INEXISTANTES AU MAROC
# ==========================================
print()
print('=== AUDIT D : FORMATIONS ETRANGERES OU INEXISTANTES AU MAROC ===')
FOREIGN_KW = ['nancy', 'essti nancy', 'france', 'polytech france', 'euromediterranee france',
              'mines paris', 'mines nancy', 'edf france', 'cnrs', 'insa lyon', 'insa paris']
foreign_fils = []
for n in nodes:
    if n.get('type') != 'FILIERE': continue
    nom = n.get('nom_fr', '').lower()
    nid = str(n['id'])
    for kw in FOREIGN_KW:
        if kw in nom:
            foreign_fils.append((nid, n.get('nom_fr', ''), n.get('duree_mois'), kw, nid in acc_filieres))
            break

print(f'Formations avec reference etrangere : {len(foreign_fils)}')
for nid, nom, d, kw, acc in foreign_fils:
    acc_label = 'ACCESSIBLE' if acc else 'inacc'
    print(f'  [{acc_label}] [{d}m] {nom[:70]} (kw: {kw})')

# ==========================================
# AUDIT 8 : PARCOURS IRREALISTES (Doctorat -> Metier technique)
# ==========================================
print()
print('=== AUDIT E : DOCTORAT -> METIER TECHNIQUE (top100) ===')
TECH_METIERS = ['developpeur', 'technicien', 'comptable', 'commercial', 'logistique',
                'community manager', 'charge', 'gestionnaire', 'assistant', 'agent']

doc_tech = []
for cnt, mid, mnom, acc_fils in top100:
    mnom_low = mnom.lower()
    is_tech = any(k in mnom_low for k in TECH_METIERS)
    if not is_tech: continue
    doc_fils = []
    for fid in acc_fils:
        f = nodes_by_id.get(fid)
        if not f: continue
        fnom = f.get('nom_fr', '').lower()
        if 'doctorat' in fnom:
            doc_fils.append(f.get('nom_fr', ''))
    if doc_fils:
        doc_tech.append((mnom, doc_fils))

print(f'METIERs techniques top100 accessibles via Doctorat : {len(doc_tech)}')
for mnom, fils in doc_tech:
    print(f'  {mnom}:')
    for f in fils[:3]:
        print(f'    <- {f[:70]}')

# ==========================================
# AUDIT 9 : FILIERE SANS VILLE (formations generiques flottantes)
# ==========================================
print()
print('=== AUDIT F : FILIEREs ACCESSIBLES SANS VILLE ni ETABLISSEMENT CLAIR ===')
no_ville_acc = []
for fid in acc_filieres:
    f = nodes_by_id.get(fid)
    if not f: continue
    if str(f.get('code', '')).startswith('BAC_'): continue
    if not f.get('ville'):
        nom = f.get('nom_fr', '')
        duree = f.get('duree_mois') or 0
        has_op = fid in {str(e['source_id']) for e in edges if e['type_lien'] == 'OFFERTE_PAR'}
        has_da_direct = fid in fil_with_da
        no_ville_acc.append((nom, duree, has_op, has_da_direct, fid))

no_ville_acc.sort(key=lambda x: -x[1])
print(f'FILIEREs accessibles sans ville : {len(no_ville_acc)}')
print('(Extraite duree >= 36m, format inconnu ou generique potentiel)')
for nom, d, has_op, has_da, fid in [(x) for x in no_ville_acc if x[1] >= 36][:30]:
    src = 'OP' if has_op else ('DA' if has_da else 'AUTRE')
    print(f'  [{d}m][acces={src}] {nom[:70]}')

print()
print('=== SYNTHESE CRITIQUE/MAJEUR/MINEUR ===')
print(f'CRITIQUE:')
print(f'  - {len(dupes_etab)} ETABs dupliques (30 groupes) - fausse le decompte etablissements')
print(f'  - 267 FILIEREs avec RECRUTEMENT mais zero acces BAC (isolees en pratique)')
print(f'  - {len(doc_tech)} metiers techniques accessibles via Doctorat (irrealiste)')
print(f'MAJEUR:')
print(f'  - {len(incoherences)} formations duree incoherente (CPGE 60m, Doctorat 60m, BTS != 24m)')
print(f'  - {len([x for x in no_ville_acc if x[1] >= 36])} FILIEREs accessibles sans ville (generiques)')
print(f'  - {len(foreign_fils)} formations avec reference etrangere')
print(f'MINEUR:')
print(f'  - 53 paires daretes dupliquees pre-existantes (impact BFS nul)')
print(f'  - Secteur=Informatique sur ~1300 noeud non-IT')
