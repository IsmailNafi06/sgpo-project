"""
AUDIT CIBLÉ — Pharmacien Casablanca, BAC_PC
Trace la chaîne BFS : BAC_PC → FILIERE Pharmacie → ETAB Casablanca → METIER Pharmacien
Aucune modification.
"""

import json, re, unicodedata, sys
from pathlib import Path
from collections import defaultdict

sys.stdout.reconfigure(encoding='utf-8')

DATA = 'backend/src/main/resources/data'
with open(f'{DATA}/nodes_all.json', 'r', encoding='utf-8') as f:
    nodes = json.load(f)
with open(f'{DATA}/edges.json', 'r', encoding='utf-8') as f:
    edges = json.load(f)

nodes_by_id  = {str(n['id']): n for n in nodes}
nodes_by_code = {(n.get('code') or ''): n for n in nodes}

def norm(s): return unicodedata.normalize('NFD', (s or '').upper()).replace('̀','').replace('́','').replace('̂','').replace('̈','').replace('̧','')

SEP = '═' * 72
sep = '─' * 72

# ── 1. TROUVER LES NŒUDS CLÉS ───────────────────────────────────────────────
print(SEP)
print('  AUDIT PHARMACIEN CASABLANCA — BAC_PC')
print(SEP)
print()

# BAC_PC node
bac_pc = next((n for n in nodes if 'BAC_PC' in (n.get('code','') or '') and n.get('type') == 'NIVEAU'), None)
if not bac_pc:
    bac_pc = next((n for n in nodes if n.get('code','') == 'BAC_PC'), None)
if not bac_pc:
    # cherche par nom
    bac_pc = next((n for n in nodes if 'PHYSIQUES' in norm(n.get('nom_fr','') or '') and 'CHIMIE' in norm(n.get('nom_fr','') or '') and n.get('type') not in ('FILIERE','ETABLISSEMENT','METIER')), None)

print(f'  BAC_PC : {bac_pc.get("id") if bac_pc else "NON TROUVÉ"} — {bac_pc.get("nom_fr") if bac_pc else "?"}')
print(f'           type={bac_pc.get("type") if bac_pc else "?"} | code={bac_pc.get("code") if bac_pc else "?"}')
print()

# Pharmacien METIER
pharmaciens = [n for n in nodes if n.get('type') == 'METIER' and 'PHARMACIEN' in norm(n.get('nom_fr','') or '')]
print(f'  METIERs "Pharmacien" trouvés : {len(pharmaciens)}')
for m in pharmaciens:
    print(f'    id={m["id"]} | {m["nom_fr"]} | code={m.get("code","")}')
print()

# FMPC Casablanca ETAB
fmpc_list = [n for n in nodes if n.get('type') == 'ETABLISSEMENT'
             and 'PHARMACIE' in norm(n.get('nom_fr','') or '')
             and 'CASABLANCA' in norm(n.get('ville','') or '')]
print(f'  ETABs Pharmacie à Casablanca : {len(fmpc_list)}')
for e in fmpc_list:
    print(f'    id={e["id"]}')
    print(f'    nom={e["nom_fr"]}')
    print(f'    ville={e.get("ville")} | secteur={e.get("secteur")} | cout={e.get("cout_estime")}')
print()

# ── 2. ARÊTES DONNE_ACCES depuis BAC_PC ─────────────────────────────────────
print(sep)
print('  1. DONNE_ACCES depuis BAC_PC vers filières Pharmacie')
print(sep)

bac_ids = set()
if bac_pc:
    bac_ids.add(str(bac_pc['id']))
# Chercher aussi les nœuds BAC_PC par code (niveau)
for n in nodes:
    if (n.get('code','') or '').startswith('BAC_PC'):
        bac_ids.add(str(n['id']))
print(f'  Nœuds BAC_PC identifiés : {bac_ids}')
print()

