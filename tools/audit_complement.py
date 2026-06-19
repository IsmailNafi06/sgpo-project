"""Complément audit — sections 3.3+ et analyses spécifiques"""
import json, re, sys, unicodedata
from collections import defaultdict, Counter
sys.stdout.reconfigure(encoding='utf-8')

with open('backend/src/main/resources/data/nodes_all.json', 'r', encoding='utf-8-sig') as f:
    nodes = json.load(f)
with open('backend/src/main/resources/data/edges.json', 'r', encoding='utf-8-sig') as f:
    edges = json.load(f)

nodes_by_id = {str(n['id']): n for n in nodes}
all_ids = set(nodes_by_id.keys())

def norm(s):
    s = (s or '').lower().strip()
    s = unicodedata.normalize('NFD', s)
    s = ''.join(c for c in s if unicodedata.category(c) != 'Mn')
    s = re.sub(r"[''`]", '', s)
    s = re.sub(r'[^a-z0-9 ]', ' ', s)
    return re.sub(r'\s+', ' ', s).strip()

def classify_etab(nom):
    nm = norm(nom or '')
    if 'superieure de technologie' in nm: return 'EST'
    if 'sciences et techniques' in nm: return 'FST'
    if 'sciences juridiques' in nm or 'droit' in nm: return 'FSJES'
    if 'medecine et de pharmacie' in nm: return 'FMP'
    if 'medecine dentaire' in nm: return 'FMD'
    if 'sciences appliquees' in nm: return 'ENSA'
    if 'nationale de commerce et de gestion' in nm: return 'ENCG'
    if 'nationale d architecture' in nm: return 'ENA'
    if 'arts et metiers' in nm: return 'ENSAM'
    if 'mohammadia d ingenieurs' in nm: return 'EMI'
    if 'informatique et d analyse' in nm: return 'ENSIAS'
    if 'agronomique et veterinaire' in nm: return 'IAV'
    if 'hassania des travaux publics' in nm: return 'EHTP'
    if 'postes et telecommunications' in nm: return 'INPT'
    if 'superieur de commerce et d administration' in nm: return 'ISCAE'
    if 'metiers de l education' in nm or ('crmef' in nm): return 'CRMEF'
    if 'cpge' in nm or 'classe preparatoire' in nm: return 'CPGE'
    if 'faculte des sciences ' in nm: return 'FS'
    if 'faculte polydisciplinaire' in nm: return 'FP'
    if 'ofppt' in nm or 'ista ' in nm or 'isfp' in nm: return 'OFPPT'
    return 'AUTRE'

etabs    = {str(n['id']): n for n in nodes if n.get('type') == 'ETABLISSEMENT'}
filieres = {str(n['id']): n for n in nodes if n.get('type') == 'FILIERE'}
metiers  = {str(n['id']): n for n in nodes if n.get('type') == 'METIER'}
bac_ids  = {nid for nid, n in filieres.items() if str(n.get('code','')).startswith('BAC_')}
real_fil = {nid for nid in filieres if nid not in bac_ids}

rec_rev = defaultdict(list)
rec_fwd = defaultdict(list)
adm_fwd = defaultdict(list)
op_fwd  = defaultdict(list)
op_rev  = defaultdict(list)
da_tgt  = defaultdict(list)
edge_cnt= defaultdict(int)

for e in edges:
    s, t, lt = str(e['source_id']), str(e['target_id']), e['type_lien']
    if s not in all_ids or t not in all_ids: continue
    edge_cnt[s] += 1; edge_cnt[t] += 1
    if lt == 'RECRUTEMENT': rec_fwd[s].append(t); rec_rev[t].append(s)
    elif lt == 'ADMISSION':  adm_fwd[s].append(t)
    elif lt == 'OFFERTE_PAR': op_fwd[s].append(t); op_rev[t].append(s)
    elif lt == 'DONNE_ACCES': da_tgt[s].append(t)

SEP = '─'*80

# ═══ 3.3 RECRUTEMENT irréalistes ═════════════════════════════════════════════
print('\n' + '='*80)
print('  3.3 CONNEXIONS RECRUTEMENT IRRÉALISTES (durée trop courte pour le métier)')
print('='*80)

