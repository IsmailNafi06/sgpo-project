import fs from 'node:fs/promises'
import path from 'node:path'

const root = process.cwd()
const dataDir = path.join(root, 'backend', 'src', 'main', 'resources', 'data')
const nodes = JSON.parse(await fs.readFile(path.join(dataDir, 'nodes_all.json'), 'utf8'))
const edges = JSON.parse(await fs.readFile(path.join(dataDir, 'edges.json'), 'utf8'))

const byCode = new Map(nodes.map((node) => [node.code, node]))
const byId = new Map(nodes.map((node) => [node.id, node]))
const adjacency = new Map()

const addAdj = (source, edge) => {
  if (!source) return
  if (!adjacency.has(source)) adjacency.set(source, [])
  adjacency.get(source).push(edge)
}

for (const edge of edges) {
  addAdj(edge.source_id, edge)
  if (edge.type_lien === 'OFFERTE_PAR') {
    addAdj(edge.target_id, { ...edge, source_id: edge.target_id, target_id: edge.source_id })
  }
}

const hasPath = (startCode, targetCode, maxDepth = 12) => {
  const start = byCode.get(startCode)
  const target = byCode.get(targetCode)
  if (!start || !target) return false

  const queue = [{ id: start.id, depth: 0 }]
  const visited = new Set([start.id])
  while (queue.length) {
    const current = queue.shift()
    if (current.depth >= maxDepth) continue

    for (const edge of adjacency.get(current.id) || []) {
      const nextId = edge.target_id
      if (nextId === target.id) return true
      if (visited.has(nextId)) continue
      const next = byId.get(nextId)
      if (!next) continue
      visited.add(nextId)
      queue.push({ id: nextId, depth: current.depth + 1 })
    }
  }
  return false
}

const targets = [
  'MEDECIN_GENERALISTE',
  'INGENIEUR_GENIE_INFORMATIQUE',
  'DATA_SCIENTIST',
  'DEEP_LEARNING_ENGINEER',
  'AUDITEUR',
  'EXPERT_COMPTABLE',
  'AVOCAT',
  'SOUDEUR',
]

const result = {}
for (const start of ['3AC', 'TC', 'BAC_SM', 'BAC_PC', 'BAC_SVT', 'BAC_LETTRES']) {
  result[start] = Object.fromEntries(targets.map((target) => [target, hasPath(start, target)]))
}

console.log(JSON.stringify(result, null, 2))
