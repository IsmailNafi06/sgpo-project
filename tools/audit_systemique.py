"""
audit_systemique.py — Audit systémique complet du graphe SGPO.

Couvre :
  Phase 1 : Corrections à forte confiance (doublons, synonymes, villes, durées,
            secteurs, nœuds morts, filières isolées, établissements fermés).
  Phase 2 : Manques (familles sous-représentées, ETAB/FILIERE/METIER manquants,
            couverture géographique, couverture par domaine).

Ne modifie aucun fichier.
"""
import json, re, sys, unicodedata
from collections import defaultdict, Counter, deque

sys.stdout.reconfigure(encoding='utf-8')

NODES_PATH = 'backend/src/main/resources/data/nodes_all.json'
EDGES_PATH  = 'backend/src/main/resources/data/edges.json'

with open(NODES_PATH, 'r', encoding='utf-8-sig') as f:
    nodes = json.load(f)
with open(EDGES_PATH, 'r', encoding='utf-8-sig') as f:
    edges = json.load(f)

nodes_by_id = {str(n['id']): n for n in nodes}
all_node_ids = set(nodes_by_id.keys())

# ── Helpers ───────────────────────────────────────────────────────────────────
def norm(s):
    s = (s or '').lower().strip()
    s = unicodedata.normalize('NFD', s)
    s = ''.join(c for c in s if unicodedata.category(c) != 'Mn')
    s = re.sub(r"[''`]", '', s)
    s = re.sub(r'[^a-z0-9 ]', ' ', s)
    return re.sub(r'\s+', ' ', s).strip()

def is_uuid(s):
    return bool(re.match(r'^[0-9a-f]{8}-', str(s).lower()))

SEP  = '─' * 80
SEP2 = '═' * 80

def header(title):
    print(f'\n{SEP2}')
    print(f'  {title}')
    print(SEP2)

def sub(title):
    print(f'\n{SEP}')
    print(f'  {title}')
    print(SEP)

# ── Séparation par type ───────────────────────────────────────────────────────
etabs   = {str(n['id']): n for n in nodes if n.get('type') == 'ETABLISSEMENT'}
filieres= {str(n['id']): n for n in nodes if n.get('type') == 'FILIERE'}
metiers = {str(n['id']): n for n in nodes if n.get('type') == 'METIER'}
bac_ids = {nid for nid, n in filieres.items()
           if str(n.get('code','')).startswith('BAC_')}
real_fil= {nid for nid in filieres if nid not in bac_ids}

# ── Index des arêtes ─────────────────────────────────────────────────────────
edge_count_node = defaultdict(int)   # nb d'aretes par noeud
op_fwd  = defaultdict(list)          # filiere_id  → [etab_id]   (OFFERTE_PAR fwd)
op_rev  = defaultdict(list)          # etab_id     → [filiere_id] (OFFERTE_PAR rev)
da_edges= []                         # (src, tgt)  DONNE_ACCES
rec_fwd = defaultdict(list)          # filiere_id  → [metier_id]  (RECRUTEMENT)
rec_rev = defaultdict(list)          # metier_id   → [filiere_id]
adm_edges= []                        # (src, tgt)  ADMISSION
dangling = []                        # edges avec src/tgt absent
self_loops = []
dup_edge_keys = set()
dup_edges = []

seen_edges = set()
for e in edges:
    s, t = str(e['source_id']), str(e['target_id'])
    lt   = e['type_lien']
    if s not in all_node_ids or t not in all_node_ids:
        dangling.append(e); continue
    if s == t:
        self_loops.append(e); continue
    key = (s, t, lt)
    if key in seen_edges:
        dup_edges.append(e); continue
    seen_edges.add(key)
    edge_count_node[s] += 1
    edge_count_node[t] += 1
    if lt == 'OFFERTE_PAR':
        op_fwd[s].append(t)
        op_rev[t].append(s)
    elif lt == 'DONNE_ACCES':
        da_edges.append((s, t))
    elif lt == 'RECRUTEMENT':
        rec_fwd[s].append(t)
        rec_rev[t].append(s)
    elif lt == 'ADMISSION':
        adm_edges.append((s, t))

# ── BFS complet depuis tous les BACs ─────────────────────────────────────────
graph = defaultdict(list)
for s, t in da_edges:
    graph[s].append((t, 'DA'))
for etab_id, fils in op_rev.items():
    for f in fils:
        graph[etab_id].append((f, 'OP_REV'))
for s, t in adm_edges:
    graph[s].append((t, 'ADM'))
for fid, mids in rec_fwd.items():
    for mid in mids:
        graph[fid].append((mid, 'REC'))

acc_filieres = set()
acc_metiers  = set()

for bac_id in bac_ids:
    visited = {bac_id}
    queue   = deque([(bac_id, False, False)])
    while queue:
        cur, aFL, aOP = queue.popleft()
        nd = nodes_by_id.get(cur)
        if not nd: continue
        ntype = nd.get('type','')
        if ntype == 'FILIERE' and cur not in bac_ids:
            acc_filieres.add(cur)
        if ntype == 'METIER':
            acc_metiers.add(cur); continue
        for nb, etype in graph[cur]:
            if nb in visited: continue
            nb_nd = nodes_by_id.get(nb)
            if not nb_nd: continue
            if etype in ('OP_REV', 'ADM'):
                if aFL and nb_nd.get('type') == 'FILIERE' and (nb_nd.get('duree_mois') or 0) >= 24:
                    continue
            if etype == 'OP_REV' and aOP:
                continue
            new_aFL = aFL
            new_aOP = (etype == 'OP_REV')
            cur_nd = nodes_by_id.get(cur)
            if cur_nd and cur_nd.get('type') == 'FILIERE' and cur not in bac_ids:
                if (cur_nd.get('duree_mois') or 0) >= 24:
                    new_aFL = True
            visited.add(nb)
            queue.append((nb, new_aFL, new_aOP))

inacc_filieres = real_fil - acc_filieres
inacc_metiers  = set(metiers.keys()) - acc_metiers

# ═════════════════════════════════════════════════════════════════════════════
# SECTION 0 — STATISTIQUES DE BASE
# ═════════════════════════════════════════════════════════════════════════════
header('SECTION 0 — STATISTIQUES GLOBALES DU DATASET')

