"""
apply_phase_a.py — Phase A : Corrections sûres immédiates du graphe SGPO.

Corrections A-01 à A-12 (confiance 100%, sources officielles confirmées).
DRY-RUN par défaut — aucun fichier modifié sans --apply.

USAGE:
  python tools/apply_phase_a.py           # dry-run (par défaut)
  python tools/apply_phase_a.py --apply   # application réelle (après validation)

CORRECTIONS INCLUSES:
  A-01  Supprimer RECRUTEMENT Avocat←Licence/Bachelor (hors SUP'H Droit)
  A-02  Corriger ville ENSA Safi [NO-OP — déjà correct dans les données]
  A-03  Supprimer OFFERTE_PAR ENSA hors-domaine [NO-OP — filières absentes]
  A-04  Supprimer 5 OFFERTE_PAR EST→Infirmier Anesthésie-Réanimation
  A-05  Supprimer 2 OFFERTE_PAR UM6SS-branded dans FMP publique Rabat
  A-06  Fusionner FST Marrakech: 3 nœuds → 1 (FSTG Marrakech)
  A-07  Fusionner FST Fès: 3 nœuds → 1 (FST Saïs Fès)
  A-08  Fusionner FMP fantômes: Rabat (3→1), Tanger (3→1), Errachidia (2→1)
  A-09  Fusionner ISCAE Rabat: id=64 (non-UUID) → nœud UUID
  A-10  Reclassifier ISTAH Mohammadia: secteur "Informatique" → "Hotellerie"
  A-11  Supprimer 3 ETABs FSJES fantômes 0-FIL (Ain Sbaa, Mohammedia, Ait Melloul)
  A-12  Taguer FILIEREs pré-LMD (DESA/DESS/Maîtrise) avec systeme="PRE_LMD"
"""

import json, sys, re, unicodedata, shutil, uuid
from collections import defaultdict
from datetime import datetime
from pathlib import Path

sys.stdout.reconfigure(encoding='utf-8')

DRY_RUN = '--apply' not in sys.argv
NODES_PATH = Path('backend/src/main/resources/data/nodes_all.json')
EDGES_PATH  = Path('backend/src/main/resources/data/edges.json')

# ─── Chargement ───────────────────────────────────────────────────────────────

with open(NODES_PATH, 'r', encoding='utf-8-sig') as f:
    nodes_orig = json.load(f)
with open(EDGES_PATH, 'r', encoding='utf-8-sig') as f:
    edges_orig = json.load(f)

nodes = [dict(n) for n in nodes_orig]
edges = [dict(e) for e in edges_orig]
nodes_by_id = {str(n['id']): n for n in nodes}

# ─── Utilitaires ──────────────────────────────────────────────────────────────

def norm(s):
    s = (s or '').lower().strip()
    s = unicodedata.normalize('NFD', s)
    s = ''.join(c for c in s if unicodedata.category(c) != 'Mn')
    s = re.sub(r"[''`]", '', s)
    s = re.sub(r'[^a-z0-9 ]', ' ', s)
    return re.sub(r'\s+', ' ', s).strip()

def is_uuid(s):
    return bool(re.match(r'^[0-9a-f]{8}-[0-9a-f]{4}-', str(s).lower()))

def edge_count(nid):
    nid = str(nid)
    return sum(1 for e in edges if str(e.get('source_id',''))==nid or str(e.get('target_id',''))==nid)

def offerte_par_count(etab_id):
    eid = str(etab_id)
    return sum(1 for e in edges if e.get('type_lien')=='OFFERTE_PAR' and str(e.get('target_id',''))==eid)

def is_licence_not_master(nom):
    n = norm(nom or '')
    has_lic = 'licence' in n or 'bachelor' in n
    has_sup = any(x in n for x in [
        'master', 'doctorat', 'desa', 'dess', 'maitrise',
        'ingenieur d etat', 'ingenieur etat', 'docteur'
    ])
    return has_lic and not has_sup

# ─── Tracking ─────────────────────────────────────────────────────────────────

deleted_edge_set = set()    # id() des arêtes à supprimer
deleted_node_ids = set()    # str(id) des nœuds à supprimer
orphan_to_repr   = {}       # str(id) orphelin → str(id) représentant
corrections_log  = []       # [(bloc, sous-type, message)]

stats = dict(
    nodes_modified=0,
    nodes_deleted=0,
    edges_deleted=0,
    edges_redirected=0,
    edges_deduped=0,
    self_loops=0,
)

def log(bloc, kind, msg):
    corrections_log.append((bloc, kind, msg))

