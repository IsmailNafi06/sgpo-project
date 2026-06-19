"""
Analyse post-Step2 : que faire des 362 FILIEREs encore sans ETAB ?
Objectif : identifier la prochaine action la plus rentable sur les METIERs.
"""

import json, re, unicodedata, sys
from collections import defaultdict, Counter

sys.stdout.reconfigure(encoding='utf-8')

def norm(s):
    s = (s or '').lower().strip()
    s = unicodedata.normalize('NFD', s)
    s = ''.join(c for c in s if unicodedata.category(c) != 'Mn')
    s = re.sub(r"[''`]", '', s)
    s = re.sub(r'[^a-z0-9 ]', ' ', s)
    return re.sub(r'\s+', ' ', s).strip()

DATA = 'backend/src/main/resources/data'
with open(f'{DATA}/nodes_all.json', 'r', encoding='utf-8') as f:
    nodes = json.load(f)
with open(f'{DATA}/edges.json', 'r', encoding='utf-8') as f:
    edges = json.load(f)

nodes_by_id = {str(n['id']): n for n in nodes}

filiere_etabs   = defaultdict(set)
filiere_metiers = defaultdict(set)
metier_filieres = defaultdict(set)
filiere_bacs    = defaultdict(set)
etab_filiers    = defaultdict(set)

for e in edges:
    s  = str(e.get('source_id', ''))
    t  = str(e.get('target_id', ''))
    lt = e.get('type_lien', '')
    if lt == 'OFFERTE_PAR':
        filiere_etabs[s].add(t)
        etab_filiers[t].add(s)
    elif lt == 'RECRUTEMENT':
        filiere_metiers[s].add(t)
        metier_filieres[t].add(s)
    elif lt == 'DONNE_ACCES':
        filiere_bacs[t].add(s)

filieres = [n for n in nodes if n.get('type') == 'FILIERE']
etabs    = [n for n in nodes if n.get('type') == 'ETABLISSEMENT']
metiers  = [n for n in nodes if n.get('type') == 'METIER']

fil_no_etab   = [n for n in filieres if not filiere_etabs.get(str(n['id']))]
etab_phantom  = [n for n in etabs    if not etab_filiers.get(str(n['id']))]

print(f'FILIEREs sans ETAB restantes : {len(fil_no_etab)}')
print(f'ETABs fantômes restants       : {len(etab_phantom)}')
print()

# ── Catégoriser les 362 FILIEREs restantes ───────────────────────────────────
def cat(nom, secteur):
    n = norm(nom + ' ' + (secteur or ''))
    if any(x in n for x in ['1ere bac', '2eme bac', 'premiere bac', 'deuxieme bac',
                              'bac sciences math', 'bac lettres', 'bac arts',
                              'bac economie', 'bac sciences exp', 'bac technolog',
                              'bac sciences agro', 'bac arts appl']):
        return 'BAC_LYCEE'
    if any(x in n for x in ['desa ', 'dess ', 'deug ', 'deust ', 'dut ']):
        return 'PRE_LMD (DESA/DESS/DEUG/DEUST/DUT)'
    if 'doctorat' in n:
        return 'DOCTORAT'
    if 'master' in n or 'mastere' in n:
        return 'MASTER'
    if 'licence' in n or 'bachelor' in n:
        return 'LICENCE'
    if any(x in n for x in ['ingenieur', 'genie', 'cycle ingenieur']):
        return 'CYCLE_INGENIEUR'
    if any(x in n for x in ['technicien specialise', 'technicien ', 'bts ', 'dts ']):
        return 'BTS/TECHNICIEN'
    if any(x in n for x in ['medecine', 'pharmacie', 'dentaire', 'infirmier',
                              'sage femme', 'kinesither', 'ortho']):
        return 'SANTE'
    if any(x in n for x in ['architecture', 'urbanisme']):
        return 'ARCHITECTURE'
    if any(x in n for x in ['cpge', 'classe preparatoire', 'prepa']):
        return 'CPGE'
    if any(x in n for x in ['ofppt', 'ista ']):
        return 'OFPPT/ISTA'
    return 'AUTRE'