print(f'\nNOEUDS : {len(nodes)} total')
print(f'  ETABLISSEMENT : {len(etabs)}')
print(f'  FILIERE total : {len(filieres)}  (dont BAC : {len(bac_ids)}  |  réelles : {len(real_fil)})')
print(f'  METIER        : {len(metiers)}')
print(f'\nARETES : {len(edges)} total (avant dédup)')
edge_types = Counter(e['type_lien'] for e in edges)
for lt, cnt in sorted(edge_types.items(), key=lambda x: -x[1]):
    print(f'  {lt:<25}: {cnt}')

print(f'\nACCESSIBILITE BFS :')
print(f'  FILIEREs accessibles depuis BAC : {len(acc_filieres)} / {len(real_fil)}  ({100*len(acc_filieres)/max(len(real_fil),1):.1f}%)')
print(f'  METIERs accessibles depuis BAC  : {len(acc_metiers)} / {len(metiers)}  ({100*len(acc_metiers)/max(len(metiers),1):.1f}%)')
print(f'\nPROBLEMES STRUCTURELS IMMEDIATS :')
print(f'  Arêtes orphelines (src/tgt absent) : {len(dangling)}')
print(f'  Self-loops                          : {len(self_loops)}')
print(f'  Arêtes dupliquées (même s+t+type)   : {len(dup_edges)}')

# ═════════════════════════════════════════════════════════════════════════════
# SECTION 1 — PHASE 1 : NETTOYAGE SÛR
# ═════════════════════════════════════════════════════════════════════════════
header('SECTION 1 — PHASE 1 : CORRECTIONS À FORTE CONFIANCE')

# ─── 1.1 Doublons ETAB (nom_norm + ville_norm identiques) ────────────────────
sub('1.1 DOUBLONS ETAB (nom normalisé + ville identiques)')
etab_key_map = defaultdict(list)
for nid, n in etabs.items():
    k = (norm(n.get('nom_fr','')), norm(n.get('ville') or ''))
    etab_key_map[k].append(nid)
dup_etab_groups = {k: v for k, v in etab_key_map.items() if len(v) > 1}
total_dup_etab_nodes = sum(len(v)-1 for v in dup_etab_groups.values())

print(f'  Groupes de doublons ETAB exacts   : {len(dup_etab_groups)}')
print(f'  Nœuds ETAB redondants à supprimer : {total_dup_etab_nodes}')
print(f'  Impact : arêtes redirigées (estimé par groupes à > 0 arête)')
print(f'  Niveau de confiance : CERTAINE — correction automatique : OUI')
non_zero_dup = sum(1 for ids in dup_etab_groups.values()
                   for nid in ids[1:] if edge_count_node[nid] > 0)
print(f'  Nœuds redondants avec arêtes actives : {non_zero_dup}')

# ─── 1.2 Synonymes ETAB (abréviation ↔ nom complet même ville) ───────────────
sub('1.2 SYNONYMES ETAB (abréviation ↔ nom complet, même ville)')
# Patterns d'abréviations courantes → clé normalisée
ABBR_MAP = {
    'ensa': 'ecole nationale des sciences appliquees',
    'encg': 'ecole nationale de commerce et de gestion',
    'ensias': 'ecole nationale superieure d informatique et d analyse des systemes',
    'ensam': 'ecole nationale superieure d arts et metiers',
    'fst':   'faculte des sciences et techniques',
    'fmp':   'faculte de medecine et de pharmacie',
    'fmd':   'faculte de medecine dentaire',
    'fsjes': 'faculte des sciences juridiques economiques et sociales',
    'fs':    'faculte des sciences',
    'fp':    'faculte polydisciplinaire',
    'fp ':   'faculte polydisciplinaire',
    'est':   'ecole superieure de technologie',
    'cpge':  'classes preparatoires aux grandes ecoles',
    'crmef': 'centre regional des metiers de l education et de la formation',
    'iav':   'institut agronomique et veterinaire',
    'inpt':  'institut national des postes et telecommunications',
    'emi':   'ecole mohammadia d ingenieurs',
    'ehtp':  'ecole hassania des travaux publics',
    'iscae': 'institut superieur de commerce et d administration des entreprises',
    'isic':  'institut superieur de l information et de la communication',
    'isma':  'institut superieur de la magistrature',
}

# Pour chaque ville, trouver les paires (abbrev, complet)
ville_to_etabs = defaultdict(list)
for nid, n in etabs.items():
    v = norm(n.get('ville') or '')
    ville_to_etabs[v].append(nid)

synonym_pairs = []
for ville, nids in ville_to_etabs.items():
    abbrev_nodes = {}
    complet_nodes = {}
    for nid in nids:
        n = etabs[nid]
        nm = norm(n.get('nom_fr',''))
        # Détecter si c'est une abréviation pure (courte, non composée)
        words = nm.split()
        if len(words) <= 3:
            # Vérifier si commence par une abréviation connue
            for abbr, full in ABBR_MAP.items():
                if nm.startswith(abbr) and (nm == abbr or nm == abbr + ' ' + ville):
                    abbrev_nodes[abbr] = nid
                    break
        else:
            # Nom complet : chercher si commence par l'expansion d'une abréviation
            for abbr, full in ABBR_MAP.items():
                full_n = norm(full)
                if nm.startswith(full_n[:min(len(full_n), 25)]):
                    complet_nodes[abbr] = nid
                    break

    for abbr in set(abbrev_nodes) & set(complet_nodes):
        aid = abbrev_nodes[abbr]
        cid = complet_nodes[abbr]
        an = etabs[aid]
        cn = etabs[cid]
        af = len(op_rev.get(aid, []))
        cf = len(op_rev.get(cid, []))
        synonym_pairs.append({
            'abbr_id': aid, 'abbr_nom': an.get('nom_fr'), 'abbr_filieres': af,
            'comp_id': cid, 'comp_nom': cn.get('nom_fr'), 'comp_filieres': cf,
            'ville': an.get('ville',''),
        })

print(f'  Paires synonymes détectées  : {len(synonym_pairs)}')
pairs_with_data_on_abbr = [p for p in synonym_pairs if p['abbr_filieres'] > 0]
pairs_abbr_empty        = [p for p in synonym_pairs if p['abbr_filieres'] == 0]
print(f'    → Abréviation vide (0 FIL) : {len(pairs_abbr_empty)}  ← fusion sans risque')
print(f'    → Abréviation avec FILIEREs: {len(pairs_with_data_on_abbr)}  ← vérification requise')
print(f'  Niveau de confiance : HAUTE pour les {len(pairs_abbr_empty)} vides · MOYENNE pour les {len(pairs_with_data_on_abbr)} actives')
print(f'  Correction automatique : OUI pour les vides, semi-auto pour les actives')