def register_merge(orphan_id, repr_id, label):
    orphan_to_repr[str(orphan_id)] = str(repr_id)
    deleted_node_ids.add(str(orphan_id))
    stats['nodes_deleted'] += 1
    log('MERGE', 'DEL', f'{orphan_id} ("{label}") → {repr_id}')

# ═══════════════════════════════════════════════════════════════════════════════
# A-01 — RECRUTEMENT Avocat ← Licence/Bachelor
#         Exclusion explicite: SUP'H Droit (private law school)
# ═══════════════════════════════════════════════════════════════════════════════

AVOCAT_IDS = {
    str(n['id']) for n in nodes
    if n.get('type') == 'METIER' and 'avocat' in norm(n.get('nom_fr', ''))
}

a01_deleted = []
a01_suph_kept = []
a01_master_kept = 0

for e in edges:
    if e.get('type_lien') != 'RECRUTEMENT':
        continue
    if str(e.get('target_id', '')) not in AVOCAT_IDS:
        continue
    src = nodes_by_id.get(str(e.get('source_id', '')), {})
    nom = src.get('nom_fr', '') or ''
    if not is_licence_not_master(nom):
        a01_master_kept += 1
        continue
    if 'suph' in norm(nom):
        a01_suph_kept.append(nom)
        continue
    a01_deleted.append(e)

for e in a01_deleted:
    deleted_edge_set.add(id(e))
    stats['edges_deleted'] += 1

tgt_names = list({nodes_by_id.get(str(e.get('target_id','')),{}).get('nom_fr','?') for e in a01_deleted})
log('A-01', 'INFO', f'Avocat METIERs ciblés : {len(AVOCAT_IDS)} ({", ".join(sorted(tgt_names))})')
log('A-01', 'DEL',  f'{len(a01_deleted)} arêtes RECRUTEMENT Licence→Avocat supprimées')
log('A-01', 'KEEP', f'{len(a01_suph_kept)} arêtes SUP\'H Droit EXCLUES (conservées par sécurité)')
for n in a01_suph_kept:
    log('A-01', 'KEEP', f'  → "{n}"')
log('A-01', 'KEEP', f'{a01_master_kept} arêtes Masters/Doctorats/autres conservées')

# ═══════════════════════════════════════════════════════════════════════════════
# A-02 — Ville ENSA Safi [NO-OP : déjà "Safi" dans les données]
# ═══════════════════════════════════════════════════════════════════════════════

for n in nodes:
    if n.get('type') == 'ETABLISSEMENT' and 'safi' in norm(n.get('nom_fr','')) and 'ensa' in norm(n.get('nom_fr','')):
        current_ville = n.get('ville', '')
        if norm(current_ville) == 'safi':
            log('A-02', 'NOOP', f'ENSA Safi ({n["id"]}) ville="{current_ville}" — déjà correct, rien à faire')
        else:
            log('A-02', 'FIX', f'ENSA Safi ({n["id"]}) ville "{current_ville}" → "Safi"')
            if not DRY_RUN:
                n['ville'] = 'Safi'
            stats['nodes_modified'] += 1

# ═══════════════════════════════════════════════════════════════════════════════
# A-03 — OFFERTE_PAR ENSA hors-domaine [NO-OP : filières absentes dans les données]
# ═══════════════════════════════════════════════════════════════════════════════

ENSA_IDS = {
    str(n['id']) for n in nodes
    if n.get('type') == 'ETABLISSEMENT'
    and 'ensa' in norm(n.get('nom_fr', ''))
    and 'ensam' not in norm(n.get('nom_fr', ''))
    and 'ensad' not in norm(n.get('nom_fr', ''))
}

# Mots-clés précis (pas "communication" pour éviter faux-positif avec "télécommunications")
A03_KW = ['journalisme', 'tourisme culturel', 'patrimoine culturel', 'arts visuels',
          'art dramatique', 'design graphique', 'animation culturelle']

a03_found = []
for e in edges:
    if e.get('type_lien') != 'OFFERTE_PAR':
        continue
    if str(e.get('target_id', '')) not in ENSA_IDS:
        continue
    src = nodes_by_id.get(str(e.get('source_id', '')), {})
    src_n = norm(src.get('nom_fr', ''))
    if any(kw in src_n for kw in A03_KW):
        a03_found.append((e, src.get('nom_fr', '?'), nodes_by_id.get(str(e['target_id']), {}).get('nom_fr', '?')))

if a03_found:
    for e, src_nom, tgt_nom in a03_found:
        deleted_edge_set.add(id(e))
        stats['edges_deleted'] += 1
        log('A-03', 'DEL', f'"{src_nom}" → "{tgt_nom}"')
    log('A-03', 'INFO', f'{len(a03_found)} arête(s) ENSA hors-domaine supprimée(s)')
