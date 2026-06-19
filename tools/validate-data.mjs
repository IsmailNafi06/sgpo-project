import fs from 'node:fs/promises'
import path from 'node:path'

const root = process.cwd()
const dataDir = path.join(root, 'backend', 'src', 'main', 'resources', 'data')
const nodesPath = path.join(dataDir, 'nodes_all.json')
const edgesPath = path.join(dataDir, 'edges.json')

const readJson = async (file) => JSON.parse((await fs.readFile(file, 'utf8')).replace(/^\uFEFF/, ''))

const nodes = await readJson(nodesPath)
const edges = await readJson(edgesPath)
const byId = new Map(nodes.map((node) => [node.id, node]))

const countBy = (items, getKey) => {
  const map = new Map()
  for (const item of items) map.set(getKey(item), (map.get(getKey(item)) || 0) + 1)
  return Object.fromEntries([...map.entries()].sort((a, b) => String(a[0]).localeCompare(String(b[0]))))
}

const duplicates = (items, getKey) => [...items.reduce((map, item) => map.set(getKey(item), (map.get(getKey(item)) || 0) + 1), new Map()).entries()].filter(([, count]) => count > 1)

const orphanEdges = edges.filter((edge) => !byId.has(edge.source_id) || !byId.has(edge.target_id))
const duplicateEdges = duplicates(edges, (edge) => `${edge.source_id}|${edge.target_id}|${edge.type_lien}`)
const validEdgeTypes = new Set(['DONNE_ACCES', 'OFFERTE_PAR', 'RECRUTEMENT', 'ADMISSION'])
const validAccessTypes = new Set(['CONCOURS', 'DOSSIER', 'OUVERT'])
const invalidEdgeTypes = edges
  .filter((edge) => edge.type_lien && !validEdgeTypes.has(edge.type_lien))
  .slice(0, 20)
  .map((edge) => ({ source_id: edge.source_id, target_id: edge.target_id, type_lien: edge.type_lien }))
const invalidAccessTypes = edges
  .filter((edge) => edge.type_acces && !validAccessTypes.has(edge.type_acces))
  .slice(0, 20)
  .map((edge) => ({
    source: byId.get(edge.source_id)?.code || edge.source_id,
    target: byId.get(edge.target_id)?.code || edge.target_id,
    type_lien: edge.type_lien,
    type_acces: edge.type_acces,
  }))
const badSchoolProgressionShortcuts = edges
  .filter((edge) => {
    if (edge.type_lien !== 'DONNE_ACCES') return false
    const sourceCode = String(byId.get(edge.source_id)?.code || '').toUpperCase()
    const targetCode = String(byId.get(edge.target_id)?.code || '').toUpperCase()
    return (sourceCode === '3AC' && targetCode !== 'TC') || (sourceCode === 'TC' && targetCode.startsWith('BAC_'))
  })
  .slice(0, 20)
  .map((edge) => ({
    source: byId.get(edge.source_id)?.code || edge.source_id,
    target: byId.get(edge.target_id)?.code || edge.target_id,
    type_lien: edge.type_lien,
  }))
const directMasters = edges
  .filter((edge) => {
    const source = byId.get(edge.source_id)
    const target = byId.get(edge.target_id)
    return (
      edge.type_lien === 'DONNE_ACCES' &&
      (source?.type === 'NIVEAU' || /^BAC_/i.test(source?.code || '')) &&
      target?.type === 'FILIERE' &&
      /\b(MASTER|MASTERE|MBA)\b|PROGRAMME GRANDE ECOLE/i.test(`${target.code} ${target.nom_fr}`)
    )
  })
  .slice(0, 20)
  .map((edge) => ({
    from: byId.get(edge.source_id)?.code,
    to: byId.get(edge.target_id)?.code,
    name: byId.get(edge.target_id)?.nom_fr,
  }))

const weirdNodes = nodes
  .filter((node) => /undefined|null|sitemap|page non trouvee|not found/i.test(`${node.code} ${node.nom_fr}`))
  .slice(0, 20)
  .map((node) => ({ type: node.type, code: node.code, name: node.nom_fr }))

const report = {
  nodes: nodes.length,
  edges: edges.length,
  nodesByType: countBy(nodes, (node) => node.type),
  edgesByType: countBy(edges, (edge) => edge.type_lien),
  duplicateCodes: duplicates(nodes, (node) => node.code).length,
  duplicateIds: duplicates(nodes, (node) => node.id).length,
  orphanEdges: orphanEdges.length,
  duplicateEdges: duplicateEdges.length,
  invalidEdgeTypes,
  invalidAccessTypes,
  badSchoolProgressionShortcuts,
  directMastersFromBacSample: directMasters,
  weirdNodes,
}

console.log(JSON.stringify(report, null, 2))
