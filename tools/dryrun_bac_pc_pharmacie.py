"""
DRY-RUN — Ajout arêtes DONNE_ACCES BAC_PC → filières Pharmacie/Médecine/Dentaire
Aucune modification de fichier — simulation pure.

Critères d'inclusion :
  - FILIERE acceptant déjà BAC_SM ou BAC_SE (via DONNE_ACCES)
  - FILIERE ayant au moins 1 RECRUTEMENT vers Médecin / Pharmacien / Dentiste
  - FILIERE ne relevant pas d'un Master, résidanat, spécialité post-licence

Critères d'exclusion :
  - nom contient MASTER / RESIDANAT / SPECIALITE / SPECIALISATION / DES /
    DIPLOME D ETUDES SPECIALISEES / ATTESTATION / CES / DESC
  - arête BAC_PC → filière déjà présente
"""

import json, sys, uuid, re, unicodedata
sys.stdout.reconfigure(encoding='utf-8')

SEP  = '=' * 72
sep  = '-' * 72

# ── CHARGEMENT ─────────────────────────────────────────────────────────────
with open('backend/src/main/resources/data/edges.json', 'r', encoding='utf-8') as f:
    edges = json.load(f)
with open('backend/src/main/resources/data/nodes_all.json', 'r', encoding='utf-8') as f:
    nodes = json.load(f)

nmap = {str(n.get('id', '')): n for n in nodes}

# ── IDs BAC ─────────────────────────────────────────────────────────────────
BAC_PC = '76295ee1-7173-59d3-b492-659129349d51'
BAC_SM = 'e3f0ebb3-c0c7-5a17-bc84-2de9736e2a85'
BAC_SE = '84a28554-5207-5ee6-a33f-340e0b111cfd'
BAC_PC_nom = 'Bac Sciences Physiques-Chimie'

# ── MOTS-CLÉS MÉTIERS CIBLES ────────────────────────────────────────────────
METIER_KW = ['PHARMACIEN', 'MEDECIN', 'DENTISTE', 'CHIRURGIEN', 'BIOLOGISTE']

# ── MOTS-CLÉS EXCLUSION (filières post-licence) ─────────────────────────────
EXCLUSION_KW = [
    'MASTER', 'MASTERE', 'RESIDANAT', 'SPECIALITE', 'SPECIALISATION',
    'DIPLOME D ETUDES SPECIALISEES', ' DES ', 'CES ', 'DESC',
    'ATTESTATION', 'POST LICENCE', 'POSTLICENCE',
]

def normalize(s):
    s = (s or '').upper().strip()
    s = unicodedata.normalize('NFD', s)
    s = ''.join(c for c in s if unicodedata.category(c) != 'Mn')
    s = re.sub(r"[''`\-]", ' ', s)
    s = re.sub(r'[^\w\s]', ' ', s)
    return re.sub(r'\s+', ' ', s).strip()

def is_excluded(nom_fr):
    n = normalize(nom_fr)
    return any(kw in n for kw in EXCLUSION_KW)

# ── FILIÈRES PHARMA/MED/DENTAIRE ────────────────────────────────────────────
PHARMA_KW = ['PHARMACIE', 'PHARMAC', 'MEDECIN', 'MEDECINE', 'DENTAIRE', 'CHIRURGI']
pharma_fils = {
    fid: n
    for fid, n in nmap.items()
    if n.get('type') == 'FILIERE'
    and any(k in (n.get('nom_fr') or '').upper() for k in PHARMA_KW)
}

# ── INDEX ARÊTES ─────────────────────────────────────────────────────────────
da_edges  = [e for e in edges if e.get('type_lien') == 'DONNE_ACCES']
rec_edges = [e for e in edges if e.get('type_lien') == 'RECRUTEMENT']

# Couples (source, target) existants pour DONNE_ACCES
da_pairs = {(e.get('source_id'), e.get('target_id')) for e in da_edges}