# Top exemples de paires vides
print(f'\n  Exemples de synonymes (abréviation vide → à fusionner dans nom complet) :')
for p in sorted(pairs_abbr_empty, key=lambda x: -etabs[x['comp_id']].get('id','') if False else 0)[:8]:
    print(f'    [{p["abbr_filieres"]} FIL] {p["abbr_nom"]:<45} → {p["comp_nom"][:45]}')

# ─── 1.3 ETABs fantômes (0 arêtes) ──────────────────────────────────────────
sub('1.3 ETABLISSEMENTS FANTÔMES (0 arête)')
zero_edge_etabs = [nid for nid in etabs if edge_count_node[nid] == 0]
zero_filiere_etabs = [nid for nid in etabs if len(op_rev.get(nid,[])) == 0]

print(f'  ETABs avec 0 arête totale     : {len(zero_edge_etabs)}')
print(f'  ETABs avec 0 FILIERE liée     : {len(zero_filiere_etabs)}')
print(f'  Impact : nœuds inutiles, ne contribuent à aucun parcours')
print(f'  Niveau de confiance : CERTAINE pour les 0-arête · HAUTE pour les 0-FILIERE')
print(f'  Correction automatique : suppression directe pour les 0-arête')

# Sous-catégories
phantom_with_suffix = sum(1 for nid in zero_edge_etabs
                          if etabs[nid].get('nom_fr','').endswith(' -'))
print(f'    → ETABs 0-arête avec nom se terminant par " -" (import incomplet) : {phantom_with_suffix}')

# ─── 1.4 Villes incorrectes / manquantes sur ETAB ────────────────────────────
sub('1.4 VILLES ETAB — incorrectes ou manquantes')

etabs_no_ville = [nid for nid, n in etabs.items()
                  if not (n.get('ville') or '').strip()]
print(f'  ETABs sans ville              : {len(etabs_no_ville)}')

# Villes déductibles depuis le nom (pattern "ETAB de Xyz" ou "ETAB Xyz")
KNOWN_CITIES = [
    'Rabat','Casablanca','Fes','Fès','Marrakech','Agadir','Tanger','Oujda',
    'Meknes','Meknès','Kénitra','Kenitra','Settat','El Jadida','Beni Mellal',
    'Beni-Mellal','Errachidia','Laayoune','Laâyoune','Dakhla','Safi','Tetouan',
    'Tétouan','Nador','Al Hoceima','Al Hoceïma','Khouribga','Berrechid',
    'Khemisset','Khenifra','Sale','Salé','Ifrane','Benguerir','Ben Guerir',
    'Mohammedia','Mohammedia','Taroudant','Guelmim','Guelmim','Essaouira',
    'Chefchaouen','Taza','Bouznika','Temara','Ain Chock','Ouarzazate',
    'Tiznit','Tan-Tan','Benslimane'
]
city_norm_map = {norm(c): c for c in KNOWN_CITIES}

deducible_ville = 0
for nid in etabs_no_ville:
    nm = norm(etabs[nid].get('nom_fr',''))
    for cn, cr in city_norm_map.items():
        if cn in nm:
            deducible_ville += 1; break

print(f'  ETABs sans ville mais ville déductible depuis nom : {deducible_ville}')
print(f'  Niveau de confiance : HAUTE pour déductibles · BASSE pour les autres')
print(f'  Correction automatique : OUI pour les déductibles (regex + map)')

# Cas ENSA Safi spécifique
ensa_safi = next((nid for nid, n in etabs.items()
                  if 'sciences appliquees' in norm(n.get('nom_fr','')) and 'safi' in norm(n.get('nom_fr',''))), None)
if ensa_safi:
    v = etabs[ensa_safi].get('ville','')
    print(f'\n  Cas confirmé ENSA Safi : ville="{v}" → devrait être "Safi"')
    print(f'    Arêtes: {edge_count_node[ensa_safi]}  |  FILIEREs: {len(op_rev.get(ensa_safi,[]))}')

# ─── 1.5 Villes sur FILIEREs ─────────────────────────────────────────────────
sub('1.5 VILLES FILIERE — manquantes ou incohérentes')

fil_no_ville = [nid for nid in real_fil
                if not (filieres[nid].get('ville') or '').strip()]
fil_accessible_no_ville = [nid for nid in fil_no_ville if nid in acc_filieres]

print(f'  FILIEREs réelles sans ville       : {len(fil_no_ville)}')
print(f'    → dont accessibles via BFS      : {len(fil_accessible_no_ville)}')
print(f'  Impact : filtre géographique frontend inopérant pour {len(fil_accessible_no_ville)} FILIEREs accessibles')
print(f'  Correction automatique : OUI via ETAB parent (OFFERTE_PAR) pour les FILIEREs liées à un ETAB')

# Combien ont un ETAB avec ville ?
deducible_from_etab = 0
for nid in fil_no_ville:
    etab_ids = op_fwd.get(nid, [])
    for eid in etab_ids:
        if etabs.get(eid, {}).get('ville'):
            deducible_from_etab += 1; break
print(f'    → Ville déductible depuis ETAB (OFFERTE_PAR) : {deducible_from_etab}')

# Incohérences ville FILIERE vs ETAB
fil_ville_mismatch = []
for nid, n in filieres.items():
    if nid in bac_ids: continue
    fv = norm(n.get('ville') or '')
    if not fv: continue
    for eid in op_fwd.get(nid, []):
        ev = norm(etabs.get(eid, {}).get('ville') or '')
        if ev and fv and fv != ev:
            fil_ville_mismatch.append((nid, n.get('nom_fr','')[:50], fv, eid, ev))
            break

print(f'\n  FILIEREs avec ville ≠ ville ETAB (incohérence) : {len(fil_ville_mismatch)}')
if fil_ville_mismatch:
    print(f'  Exemples :')
    for fid, fn, fv, eid, ev in fil_ville_mismatch[:5]:
        print(f'    FILIERE={fn} | ville_fil={fv} | ville_etab={ev}')

# ─── 1.6 Durées incohérentes ──────────────────────────────────────────────────
sub('1.6 DURÉES FILIERE — incohérentes avec le système marocain')

# Règles de durée marocaines par mot-clé dans le nom de la filière
DURATION_RULES = [
    # (keyword_in_name, expected_durations, label)
    (['bts', 'brevet de technicien superieur'], [24],      'BTS = 24 mois'),
    (['dut', 'diplome universitaire de technologie'], [24], 'DUT = 24 mois'),
    (['cpge', 'classe preparatoire'], [24],                 'CPGE = 24 mois'),
    (['licence '], [36],                                    'Licence = 36 mois'),
    (['master '], [24],                                     'Master = 24 mois (post-licence)'),
    (['doctorat'], [36, 96, 72],                            'Doctorat ≥ 36 mois'),
]