else:
    log('A-03', 'NOOP', 'Aucune filière Journalisme/Arts/Tourisme Culturel liée à une ENSA — NO-OP')

# ═══════════════════════════════════════════════════════════════════════════════
# A-04 — OFFERTE_PAR EST → Infirmier Anesthésie-Réanimation (5 arêtes)
# ═══════════════════════════════════════════════════════════════════════════════

EST_IDS = {
    str(n['id']) for n in nodes
    if n.get('type') == 'ETABLISSEMENT'
    and 'ecole superieure de technologie' in norm(n.get('nom_fr', ''))
}

A04_KW = ['infirmier', 'infirmiere', 'soins infirmier', 'aide soignant',
          'sage femme', 'bloc operatoire', 'kinesitherapie']

a04_deleted = []
for e in edges:
    if e.get('type_lien') != 'OFFERTE_PAR':
        continue
    if str(e.get('target_id', '')) not in EST_IDS:
        continue
    src = nodes_by_id.get(str(e.get('source_id', '')), {})
    src_n = norm(src.get('nom_fr', ''))
    if any(kw in src_n for kw in A04_KW):
        a04_deleted.append(e)
        tgt = nodes_by_id.get(str(e['target_id']), {})
        log('A-04', 'DEL', f'"{src.get("nom_fr","?")}" → "{tgt.get("nom_fr","?")}"')

for e in a04_deleted:
    deleted_edge_set.add(id(e))
    stats['edges_deleted'] += 1

log('A-04', 'INFO', f'{len(a04_deleted)} arête(s) OFFERTE_PAR EST→Infirmier supprimée(s)')
if len(a04_deleted) != 5:
    log('A-04', 'WARN', f'Attendu 5 arêtes, trouvé {len(a04_deleted)} — vérifier')

# ═══════════════════════════════════════════════════════════════════════════════
# A-05 — OFFERTE_PAR UM6SS-branded dans FMP publique Rabat (2 arêtes)
#         Cible: filières portant la marque UM6SS pointant vers des FMPs PUBLIQUES
# ═══════════════════════════════════════════════════════════════════════════════

FMP_PUBLIC_IDS = {
    str(n['id']) for n in nodes
    if n.get('type') == 'ETABLISSEMENT'
    and any(kw in norm(n.get('nom_fr', '')) for kw in [
        'faculte de medecine et de pharmacie',
        'faculte de medecine et pharmacie',
    ])
    and 'mohammed vi' not in norm(n.get('nom_fr', ''))
    and 'um6ss' not in norm(n.get('nom_fr', ''))
    and 'dentaire' not in norm(n.get('nom_fr', ''))
    and 'veterinaire' not in norm(n.get('nom_fr', ''))
    and 'anglophone' not in norm(n.get('nom_fr', ''))
}

A05_KW = ['um6ss', 'um6 ']

a05_deleted = []
for e in edges:
    if e.get('type_lien') != 'OFFERTE_PAR':
        continue
    if str(e.get('target_id', '')) not in FMP_PUBLIC_IDS:
        continue
    src = nodes_by_id.get(str(e.get('source_id', '')), {})
    src_n = norm(src.get('nom_fr', ''))
    if any(kw in src_n for kw in A05_KW):
        a05_deleted.append(e)
        tgt = nodes_by_id.get(str(e['target_id']), {})
        log('A-05', 'DEL', f'"{src.get("nom_fr","?")}" → "{tgt.get("nom_fr","?")}"')

for e in a05_deleted:
    deleted_edge_set.add(id(e))
    stats['edges_deleted'] += 1

log('A-05', 'INFO', f'{len(a05_deleted)} arête(s) UM6SS-branded dans FMP publique supprimée(s)')
if len(a05_deleted) != 2:
    log('A-05', 'WARN', f'Attendu 2 arêtes, trouvé {len(a05_deleted)}')

# ═══════════════════════════════════════════════════════════════════════════════
# A-06 — Fusionner FST Marrakech : 3 nœuds → 1
#         Représentant : FSTG Marrakech (afec1a97, 53 FIL)
#         SAFETY CHECK : EMSI Marrakech et EMSI Marrakech Gueliz doivent être exclus
# ═══════════════════════════════════════════════════════════════════════════════

# Détecter les ETABs EMSI à protéger
EMSI_PROTECTED = set()
for n in nodes:
    if n.get('type') == 'ETABLISSEMENT' and 'emsi' in norm(n.get('nom_fr', '')):
        EMSI_PROTECTED.add(str(n['id']))
        log('A-06', 'SAFE', f'EMSI protégé (institution privée distincte): {n["id"]} "{n.get("nom_fr","?")}"')