# Filières ayant DONNE_ACCES depuis BAC_SM ou BAC_SE
fils_sm = {e['target_id'] for e in da_edges if e.get('source_id') == BAC_SM}
fils_se = {e['target_id'] for e in da_edges if e.get('source_id') == BAC_SE}
fils_sm_or_se = fils_sm | fils_se

# Métiers cibles (METIER nodes avec mots-clés)
metier_cibles = {
    str(n.get('id', ''))
    for n in nodes
    if n.get('type') == 'METIER'
    and any(k in normalize(n.get('nom_fr', '') or '') for k in METIER_KW)
}

# Filières avec RECRUTEMENT vers ces métiers
fils_avec_recrutement = {
    e.get('source_id')
    for e in rec_edges
    if e.get('target_id') in metier_cibles
}

# ── SÉLECTION FINALE ─────────────────────────────────────────────────────────
candidats = []
exclus    = []

for fid, fn in pharma_fils.items():
    nom = fn.get('nom_fr', '') or ''

    if fid not in fils_sm_or_se:
        continue  # pas de BAC_SM/SE → hors périmètre

    if fid not in fils_avec_recrutement:
        exclus.append(('pas_de_recrutement_cible', fid, nom))
        continue

    if is_excluded(nom):
        exclus.append(('post_licence_exclu', fid, nom))
        continue

    if (BAC_PC, fid) in da_pairs:
        exclus.append(('bac_pc_deja_present', fid, nom))
        continue

    candidats.append(fid)

# ── ARÊTES MODÈLES (BAC_SM → filière candidat) ──────────────────────────────
def get_template_edge(target_fid):
    """Cherche l'arête BAC_SM→filière, sinon BAC_SE→filière."""
    for src in (BAC_SM, BAC_SE):
        for e in da_edges:
            if e.get('source_id') == src and e.get('target_id') == target_fid:
                return e
    return None

# ── ARÊTES À CRÉER ───────────────────────────────────────────────────────────
new_edges = []
for fid in candidats:
    tmpl = get_template_edge(fid)
    if not tmpl:
        continue
    new_edge = {
        'id':                        str(uuid.uuid4()),
        'source_id':                 BAC_PC,
        'target_id':                 fid,
        'type_lien':                 'DONNE_ACCES',
        'type_acces':                tmpl.get('type_acces', 'CONCOURS'),
        'taux_reussite':             tmpl.get('taux_reussite', 65),
        'cout_supplementaire':       tmpl.get('cout_supplementaire', 0),
        'duree_supplementaire_mois': tmpl.get('duree_supplementaire_mois', 0),
        'prerequis_notes':           tmpl.get('prerequis_notes', ''),
        'moyenne_minimale':          tmpl.get('moyenne_minimale', None),
    }
    new_edges.append((fid, new_edge))

# ── RAPPORT ──────────────────────────────────────────────────────────────────
print(SEP)
print('  DRY-RUN — DONNE_ACCES BAC_PC → filières Pharmacie/Médecine/Dentaire')
print(SEP)

print(f"""
  Graphe chargé : {len(nodes)} nœuds / {len(edges)} arêtes
  DONNE_ACCES existants : {len(da_edges)}
  Filières Pharma/Med/Dentaire (total) : {len(pharma_fils)}
  dont avec BAC_SM ou BAC_SE          : {len([f for f in pharma_fils if f in fils_sm_or_se])}
  dont avec recrutement cible          : {len([f for f in pharma_fils if f in fils_avec_recrutement and f in fils_sm_or_se])}
""")

# 1. Nombre de filières concernées
print(sep)
print(f'  1. FILIÈRES CONCERNÉES : {len(candidats)}')
print(sep)
for fid in candidats:
    fn   = nmap[fid]
    ville = fn.get('ville', '') or '—'
    tmpl  = get_template_edge(fid)
    src   = 'BAC_SM' if tmpl and tmpl.get('source_id') == BAC_SM else 'BAC_SE'
    print(f'    [{src}] {fn.get("nom_fr","")[:60]}')
    print(f'           ville={ville}  id={fid}')

