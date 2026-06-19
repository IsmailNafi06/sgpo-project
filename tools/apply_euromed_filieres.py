"""
APPLICATION — Correction des 5 filières Euromed restantes
ville : Casablanca → Fes
cout_estime : 0 → 80000 (si 0)
"""
import json, re, unicodedata, shutil, sys
from datetime import datetime
from pathlib import Path

sys.stdout.reconfigure(encoding='utf-8')

NODES_PATH = Path('backend/src/main/resources/data/nodes_all.json')

with open(NODES_PATH, 'r', encoding='utf-8') as f:
    nodes = json.load(f)

def normalize(s):
    s = (s or '').upper().strip()
    s = unicodedata.normalize('NFD', s)
    s = ''.join(c for c in s if unicodedata.category(c) != 'Mn')
    s = re.sub(r"[''`\-]", ' ', s)
    s = re.sub(r'[^\w\s]', ' ', s)
    return re.sub(r'\s+', ' ', s).strip()

def is_euromed_filiere(n):
    if n.get('type') != 'FILIERE':
        return False
    nom = normalize(n.get('nom_fr', '') or '')
    code = normalize(n.get('code', '') or '')
    return 'EUROMED' in nom or 'EUROMED' in code

EUROMED_VILLE = 'Fes'
EUROMED_COUT  = 80000

ts  = datetime.now().strftime('%Y%m%d_%H%M%S')
bak = NODES_PATH.with_suffix(f'.bak_euromed_fil_{ts}')
shutil.copy2(NODES_PATH, bak)

modified = []
for n in nodes:
    if not is_euromed_filiere(n):
        continue
    if (n.get('ville') or '').lower() != 'casablanca':
        continue

    changes = {}
    if n.get('ville') != EUROMED_VILLE:
        changes['ville'] = (n.get('ville'), EUROMED_VILLE)
        n['ville'] = EUROMED_VILLE
    if (n.get('cout_estime') or 0) == 0:
        changes['cout'] = (0, EUROMED_COUT)
        n['cout_estime'] = EUROMED_COUT

    if changes:
        modified.append({'nom': n.get('nom_fr', ''), 'changes': changes})

with open(NODES_PATH, 'w', encoding='utf-8') as f:
    json.dump(nodes, f, ensure_ascii=False, indent=2)

with open(NODES_PATH, 'r', encoding='utf-8') as f:
    check = json.load(f)

SEP = '═' * 68
sep = '─' * 68
print(SEP)
print('  APPLICATION — Filières Euromed : ville Casablanca → Fes')
print(SEP)
print(f'\n  Backup créé : {bak.name}')
print(f'  JSON valide : {"OUI" if len(check) == len(nodes) else "NON — ERREUR"}')
print(f'  Filières modifiées : {len(modified)}\n')
for m in modified:
    print(f'  ✓ {m["nom"][:62]}')
    for k, (old, new) in m["changes"].items():
        print(f'      {k}: "{old}" → "{new}"')

# Vérification finale
euromed_casa = [
    n for n in check
    if n.get('type') == 'FILIERE'
    and 'EUROMED' in normalize(n.get('nom_fr','') or '')
    and (n.get('ville') or '').lower() == 'casablanca'
]
print(f'\n  Vérification — Filières Euromed ville=Casablanca restantes : {len(euromed_casa)}')
if euromed_casa:
    for n in euromed_casa:
        print(f'    ✗ {n.get("nom_fr","")}')
else:
    print('  ✅ Aucune filière Euromed restante avec ville=Casablanca')

print(f'\n{sep}')
print('  APPLICATION TERMINÉE')
print(sep)