# Détecter les 3 FST Marrakech
fst_marra_candidates = []
for n in nodes:
    if n.get('type') != 'ETABLISSEMENT':
        continue
    if str(n['id']) in EMSI_PROTECTED:
        continue
    nom_n = norm(n.get('nom_fr', ''))
    ville_n = norm(n.get('ville', '') or '')
    is_marrakech = 'marrakech' in nom_n or 'marrakech' in ville_n or 'gueliz' in nom_n
    is_fst = ('sciences et techniques' in nom_n or 'fst' in nom_n.split() or
              nom_n.startswith('fst ') or 'fstg' in nom_n)
    if is_marrakech and is_fst:
        fst_marra_candidates.append(n)

# Dédoublonner
seen = set()
fst_marra_uniq = []
for n in fst_marra_candidates:
    if str(n['id']) not in seen:
        seen.add(str(n['id']))
        fst_marra_uniq.append(n)

if len(fst_marra_uniq) >= 2:
    # Représentant = UUID avec le plus d'arêtes total
    uuid_nodes  = [n for n in fst_marra_uniq if is_uuid(n['id'])]
    short_nodes = [n for n in fst_marra_uniq if not is_uuid(n['id'])]
    pool = uuid_nodes if uuid_nodes else short_nodes
    repr_node = max(pool, key=lambda n: edge_count(n['id']))
    orphans   = [n for n in fst_marra_uniq if str(n['id']) != str(repr_node['id'])]
    log('A-06', 'REPR', f'Représentant: {repr_node["id"]} "{repr_node["nom_fr"]}" '
        f'({offerte_par_count(repr_node["id"])} FIL, {edge_count(repr_node["id"])} arêtes)')
    for o in orphans:
        register_merge(o['id'], repr_node['id'],
                       f'{o.get("nom_fr","?")} ({offerte_par_count(o["id"])} FIL)')
else:
    log('A-06', 'WARN', f'Seulement {len(fst_marra_uniq)} nœud(s) FST Marrakech trouvé(s)')

# ═══════════════════════════════════════════════════════════════════════════════
# A-07 — Fusionner FST Fès : 3 nœuds → 1
#         Représentant : "Faculte des Sciences et Techniques Sais Fes" (39 FIL, 45 arêtes)
# ═══════════════════════════════════════════════════════════════════════════════

fst_fes_candidates = []
for n in nodes:
    if n.get('type') != 'ETABLISSEMENT':
        continue
    nom_n = norm(n.get('nom_fr', ''))
    ville_n = norm(n.get('ville', '') or '')
    is_fes = 'fes' in nom_n or 'sais' in nom_n or 'fes' in ville_n
    is_fst = ('sciences et techniques' in nom_n or 'fst' in nom_n.split() or
              nom_n.startswith('fst '))
    if is_fes and is_fst:
        fst_fes_candidates.append(n)

seen = set()
fst_fes_uniq = []
for n in fst_fes_candidates:
    if str(n['id']) not in seen:
        seen.add(str(n['id']))
        fst_fes_uniq.append(n)

if len(fst_fes_uniq) >= 2:
    repr_fes = max(fst_fes_uniq, key=lambda n: edge_count(n['id']))
    orphans_fes = [n for n in fst_fes_uniq if str(n['id']) != str(repr_fes['id'])]
    log('A-07', 'REPR', f'Représentant: {repr_fes["id"]} "{repr_fes["nom_fr"]}" '
        f'({offerte_par_count(repr_fes["id"])} FIL, {edge_count(repr_fes["id"])} arêtes)')
    for o in orphans_fes:
        register_merge(o['id'], repr_fes['id'],
                       f'{o.get("nom_fr","?")} ({offerte_par_count(o["id"])} FIL)')
elif len(fst_fes_uniq) == 1:
    log('A-07', 'NOOP', 'Un seul nœud FST Fès trouvé — pas de fusion nécessaire')
else:
    log('A-07', 'WARN', 'Aucun nœud FST Fès trouvé')

# ═══════════════════════════════════════════════════════════════════════════════
# A-08 — Fusionner FMP fantômes : Rabat (3→1), Tanger (3→1), Errachidia (2→1)
# ═══════════════════════════════════════════════════════════════════════════════

FMP_PUBLIC_KW = [
    'faculte de medecine et de pharmacie',
    'faculte de medecine et pharmacie',
]
FMP_EXCLUDE = ['mohammed vi', 'um6ss', 'dentaire', 'veterinaire',
               'anglophone', 'infirmiere', 'bioscience', 'biotechnologie',
               'pharmacie clinique', 'sciences de la sante']