RULES = [
    (['medecin', 'pharmacien', 'dentiste', 'chirurgien'],   72, 'Médecine/Pharmacie ≥ 72m'),
    (['avocat', 'notaire', 'magistrat', 'greffier'],         60, 'Droit ≥ 60m'),
    (['architecte'],                                          60, 'Architecture ≥ 60m'),
    (['ingenieur'],                                           36, 'Ingénieur ≥ 36m'),
    (['expert-comptable', 'expert comptable'],                60, 'Expert-Comptable ≥ 60m'),
]
irreal = []
for mkeys, min_d, label in RULES:
    for nid, n in metiers.items():
        nm = norm(n.get('nom_fr',''))
        if not any(kw in nm for kw in mkeys): continue
        for fid in rec_rev.get(nid,[]):
            fn = filieres.get(fid, {})
            fd = fn.get('duree_mois') or 0
            if 0 < fd < min_d:
                irreal.append({
                    'm': n.get('nom_fr','')[:50], 'm_id': nid,
                    'f': fn.get('nom_fr','')[:60], 'fd': fd,
                    'min': min_d, 'rule': label
                })

print(f'\n  Total: {len(irreal)} connexions irréalistes')
by_rule = defaultdict(list)
for v in irreal: by_rule[v['rule']].append(v)
for rule, vs in sorted(by_rule.items(), key=lambda x: -len(x[1])):
    print(f'\n  [{len(vs):>3}] {rule}')
    for v in vs[:4]:
        print(f'    METIER : {v["m"]}')
        print(f'    FILIERE: {v["f"]} [{v["fd"]}m] (min attendu: {v["min"]}m)')

# ═══ Analyse anciens diplômes DESA/DESS/Maîtrise ═════════════════════════════
print('\n' + '='*80)
print('  ANALYSE : ANCIENS DIPLÔMES PRÉ-LMD (DESA/DESS/Maîtrise/Mastère)')
print('='*80)

old_kws = ['desa', 'dess', 'maitrise', 'mastere specialise', 'mastere']
old_filieres = [(nid, filieres[nid].get('nom_fr',''), filieres[nid].get('duree_mois',0),
                 op_fwd.get(nid,[]))
                for nid in real_fil
                if any(kw in norm(filieres[nid].get('nom_fr','')) for kw in old_kws)]

by_type_old = Counter()
for _, nm, _, _ in old_filieres:
    nm_n = norm(nm)
    if 'desa' in nm_n: by_type_old['DESA'] += 1
    elif 'dess' in nm_n: by_type_old['DESS'] += 1
    elif 'maitrise' in nm_n: by_type_old['Maîtrise'] += 1
    elif 'mastere' in nm_n: by_type_old['Mastère/MS'] += 1

print(f'\n  FILIEREs avec diplômes pré-LMD : {len(old_filieres)}')
for k, v in by_type_old.most_common():
    print(f'    {k:<20}: {v}')

old_etab_types = Counter()
for _, _, _, eids in old_filieres:
    for eid in eids:
        old_etab_types[classify_etab(etabs.get(eid,{}).get('nom_fr',''))] += 1

print(f'\n  Distribution par type ETAB hôte :')
for et, cnt in old_etab_types.most_common():
    print(f'    {et:<10}: {cnt}')

print(f'\n  Commentaire : DESA/DESS/Maîtrise sont des diplômes pré-LMD (avant 2003-2009).')
print(f'  Ils sont techniquement à 60 mois mais ne sont PAS des diplômes d\'ingénieur.')
print(f'  Leur présence dans le graphe = données historiques. Question : sont-ils toujours actifs ?')
print(f'  Recommandation : ajouter un champ "systeme=ANCIEN" pour les différencier.')

# ═══ 3.4 RECRUTEMENT hors domaine ════════════════════════════════════════════
print('\n' + '='*80)
print('  3.4 CONNEXIONS RECRUTEMENT HORS DOMAINE (domaines incompatibles)')
print('='*80)