# 2. Nombre d'arêtes à ajouter
print()
print(sep)
print(f'  2. ARÊTES DONNE_ACCES BAC_PC À AJOUTER : {len(new_edges)}')
print(sep)
for fid, e in new_edges:
    fn = nmap[fid]
    print(f'    + BAC_PC -> {fn.get("nom_fr","")[:55]}')
    print(f'      type_acces={e["type_acces"]}  moy_min={e["moyenne_minimale"]}  taux={e["taux_reussite"]}')

# 3. Filières par ville
print()
print(sep)
print('  3. FILIÈRES PAR VILLE (Casablanca / Rabat / Fès / Marrakech)')
print(sep)
for ville_cible in ['Casablanca', 'Rabat', 'Fes', 'Marrakech']:
    subset = [(fid, nmap[fid]) for fid in candidats if (nmap[fid].get('ville') or '').lower() == ville_cible.lower()]
    print(f'  {ville_cible} ({len(subset)} filière(s)) :')
    if subset:
        for fid, fn in subset:
            print(f'    • {fn.get("nom_fr","")[:65]}')
    else:
        print('    (aucune)')

# 4. Vérification filière FMPC Casablanca
FMPC_FIL = '43d0776b-9262-ef44-2ebe-6a87d05f0960'
print()
print(sep)
print('  4. VÉRIFICATION — Diplome Docteur Pharmacie FMP Casablanca')
print(sep)
fn_fmpc = nmap.get(FMPC_FIL, {})
in_candidats = FMPC_FIL in candidats
print(f'    Filière : {fn_fmpc.get("nom_fr","INCONNUE")}')
print(f'    ville   : {fn_fmpc.get("ville","?")}')
print(f'    Incluse dans les candidats : {"OUI ✓" if in_candidats else "NON ✗"}')
if in_candidats:
    tmpl_fmpc = get_template_edge(FMPC_FIL)
    print(f'    Arête modèle : {tmpl_fmpc.get("type_acces")} / moy_min={tmpl_fmpc.get("moyenne_minimale")} / taux={tmpl_fmpc.get("taux_reussite")}')
    fmpc_edge = next((e for fid, e in new_edges if fid == FMPC_FIL), None)
    if fmpc_edge:
        print(f'    Arête simulée (id provisoire) : {fmpc_edge["id"]}')

# 5. Simulation BFS Pharmacien + BAC_PC + Casablanca
print()
print(sep)
print('  5. SIMULATION BFS — Pharmacien + BAC_PC + Casablanca + mobilite=Ville')
print(sep)
# Après ajout, quelles filières BAC_PC → ? → FMPC Casa → Pharmacien seraient valides ?
FMPC_ETAB  = 'f82d2cd1-3c65-5bca-02ba-7fe265175e35'
PHARMACIEN_KW = ['PHARMACIEN']
pharmacien_ids = {
    str(n.get('id',''))
    for n in nodes
    if n.get('type') == 'METIER'
    and any(k in normalize(n.get('nom_fr','') or '') for k in PHARMACIEN_KW)
}
print(f'    Métiers "Pharmacien" détectés : {len(pharmacien_ids)}')
for pid in pharmacien_ids:
    print(f'      • {nmap[pid].get("nom_fr","")} ({pid})')

# Filières → FMPC Casablanca via OFFERTE_PAR
fils_vers_fmpc_casa = {
    e.get('source_id')
    for e in edges
    if e.get('type_lien') == 'OFFERTE_PAR'
    and e.get('target_id') == FMPC_ETAB
}
# Filières → Pharmacien via RECRUTEMENT
fils_vers_pharmacien = {
    e.get('source_id')
    for e in rec_edges
    if e.get('target_id') in pharmacien_ids
}
# Filières cumulant les deux
fils_double = fils_vers_fmpc_casa & fils_vers_pharmacien
print(f'    Filières connectées à FMPC Casablanca (OFFERTE_PAR) : {len(fils_vers_fmpc_casa)}')
print(f'    Filières connectées à Pharmacien (RECRUTEMENT)       : {len(fils_vers_pharmacien)}')
print(f'    Filières avec OFFERTE_PAR→FMPC ET RECRUTEMENT→Pharm : {len(fils_double)}')

