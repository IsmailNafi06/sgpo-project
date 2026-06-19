"""
Audit de la structure réelle des nœuds sources des arêtes DONNE_ACCES.
Objectif : connaître exactement quels nœuds BAC/NIVEAU existent et leurs IDs.
"""
import json, sys
from collections import defaultdict, Counter
sys.stdout.reconfigure(encoding='utf-8')

DATA = 'backend/src/main/resources/data'
with open(f'{DATA}/nodes_all.json', 'r', encoding='utf-8') as f:
    nodes = json.load(f)
with open(f'{DATA}/edges.json', 'r', encoding='utf-8') as f:
    edges = json.load(f)

nodes_by_id = {str(n['id']): n for n in nodes}

# Sources des arêtes DONNE_ACCES
sources = defaultdict(int)
for e in edges:
    if e.get('type_lien') == 'DONNE_ACCES':
        sid = str(e.get('source_id', ''))
        sources[sid] += 1

print(f'Nœuds sources distincts dans DONNE_ACCES : {len(sources)}')
print()
print(f'{"ID[:8]":10} {"TYPE":15} {"CODE":30} {"NOM[:40]":40} {"nb_cibles"}')
print('─'*110)
for sid, cnt in sorted(sources.items(), key=lambda x: -x[1]):
    n = nodes_by_id.get(sid, {})
    print(f'{sid[:8]:10} {n.get("type","?"):15} {str(n.get("code",""))[:30]:30} {str(n.get("nom_fr",""))[:40]:40} {cnt}')
