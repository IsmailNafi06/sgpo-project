import fs from 'node:fs'
import path from 'node:path'

const dataDir = path.resolve('backend/src/main/resources/data')
const nodesPath = path.join(dataDir, 'nodes_all.json')
const edgesPath = path.join(dataDir, 'edges.json')

const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'))
const writeJson = (file, data) => fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`, 'utf8')

const normalize = (value = '') =>
  String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim()

const nodeCity = (node) => normalize(node.ville || node.city || '')
const nodeText = (node) => normalize(`${node.code || ''} ${node.nom_fr || ''} ${node.description || ''}`)

const healthFamily = (node) => {
  if (node.type !== 'ETABLISSEMENT') return ''
  const text = nodeText(node)
  const city = nodeCity(node) || 'NON_PRECISEE'

  if (/ABULCASIS|FPMM/.test(text)) return ''

  if (/\bFM6MD\b|FACULTE MOHAMMED VI DE MEDECINE DENTAIRE|MOHAMMED VI DE MEDECINE DENTAIRE/.test(text)) {
    return `FM6MD:${city}`
  }
  if (/\bFM6P\b|FACULTE MOHAMMED VI DE PHARMACIE|MOHAMMED VI DE PHARMACIE/.test(text)) {
    return `FM6P:${city}`
  }
  if (/\b(FMD|FMDS|FMDC)\b|FACULTE DE MEDECINE DENTAIRE/.test(text)) {
    return `FMD:${city}`
  }
  if (/\b(FMP|FMPR|FMPC|FMPO|FMPK|FMPM|FMPB)\b|FACULTE DE MEDECINE ET DE PHARMACIE|FACULTE DE MEDECINE\b/.test(text)) {
    return `FMP:${city}`
  }

  return ''
}

const canonicalScore = (node) => {
  const text = nodeText(node)
  let score = 0
  if (!/^SCRAPE_/.test(String(node.code || ''))) score += 20
  if (/FACULTE/.test(text)) score += 15
  if (/MOHAMMED VI/.test(text)) score += 8
  if (/\b(FMD|FMP|FM6P)\b/.test(text)) score -= 4
  score += Math.min(String(node.nom_fr || '').length, 90) / 10
  score += Number(node.cout_estime || 0) > 0 ? 2 : 0
  return score
}

const mergeNodeData = (canonical, duplicate) => {
  canonical.cout_estime = Math.max(Number(canonical.cout_estime || 0), Number(duplicate.cout_estime || 0))
  if (!canonical.ville && duplicate.ville) canonical.ville = duplicate.ville
  if (!canonical.secteur && duplicate.secteur) canonical.secteur = duplicate.secteur
  if (String(duplicate.description || '').length > String(canonical.description || '').length) {
    canonical.description = duplicate.description
  }
}

const timestamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, '')
fs.copyFileSync(nodesPath, `${nodesPath}.bak_health_aliases_${timestamp}`)
fs.copyFileSync(edgesPath, `${edgesPath}.bak_health_aliases_${timestamp}`)

const nodes = readJson(nodesPath)
const edges = readJson(edgesPath)

const groups = new Map()
for (const node of nodes) {
  const family = healthFamily(node)
  if (!family) continue
  if (!groups.has(family)) groups.set(family, [])
  groups.get(family).push(node)
}

const aliasToCanonicalId = new Map()
const removedCodes = new Set()
const removedIds = new Set()

for (const group of groups.values()) {
  if (group.length < 2) continue
  const sorted = [...group].sort((a, b) => canonicalScore(b) - canonicalScore(a))
  const canonical = sorted[0]
  for (const duplicate of sorted.slice(1)) {
    aliasToCanonicalId.set(duplicate.id, canonical.id)
    removedCodes.add(duplicate.code)
    removedIds.add(duplicate.id)
    mergeNodeData(canonical, duplicate)
  }
}

const mergedNodes = nodes.filter((node) => !removedCodes.has(node.code))
const edgeKeys = new Set()
const mergedEdges = []

for (const edge of edges) {
  const sourceId = aliasToCanonicalId.get(edge.source_id) || edge.source_id
  const targetId = aliasToCanonicalId.get(edge.target_id) || edge.target_id
  if (!sourceId || !targetId || sourceId === targetId) continue
  const normalizedEdge = { ...edge, source_id: sourceId, target_id: targetId }
  const key = JSON.stringify([
    normalizedEdge.source_id,
    normalizedEdge.target_id,
    normalizedEdge.type_lien || '',
  ])
  if (edgeKeys.has(key)) continue
  edgeKeys.add(key)
  mergedEdges.push(normalizedEdge)
}

writeJson(nodesPath, mergedNodes)
writeJson(edgesPath, mergedEdges)

console.log(JSON.stringify({
  groups: [...groups.entries()].filter(([, group]) => group.length > 1).map(([family, group]) => ({
    family,
    before: group.map((node) => node.nom_fr),
    kept: group.find((node) => !removedCodes.has(node.code))?.nom_fr,
  })),
  removedNodes: removedCodes.size,
  rewrittenEdges: aliasToCanonicalId.size,
  nodesBefore: nodes.length,
  nodesAfter: mergedNodes.length,
  edgesBefore: edges.length,
  edgesAfter: mergedEdges.length,
}, null, 2))