def is_public_fmp(nom):
    n = norm(nom or '')
    return (any(kw in n for kw in FMP_PUBLIC_KW) or
            norm(nom).startswith('fmp ') or norm(nom) == 'fmp') and \
           not any(ex in n for ex in FMP_EXCLUDE)

FMP_CITIES = {
    'rabat': ['rabat'],
    'tanger': ['tanger'],
    'errachidia': ['errachidia'],
}

for city_key, city_kws in FMP_CITIES.items():
    group = []
    for n in nodes:
        if n.get('type') != 'ETABLISSEMENT':
            continue
        nom_n   = norm(n.get('nom_fr', ''))
        ville_n = norm(n.get('ville', '') or '')
        in_city = any(kw in nom_n or kw in ville_n for kw in city_kws)
        if in_city and is_public_fmp(n.get('nom_fr', '')):
            group.append(n)

    seen = set()
    group_uniq = []
    for n in group:
        if str(n['id']) not in seen:
            seen.add(str(n['id']))
            group_uniq.append(n)

    if len(group_uniq) < 2:
        log('A-08', 'NOOP', f'FMP {city_key.title()}: {len(group_uniq)} nœud(s) — pas de fusion')
        continue

    # Représentant: UUID avec le plus d'arêtes
    uuid_g  = [n for n in group_uniq if is_uuid(n['id'])]
    short_g = [n for n in group_uniq if not is_uuid(n['id'])]
    pool_g  = uuid_g if uuid_g else short_g
    repr_g  = max(pool_g, key=lambda n: edge_count(n['id']))
    orph_g  = [n for n in group_uniq if str(n['id']) != str(repr_g['id'])]

    log('A-08', 'REPR', f'FMP {city_key.title()} représentant: {repr_g["id"]} '
        f'"{repr_g["nom_fr"]}" ({offerte_par_count(repr_g["id"])} FIL)')
    for o in orph_g:
        register_merge(o['id'], repr_g['id'],
                       f'{o.get("nom_fr","?")} ({offerte_par_count(o["id"])} FIL)')

# ═══════════════════════════════════════════════════════════════════════════════
# A-09 — Fusionner ISCAE Rabat : id=64 (non-UUID) → UUID
# ═══════════════════════════════════════════════════════════════════════════════

def is_iscae_node(n):
    nom_n = norm(n.get('nom_fr', ''))
    return ('iscae' in nom_n or
            ('commerce' in nom_n and 'administration' in nom_n and
             'entreprise' in nom_n and 'superieur' in nom_n))

iscae_id64  = [n for n in nodes if str(n['id']) == '64' and is_iscae_node(n)
               and n.get('type') == 'ETABLISSEMENT']
iscae_rabat = [n for n in nodes if is_uuid(n['id']) and is_iscae_node(n)
               and n.get('type') == 'ETABLISSEMENT'
               and ('rabat' in norm(n.get('nom_fr', '')) or
                    norm(n.get('ville', '') or '') == 'rabat')]

if iscae_id64 and iscae_rabat:
    repr_iscae = max(iscae_rabat, key=lambda n: edge_count(n['id']))
    log('A-09', 'REPR', f'ISCAE Rabat représentant: {repr_iscae["id"]} "{repr_iscae["nom_fr"]}"')
    for o in iscae_id64:
        register_merge(o['id'], repr_iscae['id'],
                       f'{o.get("nom_fr","?")} ({offerte_par_count(o["id"])} FIL)')
elif not iscae_id64:
    log('A-09', 'NOOP', 'ISCAE id=64 non trouvé — déjà fusionné ou absent')
else:
    log('A-09', 'WARN', 'Nœud ISCAE Rabat UUID non trouvé — fusion impossible')

# ═══════════════════════════════════════════════════════════════════════════════
# A-10 — Reclassifier ISTAH Mohammadia : secteur "Informatique" → "Hotellerie"
# ═══════════════════════════════════════════════════════════════════════════════

a10_count = 0
for n in nodes:
    nom_n = norm(n.get('nom_fr', ''))
    if 'istah' in nom_n and any(kw in nom_n for kw in ['mohammadia', 'mohammedi']):
        old_secteur = n.get('secteur', '?')
        log('A-10', 'FIX', f'{n["id"]} "{n["nom_fr"]}" secteur "{old_secteur}" → "Hotellerie"')
        if not DRY_RUN:
            n['secteur'] = 'Hotellerie'
        stats['nodes_modified'] += 1
        a10_count += 1