# Toutes les filières pharmacie
fil_pharma = [n for n in nodes if n.get('type') == 'FILIERE'
              and any(k in norm(n.get('nom_fr','') or '') for k in ('PHARMACIE','DOCTEUR EN PHARM','DOCTORAT EN PHARM'))]
fil_pharma_ids = {str(n['id']) for n in fil_pharma}

print(f'  Filières Pharmacie dans le graphe : {len(fil_pharma)}')
for f in fil_pharma:
    print(f'    id={f["id"]}')
    print(f'    nom={f["nom_fr"]}')
    print(f'    ville={f.get("ville")} | cout={f.get("cout_estime")} | duree={f.get("duree_mois")}')
print()

# Arêtes DONNE_ACCES BAC→FILIERE_PHARMA
da_bac_pharma = [e for e in edges
                 if e.get('type_lien') == 'DONNE_ACCES'
                 and str(e.get('source_id','')) in bac_ids
                 and str(e.get('target_id','')) in fil_pharma_ids]

# Aussi: arêtes DONNE_ACCES vers n'importe quelle filière pharma (source = n'importe quel BAC)
da_all_pharma = [e for e in edges
                 if e.get('type_lien') == 'DONNE_ACCES'
                 and str(e.get('target_id','')) in fil_pharma_ids]

print(f'  DONNE_ACCES BAC_PC → Pharmacie : {len(da_bac_pharma)} arête(s)')
for e in da_bac_pharma:
    src = nodes_by_id.get(str(e.get('source_id','')),{})
    tgt = nodes_by_id.get(str(e.get('target_id','')),{})
    print(f'    {src.get("nom_fr","?")} → {tgt.get("nom_fr","?")}')
    print(f'    source_id={e.get("source_id")} | target_id={e.get("target_id")} | id_arete={e.get("id","?")}')
print()

print(f'  DONNE_ACCES (tous BAC) → Pharmacie : {len(da_all_pharma)} arête(s)')
for e in da_all_pharma:
    src = nodes_by_id.get(str(e.get('source_id','')),{})
    tgt = nodes_by_id.get(str(e.get('target_id','')),{})
    print(f'    {src.get("nom_fr","?")} ({src.get("code","?")}) → {tgt.get("nom_fr","?")}')
print()

# ── 3. ARÊTES OFFERTE_PAR vers FMPC Casablanca ──────────────────────────────
print(sep)
print('  2. OFFERTE_PAR : filières Pharmacie → ETABs')
print(sep)

fmpc_ids = {str(e['id']) for e in fmpc_list}

op_pharma = [e for e in edges
             if e.get('type_lien') == 'OFFERTE_PAR'
             and str(e.get('source_id','')) in fil_pharma_ids]

print(f'  OFFERTE_PAR depuis filières Pharmacie : {len(op_pharma)} arête(s)')
for e in op_pharma:
    src = nodes_by_id.get(str(e.get('source_id','')),{})
    tgt = nodes_by_id.get(str(e.get('target_id','')),{})
    tgt_ville = tgt.get('ville','?')
    is_casa = 'CASABLANCA' in norm(tgt_ville or '')
    marker = '  ← CASABLANCA ✓' if is_casa else f'  [{tgt_ville}]'
    print(f'    {src.get("nom_fr","?")} → {tgt.get("nom_fr","?")}{marker}')
    print(f'    fil_id={e.get("source_id")} | etab_id={e.get("target_id")} | id_arete={e.get("id","?")}')
print()

# ── 4. ARÊTES RECRUTEMENT vers Pharmacien ────────────────────────────────────
print(sep)
print('  3. RECRUTEMENT : filières Pharmacie → METIER Pharmacien')
print(sep)

pharmacien_ids = {str(m['id']) for m in pharmaciens}

rec_pharma = [e for e in edges
              if e.get('type_lien') == 'RECRUTEMENT'
              and str(e.get('source_id','')) in fil_pharma_ids
              and str(e.get('target_id','')) in pharmacien_ids]