DOMAIN_RULES = [
    (['medecin', 'pharmacien', 'chirurgien'],
     ['droit', 'juridique', 'economie', 'commerce', 'tourisme', 'arts'],
     'Médecin←Droit/Commerce/Tourisme'),
    (['avocat', 'notaire'],
     ['medecine', 'pharmacie', 'informatique', 'chimie', 'physique'],
     'Avocat←Médecine/Informatique'),
    (['ingenieur genie civil', 'ingenieur btp'],
     ['tourisme', 'journalisme', 'lettres', 'arts'],
     'Ing.BTP←Tourisme/Lettres'),
]
dom_viols = []
for mkeys, fkeys, label in DOMAIN_RULES:
    for nid, n in metiers.items():
        nm = norm(n.get('nom_fr',''))
        if not any(kw in nm for kw in mkeys): continue
        for fid in rec_rev.get(nid,[]):
            fn = filieres.get(fid,{})
            fn_nm = norm(fn.get('nom_fr',''))
            if any(kw in fn_nm for kw in fkeys):
                dom_viols.append({
                    'm': n.get('nom_fr','')[:50],
                    'f': fn.get('nom_fr','')[:55],
                    'rule': label
                })

print(f'\n  Total: {len(dom_viols)} connexions hors domaine')
for v in dom_viols:
    print(f'  [{v["rule"]}]')
    print(f'    METIER : {v["m"]}')
    print(f'    FILIERE: {v["f"]}')

# ═══ 4.3 Chaînes ADMISSION absurdes ══════════════════════════════════════════
print('\n' + '='*80)
print('  4.3 CHAÎNES ADMISSION (durée totale > 120 mois = > 10 ans)')
print('='*80)

long_chains = []
for src, tgts in adm_fwd.items():
    sd = filieres.get(src,{}).get('duree_mois') or 0
    for tgt in tgts:
        td = filieres.get(tgt,{}).get('duree_mois') or 0
        if sd + td > 120:
            long_chains.append({
                'src': filieres.get(src,{}).get('nom_fr','')[:55],
                'tgt': filieres.get(tgt,{}).get('nom_fr','')[:55],
                'sd': sd, 'td': td, 'total': sd + td
            })

print(f'\n  Total: {len(long_chains)}')
for v in sorted(long_chains, key=lambda x: -x['total'])[:10]:
    print(f'  {v["sd"]}m + {v["td"]}m = {v["total"]}m')
    print(f'    {v["src"]}')
    print(f'    → {v["tgt"]}')

# ═══ 4.4 CPGE avec FILIEREs terminales ════════════════════════════════════════
print('\n' + '='*80)
print('  4.4 CPGE/LYCÉE AVEC FILIÈRES TERMINALES (Licence+)')
print('='*80)

cpge_violations = []
for nid, n in etabs.items():
    nm = norm(n.get('nom_fr',''))
    if not ('cpge' in nm or 'classe preparatoire' in nm or 'lycee' in nm): continue
    fils = op_rev.get(nid,[])
    term = [fid for fid in fils
            if (filieres.get(fid,{}).get('duree_mois') or 0) >= 36
            and 'cpge' not in norm(filieres.get(fid,{}).get('nom_fr',''))
            and 'preparation' not in norm(filieres.get(fid,{}).get('nom_fr',''))]
    if term:
        cpge_violations.append({
            'etab': n.get('nom_fr','')[:55], 'cnt': len(term),
            'ex': [filieres.get(f,{}).get('nom_fr','?')[:50] for f in term[:2]]
        })

print(f'\n  Total: {len(cpge_violations)} CPGE/lycées avec FIL terminales')
for v in cpge_violations[:10]:
    print(f'\n  ETAB: {v["etab"]} ({v["cnt"]} FIL terminales)')
    for ex in v['ex']:
        print(f'    → {ex}')

# ═══ 4.5 ETABs surchargés ═════════════════════════════════════════════════════
print('\n' + '='*80)
print('  4.5 ETABLISSEMENTS AVEC NOMBRE DE FILIÈRES SUSPECT')
print('='*80)

loads = [(nid, etabs[nid].get('nom_fr','')[:60], classify_etab(etabs[nid].get('nom_fr','')),
          len(op_rev.get(nid,[])))
         for nid in etabs if op_rev.get(nid)]
loads.sort(key=lambda x: -x[3])

SPECIALIZED = {'EST','FST','FSJES','FMP','FMD','ENSA','ENCG','ENA','ENSAM',
               'EMI','ENSIAS','IAV','EHTP','INPT','ISCAE','CRMEF'}
print(f'\n  Top 25 ETABs par FILIEREs :')
for nid, nom, et, cnt in loads[:25]:
    flag = ' *** ANORMAL' if cnt > 60 and et in SPECIALIZED else ''
    print(f'  [{et:<8}] {nom:<60} : {cnt:>4} FIL{flag}')