if a10_count == 0:
    log('A-10', 'WARN', 'ISTAH Mohammadia non trouvé')

# ═══════════════════════════════════════════════════════════════════════════════
# A-11 — Supprimer ETABs FSJES fantômes 0-FIL confirmés
#         Ain Sbaa (0 FIL), Mohammedia (0 FIL), Ait Melloul (0 FIL)
#         NOTE: Ain Chock a 26 FIL → NON supprimé (institution légitime)
# ═══════════════════════════════════════════════════════════════════════════════

# Cibles avec condition stricte 0-FIL
A11_TARGETS = [
    ('ain sbaa',   'fsjes'),
    ('mohammedia', 'fsjes'),
    ('ait melloul','fsjes'),
]
A11_PROTECTED = [('ain chock', 'fsjes')]

a11_count = 0
for kw_v, kw_t in A11_TARGETS:
    for n in nodes:
        if n.get('type') != 'ETABLISSEMENT':
            continue
        nom_n   = norm(n.get('nom_fr', ''))
        ville_n = norm(n.get('ville', '') or '')
        if kw_t in nom_n and (kw_v in nom_n or kw_v in ville_n):
            fil = offerte_par_count(n['id'])
            if fil == 0:
                deleted_node_ids.add(str(n['id']))
                stats['nodes_deleted'] += 1
                a11_count += 1
                log('A-11', 'DEL', f'{n["id"]} "{n["nom_fr"]}" [0 FIL] — supprimé')
            else:
                log('A-11', 'WARN', f'{n["id"]} "{n["nom_fr"]}" [{fil} FIL] — NON supprimé (FIL > 0)')

for kw_v, kw_t in A11_PROTECTED:
    for n in nodes:
        if n.get('type') != 'ETABLISSEMENT':
            continue
        nom_n = norm(n.get('nom_fr', ''))
        if kw_t in nom_n and kw_v in nom_n:
            fil = offerte_par_count(n['id'])
            log('A-11', 'SAFE', f'{n["id"]} "{n["nom_fr"]}" [{fil} FIL] — PROTÉGÉ (FIL > 0, institution légitime)')

log('A-11', 'INFO', f'{a11_count} fantôme(s) FSJES supprimé(s)')

# ═══════════════════════════════════════════════════════════════════════════════
# A-12 — Taguer FILIEREs pré-LMD avec systeme="PRE_LMD"
#         DESA = Diplôme d'Études Supérieures Approfondies
#         DESS = Diplôme d'Études Supérieures Spécialisées
#         Maîtrise = supprimée depuis réforme LMD 2003-2009
# ═══════════════════════════════════════════════════════════════════════════════

PRELMD_PATTERNS = [
    r'\bdesa\b',
    r'\bdess\b',
    r'\bmaitrise\b',
    r'diplome d etudes superieures approfondies',
    r'diplome d etudes superieures specialisees',
]

a12_count = 0
for n in nodes:
    if n.get('type') != 'FILIERE':
        continue
    nom_n = norm(n.get('nom_fr', '') or '')
    if any(re.search(p, nom_n) for p in PRELMD_PATTERNS):
        if n.get('systeme') != 'PRE_LMD':
            if not DRY_RUN:
                n['systeme'] = 'PRE_LMD'
            stats['nodes_modified'] += 1
            a12_count += 1

log('A-12', 'INFO', f'{a12_count} FILIERE(s) pré-LMD taguées avec systeme="PRE_LMD"')

# ═══════════════════════════════════════════════════════════════════════════════
# APPLICATION — Redirection et déduplication des arêtes
# ═══════════════════════════════════════════════════════════════════════════════

seen_edge_keys = set()
new_edges = []

for e in edges:
    if id(e) in deleted_edge_set:
        continue

    s  = str(e.get('source_id', ''))
    t  = str(e.get('target_id', ''))
    lt = e.get('type_lien', '')

    new_s = orphan_to_repr.get(s, s)
    new_t = orphan_to_repr.get(t, t)

    if new_s != s or new_t != t:
        stats['edges_redirected'] += 1

    if new_s == new_t:
        stats['self_loops'] += 1
        continue

    key = (new_s, new_t, lt)
    if key in seen_edge_keys:
        stats['edges_deduped'] += 1
        continue
    seen_edge_keys.add(key)

    new_e = dict(e)
    new_e['source_id'] = new_s
    new_e['target_id'] = new_t
    new_edges.append(new_e)

new_nodes = [n for n in nodes if str(n['id']) not in deleted_node_ids]

# ═══════════════════════════════════════════════════════════════════════════════
# VÉRIFICATIONS PRÉ-APPLICATION
# ═══════════════════════════════════════════════════════════════════════════════

