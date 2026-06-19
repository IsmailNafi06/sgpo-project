import fs from 'node:fs/promises'
import path from 'node:path'

const root = process.cwd()
const dataDir = path.join(root, 'backend', 'src', 'main', 'resources', 'data')
const nodesPath = path.join(dataDir, 'nodes_all.json')
const edgesPath = path.join(dataDir, 'edges.json')

const readJson = async (file) => JSON.parse((await fs.readFile(file, 'utf8')).replace(/^\uFEFF/, ''))
const writeJson = async (file, value) => fs.writeFile(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8')

const normalize = (value = '') =>
  String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()

const nodes = await readJson(nodesPath)
const edges = await readJson(edgesPath)
const byId = new Map(nodes.map((node) => [node.id, node]))

const report = {
  nodesReTyped: 0,
  durationsFixed: 0,
  directBacToMasterEdgesRemoved: 0,
  badOfferEdgesRemoved: 0,
  edgesRemoved: 0,
}

for (const node of nodes) {
  const text = normalize(`${node.code || ''} ${node.nom_fr || ''}`)

  if (node.type === 'ETABLISSEMENT' && /\b(DUT|BTS|DEUST|LICENCE|MASTER|DOCTORAT|DIPLOME|CYCLE INGENIEUR|APESA)\b/.test(text)) {
    node.type = 'FILIERE'
    report.nodesReTyped += 1
  }

  const programTitle = normalize(String(node.nom_fr || '').split(/\s+-\s+/)[0])
  if (node.type === 'FILIERE' && /DIPLOME DE DOCTEUR EN MEDECINE|DOCTORAT EN MEDECINE|DOCTEUR EN MEDECINE/.test(programTitle) && !/DENTAIRE|PHARMACIE|VETERINAIRE/.test(programTitle)) {
    if (Number(node.duree_mois || 0) !== 84) {
      node.duree_mois = 84
      report.durationsFixed += 1
    }
  }
}

const isBac = (node) => node?.type === 'FILIERE' && /^BAC_/i.test(node.code || '')
const isMaster = (node) => node?.type === 'FILIERE' && /\b(MASTER|MASTERE|MBA)\b/.test(normalize(`${node.code || ''} ${node.nom_fr || ''}`))
const isOfferMismatch = (program, school) => {
  if (program?.type !== 'FILIERE' || school?.type !== 'ETABLISSEMENT') return true
  const programText = normalize(`${program.code || ''} ${program.nom_fr || ''}`)
  const schoolText = normalize(`${school.code || ''} ${school.nom_fr || ''}`)
  if (/\b(MASTER|DOCTORAT)\b/.test(programText) && /\b(ECOLE SUPERIEURE DE TECHNOLOGIE|EST )\b/.test(schoolText)) return true
  if (/\b(DUT|BTS)\b/.test(programText) && /\b(ENCG|ENSA|ENSAM|ENSIAS|EMI|EHTP|INPT|INSEA)\b/.test(schoolText)) return true
  if (/\bPARCOURS PROFESSIONNALISANT\b/.test(programText) && /\b(ECOLE SUPERIEURE DE TECHNOLOGIE|EST )\b/.test(schoolText)) return true
  return false
}

const filteredEdges = []
for (const edge of edges) {
  const source = byId.get(edge.source_id)
  const target = byId.get(edge.target_id)
  let remove = false

  if (edge.type_lien === 'ADMISSION' && isBac(source) && isMaster(target)) {
    report.directBacToMasterEdgesRemoved += 1
    remove = true
  }

  if (!remove && edge.type_lien === 'OFFERTE_PAR' && isOfferMismatch(source, target)) {
    report.badOfferEdgesRemoved += 1
    remove = true
  }

  if (remove) {
    report.edgesRemoved += 1
    continue
  }
  filteredEdges.push(edge)
}

nodes.sort((a, b) => a.code.localeCompare(b.code))
filteredEdges.sort((a, b) => `${a.source_id}${a.target_id}${a.type_lien}`.localeCompare(`${b.source_id}${b.target_id}${b.type_lien}`))

await writeJson(nodesPath, nodes)
await writeJson(edgesPath, filteredEdges)

console.log(JSON.stringify({ ...report, nodes: nodes.length, edges: filteredEdges.length }, null, 2))
