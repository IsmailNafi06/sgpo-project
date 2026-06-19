import fs from 'node:fs/promises'
import path from 'node:path'

const root = process.cwd()
const dataDir = path.join(root, 'backend', 'src', 'main', 'resources', 'data')
const nodes = JSON.parse(await fs.readFile(path.join(dataDir, 'nodes_all.json'), 'utf8'))
const edges = JSON.parse(await fs.readFile(path.join(dataDir, 'edges.json'), 'utf8'))
const byId = new Map(nodes.map((node) => [node.id, node]))
const terms = process.argv.slice(2)

for (const term of terms) {
  const node = nodes.find((item) => item.code === term || item.nom_fr === term)
  if (!node) {
    console.log(JSON.stringify({ term, found: false }))
    continue
  }
  const offers = edges
    .filter((edge) => edge.source_id === node.id && edge.type_lien === 'OFFERTE_PAR')
    .map((edge) => byId.get(edge.target_id))
    .filter(Boolean)
    .map((school) => ({ code: school.code, nom_fr: school.nom_fr, ville: school.ville }))
  console.log(JSON.stringify({ code: node.code, nom_fr: node.nom_fr, id: node.id, offers }, null, 2))
}
