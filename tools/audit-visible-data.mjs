import fs from 'node:fs/promises'
import path from 'node:path'

const root = process.cwd()
const dataDir = path.join(root, 'backend', 'src', 'main', 'resources', 'data')
const nodesPath = path.join(dataDir, 'nodes_all.json')
const edgesPath = path.join(dataDir, 'edges.json')

const readJson = async (file) => JSON.parse((await fs.readFile(file, 'utf8')).replace(/^\uFEFF/, ''))
const encodedPattern = /%[0-9a-f]{2}|25D8|25D9|25EF|25BA|25BB/i
const rawUrlPattern = /https?:\/\//i
const genericJobPattern = /^(metiers?|fiches metiers?|tests metiers?|formations?|secteurs? de formation|orientation|accueil)$/i

const clean = (value = '') =>
  String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()

const nodes = await readJson(nodesPath)
const edges = await readJson(edgesPath)
const byId = new Map(nodes.map((node) => [node.id, node]))

const visibleFields = ['code', 'nom_fr', 'description', 'secteur', 'ville']
const encodedNodes = nodes
  .filter((node) => visibleFields.some((field) => typeof node[field] === 'string' && encodedPattern.test(node[field])))
  .map((node) => ({ type: node.type, code: node.code, nom_fr: node.nom_fr }))

const rawUrlDescriptions = nodes
  .filter((node) => typeof node.description === 'string' && rawUrlPattern.test(node.description))
  .map((node) => ({ type: node.type, code: node.code, nom_fr: node.nom_fr }))

const genericJobs = nodes
  .filter((node) => node.type === 'METIER' && genericJobPattern.test(clean(node.nom_fr)))
  .map((node) => ({ code: node.code, nom_fr: node.nom_fr }))

const badJobLabels = nodes
  .filter((node) => node.type === 'METIER')
  .filter((node) => {
    const label = clean(node.nom_fr)
    return !/[a-z]{3}/.test(label) || encodedPattern.test(`${node.code} ${node.nom_fr}`) || genericJobPattern.test(label)
  })
  .map((node) => ({ code: node.code, nom_fr: node.nom_fr }))

const directMasters = edges
  .filter((edge) => {
    const source = byId.get(edge.source_id)
    const target = byId.get(edge.target_id)
    return (
      edge.type_lien === 'DONNE_ACCES' &&
      source?.type === 'NIVEAU' &&
      target?.type === 'FILIERE' &&
      /MASTER|MASTERE|MBA|PGE|PROGRAMME GRANDE ECOLE/i.test(`${target.code} ${target.nom_fr}`)
    )
  })
  .map((edge) => ({ from: byId.get(edge.source_id)?.code, to: byId.get(edge.target_id)?.code, name: byId.get(edge.target_id)?.nom_fr }))

const orphanEdges = edges.filter((edge) => !byId.has(edge.source_id) || !byId.has(edge.target_id))
const duplicateEdges = [...edges.reduce((map, edge) => {
  const key = `${edge.source_id}|${edge.target_id}|${edge.type_lien}`
  map.set(key, (map.get(key) || 0) + 1)
  return map
}, new Map()).entries()].filter(([, count]) => count > 1)

const report = {
  nodes: nodes.length,
  edges: edges.length,
  metiers: nodes.filter((node) => node.type === 'METIER').length,
  encodedNodes: encodedNodes.length,
  rawUrlDescriptions: rawUrlDescriptions.length,
  genericJobs: genericJobs.length,
  badJobLabels: badJobLabels.length,
  directMasters: directMasters.length,
  orphanEdges: orphanEdges.length,
  duplicateEdges: duplicateEdges.length,
  samples: {
    encodedNodes: encodedNodes.slice(0, 10),
    rawUrlDescriptions: rawUrlDescriptions.slice(0, 10),
    genericJobs: genericJobs.slice(0, 10),
    badJobLabels: badJobLabels.slice(0, 10),
    directMasters: directMasters.slice(0, 10),
  },
}

console.log(JSON.stringify(report, null, 2))