cat_map = defaultdict(list)
for f in fil_no_etab:
    c = cat(f.get('nom_fr', ''), f.get('secteur', ''))
    cat_map[c].append(f)

print('=== RÉPARTITION DES 362 FILIERES RESTANTES ===')
for c, lst in sorted(cat_map.items(), key=lambda x: -len(x[1])):
    print(f'  {len(lst):4}  {c}')
print()

# ── Presque prêtes (BAC + METIER mais sans ETAB) ─────────────────────────────
presque = [(n, str(n['id'])) for n in fil_no_etab
           if filiere_bacs.get(str(n['id'])) and filiere_metiers.get(str(n['id']))]

# Calculer le gain par METIER si chaque "presque prête" était rattachée
metier_unlock_count = Counter()
for n, fid in presque:
    for mid in filiere_metiers.get(fid, set()):
        fils_du_m = metier_filieres.get(mid, set())
        already = any(filiere_etabs.get(f2) and filiere_bacs.get(f2) for f2 in fils_du_m)
        if not already:
            metier_unlock_count[mid] += 1

print('=== FILIERES "PRESQUE PRETES" (BAC + METIER, seul ETAB manque) ===')
print(f'  Total : {len(presque)}')
print()

# Catégoriser les "presque prêtes"
cat_presque = Counter(cat(n.get('nom_fr',''), n.get('secteur','')) for n, _ in presque)
print('  Par catégorie :')
for c, cnt in cat_presque.most_common():
    print(f'    {cnt:4}  {c}')
print()

# ── Analyser les groupes de FILIEREs partageant le même nom d'ETAB ───────────
# Certaines FILIEREs ont le nom d'un ETAB dans leur nom_fr mais cet ETAB n'est
# pas dans la liste des fantômes restants (déjà réactivé ou jamais créé)

# Extraire les patterns d'ETAB depuis les noms restants
etab_mentions = Counter()
for n, fid in presque:
    nom = norm(n.get('nom_fr', ''))
    # Chercher des sous-chaînes ressemblant à des noms d'ETAB
    for pattern in [
        'ecole superieure de technologie',
        'faculte des sciences',
        'faculte des lettres',
        'faculte de medecine',
        'universite internationale',
        'universite privee',
        'ista ', 'est ', 'encg', 'ensa', 'fsjes', 'fst',
        'ecole nationale', 'ecole superieure', 'institut superieur',
        'campus', 'college', 'ecole de',
    ]:
        if pattern in nom:
            etab_mentions[pattern] += 1

print('  Patterns d\'ETAB mentionnés dans les noms (presque prêtes) :')
for p, cnt in etab_mentions.most_common(12):
    print(f'    {cnt:4}  "{p}"')
print()

# ── Top METIERs débloquables ─────────────────────────────────────────────────
print('=== TOP 15 METIERS DÉBLOQUABLES SI ETAB AJOUTÉ ===')
print('(METIERs actuellement inaccessibles, avec au moins 1 FILIERE presque prête)')
print()
for mid, nb_fils in metier_unlock_count.most_common(15):
    m = nodes_by_id.get(mid, {})
    tot = len(metier_filieres.get(mid, set()))
    print(f'  {nb_fils:2} FIL prêtes  "{m.get("nom_fr","")[:55]}"  [total={tot} FIL]')
print()

# ── Analyse des groupes d'établissements manquants ───────────────────────────
# Regrouper les "presque prêtes" par ETAB mentionné dans le nom
groups = defaultdict(list)
for n, fid in presque:
    nom = n.get('nom_fr', '')
    nn  = norm(nom)
    placed = False
    # Chercher un ETAB connu dans le nom
    for etab in etabs:
        en = norm(etab.get('nom_fr', ''))
        ew = [w for w in en.split() if len(w) > 3][:3]
        if ew and all(w in nn for w in ew):
            groups[etab.get('nom_fr', '')[:40]].append(n)
            placed = True
            break
    if not placed:
        # Chercher un pattern générique
        if 'ecole superieure de technologie' in nn:
            # Extraire la ville
            city_found = 'inconnu'
            for city in ['khouribga','marrakech','fes','agadir','el jadida','sale',
                          'kenitra','beni mellal','guelmim','laayoune','oujda','tanger']:
                if city in nn:
                    city_found = city
                    break
            groups[f'EST {city_found}'].append(n)
        elif 'faculte des sciences' in nn and 'faculte des sciences juridiques' not in nn:
            for city in ['rabat','casablanca','fes','agadir','meknes','oujda',
                          'tetouan','kenitra','marrakech','tanger']:
                if city in nn:
                    groups[f'FS {city}'].append(n)
                    break
            else:
                groups['Faculte des Sciences (ville inconnue)'].append(n)
        else:
            groups['ETAB non identifié'].append(n)

