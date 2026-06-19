import fs from 'node:fs/promises'
import path from 'node:path'

const root = process.cwd()
const dataDir = path.join(root, 'backend', 'src', 'main', 'resources', 'data')
const nodes = JSON.parse(await fs.readFile(path.join(dataDir, 'nodes_all.json'), 'utf8'))
const edges = JSON.parse(await fs.readFile(path.join(dataDir, 'edges.json'), 'utf8'))
const byId = new Map(nodes.map((node) => [node.id, node]))
const byCode = new Map(nodes.map((node) => [node.code, node]))

const codes = [
  'F9R_INGENIEUR_GENIE_INFORMATIQUE_ENSA_CASABLANCA',
  'F9R_CYCLE_INGENIEUR_INFORMATIQUE_ENSEM_CASABLANCA',
  'F9R_LICENCE_DROIT_PRIVE_FSJES_CASABLANCA',
  'SCRAPE_9RAYTI_FORMATION_LICENCE_EN_DROIT_PRIVE_EN_FRANCAIS_FSJES_CASABLANCA',
  'F9R_MASTER_IA_DATA_SCIENCE_FACULTE_DES_SCIENCES_CASABLANCA',
  'F9R_MASTER_AUDIT_CONTROLE_GESTION_FSJES_RABAT_AGDAL',
]

const result = {}
for (const code of codes) {
  const node = byCode.get(code)
  result[code] = {
    node: node
      ? {
          id: node.id,
          nom_fr: node.nom_fr,
          type: node.type,
          duree_mois: node.duree_mois,
          cout_estime: node.cout_estime,
          ville: node.ville,
        }
      : null,
    edges: node
      ? edges
          .filter((edge) => edge.source_id === node.id || edge.target_id === node.id)
          .map((edge) => ({
            type_lien: edge.type_lien,
            source: byId.get(edge.source_id)?.code,
            sourceName: byId.get(edge.source_id)?.nom_fr,
            target: byId.get(edge.target_id)?.code,
            targetName: byId.get(edge.target_id)?.nom_fr,
          }))
      : [],
  }
}

console.log(JSON.stringify(result, null, 2))