all_new_ids = {str(n['id']) for n in new_nodes}

checks = []

# V1 — JSON valide (garanti si on arrive ici)
checks.append(('JSON valide', True, 'structures Python correctes'))

# V2 — Arêtes orphelines
orphan_e = [e for e in new_edges
            if str(e.get('source_id','')) not in all_new_ids
            or str(e.get('target_id','')) not in all_new_ids]
checks.append(('Aucune arête orpheline', len(orphan_e)==0,
               f'{len(orphan_e)} arête(s) orpheline(s)' if orphan_e else 'OK'))

# V3 — Self-loops
sl = [e for e in new_edges if str(e.get('source_id',''))==str(e.get('target_id',''))]
checks.append(('Aucun self-loop', len(sl)==0,
               f'{len(sl)} self-loop(s)' if sl else 'OK'))

# V4 — Doublons source+target+type_lien
edge_keys = [(str(e['source_id']), str(e['target_id']), e['type_lien']) for e in new_edges]
dup_count  = len(edge_keys) - len(set(edge_keys))
checks.append(('Aucun doublon source+target+type_lien', dup_count==0,
               f'{dup_count} doublon(s)' if dup_count else 'OK'))

# V5 — EMSI Marrakech et EMSI Marrakech Gueliz préservés
emsi_in_new = [n for n in new_nodes if 'emsi' in norm(n.get('nom_fr',''))
               and 'marrakech' in (norm(n.get('nom_fr','')) + norm(n.get('ville','') or ''))]
checks.append(('EMSI Marrakech préservé(s)', len(emsi_in_new)>=1,
               f'{len(emsi_in_new)} nœud(s) EMSI Marrakech trouvé(s)'))

# V6 — SUP'H Droit conservé dans RECRUTEMENT→Avocat
# V6 : compter uniquement les LICENCES SUP'H → Avocat (pas les Masters SUP'H qui sont normalement conservés)
suph_remaining = [e for e in new_edges
                  if e.get('type_lien')=='RECRUTEMENT'
                  and str(e.get('target_id','')) in AVOCAT_IDS
                  and 'suph' in norm(nodes_by_id.get(str(e.get('source_id','')),{}).get('nom_fr',''))
                  and is_licence_not_master(nodes_by_id.get(str(e.get('source_id','')),{}).get('nom_fr',''))]
checks.append((f"SUP'H Licences conservées ({len(a01_suph_kept)} attendu)", len(suph_remaining)==len(a01_suph_kept),
               f'trouvé {len(suph_remaining)}, attendu {len(a01_suph_kept)}'))

# V7 — FMP publique Rabat représentant présent
fmp_rabat_repr = [n for n in new_nodes
                  if 'faculte de medecine et de pharmacie de rabat' in norm(n.get('nom_fr',''))]
checks.append(('FMP Rabat représentant présent', len(fmp_rabat_repr)>=1,
               f'{len(fmp_rabat_repr)} nœud(s)'))

# V8 — Intégrité générale
total_before = len(nodes_orig)
total_after  = len(new_nodes)
deleted_expected = stats['nodes_deleted']
checks.append(('Compte nœuds cohérent',
               total_before - total_after == deleted_expected,
               f'avant={total_before}, après={total_after}, supprimés={deleted_expected}'))

# ═══════════════════════════════════════════════════════════════════════════════
# RAPPORT DRY-RUN / EXÉCUTION
# ═══════════════════════════════════════════════════════════════════════════════

SEP = '═' * 82
sep = '─' * 82
MODE = '[DRY-RUN — AUCUN FICHIER MODIFIÉ]' if DRY_RUN else '[APPLICATION RÉELLE]'

print(f'\n{SEP}')
print(f'  PHASE A — CORRECTIONS GRAPHE SGPO   {MODE}')
print(SEP)

# Grouper les logs par bloc
blocs = ['A-01','A-02','A-03','A-04','A-05','A-06','A-07','A-08','A-09','A-10','A-11','A-12']
bloc_labels = {
    'A-01': 'RECRUTEMENT Avocat←Licence',
    'A-02': 'Ville ENSA Safi',
    'A-03': 'OFFERTE_PAR ENSA hors-domaine',
    'A-04': 'OFFERTE_PAR EST→Infirmier',
    'A-05': 'OFFERTE_PAR UM6SS dans FMP publique',
    'A-06': 'Fusion FST Marrakech',
    'A-07': 'Fusion FST Fès',
    'A-08': 'Fusion FMP fantômes',
    'A-09': 'Fusion ISCAE Rabat',
    'A-10': 'Reclassification ISTAH Mohammadia',
    'A-11': 'Suppression FSJES fantômes',
    'A-12': 'Tag PRE_LMD',
    'MERGE': '[sous-détails fusions]',
}