# Parmi celles-là, lesquelles auront DONNE_ACCES BAC_PC après ajout ?
new_target_ids = {fid for fid, _ in new_edges}
fils_bfs_valides = fils_double & new_target_ids
fils_bfs_valides_existants = fils_double & {e.get('target_id') for e in da_edges if e.get('source_id') == BAC_PC}
total_bfs_valides = fils_bfs_valides | fils_bfs_valides_existants

print()
print(f'    AVANT correction : BAC_PC → ? → FMPC Casa → Pharmacien : {len(fils_bfs_valides_existants)} parcours')
print(f'    APRÈS correction : BAC_PC → ? → FMPC Casa → Pharmacien : {len(total_bfs_valides)} parcours')
if total_bfs_valides:
    for fid in total_bfs_valides:
        fn = nmap.get(fid, {})
        print(f'      ✓ {fn.get("nom_fr","")[:60]} (ville={fn.get("ville","")})')
else:
    print('      ✗ AUCUN — vérifier les données')

# 6. Arêtes orphelines
print()
print(sep)
print('  6. ARÊTES ORPHELINES (source ou target inexistant)')
print(sep)
orphans = 0
all_ids = set(nmap.keys())
for fid, e in new_edges:
    if e['source_id'] not in all_ids:
        print(f'    ORPHELIN source : {e["source_id"]}')
        orphans += 1
    if e['target_id'] not in all_ids:
        print(f'    ORPHELIN target : {e["target_id"]}')
        orphans += 1
print(f'    Orphelins = {orphans}')

# 7. Self-loops
print()
print(sep)
print('  7. SELF-LOOPS')
print(sep)
loops = sum(1 for _, e in new_edges if e['source_id'] == e['target_id'])
print(f'    Self-loops = {loops}')

# 8. Doublons
print()
print(sep)
print('  8. DOUBLONS (BAC_PC → filière déjà présent)')
print(sep)
doublons = 0
new_pairs = set()
for fid, e in new_edges:
    pair = (e['source_id'], e['target_id'])
    if pair in da_pairs:
        print(f'    DOUBLON : {pair}')
        doublons += 1
    if pair in new_pairs:
        print(f'    DOUBLON INTRA-LISTE : {pair}')
        doublons += 1
    new_pairs.add(pair)
print(f'    Doublons = {doublons}')

# 9. Risques
print()
print(sep)
print('  9. RISQUES ÉVENTUELS')
print(sep)
print(f'    Filières sans template (arête modèle introuvable) : 0')

# Check filieres excluded
print()
print(f'  FILIÈRES EXCLUES ({len(exclus)}) :')
for reason, fid, nom in sorted(exclus, key=lambda x: x[0]):
    fn = nmap.get(fid, {})
    print(f'    [{reason}] {nom[:60]}')

# Filières pharma/med avec BAC_SM/SE mais SANS recrutement cible
sans_rec = [(fid, nmap[fid].get('nom_fr','')) for fid in pharma_fils if fid in fils_sm_or_se and fid not in fils_avec_recrutement]
print()
print(f'  Filières Pharma/Med avec BAC_SM/SE mais sans recrutement Médecin/Pharmacien/Dentiste ({len(sans_rec)}) :')
for fid, nom in sans_rec[:10]:
    print(f'    • {nom[:65]}')
if len(sans_rec) > 10:
    print(f'    ... et {len(sans_rec)-10} autres')

print()
print(SEP)
print('  DRY-RUN TERMINÉ — AUCUN FICHIER MODIFIÉ')
print(SEP)