# ═══ Analyse RECRUTEMENT : METIERs fragilité ════════════════════════════════
print('\n' + '='*80)
print('  FRAGILITÉ : METIERs avec 1 seule FILIERE de RECRUTEMENT')
print('='*80)

important_kws = ['ingenieur', 'medecin', 'avocat', 'architecte', 'directeur',
                 'manager', 'comptable', 'economiste', 'enseignant', 'infirmier',
                 'informaticien', 'analyste', 'juriste']

single_met = [(nid, metiers[nid].get('nom_fr',''), metiers[nid].get('secteur',''),
               rec_rev.get(nid,[]))
              for nid in metiers if len(rec_rev.get(nid,[])) == 1]
print(f'\n  Total METIERs à 1 seule FILIERE : {len(single_met)} ({100*len(single_met)//len(metiers)}%)')

print(f'\n  Parmi eux, les métiers "importants" (susceptibles d\'être fréquemment cherchés) :')
for nid, nm, sec, fids in sorted(single_met, key=lambda x: x[1]):
    nm_n = norm(nm)
    if any(kw in nm_n for kw in important_kws):
        fn = filieres.get(fids[0],{}).get('nom_fr','?')[:55] if fids else '?'
        fd = filieres.get(fids[0],{}).get('duree_mois','?') if fids else '?'
        print(f'  {nm[:50]:<50} [{fd}m] via {fn}')

# ═══ Qualité secteur METIERs ══════════════════════════════════════════════════
print('\n' + '='*80)
print('  QUALITÉ SECTEUR DES METIERS')
print('='*80)

met_no_sec = sum(1 for n in metiers.values() if not (n.get('secteur') or '').strip())
sec_counter = Counter(n.get('secteur','(vide)') for n in metiers.values())
print(f'\n  METIERs sans secteur : {met_no_sec}')
print(f'\n  Distribution secteurs METIERs (top 20) :')
for s, c in sec_counter.most_common(20):
    print(f'  {s:<50}: {c}')

# ═══ FILIEREs "santé" à une EST (problème spécifique) ════════════════════════
print('\n' + '='*80)
print('  ANALYSE SPÉCIFIQUE : FILIEREs santé attribuées aux ESTs')
print('='*80)

health_at_est = []
for nid, n in etabs.items():
    if classify_etab(n.get('nom_fr','')) != 'EST': continue
    for fid in op_rev.get(nid,[]):
        fn = filieres.get(fid,{})
        fn_nm = norm(fn.get('nom_fr',''))
        if any(kw in fn_nm for kw in ['infirmier', 'sante', 'medecin', 'pharmacie',
                                        'kinesither', 'radiologie', 'sage-femme']):
            health_at_est.append({
                'etab': n.get('nom_fr','')[:45],
                'fil': fn.get('nom_fr','')[:55],
                'duree': fn.get('duree_mois'),
            })

print(f'\n  FILIEREs santé attribuées à des ESTs : {len(health_at_est)}')
for v in health_at_est:
    print(f'  [{v["duree"]}m] {v["fil"]} → EST: {v["etab"]}')

# ═══ Manques OFPPT dans le graphe ════════════════════════════════════════════
print('\n' + '='*80)
print('  ANALYSE MANQUE : REPRÉSENTATION OFPPT / FORMATION PROFESSIONNELLE')
print('='*80)

ofppt_etabs = [(nid, etabs[nid].get('nom_fr',''), len(op_rev.get(nid,[])))
               for nid in etabs
               if any(kw in norm(etabs[nid].get('nom_fr',''))
                      for kw in ['ofppt', 'ista', 'isfp', 'technicien specialise',
                                  'qualification professionnelle', 'formation professionnelle'])]

total_ts_fil = sum(1 for nid in real_fil
                   if 'technicien specialise' in norm(filieres[nid].get('nom_fr','')))
total_bts_fil= sum(1 for nid in real_fil
                   if 'bts' in norm(filieres[nid].get('nom_fr','')))

print(f'\n  ETABs identifiés comme OFPPT/ISTA dans le graphe : {len(ofppt_etabs)}')
for nid, nm, fc in ofppt_etabs:
    print(f'  {nm[:55]} | {fc} FIL')