rec_all_pharmacien = [e for e in edges
                      if e.get('type_lien') == 'RECRUTEMENT'
                      and str(e.get('target_id','')) in pharmacien_ids]

print(f'  RECRUTEMENT Pharmacie → Pharmacien : {len(rec_pharma)} arête(s)')
for e in rec_pharma:
    src = nodes_by_id.get(str(e.get('source_id','')),{})
    tgt = nodes_by_id.get(str(e.get('target_id','')),{})
    print(f'    {src.get("nom_fr","?")} → {tgt.get("nom_fr","?")}')
    print(f'    id={e.get("id","?")}')
print()

print(f'  RECRUTEMENT (toutes filières) → Pharmacien : {len(rec_all_pharmacien)} arête(s)')
for e in rec_all_pharmacien:
    src = nodes_by_id.get(str(e.get('source_id','')),{})
    print(f'    {src.get("nom_fr","?")} (id={e.get("source_id")}) → Pharmacien')
print()

# ── 5. ANALYSE BFS COMPLÈTE ──────────────────────────────────────────────────
print(sep)
print('  4. ANALYSE CHAÎNE BFS COMPLÈTE')
print(sep)
print()

for fil in fil_pharma:
    fid = str(fil['id'])
    fil_nom   = fil.get('nom_fr','?')
    fil_ville = fil.get('ville') or 'None'

    # DONNE_ACCES vers cette filière
    da_to = [e for e in edges if e.get('type_lien')=='DONNE_ACCES' and str(e.get('target_id',''))==fid]
    da_bac_ok = any(str(e.get('source_id','')) in bac_ids for e in da_to)

    # OFFERTE_PAR depuis cette filière
    op_from = [e for e in edges if e.get('type_lien')=='OFFERTE_PAR' and str(e.get('source_id',''))==fid]

    # RECRUTEMENT depuis cette filière
    rec_from = [e for e in edges if e.get('type_lien')=='RECRUTEMENT' and str(e.get('source_id',''))==fid
                and str(e.get('target_id','')) in pharmacien_ids]

    print(f'  FILIÈRE : {fil_nom}')
    print(f'    id        : {fid}')
    print(f'    ville     : {fil_ville}')
    print(f'    DONNE_ACCES reçues     : {len(da_to)} total | BAC_PC→cette_filière : {"OUI ✓" if da_bac_ok else "NON ✗"}')

    # Liste les BAC qui y ont accès
    bac_sources = []
    for e in da_to:
        src = nodes_by_id.get(str(e.get('source_id','')),{})
        bac_sources.append(src.get('code') or src.get('nom_fr','?'))
    if bac_sources:
        print(f'    BAC sources : {", ".join(bac_sources[:10])}')
    else:
        print(f'    BAC sources : AUCUNE ← MAILLON CASSÉ')

    print(f'    OFFERTE_PAR vers ETABs : {len(op_from)}')
    for e in op_from:
        tgt = nodes_by_id.get(str(e.get('target_id','')),{})
        v   = tgt.get('ville','?')
        ok  = 'CASABLANCA' in norm(v or '')
        print(f'      → {tgt.get("nom_fr","?")} | ville={v} {"✓ Casablanca" if ok else "✗ hors Casablanca"}')

    print(f'    RECRUTEMENT → Pharmacien : {len(rec_from)} {"✓" if rec_from else "✗ MANQUANT"}')
    print()

# ── 6. FILTRE VILLE ───────────────────────────────────────────────────────────
print(sep)
print('  5. ANALYSE FILTRE MOBILITÉ=VILLE (Casablanca)')
print(sep)
print()
print('  Le filtre backend Spring Boot vérifie : contientEtablissementDansVille()')
print('  Pour un chemin BFS valide, il faut AU MOINS UN ETAB avec ville="Casablanca"')
print('  (ou proche : Hassan II, Ain Chock, etc. selon la logique backend)')
print()

