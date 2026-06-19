import fs from 'node:fs/promises'
import path from 'node:path'

const root = process.cwd()
const dataDir = path.join(root, 'backend', 'src', 'main', 'resources', 'data')
const nodesPath = path.join(dataDir, 'nodes_all.json')
const edgesPath = path.join(dataDir, 'edges.json')

const nodes = JSON.parse(await fs.readFile(nodesPath, 'utf8'))
let edges = JSON.parse(await fs.readFile(edgesPath, 'utf8'))

const normalize = (value = '') =>
  String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')

const byId = new Map(nodes.map((node) => [node.id, node]))

for (const node of nodes) {
  const text = normalize(`${node.code} ${node.nom_fr}`)

  if (node.code === '1BAC_SE') {
    node.nom_fr = '1ere Bac Sciences Experimentales: Physique-Chimie / SVT'
  }
  if (node.code === 'BAC_SE') {
    node.nom_fr = 'Bac Sciences Experimentales: Physique-Chimie / SVT'
  }

  if (node.type !== 'FILIERE') continue

  const programName = normalize(String(node.nom_fr || '').split(' - ')[0])

  if (/LICENCE_MASTER|LICENCE_ET_MASTER|LICENCE_.*MASTER/.test(text)) {
    node.duree_mois = 36
  } else if (/MASTER|MASTERE|MSC/.test(text)) {
    node.duree_mois = 24
  } else if (/LICENCE|BACHELOR|BAC_3/.test(text)) {
    node.duree_mois = 36
  } else if (/BTS|DUT|DEUST|TECHNICIEN_SPECIALISE|TECHNICIEN_SPECIALISE/.test(text)) {
    node.duree_mois = 24
  } else if (/PHARMACIE/.test(programName)) {
    node.duree_mois = 72
  } else if (/MEDECINE_DENTAIRE|DOCTEUR_EN_MEDECINE_DENTAIRE|DIPLOME_DE_DOCTEUR_EN_MEDECINE_DENTAIRE/.test(programName)) {
    node.duree_mois = 72
  } else if (/DOCTORAT_EN_MEDECINE|DOCTEUR_EN_MEDECINE|DIPLOME_DE_DOCTEUR_EN_MEDECINE/.test(programName)) {
    node.duree_mois = 84
  } else if (/CYCLE_INGENIEUR|DIPLOME_INGENIEUR|INGENIEUR_EN|INGENIEUR_GENIE|INGENIERIE_DATA/.test(text)) {
    node.duree_mois = Math.max(Number(node.duree_mois || 0), 60)
  }
}

edges = edges.filter((edge) => {
  const source = byId.get(edge.source_id)
  const target = byId.get(edge.target_id)
  if (!source || !target) return false
  const sourceText = normalize(`${source.code} ${source.nom_fr}`)
  const targetText = normalize(`${target.code} ${target.nom_fr}`)
  const directBacToMaster = edge.type_lien === 'ADMISSION' && /^BAC_/.test(sourceText) && /MASTER|MASTERE|MSC/.test(targetText)
  return !directBacToMaster
})

await fs.writeFile(nodesPath, JSON.stringify(nodes, null, 2))
await fs.writeFile(edgesPath, JSON.stringify(edges, null, 2))

console.log(
  JSON.stringify(
    {
      nodes: nodes.length,
      edges: edges.length,
      note: 'Durations normalized and direct bac-to-master admissions removed.',
    },
    null,
    2,
  ),
)