print(f'\n  FILIEREs "Technicien Spécialisé" dans le graphe : {total_ts_fil}')
print(f'  FILIEREs "BTS" dans le graphe                   : {total_bts_fil}')
print(f'\n  Réalité marocaine : OFPPT = 490 établissements, 415 800 places.')
print(f'  Le graphe contient seulement {len(ofppt_etabs)} ETABs OFPPT.')
print(f'  Gap énorme : toute la formation professionnelle publique est absente.')
print(f'  Impact : un étudiant vers Technicien/Artisan ne trouve aucune formation OFPPT.')

# ═══ FILIEREs avec ETAB de ville différente (vraie FSJES cas) ═══════════════
print('\n' + '='*80)
print('  ANALYSE : FILIEREs LP liées à une FSJES/FS mais avec ville différente')
print('='*80)

print(f'\n  Plusieurs FILIEREs de Licences Professionnelles ont ville != ETAB.')
print(f'  Exemple : LP "Settat" liée à FSJES Fès.')
print(f'  Explication probable : LP délocalisée (convention ETAB principal + antenne locale).')
print(f'  Ces LP existent réellement mais sont rattachées au mauvais ETAB dans le graphe.')
print(f'  Correction : créer des nœuds ETAB pour les antennes locales, ou corriger la ville.')

# Lister les cas
lp_mismatch = []
for nid in real_fil:
    fn = filieres[nid]
    fn_nm = norm(fn.get('nom_fr',''))
    fv = norm(fn.get('ville') or '')
    if 'professionnelle' not in fn_nm and 'lp' not in fn_nm: continue
    for eid in op_fwd.get(nid,[]):
        ev = norm(etabs.get(eid,{}).get('ville') or '')
        if ev and fv and fv != ev:
            lp_mismatch.append({
                'fil': fn.get('nom_fr','')[:60],
                'fil_ville': fv, 'etab_ville': ev,
                'etab': etabs.get(eid,{}).get('nom_fr','')[:45]
            })

print(f'\n  LP avec ville FIL != ville ETAB : {len(lp_mismatch)}')
for v in lp_mismatch[:10]:
    print(f'  FIL_VILLE={v["fil_ville"]:<15} ETAB_VILLE={v["etab_ville"]:<15} | {v["fil"][:55]}')

# ═══ FMP offrant des Licences (vraie violation) ═══════════════════════════════
print('\n' + '='*80)
print('  VIOLATIONS RÉELLES : FMP/FMD offrant Licences (impossible officiellement)')
print('='*80)

fmp_lic = []
for nid, n in etabs.items():
    et = classify_etab(n.get('nom_fr',''))
    if et not in ('FMP','FMD'): continue
    for fid in op_rev.get(nid,[]):
        fn = filieres.get(fid,{})
        fn_nm = norm(fn.get('nom_fr',''))
        fd = fn.get('duree_mois') or 0
        if 'licence' in fn_nm and fd == 36:
            fmp_lic.append({
                'etab': n.get('nom_fr','')[:45], 'et': et,
                'fil': fn.get('nom_fr','')[:60], 'fd': fd
            })

print(f'\n  FMPs/FMDs offrant des Licences (36m) : {len(fmp_lic)}')
for v in fmp_lic:
    print(f'  [{v["et"]}] {v["etab"]} → {v["fil"]} [{v["fd"]}m]')

# ═══ ENSA offrant Licences ════════════════════════════════════════════════════
print('\n' + '='*80)
print('  VIOLATIONS RÉELLES : ENSA offrant Licences (36m — impossible)')
print('='*80)

ensa_lic = []
for nid, n in etabs.items():
    et = classify_etab(n.get('nom_fr',''))
    if et != 'ENSA': continue
    for fid in op_rev.get(nid,[]):
        fn = filieres.get(fid,{})
        fn_nm = norm(fn.get('nom_fr',''))
        fd = fn.get('duree_mois') or 0
        if 'licence' in fn_nm and fd == 36:
            ensa_lic.append({
                'etab': n.get('nom_fr','')[:45],
                'fil': fn.get('nom_fr','')[:60], 'fd': fd
            })

print(f'\n  ENSAs offrant des Licences (36m) : {len(ensa_lic)}')
for v in ensa_lic:
    print(f'  {v["etab"]} → {v["fil"]} [{v["fd"]}m]')

print('\n[Complément audit terminé]')