print(f'\n{sep}')
print('  CORRECTIONS PAR BLOC')
print(sep)

for bloc in blocs:
    entries = [(b, k, m) for b, k, m in corrections_log if b == bloc]
    if not entries:
        continue
    label = bloc_labels.get(bloc, bloc)
    print(f'\n  ┌─ {bloc} — {label}')
    for _, kind, msg in entries:
        prefix = '  │  '
        icon = {'INFO':'ℹ', 'DEL':'✗', 'KEEP':'→', 'NOOP':'○', 'WARN':'⚠',
                'FIX':'✎', 'REPR':'★', 'SAFE':'🛡', 'DEL':'✗'}.get(kind, '·')
        print(f'{prefix}{icon} {msg}')
    print(f'  └{"─"*70}')

# Sous-détails fusions
merge_entries = [(b, k, m) for b, k, m in corrections_log if b == 'MERGE']
if merge_entries:
    print(f'\n  ┌─ DÉTAILS FUSIONS')
    for _, kind, msg in merge_entries:
        print(f'  │  {msg}')
    print(f'  └{"─"*70}')

print(f'\n{sep}')
print('  STATISTIQUES')
print(sep)
print(f'  Nœuds avant              : {len(nodes_orig):>6}')
print(f'  Nœuds après              : {len(new_nodes):>6}  (−{len(nodes_orig)-len(new_nodes)})')
print(f'  ├─ Nœuds modifiés (champ): {stats["nodes_modified"]:>6}  (A-02/A-10/A-12)')
print(f'  └─ Nœuds supprimés       : {stats["nodes_deleted"]:>6}  (A-06/A-07/A-08/A-09/A-11)')
print()
print(f'  Arêtes avant             : {len(edges_orig):>6}')
print(f'  Arêtes après             : {len(new_edges):>6}  (−{len(edges_orig)-len(new_edges)})')
print(f'  ├─ Arêtes supprimées     : {stats["edges_deleted"]:>6}  (A-01/A-04/A-05/A-03)')
print(f'  ├─ Arêtes redirigées     : {stats["edges_redirected"]:>6}  (fusions)')
print(f'  ├─ Arêtes dédupliquées   : {stats["edges_deduped"]:>6}  (doublons post-fusion)')
print(f'  └─ Self-loops éliminés   : {stats["self_loops"]:>6}')

print(f'\n{sep}')
print('  VÉRIFICATIONS')
print(sep)
all_ok = True
for check_name, ok, detail in checks:
    icon = '✓' if ok else '✗'
    print(f'  {icon} {check_name}  [{detail}]')
    if not ok:
        all_ok = False

if orphan_e:
    print(f'\n  [DÉTAIL arêtes orphelines]:')
    for e in orphan_e[:5]:
        print(f'    {e.get("source_id","?")} → {e.get("target_id","?")} ({e.get("type_lien","?")})')

print(f'\n{SEP}')
if DRY_RUN:
    if all_ok:
        print('  ✓ DRY-RUN COMPLET — toutes les vérifications passent.')
        print('  Pour appliquer : python tools/apply_phase_a.py --apply')
    else:
        print('  ✗ DRY-RUN — DES VÉRIFICATIONS ÉCHOUENT. Corriger avant --apply.')
else:
    if not all_ok:
        print('  [ABORT] Vérifications échouées — aucun fichier modifié.')
        sys.exit(1)

    # Backups horodatés
    ts = datetime.now().strftime('%Y%m%d_%H%M%S')
    shutil.copy(str(NODES_PATH), str(NODES_PATH) + f'.bak_{ts}')
    shutil.copy(str(EDGES_PATH),  str(EDGES_PATH)  + f'.bak_{ts}')
    print(f'  Backups créés : *.bak_{ts}')

    # Écriture
    with open(NODES_PATH, 'w', encoding='utf-8') as f:
        json.dump(new_nodes, f, ensure_ascii=False, indent=2)
    with open(EDGES_PATH, 'w', encoding='utf-8') as f:
        json.dump(new_edges, f, ensure_ascii=False, indent=2)

    print(f'  ✓ {NODES_PATH} mis à jour ({len(new_nodes)} nœuds)')
    print(f'  ✓ {EDGES_PATH} mis à jour ({len(new_edges)} arêtes)')
    print('  ✓ PHASE A APPLIQUÉE AVEC SUCCÈS.')
print(SEP)