for fil in fil_pharma:
    fid = str(fil['id'])
    fil_nom   = fil.get('nom_fr','?')
    fil_ville = fil.get('ville') or 'None'

    op_from = [e for e in edges if e.get('type_lien')=='OFFERTE_PAR' and str(e.get('source_id',''))==fid]

    etabs_villes = []
    for e in op_from:
        tgt = nodes_by_id.get(str(e.get('target_id','')),{})
        etabs_villes.append((tgt.get('nom_fr','?'), tgt.get('ville','?')))

    has_casa_etab = any('CASABLANCA' in norm(v or '') for _, v in etabs_villes)
    filiere_ville_ok = 'CASABLANCA' in norm(fil_ville or '')

    print(f'  FILIÈRE : {fil_nom}')
    print(f'    ville filière : {fil_ville} {"→ PASSE filtre ville ✓" if filiere_ville_ok else "→ NE PASSE PAS filtre ville ✗"}')
    for nom, v in etabs_villes:
        ok = 'CASABLANCA' in norm(v or '')
        print(f'    ETAB : {nom[:50]} | ville={v} {"✓" if ok else "✗"}')
    if not etabs_villes:
        print(f'    ETAB : AUCUN ← chemin incomplet')
    print()

# ── RÉSUMÉ DIAGNOSTIC ─────────────────────────────────────────────────────────
print(SEP)
print('  DIAGNOSTIC — PREMIER MAILLON CASSÉ')
print(SEP)
print()

# Vérifier chaîne pour chaque filière
for fil in fil_pharma:
    fid = str(fil['id'])
    fil_nom   = fil.get('nom_fr','?')

    da_bac = [e for e in edges if e.get('type_lien')=='DONNE_ACCES'
              and str(e.get('target_id',''))==fid
              and str(e.get('source_id','')) in bac_ids]

    op = [e for e in edges if e.get('type_lien')=='OFFERTE_PAR' and str(e.get('source_id',''))==fid]
    op_casa = [e for e in op if 'CASABLANCA' in norm((nodes_by_id.get(str(e.get('target_id','')),{}).get('ville') or ''))]

    rec = [e for e in edges if e.get('type_lien')=='RECRUTEMENT'
           and str(e.get('source_id',''))==fid
           and str(e.get('target_id','')) in pharmacien_ids]

    ok_da  = len(da_bac) > 0
    ok_op  = len(op) > 0
    ok_casa = len(op_casa) > 0
    ok_rec = len(rec) > 0

    chain = f'BAC_PC →[DA]→ {fil_nom[:35]} →[OP]→ FMPC Casa →[REC]→ Pharmacien'
    print(f'  Chaîne : {chain}')
    print(f'    [DA] DONNE_ACCES BAC_PC → cette filière : {"✓" if ok_da else "✗ MANQUANT"}')
    print(f'    [OP] OFFERTE_PAR → n\'importe quel ETAB : {"✓" if ok_op else "✗ MANQUANT"}')
    print(f'    [OP] OFFERTE_PAR → ETAB Casablanca      : {"✓" if ok_casa else "✗ MANQUANT ou ville fausse"}')
    print(f'    [RE] RECRUTEMENT → Pharmacien            : {"✓" if ok_rec else "✗ MANQUANT"}')

    if not ok_da:
        print(f'    ⚠ PREMIER MAILLON CASSÉ : aucune arête DONNE_ACCES BAC_PC → "{fil_nom}"')
    elif not ok_op:
        print(f'    ⚠ PREMIER MAILLON CASSÉ : aucune arête OFFERTE_PAR depuis "{fil_nom}"')
    elif not ok_casa:
        print(f'    ⚠ PREMIER MAILLON CASSÉ : aucun ETAB Casablanca pour "{fil_nom}"')
    elif not ok_rec:
        print(f'    ⚠ PREMIER MAILLON CASSÉ : aucune arête RECRUTEMENT "{fil_nom}" → Pharmacien')
    else:
        print(f'    ✓ Chaîne COMPLÈTE — le problème est ailleurs (filtre frontend ou BFS)')
    print()

print(SEP)