# Durée de 0 ou None
zero_dur = [nid for nid in real_fil if not (filieres[nid].get('duree_mois') or 0)]
print(f'  FILIEREs sans durée (0 ou None) : {len(zero_dur)}')
print(f'    → dont accessibles            : {sum(1 for nid in zero_dur if nid in acc_filieres)}')

# Distribution des durées
dur_counter = Counter()
for nid in real_fil:
    d = filieres[nid].get('duree_mois') or 0
    dur_counter[d] += 1

print(f'\n  Distribution des durées (top 15) :')
for d, cnt in sorted(dur_counter.items(), key=lambda x: -x[1])[:15]:
    bar = '█' * min(cnt // 5, 40)
    print(f'    {d:>4} mois : {cnt:>4}  {bar}')

# Anomalies par règle
print(f'\n  Anomalies détectées :')
total_anomalies = 0
dur_anomalies = []
for keywords, valid_durs, label in DURATION_RULES:
    hits = []
    for nid in real_fil:
        nm = norm(filieres[nid].get('nom_fr',''))
        if any(kw in nm for kw in keywords):
            d = filieres[nid].get('duree_mois') or 0
            # Pour doctorat : ≥ 36 mois est valide
            if keywords[0] == 'doctorat':
                if d < 36:
                    hits.append((nid, d))
            elif d not in valid_durs:
                hits.append((nid, d))
    if hits:
        total_anomalies += len(hits)
        dur_anomalies.extend([(nid, d, label) for nid, d in hits])
        print(f'    [{len(hits):>3}] {label} — {hits[0][1]}m trouvé')
    else:
        print(f'    [  0] {label} — OK')

print(f'\n  Total anomalies durée : {total_anomalies}')
print(f'  Niveau de confiance : HAUTE · Correction automatique : SEMI (déduction par type)')

# ─── 1.7 Doublons FILIERE ────────────────────────────────────────────────────
sub('1.7 DOUBLONS FILIERE (même nom normalisé + même ville ETAB)')

fil_key_map = defaultdict(list)
for nid in real_fil:
    n = filieres[nid]
    nm = norm(n.get('nom_fr',''))
    v  = norm(n.get('ville') or '')
    d  = n.get('duree_mois') or 0
    fil_key_map[(nm, v, d)].append(nid)

dup_fil_groups = {k: v for k, v in fil_key_map.items() if len(v) > 1}
total_dup_fil  = sum(len(v)-1 for v in dup_fil_groups.values())

# Doublons exacts même ETAB (les plus sûrs à supprimer)
same_etab_dups = 0
for k, nids in dup_fil_groups.items():
    # Vérifier si plusieurs nids ont le même ETAB parent
    etab_sets = [set(op_fwd.get(nid, [])) for nid in nids]
    if len(nids) >= 2:
        for i in range(len(etab_sets)):
            for j in range(i+1, len(etab_sets)):
                if etab_sets[i] & etab_sets[j]:
                    same_etab_dups += 1

print(f'  Groupes de doublons FILIERE (nom+ville+durée) : {len(dup_fil_groups)}')
print(f'  FILIEREs redondantes totales                  : {total_dup_fil}')
print(f'  Paires avec même ETAB parent (sûres à suppr.) : {same_etab_dups}')
print(f'  Niveau de confiance : HAUTE · Correction automatique : OUI')

# ─── 1.8 FILIEREs isolées ────────────────────────────────────────────────────
sub('1.8 FILIÈRES ISOLÉES (ni OFFERTE_PAR ni DONNE_ACCES du BAC)')

# FILIEREs sans OFFERTE_PAR
no_op = [nid for nid in real_fil if not op_fwd.get(nid)]
# Parmi celles-là, celles aussi sans DONNE_ACCES depuis BAC
da_targets_from_bac = {t for s, t in da_edges if s in bac_ids}
truly_isolated = [nid for nid in no_op if nid not in da_targets_from_bac]
isolated_with_rec = [nid for nid in truly_isolated if rec_fwd.get(nid)]
isolated_no_rec   = [nid for nid in truly_isolated if not rec_fwd.get(nid)]

print(f'  FILIEREs sans OFFERTE_PAR                     : {len(no_op)}')
print(f'    → dont aussi sans DONNE_ACCES BAC (isolées) : {len(truly_isolated)}')
print(f'    → isolées avec RECRUTEMENT (METIER atteignable si ETAB présent) : {len(isolated_with_rec)}')
print(f'    → isolées sans RECRUTEMENT (nœuds vraiment morts)               : {len(isolated_no_rec)}')
print(f'  Niveau de confiance : CERTAINE pour les nœuds morts')
print(f'  Correction : créer OFFERTE_PAR si ETAB identifiable dans le nom (semi-auto)')

# FILIEREs sans aucune connexion
dead_fil = [nid for nid in real_fil if edge_count_node[nid] == 0]
print(f'\n  FILIEREs sans aucune arête (mortes) : {len(dead_fil)}')

# ─── 1.9 METIERs inaccessibles ───────────────────────────────────────────────
sub('1.9 METIERS INACCESSIBLES depuis le BFS')

print(f'  METIERs inaccessibles BFS      : {len(inacc_metiers)} / {len(metiers)}')

# Cause de l'inaccessibilité
no_rec_metiers   = [nid for nid in inacc_metiers if not rec_rev.get(nid)]
all_inacc_source = [nid for nid in inacc_metiers
                    if rec_rev.get(nid) and
                    all(fid not in acc_filieres for fid in rec_rev[nid])]

print(f'    → Aucune arête RECRUTEMENT entrante            : {len(no_rec_metiers)}')
print(f'    → RECRUTEMENT existe mais FILIEREs inaccessibles: {len(all_inacc_source)}')
print(f'  Niveau de confiance : CERTAINE pour les sans RECRUTEMENT')
print(f'  Correction auto : NON — nécessite ajout d\'arêtes RECRUTEMENT (données manquantes)')

# ─── 1.10 Secteurs incorrects ────────────────────────────────────────────────
sub('1.10 SECTEURS FILIERE — manifestement incorrects')

# FILIEREs avec secteur="Informatique" mais nom non-IT
IT_KEYWORDS = ['informatique', 'data', 'cyber', 'reseaux', 'digital', 'logiciel',
               'systeme information', 'intelligence artificielle', 'big data',
               'genie logiciel', 'developpement', 'web', 'bases de donnees',
               'securite', 'ia ', ' ia', 'cloud', 'iot', 'programmation']

wrong_secteur_it = []
non_it_keywords_found = Counter()
for nid in real_fil:
    n = filieres[nid]
    if n.get('secteur') != 'Informatique': continue
    nm = norm(n.get('nom_fr',''))
    is_it = any(kw in nm for kw in IT_KEYWORDS)
    if not is_it:
        wrong_secteur_it.append(nid)
        # Détecter le vrai domaine
        for kw in ['droit','chimie','physique','finance','mecanique','genie civil',
                   'agro','biologie','medecin','tourisme','langues','lettres',
                   'economie','architecture','electronique']:
            if kw in nm:
                non_it_keywords_found[kw] += 1

print(f'  FILIEREs secteur="Informatique" mais contenu non-IT : {len(wrong_secteur_it)}')
print(f'  Top domaines réels pour ces FILIEREs :')
for kw, cnt in non_it_keywords_found.most_common(10):
    print(f'    {kw:<20}: {cnt}')

# FILIEREs sans secteur
no_secteur = [nid for nid in real_fil
              if not (filieres[nid].get('secteur') or '').strip()]
print(f'\n  FILIEREs sans secteur (vide/null) : {len(no_secteur)}')
print(f'  Niveau de confiance : HAUTE · Correction automatique : OUI (règles sur mots-clés)')

# ─── 1.11 Établissements fermés / obsolètes ───────────────────────────────────
sub('1.11 ÉTABLISSEMENTS FERMÉS OU SUSPECTS')
CLOSED_KEYWORDS = ['insa euro', 'euro-mediterran', 'euro mediterran']
FOREIGN_PATTERNS = ['nancy', 'paris ', 'lyon ', 'bordeaux ', 'toulouse ',
                    ' france', 'belgique', 'canada ', 'suisse']
closed = []
foreign = []
for nid, n in etabs.items():
    nm = norm(n.get('nom_fr',''))
    if any(kw in nm for kw in CLOSED_KEYWORDS):
        closed.append(nid)
    if any(kw in nm for kw in FOREIGN_PATTERNS):
        foreign.append(nid)

print(f'  ETABs potentiellement fermés (INSA Euro-Med) : {len(closed)}')
for nid in closed:
    n = etabs[nid]
    print(f'    {n.get("nom_fr")} | ville={n.get("ville")} | arêtes={edge_count_node[nid]}')

print(f'  ETABs suspects (mots-clés pays étranger)     : {len(foreign)}')
for nid in foreign:
    n = etabs[nid]
    print(f'    {n.get("nom_fr")} | ville={n.get("ville")} | arêtes={edge_count_node[nid]}')

# ─── 1.12 Nœuds avec nom se terminant par " -" (import incomplet) ─────────────
sub('1.12 NŒUDS AVEC NOM INCOMPLET (se termine par " -")')
incomplete_name_etab = [nid for nid, n in etabs.items()
                        if (n.get('nom_fr') or '').rstrip().endswith(' -')]
incomplete_name_fil  = [nid for nid in real_fil
                        if (filieres[nid].get('nom_fr') or '').rstrip().endswith(' -')]
print(f'  ETABs avec nom se terminant par " -"   : {len(incomplete_name_etab)}')
print(f'    → dont 0 arêtes                      : {sum(1 for nid in incomplete_name_etab if edge_count_node[nid]==0)}')
print(f'  FILIEREs avec nom se terminant par " -": {len(incomplete_name_fil)}')
print(f'  Niveau de confiance : HAUTE · Impact : qualité d\'affichage frontend')

# ─── RÉCAPITULATIF PHASE 1 ───────────────────────────────────────────────────
sub('RÉCAPITULATIF PHASE 1 — CORRECTIONS SÛRES')
print(f'''
  CATÉGORIE                          | NŒUDS  | CONFIANCE    | AUTO
  ─────────────────────────────────────────────────────────────────
  Doublons ETAB exacts               | {total_dup_etab_nodes:>5}  | CERTAINE     | OUI
  Synonymes ETAB (abrév. vide)       | {len(pairs_abbr_empty):>5}  | HAUTE        | OUI
  Synonymes ETAB (abrév. avec FIL)   | {len(pairs_with_data_on_abbr):>5}  | MOYENNE      | SEMI
  ETABs 0-arête (fantômes)           | {len(zero_edge_etabs):>5}  | CERTAINE     | OUI
  ETABs 0-FILIERE (non fantômes)     | {len(zero_filiere_etabs)-len(zero_edge_etabs):>5}  | HAUTE        | NON
  ENSA Safi ville=Marrakech          |     1  | CERTAINE     | OUI
  ETABs ville déduite depuis nom     | {deducible_ville:>5}  | HAUTE        | OUI
  FILIEREs ville déduite depuis ETAB | {deducible_from_etab:>5}  | HAUTE        | OUI
  FILIEREs ville ≠ ETAB             | {len(fil_ville_mismatch):>5}  | HAUTE        | OUI
  Doublons FILIERE (nom+ville+durée) | {total_dup_fil:>5}  | HAUTE        | OUI
  FILIEREs isolées mortes            | {len(isolated_no_rec):>5}  | CERTAINE     | OUI
  FILIEREs sans durée               | {len(zero_dur):>5}  | CERTAINE     | SEMI
  Anomalies durée BTS/CPGE/Doctorat  | {total_anomalies:>5}  | HAUTE        | SEMI
  METIERs 0-RECRUTEMENT             | {len(no_rec_metiers):>5}  | CERTAINE     | NON*
  Secteur="Informatique" faux        | {len(wrong_secteur_it):>5}  | HAUTE        | OUI
  Noms incomplets (" -")            | {len(incomplete_name_etab)+len(incomplete_name_fil):>5}  | HAUTE        | OUI
  ETABs fermés/suspects             | {len(closed)+len(foreign):>5}  | HAUTE        | SEMI
  * nécessite ajout d'arêtes données
''')

# ═════════════════════════════════════════════════════════════════════════════
# SECTION 2 — PHASE 2 : ANALYSE DES MANQUES
# ═════════════════════════════════════════════════════════════════════════════
header('SECTION 2 — PHASE 2 : ANALYSE DES MANQUES')

# ─── 2.1 Couverture géographique ─────────────────────────────────────────────
sub('2.1 COUVERTURE GÉOGRAPHIQUE')

# Villes avec des FILIEREs accessibles
acc_cities = Counter()
for nid in acc_filieres:
    v = filieres[nid].get('ville') or ''
    if v.strip():
        acc_cities[v] += 1

# Villes avec des ETABs
etab_cities = Counter()
for n in etabs.values():
    v = n.get('ville') or ''
    if v.strip():
        etab_cities[v] += 1

print(f'  Villes avec au moins 1 FILIERE accessible : {len(acc_cities)}')
print(f'\n  Top 20 villes par FILIEREs accessibles :')
for city, cnt in acc_cities.most_common(20):
    etab_cnt = etab_cities.get(city, 0)
    print(f'    {city:<25}: {cnt:>4} FILIEREs acc.  |  {etab_cnt:>3} ETABs')

print(f'\n  Villes avec ETABs mais 0 FILIEREs accessibles :')
zero_acc_cities = [(c, cnt) for c, cnt in etab_cities.items()
                   if acc_cities.get(c, 0) == 0 and cnt > 0]
zero_acc_cities.sort(key=lambda x: -x[1])
for city, cnt in zero_acc_cities[:15]:
    print(f'    {city:<25}: {cnt} ETABs mais 0 FIL accessibles')

# Régions marocaines importantes : vérifier couverture
MAJOR_CITIES = ['Rabat','Casablanca','Fes','Marrakech','Agadir','Tanger','Oujda',
                'Meknes','Kenitra','Settat','El Jadida','Beni Mellal','Safi',
                'Tetouan','Errachidia','Laayoune','Dakhla','Khouribga','Nador',
                'Khenifra','Sale','Mohammedia','Guelmim']
print(f'\n  Couverture grandes villes marocaines :')
for city in MAJOR_CITIES:
    # Chercher avec variations
    cnt_fil = sum(v for c, v in acc_cities.items()
                  if norm(c).startswith(norm(city)[:5]))
    cnt_etab = sum(v for c, v in etab_cities.items()
                   if norm(c).startswith(norm(city)[:5]))
    status = '✓' if cnt_fil > 0 else '✗'
    print(f'    {status} {city:<20}: {cnt_etab:>3} ETABs | {cnt_fil:>4} FILIEREs acc.')

# ─── 2.2 Couverture par domaine ──────────────────────────────────────────────
sub('2.2 COUVERTURE PAR DOMAINE (SECTEUR)')

# Distribution secteur pour FILIEREs accessibles
acc_secteurs = Counter()
for nid in acc_filieres:
    s = filieres[nid].get('secteur') or 'Non défini'
    acc_secteurs[s] += 1

# Distribution secteur pour METIERs
metier_secteurs = Counter()
for n in metiers.values():
    s = n.get('secteur') or 'Non défini'
    metier_secteurs[s] += 1

acc_metier_secteurs = Counter()
for nid in acc_metiers:
    s = metiers[nid].get('secteur') or 'Non défini'
    acc_metier_secteurs[s] += 1

print(f'  Secteurs représentés dans FILIEREs accessibles : {len(acc_secteurs)}')
print(f'\n  Top secteurs — FILIEREs accessibles :')
for s, cnt in acc_secteurs.most_common(20):
    m_cnt = acc_metier_secteurs.get(s, 0)
    print(f'    {s:<35}: {cnt:>4} FIL  |  {m_cnt:>3} MET acc.')

print(f'\n  Secteurs de METIERs avec aucune FILIERE accessible de même secteur :')
for s, cnt in metier_secteurs.most_common():
    if acc_secteurs.get(s, 0) == 0 and cnt > 0:
        print(f'    {s:<35}: {cnt} METIERs sans couverture FILIERE')

# ─── 2.3 Analyse des FILIEREs manquantes ─────────────────────────────────────
sub('2.3 FILIÈRES IMPORTANTES MANQUANTES (estimation)')

# FILIEREs accessibles par type (durée)
dur_dist_acc = Counter()
for nid in acc_filieres:
    d = filieres[nid].get('duree_mois') or 0
    if d == 0: bucket = 'Non défini'
    elif d <= 12: bucket = '≤12m (Bac+1)'
    elif d <= 24: bucket = '24m (Bac+2: BTS/DUT/CPGE)'
    elif d <= 36: bucket = '36m (Bac+3: Licence)'
    elif d <= 60: bucket = '37-60m (Bac+4/5: Master/Ing.)'
    elif d <= 84: bucket = '61-84m (Bac+6/7: Médecine/Archi)'
    else:         bucket = '>84m (Doctorat)'
    dur_dist_acc[bucket] += 1

print(f'  Distribution FILIEREs accessibles par niveau :')
for bucket, cnt in sorted(dur_dist_acc.items()):
    print(f'    {bucket:<35}: {cnt}')

# Ratio Licences vs Master (Maroc : ~3:1 normal)
lic_cnt = dur_dist_acc.get('36m (Bac+3: Licence)', 0)
mas_cnt = dur_dist_acc.get('37-60m (Bac+4/5: Master/Ing.)', 0)
if lic_cnt > 0:
    print(f'\n  Ratio Licence/Master : {lic_cnt}/{mas_cnt} = {lic_cnt/max(mas_cnt,1):.1f}  (attendu: ~3:1 à 2:1)')

# ─── 2.4 Familles de METIERs sous-représentées ─────────────────────────────────
sub('2.4 FAMILLES DE METIERS SOUS-REPRÉSENTÉES')

# Comparer nb de METIERs accessibles par secteur
print(f'  METIERs totaux vs accessibles par secteur :')
for s, total in metier_secteurs.most_common(25):
    acc = acc_metier_secteurs.get(s, 0)
    pct = 100 * acc / total if total else 0
    flag = ' ←← PROBLÈME' if pct < 50 and total > 3 else ''
    print(f'    {s:<35}: {acc:>3}/{total:<3} ({pct:.0f}%){flag}')

# ─── 2.5 ETABs officiels manquants (estimation) ─────────────────────────────
sub('2.5 ÉTABLISSEMENTS OFFICIELS POTENTIELLEMENT MANQUANTS')

# Vérifier présence des réseaux officiels connus
OFFICIAL_NETWORKS = {
    'ENSA (13 écoles)': ([
        'ensa agadir','ensa al hoceima','ensa beni mellal','ensa berrechid',
        'ensa el jadida','ensa fes','ensa khouribga','ensa kenitra',
        'ensa marrakech','ensa oujda','ensa safi','ensa tanger','ensa tetouan'
    ], 13),
    'ENCG (12 écoles)': ([
        'encg agadir','encg beni mellal','encg casablanca','encg dakhla',
        'encg el jadida','encg fes','encg kenitra','encg marrakech',
        'encg meknes','encg oujda','encg settat','encg tanger'
    ], 12),
    'FMP (11 facultés)': ([
        'medecine pharmacie rabat','medecine pharmacie casablanca',
        'medecine pharmacie marrakech','medecine pharmacie fes',
        'medecine pharmacie oujda','medecine pharmacie tanger',
        'medecine pharmacie agadir','medecine pharmacie laayoune',
        'medecine pharmacie beni mellal','medecine pharmacie guelmim',
        'medecine pharmacie errachidia'
    ], 11),
    'ENA (6 écoles)': ([
        'architecture rabat','architecture fes','architecture marrakech',
        'architecture tetouan','architecture agadir','architecture oujda'
    ], 6),
    'ENSAM (3 écoles)': ([
        'arts metiers casablanca','arts metiers meknes','arts metiers rabat'
    ], 3),
    'FST (réseau)': ([
        'sciences techniques fes','sciences techniques settat',
        'sciences techniques tanger','sciences techniques errachidia',
        'sciences techniques beni mellal','sciences techniques mohammedia',
        'sciences techniques laayoune','sciences techniques kenitra'
    ], 8),
}

etab_names_norm = [norm(n.get('nom_fr','')) for n in etabs.values()]

for network, (keywords, expected) in OFFICIAL_NETWORKS.items():
    found = 0
    for kw in keywords:
        kw_parts = kw.split()
        if any(all(p in en for p in kw_parts) for en in etab_names_norm):
            found += 1
    status = '✓' if found >= expected else f'? ({found}/{expected})'
    print(f'  {network:<30}: {status}')

# ─── 2.6 Manques classifiés A/B/C ────────────────────────────────────────────
sub('2.6 MANQUES CLASSIFIÉS (A=sans nouvelles données / B=nouvelles données / C=validation humaine)')

print('''
  A — CORRIGEABLE SANS NOUVELLES DONNÉES :
  ─────────────────────────────────────────
  A1. Villes FILIEREs déductibles depuis ETAB parent (OFFERTE_PAR)
      → Impact : filtre géographique pour ~{deducible} FILIEREs accessibles
  A2. Secteur "Informatique" corrigé par règles mots-clés
      → ~{wrong_it} FILIEREs mal classées reclassifiables
  A3. Synonymes ETAB vides fusionnés vers nœud complet
      → ~{syn} paires → moins de confusion dans l'affichage
  A4. Noms incomplets (" -") nettoyés (trim du suffixe)
      → qualité affichage frontend
  A5. Doublons FILIERE (même nom+ville+durée) fusionnés
      → réduction redondance graphe

  B — NÉCESSITE NOUVELLES DONNÉES :
  ──────────────────────────────────
  B1. FILIEREs isolées (~{isolated} sans OFFERTE_PAR) → scraping sites ETAB
      → ~300 FILIEREs potentiellement connectables si ETAB identifié
  B2. METIERs sans RECRUTEMENT ({no_rec}) → scraping ANAPEC/fiches métiers
      → ~46 METIERs à connecter à des FILIEREs existantes
  B3. Durées manquantes ({zero_dur_count} FILIEREs) → scraping annuaires ETAB
  B4. FMPs Beni Mellal, Guelmim, Errachidia partiellement manquantes
      → 3 ETABs à vérifier et compléter

  C — NÉCESSITE VALIDATION HUMAINE :
  ────────────────────────────────────
  C1. ENA Casablanca : école existante mais hors concours commun → statut à préciser
  C2. ENSA Casablanca (plein nom) : pas d'ENSA officielle à Casablanca → vérifier
  C3. Synonymes ETAB avec FILIEREs des deux côtés ({active_syn}) → fusionner avec soin
  C4. FILIEREs privées durée 48m (EGE, ESISA) → légitimes mais non-standard
  C5. ETABs "internationaux" suspects → différencier antennes marocaines vs. étrangers
'''.format(
    deducible=deducible_from_etab,
    wrong_it=len(wrong_secteur_it),
    syn=len(pairs_abbr_empty),
    isolated=len(truly_isolated),
    no_rec=len(no_rec_metiers),
    zero_dur_count=len(zero_dur),
    active_syn=len(pairs_with_data_on_abbr),
))

# ═════════════════════════════════════════════════════════════════════════════
# SECTION 3 — PHASE 3 : STRATÉGIE DE SCRAPING
# ═════════════════════════════════════════════════════════════════════════════
header('SECTION 3 — PHASE 3 : STRATÉGIE DE SCRAPING')

print('''
  SOURCE                          | ROI    | NŒUDS ESTIM. | RELATIONS ESTIM. | PRIO
  ────────────────────────────────────────────────────────────────────────────────────
  cursussup.gov.ma                | ÉLEVÉ  | ~200+ ETABs  | ~1 000 OP        | 1 ★★★★★
    → Annuaire officiel MESRSFC, toutes universités et écoles agréées.
    → Permettrait de valider tous les ETABs actuels et d'ajouter les manquants.

  Sites officiels FST/FMP/ENSA... | ÉLEVÉ  | 0 nouveaux   | ~300 OFFERTE_PAR | 2 ★★★★
    → Programmes de chaque école → corriger les FILIEREs isolées (sans OFFERTE_PAR).
    → 1 visite par école = ~5-15 FILIEREs connectées.

  anapec.org.ma (fiches métiers)  | MOYEN  | 0 METIERs    | ~50 RECRUTEMENT  | 3 ★★★
    → Fiches métiers → débouchés → relier METIERs sans RECRUTEMENT.
    → 46 METIERs sans RECRUTEMENT = 46 pages à scraper.

  ofppt.ma (filières TS/BTS)      | MOYEN  | ~20 FILIEREs | ~40 OP           | 3 ★★★
    → Filières techniques manquantes (OFPPT peu représenté dans le graphe).
    → BTS/TS/TH dans des domaines sous-représentés.

  concoursena.ma / tafem.ma       | FAIBLE | 0            | 0                | 4 ★★
    → Seuils d'admission → enrichir duree_mois et moyenne_minimale.
    → Ne crée pas de nouveaux nœuds mais améliore la qualité des arêtes.

  Google Scholar / CNRST           | FAIBLE | 0            | 0                | 5 ★
    → Doctorats → identifier FILIEREs Master/Doctorat manquantes dans certaines FSs.
    → ROI trop faible pour le coût.
''')

# ═════════════════════════════════════════════════════════════════════════════
# SECTION 4 — PHASE 4 : VERSION LIVRABLE
# ═════════════════════════════════════════════════════════════════════════════
header('SECTION 4 — PHASE 4 : VERSION LIVRABLE')

total_safe_fixes = (total_dup_etab_nodes + len(pairs_abbr_empty) +
                    len(zero_edge_etabs) + len(isolated_no_rec) +
                    len(wrong_secteur_it) + len(dup_edges))

print(f'''
  ══════════════════════════════════════════════════════════
  1. CORRECTIONS INDISPENSABLES AVANT LIVRAISON
  ══════════════════════════════════════════════════════════

  [CRITIQUE] ENSA Safi ville=Marrakech → Safi  (1 ETAB + ~10 FILIEREs)
  [CRITIQUE] Synonymes ETAB vides x{len(pairs_abbr_empty)} → fusionner (ENCG, ENSIAS, FST...)
  [CRITIQUE] ETABs 0-arête fantômes x{len(zero_edge_etabs)} → supprimer
  [CRITIQUE] Doublons ETAB exacts x{total_dup_etab_nodes} → fusionner
  [CRITIQUE] FILIEREs ville manquante (déductible) x{deducible_from_etab} → fill_ville
  [CRITIQUE] Secteur "Informatique" faux x{len(wrong_secteur_it)} → reclassifier
  [CRITIQUE] FILIEREs mortes (0 arête) x{len(dead_fil)} → supprimer
  [CRITIQUE] INSA Euro-Méd (fermé 2022, 0 arête) → supprimer

  ══════════════════════════════════════════════════════════
  2. CORRECTIONS AMÉLIORANT FORTEMENT LA QUALITÉ
  ══════════════════════════════════════════════════════════

  [MAJEUR] Doublons FILIERE x{total_dup_fil} → fusionner
  [MAJEUR] FILIEREs isolées mais connectables x{len(isolated_with_rec)} → créer OFFERTE_PAR
  [MAJEUR] METIERs sans RECRUTEMENT x{len(no_rec_metiers)} → ajouter arêtes
  [MAJEUR] Noms " -" incomplets x{len(incomplete_name_etab)+len(incomplete_name_fil)} → nettoyer
  [MAJEUR] ETABs avec "Ville" dans nom_fr (redondant) → normaliser

  ══════════════════════════════════════════════════════════
  3. CE QUI PEUT RESTER EN L'ÉTAT
  ══════════════════════════════════════════════════════════

  [OK] FILIEREs privées durée 48m (EGE, ESISA) → légitimes
  [OK] ESSTI Rabat → école privée marocaine accréditée
  [OK] ENA Casablanca → à conserver, marquée "concours propre"
  [OK] IAV Hassan II → nom légèrement redondant mais fonctionnel
  [OK] FILIEREs Doctorat/Master sans ville → peu prioritaire

  ══════════════════════════════════════════════════════════
  4. GAIN ATTENDU APRÈS CORRECTIONS DE PHASE 1
  ══════════════════════════════════════════════════════════

  Avant corrections :
    METIERs accessibles : {len(acc_metiers)} / {len(metiers)}  ({100*len(acc_metiers)/max(len(metiers),1):.1f}%)
    FILIEREs accessibles: {len(acc_filieres)} / {len(real_fil)}  ({100*len(acc_filieres)/max(len(real_fil),1):.1f}%)
    FILIEREs avec ville : {len(real_fil)-len(fil_no_ville)} / {len(real_fil)}

  Après Phase 1 (estimé) :
    METIERs accessibles : ~{min(len(acc_metiers)+10, len(metiers))} / {len(metiers)-len(no_rec_metiers)}  (suppression orphelins)
    FILIEREs accessibles: ~{len(acc_filieres)+len(isolated_with_rec)//3} / {len(real_fil)-len(dead_fil)-total_dup_fil}  (isolation corrigée)
    FILIEREs avec ville : ~{len(real_fil)-len(fil_no_ville)+deducible_from_etab} / {len(real_fil)}  (fill_ville appliqué)

  ══════════════════════════════════════════════════════════
  5. ESTIMATION DU TEMPS
  ══════════════════════════════════════════════════════════

  Phase 1 — scripts automatiques :
    merge_etabs_v2.py (synonymes ENCG, ENSIAS, FST)  : ~1h script + test
    fix_ville_etab.py (ENSA Safi + déductibles)       : ~30min
    fill_ville_from_etab.py (FILIEREs)               : ~30min
    clean_secteurs.py (455 faux Informatique)         : ~30min
    delete_phantoms.py (0-arête)                     : ~20min
    clean_names.py (noms " -")                       : ~20min
    Total Phase 1                                    : ~4h

  Phase 2 — données partielles (sans scraping) :
    fill_offerte_par.py (FILIEREs isolées connues)   : ~2h
    add_recrutement.py (46 METIERs sans lien)        : ~3h
    Total Phase 2 partielle                          : ~5h

  Phase 3 — scraping optionnel :
    cursussup.gov.ma (validation ETABs)              : ~4h
    Sites ENSA/FST/FMP (FILIEREs manquantes)         : ~8h
    Total Phase 3                                    : ~12h

  ══════════════════════════════════════════════════════════
  6. SCRAPING INDISPENSABLE OU NON ?
  ══════════════════════════════════════════════════════════

  RÉPONSE : NON pour une version livrable v1.
             OUI pour une version fiable à 95%+.

  Sans scraping (Phase 1 seulement) :
    → Graphe cohérent et sans erreurs majeures
    → Couverture METIERs ~{100*len(acc_metiers)/max(len(metiers),1):.0f}% → estimé ~{min(100*len(acc_metiers)/max(len(metiers),1)+5, 97):.0f}%
    → Géographie correcte pour les villes avec données
    → Données non vérifiées mais sans contradiction flagrante

  Avec scraping cursussup.gov.ma (1 source, 4h) :
    → Validation de tous les ETABs actuels
    → Détection des ETABs fictifs ou fermés
    → Couverture géographique complétée pour les grandes villes
    → Recommandé fortement avant livraison finale

  Sans scraping, les risques résiduels sont :
    • ~{len(zero_filiere_etabs)-len(zero_edge_etabs)} ETABs avec 0 FILIERE mais >0 arêtes (DONNE_ACCES seul)
    • ~{len(truly_isolated)} FILIEREs potentiellement liées à de faux ETABs
    • Quelques ETABs privés non vérifiés dans le graphe
''')

print(f'\n[Audit terminé] {len(nodes)} nœuds · {len(edges)} arêtes analysés.')