print('=== GROUPES D\'ETAB MANQUANTS (FILIEREs presque prêtes) ===')
top_groups = sorted(groups.items(), key=lambda x: -len(x[1]))
for grp, fils in top_groups[:20]:
    mets = set()
    for f in fils:
        fid = str(f['id'])
        for mid in filiere_metiers.get(fid, set()):
            fils_du_m = metier_filieres.get(mid, set())
            if not any(filiere_etabs.get(f2) and filiere_bacs.get(f2) for f2 in fils_du_m):
                mets.add(mid)
    print(f'  [{len(fils):3} FIL -> {len(mets):2} MET débloqués]  "{grp}"')
print()

# ── Recommandation unique ─────────────────────────────────────────────────────
print('=== PROCHAINE ACTION LA PLUS RENTABLE ===')
print()

# BAC_LYCEE : ces FILIEREs ne correspondent à aucun ETAB réel
# (les lycées ne sont pas dans le graphe et n'ont pas de OFFERTE_PAR)
nb_bac_lycee = len(cat_map.get('BAC_LYCEE', []))
nb_prelmd    = len(cat_map.get('PRE_LMD (DESA/DESS/DEUG/DEUST/DUT)', []))
nb_doc       = len(cat_map.get('DOCTORAT', []))

# La question clé : combien des 362 sont des "bruits" irrécupérables sans scraping ?
bruit = nb_bac_lycee + nb_prelmd + nb_doc
print(f'  FILIEREs récupérables (presque prêtes, ETAB à identifier) : {len(presque)}')
print(f'  FILIEREs "bruit" sans ETAB naturel (BAC lycée, PRE_LMD, Doctorat sans lien) : {bruit}')
print(f'  FILIEREs restantes indéterminées : {len(fil_no_etab) - len(presque) - bruit}')
print()

# Calcul du gain maximal si on résoud les presque prêtes
nb_metiers_unlock = len([mid for mid, _ in metier_unlock_count.most_common()])
print(f'  Si les {len(presque)} FILIEREs presque prêtes sont rattachées :')
print(f'    -> {nb_metiers_unlock} METIERs supplémentaires seraient accessibles')
print(f'    -> Total METIERs accessibles : 312 + {nb_metiers_unlock} = {312 + nb_metiers_unlock}')
print()

# Identifier le groupe le plus actionnable sans scraping
# (ETABs fantômes restants qui n'ont pas encore de FILIEREs)
etab_phantom_names = {norm(n.get('nom_fr','')): n for n in etab_phantom}
best_group = top_groups[0] if top_groups else None
if best_group:
    grp_name, grp_fils = best_group
    print(f'  ACTION RECOMMANDÉE :')
    print(f'    Identifier et rattacher le groupe "{grp_name}"')
    print(f'    {len(grp_fils)} FILIEREs -> débloque directement des METIERs')
    print()

print('  STRATÉGIE GLOBALE :')
print(f'  1. Les {len(presque)} "presque prêtes" nécessitent d identifier {len(top_groups[:15])} ETABs distincts.')
print(f'  2. Parmi les {len(etab_phantom)} ETABs fantômes RESTANTS, certains correspondent.')
print(f'  3. Lancer step3_dryrun.py pour matcher les ETABs fantômes restants')
print(f'     aux "presque prêtes" non encore rattachées.')
print(f'  4. Les {bruit} FILIEREs "bruit" (BAC lycée + PRE_LMD + Doctorat isolés)')
print(f'     peuvent être ignorées : elles n ont pas d ETAB dans le système universitaire.')
